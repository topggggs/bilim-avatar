import 'dotenv/config';
import { createStore } from './store.js';
import { startWorker } from './generation.js';
import { runtimeSettings } from './runtime.js';
runtimeSettings();
if (!process.env.REDIS_URL) throw Error('Missing REDIS_URL');
const store = await createStore();
const worker = startWorker(store);
worker.on('ready', () => console.log('Bilim avatar worker ready'));
let stopping = false;
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    if (stopping) return;
    stopping = true;
    const deadline = setTimeout(() => process.exit(1), 10000);
    deadline.unref();
    void worker
      .close()
      .then(() => store.close())
      .then(() => process.exit(0))
      .catch(() => {
        console.error('worker_shutdown_failed');
        process.exit(1);
      });
  });
