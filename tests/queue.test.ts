import { it, expect } from 'vitest';
import { Queue, Worker, QueueEvents } from 'bullmq';
import { MemoryStore, initialState } from '../apps/api/src/store';
import { generate } from '../apps/api/src/generation';
it.skipIf(!process.env.TEST_REDIS_URL)(
  'Redis: отдельный воркер принимает задачу и сохраняет запасной аватар',
  async () => {
    const url = new URL(process.env.TEST_REDIS_URL!),
      connection = { host: url.hostname, port: Number(url.port) },
      name = `bilim-qa-${crypto.randomUUID()}`;
    const store = new MemoryStore(initialState(true));
    const av = await store.tx((s) => {
      const a = s.avatars[0];
      a.status = 'queued';
      return a;
    });
    const queue = new Queue(name, { connection });
    const events = new QueueEvents(name, { connection });
    const worker = new Worker(name, (job) => generate(store, job.data.id, 'fallback'), {
      connection,
    });
    try {
      await events.waitUntilReady();
      const job = await queue.add('generate', { id: av.id });
      await job.waitUntilFinished(events, 10000);
      const saved = (await store.read()).avatars.find((x) => x.id === av.id)!;
      expect(saved.status).toBe('fallback');
      expect(saved.fallbackSvg).toContain('<svg');
    } finally {
      await worker.close();
      await events.close();
      await queue.obliterate({ force: true });
      await queue.close();
    }
  },
);
