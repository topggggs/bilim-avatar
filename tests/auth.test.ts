import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../apps/api/src/app';
import { MemoryStore, initialState } from '../apps/api/src/store';
import { digest, hashPassword, verifyPassword, smtpMailer } from '../apps/api/src/local-auth';
import { phoneSchema, twilioSender } from '../apps/api/src/sms';
import nodemailer from 'nodemailer';
const origin = 'http://localhost:5173';
const password = 'Моя длинная рабочая фраза 2026';
let store: MemoryStore, app: ReturnType<typeof createApp>;
beforeEach(() => {
  store = new MemoryStore(initialState(true));
  app = createApp(store, { demo: true, origin });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
const agent = () => request.agent(app);
const post = (a: ReturnType<typeof agent>, route: string, data: object) =>
  a.post(`/api/auth${route}`).set('Origin', origin).send(data);
const linkToken = (link: string) => link.split('=')[1];
async function register(email = 'worker@example.test') {
  const a = agent();
  const token = linkToken(
    (await post(a, '/register/request', { email }).expect(200)).body.previewLink,
  );
  await post(a, '/register/complete', {
    token,
    name: 'Айдар Асанов',
    position: 'Инженер',
    password,
    consent: true,
  }).expect(201);
  return { a, token, email };
}
describe('регистрация и доступ', () => {
  it('разрешает Vite loopback host alias только в демо-режиме', async () => {
    await request(app)
      .post('/api/auth/register/request')
      .set('Origin', 'http://127.0.0.1:5173')
      .send({ email: 'loopback@example.test' })
      .expect(200);
    await request(app)
      .post('/api/auth/register/request')
      .set('Origin', 'http://localhost:3001')
      .send({ email: 'api-origin@example.test' })
      .expect(200);

    const production = createApp(store, { demo: false, origin });
    await request(production)
      .post('/api/auth/login')
      .set('Origin', 'http://127.0.0.1:5173')
      .send({})
      .expect(403);
  });
  it('local-регистрация при npm run dev принимает 127.0.0.1 вместо localhost', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const mail = vi.fn(async () => {});
    const dev = createApp(store, { demo: false, localAuth: true, origin, sendAuthMail: mail });
    await request(dev)
      .post('/api/auth/register/request')
      .set('Origin', 'http://127.0.0.1:5173')
      .send({ email: 'loopback@example.test' })
      .expect(200);
    expect(mail).toHaveBeenCalledOnce();
  });
  it('подтверждение почты, нормализация, фиксированная роль, секреты отдельно от пользователя', async () => {
    const a = agent();
    const r = await post(a, '/register/request', { email: ' Worker@Example.Test ' }).expect(200);
    expect((await store.read()).accounts).toHaveLength(0);
    const token = linkToken(r.body.previewLink);
    expect((await store.read()).authTokens[0].hash).toBe(digest(token));
    const data = { token, name: 'Айдар Асанов', password, consent: true };
    await post(a, '/register/complete', { ...data, role: 'admin' }).expect(400);
    await post(a, '/register/complete', { ...data, consent: false }).expect(400);
    await post(a, '/register/complete', { ...data, password: 'short' }).expect(400);
    const result = await post(a, '/register/complete', data).expect(201);
    expect(result.headers['set-cookie'][0]).toContain('HttpOnly');
    expect(result.headers['set-cookie'][0]).toContain('SameSite=Lax');
    const user = (await a.get('/api/me').expect(200)).body;
    expect(user.role).toBe('employee');
    expect(user.managerId).toBeUndefined();
    expect(user.passwordHash).toBeUndefined();
    const state = await store.read();
    expect(state.accounts[0].email).toBe('worker@example.test');
    expect(state.accounts[0].passwordHash).not.toBe(password);
    expect(state.accounts[0].consentVersion).toBe('registration-1');
    expect(JSON.stringify((await a.get(`/api/profile/${user.id}`)).body)).not.toContain(
      'passwordHash',
    );
    await a.get('/api/admin/users').expect(403);
    await a.get('/api/team').expect(403);
    await post(a, '/register/complete', data).expect(400);
  });
  it('вход, одинаковая ошибка неизвестной почты/неверного пароля, отзыв cookie после выхода', async () => {
    const { a, email } = await register();
    await post(a, '/logout', {}).expect(200);
    await a.get('/api/me').expect(401);
    const wrong = await post(a, '/password/login', { email, password: 'wrong' }).expect(401);
    expect(
      (
        await post(a, '/password/login', {
          email: 'unknown@example.test',
          password: 'wrong',
        }).expect(401)
      ).body,
    ).toEqual(wrong.body);
    const login = await post(a, '/password/login', { email: email.toUpperCase(), password }).expect(
      200,
    );
    const copiedCookie = login.headers['set-cookie'][0].split(';')[0];
    await post(a, '/logout', {}).expect(200);
    await request(app).get('/api/me').set('Cookie', copiedCookie).expect(401);
  });
  it('сброс пароля: одноразовая ссылка, все старые сессии завершаются', async () => {
    const { a, email } = await register();
    await store.tx((s) => {
      s.authTokens.forEach((t) => {
        t.createdAt = new Date(Date.now() - 61000).toISOString();
      });
    });
    const token = linkToken(
      (await post(a, '/password/request', { email }).expect(200)).body.previewLink,
    );
    await post(a, '/password/reset', { token, password: 'Новый очень длинный пароль 2026' }).expect(
      200,
    );
    await a.get('/api/me').expect(401);
    await post(a, '/password/reset', { token, password }).expect(400);
    await post(a, '/password/login', { email, password }).expect(401);
    await post(a, '/password/login', { email, password: 'Новый очень длинный пароль 2026' }).expect(
      200,
    );
  });
  it('нет аккаунта без токена, просроченные ссылки и неизвестные сбросы отклоняются', async () => {
    const a = agent();
    const token = linkToken(
      (await post(a, '/register/request', { email: 'test@example.test' })).body.previewLink,
    );
    await store.tx((s) => {
      s.authTokens[0].expiresAt = new Date(Date.now() - 1).toISOString();
    });
    await post(a, '/register/complete', { token, name: 'Name', password, consent: true }).expect(
      400,
    );
    const other = linkToken(
      (await post(a, '/password/request', { email: 'absent@example.test' })).body.previewLink,
    );
    await post(a, '/password/reset', { token: other, password }).expect(400);
    expect((await store.read()).accounts).toHaveLength(0);
  });
  it('дубликаты аккаунта и конкурентное использование ссылки запрещены', async () => {
    const a = agent();
    const token = linkToken(
      (await post(a, '/register/request', { email: 'race@example.test' })).body.previewLink,
    );
    const data = { token, name: 'Name', password, consent: true };
    const r = await Promise.all([
      post(a, '/register/complete', data),
      post(a, '/register/complete', data),
    ]);
    expect(r.map((x) => x.status).sort()).toEqual([201, 400]);
    expect((await store.read()).accounts).toHaveLength(1);
    await store.tx((s) => {
      s.authTokens.forEach((t) => {
        t.createdAt = new Date(Date.now() - 61000).toISOString();
      });
    });
    const next = linkToken(
      (await post(a, '/register/request', { email: 'race@example.test' })).body.previewLink,
    );
    await post(a, '/register/complete', { ...data, token: next }).expect(409);
  });
  it('ограничивает повторную отправку, домены и подбор пароля', async () => {
    vi.stubEnv('REGISTRATION_DOMAINS', 'company.kz');
    app = createApp(store, { demo: true, origin });
    const a = agent();
    await post(a, '/register/request', { email: 'worker@other.kz' }).expect(400);
    const token = linkToken(
      (await post(a, '/register/request', { email: 'worker@company.kz' })).body.previewLink,
    );
    await post(a, '/register/request', { email: 'worker@company.kz' }).expect(429);
    await post(a, '/register/complete', { token, name: 'Name', password, consent: true }).expect(
      201,
    );
    for (let i = 0; i < 8; i++)
      await post(a, '/password/login', { email: 'worker@company.kz', password: 'wrong' }).expect(
        401,
      );
    await post(a, '/password/login', { email: 'worker@company.kz', password }).expect(401);
    expect((await store.read()).accounts[0].lockedUntil).toBeTruthy();
  });
  it('scrypt с солью, корректным сравнением и отклонением повреждённого хеша', async () => {
    const a = await hashPassword(password),
      b = await hashPassword(password);
    expect(a).not.toBe(b);
    expect(await verifyPassword(password, a)).toBe(true);
    expect(await verifyPassword('different', a)).toBe(false);
    expect(await verifyPassword(password, 'broken')).toBe(false);
  });
  it('смена режима авторизации отклоняет старые локальные cookie', async () => {
    vi.stubEnv('SESSION_SECRET', 'same-test-secret-at-least-32-characters');
    app = createApp(store, { demo: true, origin });
    const { a } = await register();
    const login = await post(a, '/password/login', {
      email: 'worker@example.test',
      password,
    }).expect(200);
    const cookie = login.headers['set-cookie'][0].split(';')[0];
    const oidc = createApp(store, { demo: false, origin });
    await request(oidc).get('/api/me').set('Cookie', cookie).expect(401);
  });
  it('в OIDC режиме регистрация паролем закрыта', async () => {
    app = createApp(store, { demo: false, origin });
    const a = agent();
    expect((await a.get('/api/auth/mode')).body).toMatchObject({
      local: false,
      oidc: true,
      preview: false,
    });
    await post(a, '/register/request', { email: 'test@example.test' }).expect(401);
  });
});
describe('номер телефона', () => {
  async function challenge(a = agent(), phone = '+77011234567', kind = 'signup') {
    return (await post(a, '/phone/request', { phone, kind }).expect(200)).body;
  }
  async function verify(a: ReturnType<typeof agent>, c: any) {
    return (
      await post(a, '/phone/verify', { challengeId: c.challengeId, code: c.previewCode }).expect(
        200,
      )
    ).body.token;
  }
  it('номер E.164, код SMS, регистрация, вход и восстановление', async () => {
    expect(phoneSchema.parse('+7 (701) 123-45-67')).toBe('+77011234567');
    const a = agent(),
      c = await challenge(a, '+7 (701) 123-45-67');
    const token = await verify(a, c);
    await post(a, '/phone/verify', { challengeId: c.challengeId, code: c.previewCode }).expect(400);
    await post(a, '/register/complete', {
      token,
      name: 'Test User',
      password,
      consent: true,
    }).expect(201);
    const account = (await store.read()).accounts[0];
    expect(account.phone).toBe('+77011234567');
    expect(account.email).toBeUndefined();
    await post(a, '/password/login', { phone: '+77011234567', password }).expect(200);
    await store.tx((s) => {
      s.phoneChallenges.forEach((x) => {
        x.createdAt = new Date(Date.now() - 61000).toISOString();
      });
    });
    const resetToken = await verify(a, await challenge(a, '+77011234567', 'reset'));
    await post(a, '/password/reset', {
      token: resetToken,
      password: 'Новая фраза для моего входа',
    }).expect(200);
    await a.get('/api/me').expect(401);
    await post(a, '/password/login', {
      phone: '+77011234567',
      password: 'Новая фраза для моего входа',
    }).expect(200);
  });
  it('пять неверных кодов блокируют проверку, попытки сохраняются', async () => {
    const a = agent(),
      c = await challenge(a);
    const wrong = c.previewCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++)
      await post(a, '/phone/verify', { challengeId: c.challengeId, code: wrong }).expect(400);
    await post(a, '/phone/verify', { challengeId: c.challengeId, code: c.previewCode }).expect(400);
    expect((await store.read()).phoneChallenges[0].attempts).toBe(5);
  });
  it('проверяет срок SMS и интервал отправки; новый код отменяет предыдущий', async () => {
    const a = agent(),
      c = await challenge(a);
    await post(a, '/phone/request', { phone: '+77011234567', kind: 'signup' }).expect(429);
    await store.tx((s) => {
      s.phoneChallenges[0].createdAt = new Date(Date.now() - 61000).toISOString();
    });
    const next = await challenge(a);
    await post(a, '/phone/verify', { challengeId: c.challengeId, code: c.previewCode }).expect(400);
    await store.tx((s) => {
      s.phoneChallenges.find((x) => x.id === next.challengeId)!.expiresAt = new Date(
        Date.now() - 1,
      ).toISOString();
    });
    await post(a, '/phone/verify', {
      challengeId: next.challengeId,
      code: next.previewCode,
    }).expect(400);
    await post(a, '/phone/request', { phone: '8701abc', kind: 'signup' }).expect(400);
    await post(a, '/phone/request', { phone: '+12025550123', kind: 'signup' }).expect(400);
  });
});
describe('доставка и production', () => {
  it('коды/ссылки не возвращаются production-клиенту, передаются только доставщику', async () => {
    const mail = vi.fn(async () => {}),
      sms = vi.fn(async () => {});
    app = createApp(store, {
      demo: false,
      localAuth: true,
      origin,
      sendAuthMail: mail,
      sendAuthSms: sms,
    });
    const a = agent();
    expect((await a.get('/api/auth/mode')).body.preview).toBe(false);
    const email = await post(a, '/register/request', { email: 'test@example.test' }).expect(200);
    const phone = await post(a, '/phone/request', { phone: '+77011234567', kind: 'signup' }).expect(
      200,
    );
    expect(email.body.previewLink).toBeUndefined();
    expect(phone.body.previewCode).toBeUndefined();
    expect(mail.mock.calls).toHaveLength(1);
    expect(sms.mock.calls).toHaveLength(1);
    expect(JSON.stringify(await store.read())).not.toContain(password);
    await post(a, '/demo', {}).expect(404);
  });
  it('ошибка доставки не оставляет активной ссылки или кода', async () => {
    app = createApp(store, {
      demo: true,
      origin,
      sendAuthMail: async () => {
        throw Error('SMTP secret');
      },
      sendAuthSms: async () => {
        throw Error('SMS secret');
      },
    });
    const a = agent();
    const mail = await post(a, '/register/request', { email: 'test@example.test' }).expect(503);
    const sms = await post(a, '/phone/request', { phone: '+77011234567', kind: 'signup' }).expect(
      503,
    );
    expect(mail.text + sms.text).not.toContain('secret');
    expect((await store.read()).authTokens).toHaveLength(0);
    expect((await store.read()).phoneChallenges).toHaveLength(0);
  });
  it('без настроенной почты production возвращает понятную ошибку', async () => {
    vi.stubEnv('SMTP_HOST', '');
    app = createApp(store, { demo: false, localAuth: true, origin });
    await post(agent(), '/register/request', { email: 'test@example.test' }).expect(503);
  });
  it('Gmail без пароля приложения не выдаёт фиктивную ссылку подтверждения', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.gmail.com');
    vi.stubEnv('SMTP_USER', 'sender@gmail.com');
    vi.stubEnv('SMTP_PASSWORD', '');
    vi.stubEnv('SMTP_FROM', 'sender@gmail.com');
    app = createApp(store, { demo: false, localAuth: true, origin });
    const response = await post(agent(), '/register/request', {
      email: 'person@gmail.test',
    }).expect(503);
    expect(response.body.error).toContain('SMTP_PASSWORD');
    expect(response.body.previewLink).toBeUndefined();
    expect((await store.read()).authTokens).toHaveLength(0);
  });
  it('Gmail: пробелы пароля приложения убираются, отказ входа объясняется', async () => {
    vi.stubEnv('SMTP_HOST', 'smtp.gmail.com');
    vi.stubEnv('SMTP_USER', 'sender@gmail.com');
    vi.stubEnv('SMTP_PASSWORD', 'abcd efgh ijkl mnop');
    const rejected = Object.assign(Error('Invalid login: 535-5.7.8 Username and Password'), {
      code: 'EAUTH',
      responseCode: 535,
    });
    const create = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({
      sendMail: async () => {
        throw rejected;
      },
    } as any);
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    app = createApp(store, { demo: false, localAuth: true, origin });
    const response = await post(agent(), '/register/request', {
      email: 'person@gmail.test',
    }).expect(503);
    expect((create.mock.calls[0][0] as any).auth).toEqual({
      user: 'sender@gmail.com',
      pass: 'abcdefghijklmnop',
    });
    expect(response.body.error).toContain('пароль приложения');
    expect(log.mock.calls[0].join(' ')).toContain('SMTP_PASSWORD');
    expect((await store.read()).authTokens).toHaveLength(0);
  });
  it('demo не вызывает настоящего SMS провайдера даже при наличии ключей', async () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtest');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'test-secret');
    vi.stubEnv('TWILIO_FROM', 'Bilim');
    const network = vi.spyOn(globalThis, 'fetch');
    app = createApp(store, { demo: true, origin });
    const response = await post(agent(), '/phone/request', {
      phone: '+77011234567',
      kind: 'signup',
    }).expect(200);
    expect(response.body.previewCode).toMatch(/^\d{6}$/);
    expect(network).not.toHaveBeenCalled();
  });
  it('SMTP использует TLS, текстовое письмо и одноразовую ссылку', async () => {
    const sendMail = vi.fn(async (_message: unknown) => ({}));
    const create = vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as any);
    await smtpMailer()({
      to: 'test@example.test',
      kind: 'signup',
      link: `${origin}/#verify=test-token`,
    });
    expect(create.mock.calls[0][0]).toMatchObject({
      requireTLS: true,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    expect(sendMail.mock.calls[0][0]).toMatchObject({
      to: 'test@example.test',
      subject: 'BI Group — подтверждение почты',
    });
  });
  it('зарегистрированный сотрудник начинает тест, даже если методика в статусе черновика', async () => {
    const links: string[] = [];
    app = createApp(store, {
      demo: false,
      localAuth: true,
      origin,
      sendAuthMail: async ({ link }) => void links.push(link),
    });
    expect((await store.read()).versions[0].contentStatus).toBe('draft');
    const a = agent();
    await post(a, '/register/request', { email: 'draft@example.test' }).expect(200);
    const created = await post(a, '/register/complete', {
      token: linkToken(links[0]),
      name: 'Новый Сотрудник',
      password,
      consent: true,
    }).expect(201);
    // Production cookies are Secure; supertest speaks plain HTTP, so pass the session explicitly.
    await request(app)
      .post('/api/test/sessions')
      .set('Origin', origin)
      .set('Cookie', created.headers['set-cookie'][0].split(';')[0])
      .send({
        appearance: { universe: 'animals', gender: 'neutral', style: 'tech' },
        consent: true,
        analysisProvider: 'gemini',
      })
      .expect(201);
  });
  it('письмо приходит на языке интерфейса из Accept-Language', async () => {
    const mail = vi.fn(async (_mail: unknown) => {});
    app = createApp(store, { demo: false, localAuth: true, origin, sendAuthMail: mail });
    await post(agent(), '/register/request', { email: 'kk@example.test' })
      .set('Accept-Language', 'kk')
      .expect(200);
    await post(agent(), '/register/request', { email: 'browser@example.test' })
      .set('Accept-Language', 'de-DE,de;q=0.9')
      .expect(200);
    expect(mail.mock.calls.map(([m]) => (m as { lang: string }).lang)).toEqual(['kk', 'ru']);
    const sendMail = vi.fn(async (_message: unknown) => ({}));
    vi.spyOn(nodemailer, 'createTransport').mockReturnValue({ sendMail } as any);
    await smtpMailer()({ to: 'a@example.test', kind: 'reset', link: 'x', lang: 'en' });
    expect(sendMail.mock.calls[0][0]).toMatchObject({ subject: 'BI Group — reset your password' });
  });
  it('SMS провайдер получает E.164 и код; ошибки API не раскрывают ключи', async () => {
    vi.stubEnv('TWILIO_ACCOUNT_SID', 'ACtest');
    vi.stubEnv('TWILIO_AUTH_TOKEN', 'secret');
    vi.stubEnv('TWILIO_FROM', 'Bilim');
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response('{}', { status: 201 }));
    await twilioSender()({ to: '+77011234567', code: '123456' });
    expect(String((fetchMock.mock.calls[0][1] as any).body)).toContain('123456');
    fetchMock.mockResolvedValue(new Response('{}', { status: 500 }));
    await expect(twilioSender()({ to: '+77011234567', code: '123456' })).rejects.toThrow(
      'SMS delivery failed',
    );
  });
});
