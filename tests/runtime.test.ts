import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createReadiness,
  maintenanceLoop,
  recoverExpiredAvatars,
  runtimeSettings,
} from '../apps/api/src/runtime';
import { MemoryStore, PostgresStore, initialState } from '../apps/api/src/store';

afterEach(() => vi.useRealTimers());
const local = {
  AUTH_MODE: 'local',
  NODE_ENV: 'production',
  STORAGE_MODE: 'postgres',
  DATABASE_URL: 'postgres://user:private-database-password@db/bilim',
  SESSION_SECRET: 'test-session-value-for-runtime-checks-at-least-32',
  APP_ORIGIN: 'https://bilim.example',
  SMTP_HOST: 'mail.example',
  SMTP_FROM: 'BI Academy <academy@company.example>',
  REGISTRATION_DOMAINS: 'company.example',
};

describe('runtime configuration', () => {
  it('identifies synthetic previews and explicit fallback without requiring external services', () => {
    expect(runtimeSettings({}).services).toEqual({
      authentication: 'demo',
      email: 'preview',
      sms: 'preview',
      avatars: 'fallback',
    });
    expect(runtimeSettings(local).services).toEqual({
      authentication: 'local',
      email: 'configured',
      sms: 'not_configured',
      avatars: 'fallback',
    });
  });
  it('rejects incomplete providers and never logs supplied secrets', () => {
    const env = {
      ...local,
      SMTP_USER: 'private-mail-user',
      SMTP_PASSWORD: 'private-mail-password',
      TWILIO_AUTH_TOKEN: 'private-sms-token',
      AVATAR_PROVIDER: 'openai',
      OPENAI_API_KEY: 'private-images-key',
    };
    expect(() => runtimeSettings(env)).toThrow('Missing TWILIO_ACCOUNT_SID');
    try {
      runtimeSettings(env);
    } catch (error) {
      const text = String(error);
      expect(text).toContain('Missing S3_BUCKET');
      for (const value of Object.values(env).filter((v) => v.startsWith('private-')))
        expect(text).not.toContain(value);
      expect(text).not.toContain('private-database-password');
    }
  });
  it.each([
    { AUTH_MODE: 'other' },
    { AVATAR_PROVIDER: 'typo' },
    { NODE_ENV: 'production' },
    { ...local, APP_ORIGIN: 'http://bilim.example' },
    { ...local, APP_ORIGIN: 'https://bilim.example/unexpected' },
    { ...local, SESSION_SECRET: 'replace-with-at-least-32-random-characters' },
    { ...local, SMTP_PORT: 'NaN' },
    { ...local, SMTP_USER: 'username' },
    { ...local, SMTP_FROM: 'bad\nvalue@example.com' },
    { ...local, REGISTRATION_DOMAINS: 'company.example,*' },
    { REDIS_URL: 'https://cache.example' },
    {
      TWILIO_ACCOUNT_SID: 'sid',
      TWILIO_AUTH_TOKEN: 'secret',
      TWILIO_FROM: '+12345',
      SMS_ALLOWED_PREFIXES: '*',
    },
  ])('fails closed for invalid production settings %#', (env) => {
    expect(() => runtimeSettings(env)).toThrow('Runtime configuration invalid');
  });
  it('accepts complete OIDC and generation settings while exposing no connection values', () => {
    const settings = runtimeSettings({
      ...local,
      AUTH_MODE: 'oidc',
      OIDC_ISSUER: 'https://identity.example',
      OIDC_CLIENT_ID: 'client-id',
      OIDC_CLIENT_SECRET: 'private-id-secret',
      OIDC_REDIRECT_URI: 'https://bilim.example/api/auth/callback',
      AVATAR_PROVIDER: 'openai',
      OPENAI_API_KEY: 'private-api-key',
      REDIS_URL: 'redis://cache:6379/0',
      S3_BUCKET: 'private-bucket',
      S3_ACCESS_KEY_ID: 'private-key',
      S3_SECRET_ACCESS_KEY: 'private-secret',
    });
    expect(settings.services.avatars).toBe('configured');
    expect(settings.services.email).toBe('not_required');
    expect(JSON.stringify(settings)).not.toContain('private');
  });
  it('requires a browser-reachable HTTPS endpoint for custom production object storage', () => {
    const env = {
      ...local,
      AVATAR_PROVIDER: 'openai',
      OPENAI_API_KEY: 'private',
      REDIS_URL: 'redis://cache:6379',
      S3_BUCKET: 'avatars',
      S3_ACCESS_KEY_ID: 'private',
      S3_SECRET_ACCESS_KEY: 'private',
      S3_ENDPOINT: 'http://s3:9000',
    };
    expect(() => runtimeSettings(env)).toThrow('Missing S3_PUBLIC_ENDPOINT');
    expect(() => runtimeSettings({ ...env, S3_PUBLIC_ENDPOINT: 'http://localhost:9000' })).toThrow(
      'Invalid S3_PUBLIC_ENDPOINT',
    );
    expect(
      runtimeSettings({ ...env, S3_PUBLIC_ENDPOINT: 'https://assets.company.example' }).services
        .avatars,
    ).toBe('configured');
  });
});

