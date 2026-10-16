import { Queue, Worker } from 'bullmq';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Store, Avatar } from './store.js';
export function redisConnection(worker = false) {
  const u = new URL(process.env.REDIS_URL!);
  if (!['redis:', 'rediss:'].includes(u.protocol)) throw Error('Invalid REDIS_URL');
  const database = u.pathname.slice(1);
  if (database && !/^\d+$/.test(database)) throw Error('Invalid REDIS_URL database');
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username ? decodeURIComponent(u.username) : undefined,
    password: u.password ? decodeURIComponent(u.password) : undefined,
    db: Number(database || 0),
    connectTimeout: 2000,
    maxRetriesPerRequest: worker ? null : 1,
    ...(worker ? {} : { enableOfflineQueue: false, commandTimeout: 2500 }),
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
function within<T>(operation: Promise<T>, timeoutMs = 2500): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    operation,
    new Promise<T>((_, reject) => {
      timer = setTimeout(() => reject(Error('avatar_queue_unavailable')), timeoutMs);
    }),
  ]).finally(() => clearTimeout(timer));
}
class AvatarQueue extends Queue {
  private connected = false;
  private initialReady: Promise<void>;
  constructor(name: string) {
    super(name, {
      connection: redisConnection(),
      defaultJobOptions: { removeOnComplete: 100, removeOnFail: 100 },
    });
    // BullMQ must finish its first ready/version check before issuing commands.
    // One bounded shared wait keeps a cold Redis from holding HTTP requests open.
    this.initialReady = within(
      super.waitUntilReady().then(() => {
        this.connected = true;
      }),
    );
    void this.initialReady.catch(() => {});
  }
  private async available() {
    if (!this.connected) await this.initialReady;
    const client = await this.client;
    if (client.status !== 'ready') throw Error('avatar_queue_unavailable');
  }
  override async add(...args: Parameters<Queue['add']>) {
    await this.available();
    return within(super.add(...args));
  }
  override async getJobCounts(...args: Parameters<Queue['getJobCounts']>) {
    await this.available();
    return within(super.getJobCounts(...args));
  }
  override async getWorkersCount() {
    await this.available();
    return within(super.getWorkersCount());
  }
}
export function avatarQueue(name = 'bilim-avatar') {
  return new AvatarQueue(name);
}
function s3(endpoint = process.env.S3_ENDPOINT) {
  return new S3Client({
    region: process.env.S3_REGION ?? 'us-east-1',
    endpoint,
    forcePathStyle: true,
    credentials: {
      accessKeyId: process.env.S3_ACCESS_KEY_ID!,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
  });
}
export async function imageUrl(av: Avatar) {
  const client = s3(process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT);
  try {
    return await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: av.imageKey }),
      { expiresIn: 120 },
    );
  } finally {
    client.destroy();
  }
}
async function api(path: string, body: unknown, signal: AbortSignal) {
  const r = await fetch(`https://api.openai.com/v1/${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!r.ok) throw Error(`image_provider_http_${r.status}`);
  return r.json();
}
export async function generate(store: Store, id: string, provider = process.env.AVATAR_PROVIDER) {
  // Claim inside the transaction: duplicate jobs must never call the model twice.
  const av = await store.tx((s) => {
    const a = s.avatars.find((x) => x.id === id);
    if (!a || a.status !== 'queued') return;
    const expired = Date.now() - Date.parse(a.createdAt) >= 27000;
    if (provider !== 'openai' || expired) {
      a.status = 'fallback';
      a.model = 'fallback-v1';
      if (expired) a.error = 'deadline_exceeded';
      return;
    }
    a.status = 'generating';
    return a;
  });
  if (!av) return;
  const remaining = Math.max(1, 27000 - (Date.now() - Date.parse(av.createdAt)));
  const signal = AbortSignal.timeout(remaining);
  let failure = 'validation_failed';
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (signal.aborted) break;
      await store.tx((s) => {
        const current = s.avatars.find((x) => x.id === id)!;
        if (current.status === 'generating') current.attempts = attempt;
      });
      const output = await api(
        'images/generations',
        { model: av.model, prompt: av.prompt, size: '1024x1024', quality: 'low', n: 1 },
        signal,
      );
      const data = output.data?.[0]?.b64_json;
      const image = generatedPng(data);
      const check = await api(
        'responses',
        {
          model: process.env.VISION_MODEL ?? 'gpt-4.1-mini',
          store: false,
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: 'Check this original workplace mascot. Does it have a safety helmet, high visibility vest, no offensive/sexual/violent content, no recognizable copyrighted character, no foreign logos and no text except the permitted BI emblem? Return exactly PASS if ALL checks pass, otherwise FAIL.',
                },
                { type: 'input_image', image_url: `data:image/png;base64,${data}`, detail: 'low' },
              ],
            },
          ],
        },
        signal,
      );
      const verdict = check.output
        ?.flatMap((o: { content?: { text?: string }[] }) => o.content ?? [])
        .map((c: { text?: string }) => c.text ?? '')
        .join('')
        .trim();
      if (verdict !== 'PASS') continue;
      const key = `avatars/${id}.png`;
      const client = s3();
      try {
        await client.send(
          new PutObjectCommand({
            Bucket: process.env.S3_BUCKET!,
            Key: key,
            Body: image,
            ContentType: 'image/png',
            ServerSideEncryption: process.env.S3_SSE === 'AES256' ? 'AES256' : undefined,
          }),
          { abortSignal: signal },
        );
      } finally {
        client.destroy();
      }
      await store.tx((s) => {
        const a = s.avatars.find((x) => x.id === id)!;
        if (a.status === 'generating' && Date.now() - Date.parse(a.createdAt) < 28000) {
          a.status = 'ready';
          a.imageKey = key;
        }
      });
      return;
    }
  } catch (e) {
    failure = signal.aborted ? 'deadline_exceeded' : 'generation_failed';
  }
  await store.tx((s) => {
    const a = s.avatars.find((x) => x.id === id)!;
    if (a.status === 'generating') {
      a.status = 'fallback';
      a.model = 'fallback-v1';
      a.error = failure;
    }
  });
}
export function generatedPng(data: unknown) {
  if (
    typeof data !== 'string' ||
    !data.length ||
    data.length > 16000000 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(data)
  )
    throw Error('invalid_image_response');
  const image = Buffer.from(data, 'base64');
  if (image.length < 8 || !image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')))
    throw Error('invalid_image_response');
  return image;
}
export function startWorker(store: Store) {
  const worker = new Worker('bilim-avatar', (job) => generate(store, job.data.id), {
    connection: redisConnection(true),
    concurrency: 2,
  });
  // Attach before the first connection attempt so Redis outages cannot crash the process.
  worker.on('error', () => console.error('avatar_worker_unavailable'));
  worker.on('failed', () => console.error('avatar_job_failed'));
  return worker;
}
