import 'dotenv/config';
import { createAnalyzer } from './analysis.js';
import { createStore } from './store.js';
import { createApp } from './app.js';
import { avatarQueue, imageUrl, generate } from './generation.js';
import { smtpLogDetails, verifySmtp } from './local-auth.js';

export async function createServer() {
  const demo = (process.env.AUTH_MODE ?? 'demo') === 'demo';
  const local = process.env.AUTH_MODE === 'local';
  if (process.env.NODE_ENV === 'production' && (demo || process.env.STORAGE_MODE !== 'postgres'))
    throw Error('Production requires local or OIDC authentication and PostgreSQL');
  if (!demo && process.env.NODE_ENV === 'production') {
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
  if (local && process.env.SMTP_HOST?.trim())
    void verifySmtp().then(
      () =>
        console.log(`SMTP ${process.env.SMTP_HOST}: login OK, registration emails will be sent`),
      (e) => console.error(`SMTP ${process.env.SMTP_HOST}: ${smtpLogDetails(e)}`),
    );
  const store = await createStore();
  const queue = process.env.REDIS_URL ? avatarQueue() : undefined;
  const app = createApp(store, {
    analyze: createAnalyzer(),
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
  return { app, store, queue, demo, local };
}
