import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from './server.js';
const { app, store, queue, demo, local } = await createServer();
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../dist/web');
app.use(express.static(root));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(root, 'index.html')));
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
    `BI Group API http://localhost:${process.env.PORT ?? 3001} (${demo ? 'synthetic demo' : local ? 'email authentication' : 'OIDC'})`,
  ),
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => {
    clearInterval(recovery);
    server.close(() => {
      void Promise.all([queue?.close(), store.close()]).then(() => process.exit(0));
    });
  });
