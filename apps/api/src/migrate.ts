import 'dotenv/config';
import { PostgresStore } from './store.js';
const store = new PostgresStore(process.env.DATABASE_URL!);
await store.init();
await store.close();
console.log('Schema ready');