describe('readiness', () => {
  it('checks storage, coalesces requests and distinguishes an optional avatar outage', async () => {
    const storage = vi.fn(async () => {});
    const ready = createReadiness({
      settings: runtimeSettings({}),
      storage,
      queue: async () => {
        throw Error('redis://private-password@cache');
      },
    });
    const [first, second] = await Promise.all([ready(), ready()]);
    expect(first.status).toBe('degraded');
    expect(second).toEqual(first);
    expect(first.checks.avatarQueue).toBe('unavailable');
    expect(storage).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(first)).not.toContain('private-password');
    await ready();
    expect(storage).toHaveBeenCalledTimes(1);
  });
  it('reports unavailable storage as not ready, and a missing worker as degraded', async () => {
    const unavailable = createReadiness({
      settings: runtimeSettings({}),
      storage: async () => {
        throw Error('db');
      },
    });
    expect((await unavailable()).status).toBe('not_ready');
    const missingWorker = createReadiness({
      settings: runtimeSettings({}),
      storage: async () => {},
      queue: async () => {},
      worker: async () => {
        throw Error('none');
      },
    });
    expect((await missingWorker()).status).toBe('degraded');
    const ready = createReadiness({ settings: runtimeSettings({}), storage: async () => {} });
    expect((await ready()).status).toBe('ready');
  });
  it('bounds hanging checks and never accumulates another unresolved probe', async () => {
    vi.useFakeTimers();
    let release: () => void = () => {};
    const storage = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const ready = createReadiness({ settings: runtimeSettings({}), storage, timeoutMs: 100 });
    const first = ready();
    await vi.advanceTimersByTimeAsync(100);
    expect((await first).status).toBe('not_ready');
    await vi.advanceTimersByTimeAsync(1001);
    const second = ready();
    await vi.advanceTimersByTimeAsync(100);
    expect((await second).status).toBe('not_ready');
    expect(storage).toHaveBeenCalledTimes(1);
    release();
    await Promise.resolve();
    await vi.advanceTimersByTimeAsync(1001);
    const third = ready();
    await Promise.resolve();
    release();
    expect((await third).status).toBe('ready');
  });
});

describe('avatar recovery', () => {
  it('does not rewrite idle storage or hydrate the full PostgreSQL state', async () => {
    const store = new MemoryStore(initialState(true));
    const mutation = vi.spyOn(store, 'tx');
    await recoverExpiredAvatars(store);
    expect(mutation).not.toHaveBeenCalled();
    const postgres = new PostgresStore('postgres://test:test@localhost/test');
    const query = vi.spyOn(postgres.pool, 'query').mockResolvedValue({ rowCount: 0 } as never);
    const read = vi.spyOn(postgres, 'read');
    try {
      await recoverExpiredAvatars(postgres);
      expect(query).toHaveBeenCalledTimes(1);
      expect(read).not.toHaveBeenCalled();
    } finally {
      await postgres.close();
    }
  });
  it('runs maintenance sequentially, catches failures and waits for an active task on stop', async () => {
    vi.useFakeTimers();
    let release: () => void = () => {};
    const task = vi
      .fn()
      .mockRejectedValueOnce(Error('private-error'))
      .mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            release = resolve;
          }),
      );
    const onError = vi.fn();
    const loop = maintenanceLoop(task, { intervalMs: 100, onError });
    await vi.advanceTimersByTimeAsync(200);
    expect(task).toHaveBeenCalledTimes(2);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith();
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);
    let stopped = false;
    const stop = loop.stop().then(() => {
      stopped = true;
    });
    await Promise.resolve();
    expect(stopped).toBe(false);
    release();
    await stop;
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);
  });
  it('settles expired pending jobs but preserves new jobs and ready images', async () => {
    const store = new MemoryStore(initialState(true));
    const now = Date.now();
    await store.tx((state) => {
      const base = state.avatars[0];
      state.avatars = [
        {
          ...base,
          id: 'old-queued',
          status: 'queued',
          createdAt: new Date(now - 27000).toISOString(),
        },
        {
          ...base,
          id: 'old-running',
          status: 'generating',
          createdAt: new Date(now - 28000).toISOString(),
        },
        {
          ...base,
          id: 'ready',
          status: 'ready',
          imageKey: 'saved.png',
          createdAt: new Date(now - 30000).toISOString(),
        },
        { ...base, id: 'new', status: 'queued', createdAt: new Date(now).toISOString() },
      ];
    });
    await recoverExpiredAvatars(store, now);
    const avatars = (await store.read()).avatars;
    expect(avatars.map((a) => a.status)).toEqual(['fallback', 'fallback', 'ready', 'queued']);
    expect(avatars[0].error).toBe('deadline_exceeded');
    expect(avatars[2].imageKey).toBe('saved.png');
  });
});
