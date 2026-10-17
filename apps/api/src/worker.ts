import 'dotenv/config';
import { createStore } from './store.js';
import { startWorker } from './generation.js';
const store = await createStore();
const worker = startWorker(store);
console.log('Bilim avatar worker ready');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    void worker
      .close()
      .then(() => store.close())
      .then(() => process.exit(0));
  });
