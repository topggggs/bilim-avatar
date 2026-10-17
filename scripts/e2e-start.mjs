import { rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';
await rm(new URL('../.data/e2e', import.meta.url), { recursive: true, force: true });
const child = spawn(process.execPath, ['--import', 'tsx', 'tests/fixtures/e2e-server.ts'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    APP_ORIGIN: 'http://localhost:3011',
    PORT: '3011',
    DATA_DIR: '.data/e2e',
    AUTH_MODE: 'demo',
    STORAGE_MODE: 'file',
    AVATAR_PROVIDER: 'fallback',
    REDIS_URL: '',
  },
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('exit', (code) => process.exit(code ?? 0));
