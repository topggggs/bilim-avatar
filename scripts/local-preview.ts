import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { S3Client, HeadBucketCommand, CreateBucketCommand } from '@aws-sdk/client-s3';
import { PostgresStore, initialState } from '../apps/api/src/store.js';
const run = promisify(execFile);
await mkdir('.data', { recursive: true });
const file = '.data/preview-secrets.env';
let saved: string;
try {
  saved = await readFile(file, 'utf8');
} catch (e) {
  if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
  saved = `PREVIEW_DB_PASSWORD=${randomBytes(24).toString('hex')}\nPREVIEW_S3_SECRET=${randomBytes(24).toString('hex')}\nPREVIEW_SESSION_SECRET=${randomBytes(40).toString('hex')}\n`;
  await writeFile(file, saved, { mode: 0o600 });
}
const vars = Object.fromEntries(
  saved
    .trim()
    .split('\n')
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at), line.slice(at + 1)];
    }),
);
try {
  await access('dist/web/index.html');
} catch {
  throw Error('Сначала выполните npm run build');
}
console.log('Подключение PostgreSQL, Redis и S3…');
await run(
  'docker',
  ['compose', '--env-file', file, '-f', 'compose.preview.yml', 'up', '-d', '--wait'],
  { maxBuffer: 1024 * 1024 },
);
const databaseUrl = `postgres://bilim:${vars.PREVIEW_DB_PASSWORD}@127.0.0.1:55432/bilim_preview`;
const store = new PostgresStore(databaseUrl);
await store.init();
await store.tx((s) => {
  if (!s.users.length) Object.assign(s, initialState(true));
});
await store.close();
const endpoint = 'http://127.0.0.1:59000',
  bucket = 'bilim-preview-avatars';
const s3 = new S3Client({
  endpoint,
  region: 'us-east-1',
  forcePathStyle: true,
  credentials: { accessKeyId: 'bilim_preview', secretAccessKey: vars.PREVIEW_S3_SECRET },
});
for (let attempt = 0; attempt < 12; attempt++) {
  try {
    try {
      await s3.send(new HeadBucketCommand({ Bucket: bucket }));
    } catch (e) {
      if ((e as any).$metadata?.httpStatusCode !== 404) throw e;
      await s3.send(new CreateBucketCommand({ Bucket: bucket }));
    }
    break;
  } catch (e) {
    if (attempt === 11) throw Error('Локальное S3 не готово');
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}
s3.destroy();
const env = {
  ...process.env,
  NODE_ENV: 'development',
  AUTH_MODE: 'demo',
  STORAGE_MODE: 'postgres',
  DATABASE_URL: databaseUrl,
  REDIS_URL: 'redis://127.0.0.1:56379',
  AVATAR_PROVIDER: 'fallback',
  APP_ORIGIN: 'http://127.0.0.1:53001',
  PORT: '53001',
  SESSION_SECRET: vars.PREVIEW_SESSION_SECRET,
  S3_ENDPOINT: endpoint,
  S3_PUBLIC_ENDPOINT: endpoint,
  S3_REGION: 'us-east-1',
  S3_BUCKET: bucket,
  S3_ACCESS_KEY_ID: 'bilim_preview',
  S3_SECRET_ACCESS_KEY: vars.PREVIEW_S3_SECRET,
};
const children = ['apps/api/src/worker.ts', 'apps/api/src/index.ts'].map((file) =>
  spawn(process.execPath, ['--import', 'tsx', file], { env, stdio: 'inherit' }),
);
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
}
for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, stop);
for (const child of children)
  child.on('exit', () => {
    if (!stopping) {
      stop();
      process.exitCode = 1;
    }
  });
console.log('Локальный сайт: http://127.0.0.1:53001');
console.log(
  'Внешние SMS, письма и модель не вызываются. Для реальных подключений используйте production-конфигурацию.',
);
