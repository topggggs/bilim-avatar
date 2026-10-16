import { Queue, Worker } from 'bullmq';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Store, Avatar } from './store.js';
export function redisConnection() {
  const u = new URL(process.env.REDIS_URL!);
  return {
    host: u.hostname,
    port: Number(u.port || 6379),
    username: u.username || undefined,
    password: u.password || undefined,
    ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
  };
}
export function avatarQueue() {
  return new Queue('bilim-avatar', {
    connection: redisConnection(),
    defaultJobOptions: { removeOnComplete: 100, removeOnFail: 100 },
  });
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
  return getSignedUrl(
    s3(process.env.S3_PUBLIC_ENDPOINT ?? process.env.S3_ENDPOINT),
    new GetObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: av.imageKey }),
    { expiresIn: 120 },
  );
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
  const start = Date.now();
  let av = (await store.read()).avatars.find((x) => x.id === id);
  if (!av || av.status !== 'queued') return;
  if (provider !== 'openai') {
    await store.tx((s) => {
      const a = s.avatars.find((x) => x.id === id)!;
      a.status = 'fallback';
      a.model = 'fallback-v1';
    });
    return;
  }
  await store.tx((s) => {
    s.avatars.find((x) => x.id === id)!.status = 'generating';
  });
  const signal = AbortSignal.timeout(28000);
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (Date.now() - start > 26000) break;
      await store.tx((s) => {
        s.avatars.find((x) => x.id === id)!.attempts = attempt;
      });
      const output = await api(
        'images/generations',
        { model: av.model, prompt: av.prompt, size: '1024x1024', quality: 'low', n: 1 },
        signal,
      );
      const data = output.data?.[0]?.b64_json;
      if (typeof data !== 'string' || data.length > 16000000) throw Error('invalid_image_response');
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
      await s3().send(
        new PutObjectCommand({
          Bucket: process.env.S3_BUCKET!,
          Key: key,
          Body: Buffer.from(data, 'base64'),
          ContentType: 'image/png',
          ServerSideEncryption: process.env.S3_SSE === 'AES256' ? 'AES256' : undefined,
        }),
        { abortSignal: signal },
      );
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
    await store.tx((s) => {
      s.avatars.find((x) => x.id === id)!.error = e instanceof Error ? e.name : 'generation_failed';
    });
  }
  await store.tx((s) => {
    const a = s.avatars.find((x) => x.id === id)!;
    a.status = 'fallback';
  });
}
export function startWorker(store: Store) {
  return new Worker('bilim-avatar', (job) => generate(store, job.data.id), {
    connection: redisConnection(),
    concurrency: 2,
  });
}
