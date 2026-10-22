import { build } from 'esbuild';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
const out = '.vercel/output';
const fn = `${out}/functions/api.func`;
await rm(out, { recursive: true, force: true });
await cp('dist/web', `${out}/static`, { recursive: true });
await mkdir(fn, { recursive: true });
await build({
  entryPoints: ['apps/api/src/vercel.ts'],
  outfile: `${fn}/index.mjs`,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // Bundled CommonJS dependencies need require() in ESM.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  // pg-native is optional and not installed.
  external: ['pg-native'],
  logLevel: 'warning',
});
const json = (value) => JSON.stringify(value, null, 2);
await writeFile(
  `${fn}/.vc-config.json`,
  json({
    runtime: 'nodejs22.x',
    handler: 'index.mjs',
    launcherType: 'Nodejs',
    // Let Express read the request body.
    shouldAddHelpers: false,
    maxDuration: 60,
  }),
);
await writeFile(
  `${out}/config.json`,
  json({
    version: 3,
    routes: [
      { src: '^/api(?:/.*)?$', dest: '/api' },
      { handle: 'filesystem' },
      { src: '^/(.*)$', dest: '/index.html' },
    ],
  }),
);
console.log(`Vercel output ready in ${out}`);
