import { it, expect, vi, afterEach } from 'vitest';
import { S3Client, CreateBucketCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Worker } from 'bullmq';
import { MemoryStore, initialState } from '../apps/api/src/store';
import {
  generate,
  imageUrl,
  generatedPng,
  redisConnection,
  avatarQueue,
} from '../apps/api/src/generation';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
it.skipIf(!process.env.TEST_REDIS_URL)(
  'реальная avatarQueue: первый connect, обработка, быстрый отказ при обрыве и восстановление',
  async () => {
    vi.stubEnv('REDIS_URL', process.env.TEST_REDIS_URL!);
    const name = `bilim-generation-qa-${crypto.randomUUID()}`;
    const store = new MemoryStore(initialState(true));
    const id = await store.tx((s) => {
      const avatar = s.avatars[0];
      avatar.status = 'queued';
      return avatar.id;
    });
    const queue = avatarQueue(name);
    queue.on('error', () => {});
    const worker = new Worker(name, (job) => generate(store, job.data.id, 'fallback'), {
      connection: redisConnection(true),
    });
    worker.on('error', () => {});
    try {
      // Called immediately: commands must wait for BullMQ's initial ready/version check.
      expect(await queue.getJobCounts('waiting')).toHaveProperty('waiting', 0);
      await worker.waitUntilReady();
      await vi.waitFor(async () => expect(await queue.getWorkersCount()).toBeGreaterThan(0));
      await queue.add('generate', { id });
      await vi.waitFor(async () => expect((await store.read()).avatars[0].status).toBe('fallback'));
      const client = await queue.client;
      client.disconnect();
      await vi.waitFor(() => expect(client.status).toBe('end'));
      const started = Date.now();
      await expect(queue.getJobCounts('waiting')).rejects.toThrow('avatar_queue_unavailable');
      expect(Date.now() - started).toBeLessThan(500);
      await client.connect();
      expect(await queue.getJobCounts('waiting')).toHaveProperty('waiting', 0);
    } finally {
      await worker.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  },
);
it('задача захватывается атомарно; повторная доставка не вызывает модель дважды', async () => {
  const store = new MemoryStore(initialState(true));
  const id = await store.tx((s) => {
    const a = s.avatars[0];
    a.status = 'queued';
    return a.id;
  });
  let release: (value: Response) => void = () => {};
  const request = vi.spyOn(globalThis, 'fetch').mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const first = generate(store, id, 'openai');
  await vi.waitFor(() => expect(request).toHaveBeenCalledTimes(1));
  await generate(store, id, 'openai');
  release(new Response('{}', { status: 503 }));
  await first;
  expect(request).toHaveBeenCalledTimes(1);
  expect((await store.read()).avatars.find((a) => a.id === id)?.status).toBe('fallback');
});
it('просроченная задача получает fallback без обращения к модели', async () => {
  const store = new MemoryStore(initialState(true));
  const id = await store.tx((s) => {
    const a = s.avatars[0];
    a.status = 'queued';
    a.createdAt = new Date(Date.now() - 28000).toISOString();
    return a.id;
  });
  const request = vi.spyOn(globalThis, 'fetch');
  await generate(store, id, 'openai');
  expect(request).not.toHaveBeenCalled();
  expect((await store.read()).avatars.find((a) => a.id === id)?.error).toBe('deadline_exceeded');
});
it('некорректные ответы модели не сохраняются под видом PNG', () => {
  for (const data of [null, '', 'not_an_image', 'aGVsbG8=', 'a'.repeat(16000001)])
    expect(() => generatedPng(data)).toThrow('invalid_image_response');
  expect(
    generatedPng(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTRUAAAAASUVORK5CYII=',
    ).length,
  ).toBeGreaterThan(8);
});
it('Redis connection respects TLS, escaped credentials and database, queue fails quickly', () => {
  vi.stubEnv('REDIS_URL', 'rediss://user:p%40ss@cache.example:6380/4');
  expect(redisConnection()).toMatchObject({
    host: 'cache.example',
    port: 6380,
    username: 'user',
    password: 'p@ss',
    db: 4,
    tls: {},
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
  });
  expect(redisConnection(true).maxRetriesPerRequest).toBe(null);
  vi.stubEnv('REDIS_URL', 'redis://cache/invalid');
  expect(() => redisConnection()).toThrow('Invalid REDIS_URL database');
});
it('ошибка провайдера приводит к безопасному запасному аватару', async () => {
  const store = new MemoryStore(initialState(true));
  const id = await store.tx((s) => {
    const a = s.avatars[0];
    a.status = 'queued';
    return a.id;
  });
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('{}', { status: 503 }));
  await generate(store, id, 'openai');
  const a = (await store.read()).avatars.find((x) => x.id === id)!;
  expect(a.status).toBe('fallback');
  expect(a.imageKey).toBeUndefined();
});
it.skipIf(!process.env.TEST_S3_ENDPOINT)(
  'конвейер с mock API: проверка контента, приватное S3, подписанная ссылка; три отклонения → fallback',
  async () => {
    const endpoint = process.env.TEST_S3_ENDPOINT!;
    vi.stubEnv('S3_ENDPOINT', endpoint);
    vi.stubEnv('S3_PUBLIC_ENDPOINT', endpoint);
    vi.stubEnv('S3_REGION', 'us-east-1');
    vi.stubEnv('S3_BUCKET', 'bilim-avatars-qa');
    vi.stubEnv('S3_ACCESS_KEY_ID', 'bilim_qa');
    vi.stubEnv('S3_SECRET_ACCESS_KEY', 'bilim_qa_storage_only');
    vi.stubEnv('OPENAI_API_KEY', 'test-key-never-sent');
    const s3 = new S3Client({
      endpoint,
      region: 'us-east-1',
      forcePathStyle: true,
      credentials: { accessKeyId: 'bilim_qa', secretAccessKey: 'bilim_qa_storage_only' },
    });
    try {
      await s3.send(new CreateBucketCommand({ Bucket: 'bilim-avatars-qa' }));
    } catch (e) {
      if (!['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes((e as Error).name)) throw e;
    }
    const original = globalThis.fetch;
    let verdict = 'PASS';
    const outbound: Record<string, any>[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
      const url = String(input);
      if (!url.startsWith('https://api.openai.com/v1/')) return original(input, init);
      const body = JSON.parse(String(init?.body));
      outbound.push(body);
      return Response.json(
        url.endsWith('images/generations')
          ? {
              data: [
                {
                  b64_json:
                    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jTRUAAAAASUVORK5CYII=',
                },
              ],
            }
          : { output: [{ content: [{ text: verdict }] }] },
      );
    });
    const store = new MemoryStore(initialState(true));
    const id = await store.tx((s) => {
      const av = s.avatars[0];
      av.status = 'queued';
      av.model = 'gpt-image-1';
      return av.id;
    });
    await generate(store, id, 'openai');
    const ready = (await store.read()).avatars.find((a) => a.id === id)!;
    expect(ready.status).toBe('ready');
    expect(ready.attempts).toBe(1);
    expect((await original(await imageUrl(ready))).status).toBe(200);
    expect((await original(`${endpoint}/bilim-avatars-qa/${ready.imageKey}`)).status).toBe(403);
    expect(JSON.stringify(outbound)).not.toContain('Алина');
    expect(outbound[0]).toHaveProperty('prompt');
    expect(outbound[0]).not.toHaveProperty('answers');
    verdict = 'FAIL';
    const failedId = await store.tx((s) => {
      const av = {
        ...s.avatars[0],
        id: crypto.randomUUID(),
        imageKey: undefined,
        status: 'queued' as const,
      };
      s.avatars.push(av);
      return av.id;
    });
    await generate(store, failedId, 'openai');
    const fallback = (await store.read()).avatars.find((a) => a.id === failedId)!;
    expect(fallback.status).toBe('fallback');
    expect(fallback.attempts).toBe(3);
    expect(fallback.imageKey).toBeUndefined();
    await s3.send(new DeleteObjectCommand({ Bucket: 'bilim-avatars-qa', Key: ready.imageKey }));
    s3.destroy();
  },
);
