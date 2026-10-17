import { it, expect, vi, afterEach } from 'vitest';
import { S3Client, CreateBucketCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { MemoryStore, initialState } from '../apps/api/src/store';
import { generate, imageUrl } from '../apps/api/src/generation';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
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
