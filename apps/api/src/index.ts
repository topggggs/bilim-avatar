import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore, PostgresStore } from './store.js';
import { createApp } from './app.js';
import { avatarQueue, imageUrl, generate } from './generation.js';
import {
  createReadiness,
  maintenanceLoop,
  recoverExpiredAvatars,
  runtimeSettings,
} from './runtime.js';
const settings = runtimeSettings();
const demo = settings.auth === 'demo';
const local = settings.auth === 'local';
const store = await createStore();
const queue = process.env.REDIS_URL ? avatarQueue() : undefined;
queue?.on('error', () => console.error('avatar_queue_unavailable'));
const readiness = createReadiness({
  settings,
  storage: () => (store instanceof PostgresStore ? store.pool.query('SELECT 1') : store.read()),
  queue: queue ? () => queue.getJobCounts('waiting', 'active') : undefined,
  worker: queue
    ? async () => {
        if ((await queue.getWorkersCount()) < 1) throw Error('worker_unavailable');
      }
    : undefined,
});
const app = createApp(store, {
  demo,
  origin: process.env.APP_ORIGIN ?? 'http://localhost:5173',
  readiness,
  enqueue: queue
    ? async (id) => {
        await queue.add('generate', { id }, { jobId: id });
      }
    : async (id) => {
        await generate(store, id, 'fallback');
      },
  image: imageUrl,
});
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../dist/web');
app.use(express.static(root));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(root, 'index.html')));
// Recovery sweeper: pending jobs older than 30 seconds always settle on a usable fallback.
const recovery = maintenanceLoop(() => recoverExpiredAvatars(store), {
  onError: () => console.error('avatar_recovery_unavailable'),
});
const server = app.listen(Number(process.env.PORT ?? 3001), '0.0.0.0', () =>
  console.log(
    `Bilim API http://localhost:${process.env.PORT ?? 3001} (${demo ? 'synthetic demo' : local ? 'email authentication' : 'OIDC'})`,
  ),
);
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    server.close(() => {
      void recovery
        .stop()
        .then(() => queue?.close())
        .then(() => store.close())
        .then(() => process.exit(0))
        .catch(() => {
          console.error('shutdown_failed');
          process.exit(1);
        });
    });
  });
