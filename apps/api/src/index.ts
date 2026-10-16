import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createStore } from './store.js';
import { createApp } from './app.js';
import { avatarQueue, imageUrl, generate } from './generation.js';
const demo = (process.env.AUTH_MODE ?? 'demo') === 'demo';
const local = process.env.AUTH_MODE === 'local';
if (process.env.NODE_ENV === 'production' && (demo || process.env.STORAGE_MODE !== 'postgres'))
  throw Error('Production requires local or OIDC authentication and PostgreSQL');
if (!demo) {
  const required = [
    'SESSION_SECRET',
    'APP_ORIGIN',
    ...(local
      ? ['SMTP_HOST', 'SMTP_FROM', 'REGISTRATION_DOMAINS']
      : ['OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_REDIRECT_URI']),
  ];
  for (const key of required) if (!process.env[key]) throw Error(`Missing ${key}`);
  if (process.env.SESSION_SECRET!.length < 32 || !process.env.APP_ORIGIN!.startsWith('https://'))
    throw Error('Production requires HTTPS and a strong session secret');
}
const store = await createStore();
const queue = process.env.REDIS_URL ? avatarQueue() : undefined;
const app = createApp(store, {
  demo,
  origin: process.env.APP_ORIGIN ?? 'http://localhost:5173',
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
const recovery = setInterval(() => {
  void store.tx((s) => {
    for (const a of s.avatars)
      if (
        ['queued', 'generating'].includes(a.status) &&
        Date.now() - Date.parse(a.createdAt) > 27000
      ) {
        a.status = 'fallback';
        a.error = 'deadline_exceeded';
      }
  });
}, 1000);
const server = app.listen(Number(process.env.PORT ?? 3001), '0.0.0.0', () =>
  console.log(
    `Bilim API http://localhost:${process.env.PORT ?? 3001} (${demo ? 'synthetic demo' : local ? 'email authentication' : 'OIDC'})`,
  ),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    clearInterval(recovery);
    server.close(() => {
      void Promise.all([queue?.close(), store.close()]).then(() => process.exit(0));
    });
  });
