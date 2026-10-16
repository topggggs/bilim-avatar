import { PostgresStore, type Store } from './store.js';

type Environment = Record<string, string | undefined>;
export type RuntimeSettings = {
  auth: 'demo' | 'local' | 'oidc';
  avatarProvider: 'fallback' | 'openai';
  services: {
    authentication: 'demo' | 'local' | 'oidc';
    email: 'preview' | 'configured' | 'not_required';
    sms: 'preview' | 'configured' | 'not_configured' | 'not_required';
    avatars: 'fallback' | 'configured';
  };
};

// Diagnostics contain variable names and fixed messages only, never supplied values.
export function runtimeSettings(env: Environment = process.env): RuntimeSettings {
  const issues: string[] = [];
  const auth = env.AUTH_MODE ?? 'demo';
  const avatarProvider = env.AVATAR_PROVIDER ?? 'fallback';
  const production = env.NODE_ENV === 'production';
  const required = (...keys: string[]) => {
    for (const key of keys) if (!env[key]?.trim()) issues.push(`Missing ${key}`);
  };
  const url = (key: string, protocols: string[], originOnly = false) => {
    if (!env[key]) return;
    try {
      const value = new URL(env[key]);
      if (
        !value.hostname ||
        !protocols.includes(value.protocol) ||
        (originOnly && (value.origin !== env[key] || value.username || value.password))
      )
        issues.push(`Invalid ${key}`);
    } catch {
      issues.push(`Invalid ${key}`);
    }
  };
  if (!['demo', 'local', 'oidc'].includes(auth)) issues.push('Invalid AUTH_MODE');
  if (!['fallback', 'openai'].includes(avatarProvider)) issues.push('Invalid AVATAR_PROVIDER');
  if (env.STORAGE_MODE && !['file', 'postgres'].includes(env.STORAGE_MODE))
    issues.push('Invalid STORAGE_MODE');
  if (production && (auth === 'demo' || env.STORAGE_MODE !== 'postgres'))
    issues.push('Production requires local or OIDC authentication and PostgreSQL');
  if (env.STORAGE_MODE === 'postgres') {
    required('DATABASE_URL');
    url('DATABASE_URL', ['postgres:', 'postgresql:']);
  }
  if (auth !== 'demo') {
    required('SESSION_SECRET', 'APP_ORIGIN');
    if (
      env.SESSION_SECRET &&
      (env.SESSION_SECRET.length < 32 || /^(replace|change-me|example)/i.test(env.SESSION_SECRET))
    )
      issues.push('SESSION_SECRET must be a generated secret of at least 32 characters');
    url('APP_ORIGIN', ['https:'], true);
    if (auth === 'local') {
      required('SMTP_HOST', 'SMTP_FROM', 'REGISTRATION_DOMAINS');
      const port = Number(env.SMTP_PORT ?? 587);
      if (!Number.isInteger(port) || port < 1 || port > 65535) issues.push('Invalid SMTP_PORT');
      if (Boolean(env.SMTP_USER) !== Boolean(env.SMTP_PASSWORD))
        issues.push('SMTP_USER and SMTP_PASSWORD must be set together');
      if (env.SMTP_FROM && !/^[^\r\n]*[^\s@<>]+@[^\s@<>]+[^\r\n]*$/.test(env.SMTP_FROM))
        issues.push('Invalid SMTP_FROM');
      if (
        env.REGISTRATION_DOMAINS &&
        env.REGISTRATION_DOMAINS.split(',').some(
          (domain) => !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain.trim()),
        )
      )
        issues.push('Invalid REGISTRATION_DOMAINS');
    } else if (auth === 'oidc') {
      required('OIDC_ISSUER', 'OIDC_CLIENT_ID', 'OIDC_CLIENT_SECRET', 'OIDC_REDIRECT_URI');
      url('OIDC_ISSUER', ['https:']);
      url('OIDC_REDIRECT_URI', ['https:']);
    }
  }
  const smsFields = ['TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM'];
  const smsCount = smsFields.filter((key) => env[key]?.trim()).length;
  if (smsCount && smsCount !== smsFields.length) required(...smsFields);
  if (smsCount && env.SMS_ALLOWED_PREFIXES) {
    if (
      env.SMS_ALLOWED_PREFIXES.split(',').some((prefix) => !/^\+[1-9]\d{0,5}$/.test(prefix.trim()))
    )
      issues.push('Invalid SMS_ALLOWED_PREFIXES');
  }
  if (env.REDIS_URL) url('REDIS_URL', ['redis:', 'rediss:']);
  if (avatarProvider === 'openai') {
    required(
      'OPENAI_API_KEY',
      'REDIS_URL',
      'S3_BUCKET',
      'S3_ACCESS_KEY_ID',
      'S3_SECRET_ACCESS_KEY',
    );
    if (production && env.S3_ENDPOINT) required('S3_PUBLIC_ENDPOINT');
    for (const key of ['S3_ENDPOINT', 'S3_PUBLIC_ENDPOINT']) url(key, ['http:', 'https:']);
    if (env.S3_PUBLIC_ENDPOINT && production) url('S3_PUBLIC_ENDPOINT', ['https:']);
  }
  if (issues.length)
    throw Error(`Runtime configuration invalid: ${[...new Set(issues)].join('; ')}`);
  return {
    auth: auth as RuntimeSettings['auth'],
    avatarProvider: avatarProvider as RuntimeSettings['avatarProvider'],
    services: {
      authentication: auth as RuntimeSettings['auth'],
      email: auth === 'demo' ? 'preview' : auth === 'local' ? 'configured' : 'not_required',
      sms:
        auth === 'demo'
          ? 'preview'
          : auth !== 'local'
            ? 'not_required'
            : smsCount === 3
              ? 'configured'
              : 'not_configured',
      avatars: avatarProvider === 'openai' ? 'configured' : 'fallback',
    },
  };
}

