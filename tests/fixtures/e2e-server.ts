// Isolated HTTP harness: synthetic accounts, file storage and a named provider fixture.
// Production entry points never import this file or offer a mock analysis provider.
import express from 'express';
import path from 'node:path';
import { createApp } from '../../apps/api/src/app';
import { createStore } from '../../apps/api/src/store';
import { createAnalyzer } from '../../apps/api/src/analysis';
import { configSchema } from '../../packages/core/src/index';
import raw from '../../config/test.ru.json';
import { reportFor } from './written';
const store = await createStore();
const c = configSchema.parse(raw);
const analyze = createAnalyzer({
  provider: 'gemini',
  apiKey: 'e2e-fixture',
  request: (async () => {
    const { model, analyzedAt, rubricVersion, ...report } = reportFor(c);
    report.ratings[0].value = 1;
    await new Promise((resolve) => setTimeout(resolve, 700));
    return Response.json({
      modelVersion: 'e2e-fixture',
      candidates: [
        { finishReason: 'STOP', content: { parts: [{ text: JSON.stringify(report) }] } },
      ],
    });
  }) as typeof fetch,
});
const app = createApp(store, { demo: true, origin: process.env.APP_ORIGIN!, analyze });
const root = path.resolve('dist/web');
app.use(express.static(root));
app.get('/{*splat}', (_req, res) => res.sendFile(path.join(root, 'index.html')));
const server = app.listen(Number(process.env.PORT), '127.0.0.1');
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => server.close(() => void store.close().then(() => process.exit(0))));
