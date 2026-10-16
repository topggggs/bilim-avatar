import { phoneSchema, smsConfigured, twilioSender, type SendAuthSms } from './sms.js';
import {
  randomBytes,
  randomInt,
  randomUUID,
  createHash,
  createHmac,
  scrypt,
  timingSafeEqual,
} from 'node:crypto';
import { Router, type Response } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import nodemailer from 'nodemailer';
import { audit, type Store, type State } from './store.js';

export class AuthError extends Error {
  constructor(
    public status: number,
    message: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
  }
}
export const emailSchema = z
  .string()
  .trim()
  .max(254)
  .email('Укажите корректную почту')
  .transform((v) => v.toLowerCase());
export const passwordSchema = z
  .string()
  .min(15, 'Нужно не менее 15 символов')
  .max(128, 'Максимум 128 символов')
  .refine(
    (v) =>
      v.trim().length >= 15 &&
      !['123456789012345', 'passwordpassword', 'qwertyuiopasdfgh'].includes(v.toLowerCase()),
    'Используйте более длинную и уникальную фразу',
  );
const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const params = { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 };
const derive = (password: string, salt: string) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, 64, params, (error, key) => (error ? reject(error) : resolve(key))),
  );
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  return `scrypt$32768$8$3$${salt}$${(await derive(password, salt)).toString('hex')}`;
}
export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, n, r, p, salt, key, extra] = encoded.split('$');
  if (
    algorithm !== 'scrypt' ||
    n !== '32768' ||
    r !== '8' ||
    p !== '3' ||
    !/^[a-f0-9]{32}$/.test(salt ?? '') ||
    !/^[a-f0-9]{128}$/.test(key ?? '') ||
    extra !== undefined
  )
    return false;
  return timingSafeEqual(await derive(password, salt), Buffer.from(key, 'hex'));
}
export type AuthMail = { to: string; kind: 'signup' | 'reset'; link: string };
export type SendAuthMail = (mail: AuthMail) => Promise<void>;
export function smtpMailer(): SendAuthMail {
  const port = Number(process.env.SMTP_PORT ?? 587);
  const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    requireTLS: true,
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
      : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
    debug: false,
  });
  return async ({ to, kind, link }) => {
    await transport.sendMail({
      from: process.env.SMTP_FROM,
      to,
      subject: kind === 'signup' ? 'Bilim — подтверждение почты' : 'Bilim — восстановление доступа',
      text: `${kind === 'signup' ? 'Завершите регистрацию в Bilim' : 'Если вы регистрировались в Bilim, установите новый пароль'}:\n\n${link}\n\nСсылка действует ${kind === 'signup' ? '30' : '15'} минут. Если вы не отправляли запрос, проигнорируйте это письмо.`,
    });
  };
}
function liveToken(s: State, raw: string, kind: 'signup' | 'reset') {
  const record = s.authTokens.find(
    (t) =>
      t.hash === digest(raw) &&
      t.kind === kind &&
      !t.usedAt &&
      Date.parse(t.expiresAt) > Date.now(),
  );
  if (!record) throw new AuthError(400, 'Ссылка недействительна или устарела. Запросите новую.');
  return record;
}
let dummyPassword: Promise<string> | undefined;
export function localAuth(
  store: Store,
  options: {
    origin: string;
    preview: boolean;
    domains?: string[];
    sendMail?: SendAuthMail;
    sendSms?: SendAuthSms;
    phone: boolean;
    otpSecret: Uint8Array;
    signIn: (res: Response, userId: string, version: number) => Promise<void>;
  },
) {
  const router = Router();
  router.use(
    rateLimit({
      windowMs: 15 * 60000,
      limit: 40,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { error: 'Слишком много попыток. Повторите через 15 минут.' },
    }),
  );
  // A real derivation for unknown emails keeps login comparison work comparable.
  const dummy = () => (dummyPassword ??= hashPassword(randomBytes(32).toString('hex')));
  const sendMail =
    options.sendMail ?? (!options.preview && process.env.SMTP_HOST ? smtpMailer() : undefined);
  const sendSms =
    options.sendSms ?? (!options.preview && smsConfigured() ? twilioSender() : undefined);
  const otpHash = (id: string, code: string) =>
    createHmac('sha256', options.otpSecret).update(`${id}:${code}`).digest('hex');
  const sameContact = (
    a: { email?: string; phone?: string },
    b: { email?: string; phone?: string },
  ) => !!((a.email && a.email === b.email) || (a.phone && a.phone === b.phone));
  const emailBody = z.object({ email: emailSchema }).strict();
  async function requestLink(email: string, kind: 'signup' | 'reset') {
    if (
      kind === 'signup' &&
      options.domains?.length &&
      !options.domains.includes(email.split('@')[1])
    )
      throw new AuthError(400, 'Используйте рабочую почту разрешённого домена.', {
        email: 'Используйте рабочую почту',
      });
    if (!options.preview && !sendMail)
      throw new AuthError(503, 'Отправка писем пока недоступна. Попробуйте позже.');
    const raw = randomBytes(32).toString('base64url');
    const record = await store.tx((s) => {
      // Keep expired records briefly for the per-address throttle, then remove them.
      s.authTokens = s.authTokens.filter((t) => Date.parse(t.createdAt) > Date.now() - 86400000);
      const recent = s.authTokens.filter(
        (t) => t.email === email && Date.parse(t.createdAt) > Date.now() - 3600000,
      );
      if (
        recent.length >= 5 ||
        recent.some((t) => t.kind === kind && Date.parse(t.createdAt) > Date.now() - 60000)
      )
        throw new AuthError(429, 'Письмо уже запрошено. Подождите перед повторной отправкой.');
      const next = {
        id: randomUUID(),
        hash: digest(raw),
        email,
        kind,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + (kind === 'signup' ? 30 : 15) * 60000).toISOString(),
      };
      s.authTokens.push(next);
      return next;
    });
    const link = `${options.origin}/#${kind === 'signup' ? 'verify' : 'reset'}=${raw}`;
    if (sendMail) {
      try {
        await sendMail({ to: email, kind, link });
      } catch {
        await store.tx((s) => {
          s.authTokens = s.authTokens.filter((t) => t.id !== record.id);
        });
        throw new AuthError(503, 'Не удалось отправить письмо. Попробуйте ещё раз.');
      }
    }
    return { ok: true, retryAfter: 60, ...(options.preview ? { previewLink: link } : {}) };
  }
  router.post('/phone/request', async (req, res) => {
    if (!options.phone) throw new AuthError(503, 'Вход по телефону пока недоступен.');
    const body = z
      .object({ phone: phoneSchema, kind: z.enum(['signup', 'reset']) })
      .strict()
      .parse(req.body);
    const prefixes = (process.env.SMS_ALLOWED_PREFIXES ?? '+7')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!prefixes.some((p) => body.phone.startsWith(p)))
      throw new AuthError(400, 'Номера этой страны пока не поддерживаются.', {
        phone: 'Используйте поддерживаемый код страны',
      });
    if (!options.preview && !sendSms) throw new AuthError(503, 'Отправка SMS пока недоступна.');
    const code = String(randomInt(0, 1000000)).padStart(6, '0');
    const id = randomUUID();
    await store.tx((s) => {
      s.phoneChallenges = s.phoneChallenges.filter(
        (x) => Date.parse(x.createdAt) > Date.now() - 86400000,
      );
      const recent = s.phoneChallenges.filter(
        (x) => x.phone === body.phone && Date.parse(x.createdAt) > Date.now() - 3600000,
      );
      if (
        recent.length >= 5 ||
        recent.some((x) => x.kind === body.kind && Date.parse(x.createdAt) > Date.now() - 60000)
      )
        throw new AuthError(429, 'Код уже запрошен. Подождите перед повторной отправкой.');
      // A resend invalidates earlier codes for this number and purpose.
      for (const x of s.phoneChallenges)
        if (x.phone === body.phone && x.kind === body.kind) x.usedAt = new Date().toISOString();
      s.phoneChallenges.push({
        id,
        phone: body.phone,
        kind: body.kind,
        hash: otpHash(id, code),
        attempts: 0,
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 5 * 60000).toISOString(),
      });
    });
    if (sendSms)
      try {
        await sendSms({ to: body.phone, code });
      } catch {
        await store.tx((s) => {
          s.phoneChallenges = s.phoneChallenges.filter((x) => x.id !== id);
        });
        throw new AuthError(503, 'Не удалось отправить SMS. Попробуйте ещё раз.');
      }
    res.json({
      challengeId: id,
      retryAfter: 60,
      ...(options.preview ? { previewCode: code } : {}),
    });
  });
  router.post('/phone/verify', async (req, res) => {
    if (!options.phone) throw new AuthError(503, 'Вход по телефону пока недоступен.');
    const body = z
      .object({
        challengeId: z.string().uuid(),
        code: z.string().regex(/^\d{6}$/, 'Введите 6 цифр из SMS'),
      })
      .strict()
      .parse(req.body);
    const token = randomBytes(32).toString('base64url');
    // Incorrect attempts must commit, so return a failure instead of throwing in tx.
    const valid = await store.tx((s) => {
      const c = s.phoneChallenges.find((x) => x.id === body.challengeId);
      if (!c || c.usedAt || c.attempts >= 5 || Date.parse(c.expiresAt) <= Date.now()) return null;
      c.attempts += 1;
      if (
        !timingSafeEqual(Buffer.from(c.hash, 'hex'), Buffer.from(otpHash(c.id, body.code), 'hex'))
      )
        return null;
      c.usedAt = new Date().toISOString();
      s.authTokens.push({
        id: randomUUID(),
        hash: digest(token),
        phone: c.phone,
        kind: c.kind,
        createdAt: c.usedAt,
        expiresAt: new Date(Date.now() + 10 * 60000).toISOString(),
      });
      return { kind: c.kind };
    });
    if (!valid)
      throw new AuthError(400, 'Неверный или устаревший код. Проверьте SMS или запросите новый.', {
        code: 'Код не подошёл. Осталось не более 5 попыток на SMS.',
      });
    res.json({ token, kind: valid.kind });
  });
  router.post('/register/request', async (req, res) => {
    const { email } = emailBody.parse(req.body);
    res.json(await requestLink(email, 'signup'));
  });
  router.post('/register/complete', async (req, res) => {
    const body = z
      .object({
        token: tokenSchema,
        name: z.string().trim().min(2, 'Укажите имя и фамилию').max(100),
        position: z.string().trim().max(100).optional(),
        password: passwordSchema,
        consent: z.literal(true, { error: 'Нужно согласие на обработку данных' }),
      })
      .strict()
      .parse(req.body);
    // Check a token before doing expensive password work, then re-check atomically.
    liveToken(await store.read(), body.token, 'signup');
    const passwordHash = await hashPassword(body.password);
    const account = await store.tx((s) => {
      const record = liveToken(s, body.token, 'signup');
      if (s.accounts.some((a) => sameContact(a, record)))
        throw new AuthError(409, 'Учётная запись уже создана. Войдите или восстановите пароль.');
      const userId = randomUUID(),
        at = new Date().toISOString();
      s.users.push({
        id: userId,
        name: body.name,
        position: body.position || 'Сотрудник',
        role: 'employee',
      });
      const next = {
        id: randomUUID(),
        userId,
        email: record.email,
        phone: record.phone,
        passwordHash,
        sessionVersion: 1,
        createdAt: at,
        verifiedAt: at,
        consentAt: at,
        consentVersion: 'registration-1',
      };
      s.accounts.push(next);
      for (const t of s.authTokens)
        if (sameContact(t, record) && t.kind === 'signup') t.usedAt = at;
      audit(s, userId, 'account.registered', userId);
      return next;
    });
    await options.signIn(res, account.userId, account.sessionVersion);
    res.status(201).json({ ok: true });
  });
  router.post('/password/login', async (req, res) => {
    const { email, phone, password } = z
      .object({
        email: emailSchema.optional(),
        phone: phoneSchema.optional(),
        password: z.string().min(1).max(128),
      })
      .strict()
      .refine((v) => !!v.email !== !!v.phone, 'Укажите почту или телефон')
      .parse(req.body);
    const account = (await store.read()).accounts.find((a) => sameContact(a, { email, phone }));
    const valid = await verifyPassword(password, account?.passwordHash ?? (await dummy()));
    if (
      !account ||
      !valid ||
      (account.lockedUntil && Date.parse(account.lockedUntil) > Date.now())
    ) {
      if (account)
        await store.tx((s) => {
          const a = s.accounts.find((x) => x.id === account.id)!;
          if (
            a.passwordHash !== account.passwordHash ||
            (a.lockedUntil && Date.parse(a.lockedUntil) > Date.now())
          )
            return;
          a.failedLogins = (a.failedLogins ?? 0) + 1;
          if (a.failedLogins >= 8) {
            a.lockedUntil = new Date(Date.now() + 15 * 60000).toISOString();
            a.failedLogins = 0;
          }
        });
      throw new AuthError(401, 'Неверные данные для входа.');
    }
    // A concurrent reset must invalidate a login that checked the old hash.
    const current = await store.tx((s) => {
      const a = s.accounts.find((x) => x.id === account.id);
      if (
        !a ||
        a.passwordHash !== account.passwordHash ||
        (a.lockedUntil && Date.parse(a.lockedUntil) > Date.now())
      )
        throw new AuthError(401, 'Неверные данные для входа.');
      a.failedLogins = 0;
      a.lockedUntil = undefined;
      audit(s, a.userId, 'account.login', a.userId);
      return a;
    });
    await options.signIn(res, current.userId, current.sessionVersion);
    res.json({ ok: true });
  });
  router.post('/password/request', async (req, res) => {
    const { email } = emailBody.parse(req.body);
    res.json(await requestLink(email, 'reset'));
  });
  router.post('/password/reset', async (req, res) => {
    const body = z
      .object({ token: tokenSchema, password: passwordSchema })
      .strict()
      .parse(req.body);
    liveToken(await store.read(), body.token, 'reset');
    const passwordHash = await hashPassword(body.password);
    const contact = await store.tx((s) => {
      const record = liveToken(s, body.token, 'reset');
      const account = s.accounts.find((a) => sameContact(a, record));
      if (!account)
        throw new AuthError(400, 'Ссылка недействительна или устарела. Запросите новую.');
      account.passwordHash = passwordHash;
      account.sessionVersion += 1;
      account.failedLogins = 0;
      account.lockedUntil = undefined;
      const at = new Date().toISOString();
      for (const t of s.authTokens) if (sameContact(t, record) && t.kind === 'reset') t.usedAt = at;
      audit(s, account.userId, 'account.password_reset', account.userId);
      return { email: account.email, phone: account.phone };
    });
    res.json({ ok: true, ...contact });
  });
  return router;
}