type Check = 'ok' | 'unavailable' | 'not_required';
export type ReadinessReport = {
  status: 'ready' | 'degraded' | 'not_ready';
  checks: { storage: Check; avatarQueue: Check; avatarWorker: Check };
  services: RuntimeSettings['services'];
};

function boundedProbe(check: () => Promise<unknown>, timeoutMs: number) {
  let pending: Promise<unknown> | undefined;
  return async (): Promise<Check> => {
    // Reuse a stuck probe instead of piling up database/Redis work on every request.
    if (!pending) {
      const next = Promise.resolve().then(check);
      pending = next;
      void next
        .finally(() => {
          if (pending === next) pending = undefined;
        })
        .catch(() => {});
    }
    let timer: ReturnType<typeof setTimeout>;
    try {
      await Promise.race([
        pending,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(Error('timeout')), timeoutMs);
        }),
      ]);
      return 'ok';
    } catch {
      return 'unavailable';
    } finally {
      clearTimeout(timer!);
    }
  };
}

export function createReadiness(options: {
  settings: RuntimeSettings;
  storage: () => Promise<unknown>;
  queue?: () => Promise<unknown>;
  worker?: () => Promise<unknown>;
  timeoutMs?: number;
}) {
  const storage = boundedProbe(options.storage, options.timeoutMs ?? 2000);
  const queue = options.queue && boundedProbe(options.queue, options.timeoutMs ?? 2000);
  const worker = options.worker && boundedProbe(options.worker, options.timeoutMs ?? 2000);
  let running: Promise<ReadinessReport> | undefined;
  let last: { at: number; report: ReadinessReport } | undefined;
  return (): Promise<ReadinessReport> => {
    if (last && Date.now() - last.at < 1000) return Promise.resolve(last.report);
    if (running) return running;
    running = (async () => {
      const [database, avatarQueue, avatarWorker] = await Promise.all([
        storage(),
        queue ? queue() : Promise.resolve<Check>('not_required'),
        worker ? worker() : Promise.resolve<Check>('not_required'),
      ]);
      const report: ReadinessReport = {
        status:
          database !== 'ok'
            ? 'not_ready'
            : [avatarQueue, avatarWorker].includes('unavailable')
              ? 'degraded'
              : 'ready',
        checks: { storage: database, avatarQueue, avatarWorker },
        services: options.settings.services,
      };
      last = { at: Date.now(), report };
      return report;
    })().finally(() => {
      running = undefined;
    });
    return running;
  };
}

export function maintenanceLoop(
  task: () => Promise<unknown>,
  options: { intervalMs?: number; onError?: () => void } = {},
) {
  let stopped = false;
  let running: Promise<void> | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const schedule = () => {
    if (stopped) return;
    timer = setTimeout(() => {
      running = (async () => {
        try {
          await task();
        } catch {
          options.onError?.();
        }
      })().finally(schedule);
    }, options.intervalMs ?? 1000);
    timer.unref?.();
  };
  schedule();
  return {
    async stop() {
      stopped = true;
      clearTimeout(timer);
      await running;
    },
  };
}

export async function recoverExpiredAvatars(store: Store, now = Date.now()) {
  // PostgresStore.read() currently hydrates the pilot snapshot; avoid that write path
  // for an idle maintenance tick and only open a mutation when recovery is needed.
  const pending =
    store instanceof PostgresStore
      ? (
          await store.pool.query(
            "SELECT 1 FROM avatars WHERE payload->>'status' IN ('queued','generating') AND (payload->>'createdAt')::timestamptz <= $1 LIMIT 1",
            [new Date(now - 27000).toISOString()],
          )
        ).rowCount! > 0
      : (await store.read()).avatars.some(
          (avatar) =>
            ['queued', 'generating'].includes(avatar.status) &&
            now - Date.parse(avatar.createdAt) >= 27000,
        );
  if (!pending) return;
  await store.tx((state) => {
    for (const avatar of state.avatars) {
      if (
        ['queued', 'generating'].includes(avatar.status) &&
        now - Date.parse(avatar.createdAt) >= 27000
      ) {
        avatar.status = 'fallback';
        avatar.model = 'fallback-v1';
        avatar.error = 'deadline_exceeded';
      }
    }
  });
}
