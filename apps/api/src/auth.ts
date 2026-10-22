import { smsConfigured, type SendAuthSms } from './sms.js';
import { localAuth, type SendAuthMail } from './local-auth.js';
import { randomBytes, createHash } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import { SignJWT, jwtVerify, createRemoteJWKSet } from 'jose';
import type { Store, User } from './store.js';
export type AuthRequest = Express.Request & { user?: User };
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
export function auth(
  store: Store,
  demo: boolean,
  origin: string,
  options: { local?: boolean; sendMail?: SendAuthMail; sendSms?: SendAuthSms } = {},
) {
  const local = options.local ?? (demo || process.env.AUTH_MODE === 'local');
  const preview = demo && process.env.NODE_ENV !== 'production';
  const phone = local && (preview || !!options.sendSms || smsConfigured());
  const secret = new TextEncoder().encode(
    process.env.SESSION_SECRET ?? randomBytes(32).toString('hex'),
  );
  const router = Router();
  const cookie = { httpOnly: true, secure: !demo, sameSite: 'lax' as const, path: '/api' };
  async function token(payload: Record<string, unknown>, expires = '8h') {
    return new SignJWT(payload)
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(expires)
      .sign(secret);
  }
  const middleware: RequestHandler = async (req, res, next) => {
    try {
      const raw = req.cookies?.bilim_session;
      if (!raw) {
        res.status(401).json({ error: 'Требуется вход' });
        return;
      }
      const { payload } = await jwtVerify(raw, secret, { algorithms: ['HS256'] });
      const allowedKinds = demo ? ['demo', 'local'] : local ? ['local'] : ['oidc'];
      if (!allowedKinds.includes(String(payload.kind))) throw Error('Authentication mode changed');
      const state = await store.read();
      req.user = state.users.find((u) => u.id === payload.uid);
      const account =
        payload.kind === 'local' ? state.accounts.find((a) => a.userId === payload.uid) : undefined;
      if (payload.kind === 'local' && (!account || account.sessionVersion !== payload.sv))
        throw Error('Session revoked');
      if (!req.user) {
        res.status(401).json({ error: 'Нет доступа к BI Group' });
        return;
      }
      next();
    } catch {
      res.status(401).json({ error: 'Сессия истекла. Войдите снова.' });
    }
  };
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
  router.get('/mode', (_req, res) =>
    res.json({ demo, local, oidc: !demo && !local, preview, phone }),
  );
  if (local)
    router.use(
      localAuth(store, {
        origin,
        preview,
        sendMail: options.sendMail,
        sendSms: options.sendSms,
        phone,
        otpSecret: secret,
        // "*" explicitly allows registration from any confirmed email.
        domains: process.env.REGISTRATION_DOMAINS?.split(',')
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s && s !== '*'),
        signIn: async (res, uid, sv) => {
          res.cookie('bilim_session', await token({ uid, sv, kind: 'local' }), {
            ...cookie,
            maxAge: 8 * 3600000,
          });
        },
      }),
    );
  router.post('/demo', async (req, res) => {
    if (!demo) {
      res.sendStatus(404);
      return;
    }
    const allowed = ['employee', 'manager', 'methodologist', 'admin'];
    const id = req.body?.userId ?? 'employee';
    if (!allowed.includes(id)) {
      res.sendStatus(400);
      return;
    }
    res.cookie('bilim_session', await token({ uid: id, kind: 'demo' }), cookie).json({ ok: true });
  });
  router.post('/logout', async (req, res) => {
    try {
      const { payload } = await jwtVerify(req.cookies?.bilim_session, secret, {
        algorithms: ['HS256'],
      });
      if (payload.kind === 'local')
        await store.tx((s) => {
          const a = s.accounts.find((x) => x.userId === payload.uid);
          if (a && a.sessionVersion === payload.sv) a.sessionVersion += 1;
        });
    } catch {}
    res.clearCookie('bilim_session', cookie).json({ ok: true });
  });
  let discovery:
    | Promise<{
        issuer: string;
        authorization_endpoint: string;
        token_endpoint: string;
        jwks_uri: string;
      }>
    | undefined;
  function discover() {
    return (discovery ??= (async () => {
      const issuer = process.env.OIDC_ISSUER!;
      const r = await fetch(`${issuer.replace(/\/$/, '')}/.well-known/openid-configuration`, {
        signal: AbortSignal.timeout(10000),
      });
      if (!r.ok) throw Error('OIDC discovery failed');
      const d = await r.json();
      if (d.issuer !== issuer) throw Error('OIDC issuer mismatch');
      return d;
    })());
  }
  router.get('/login', async (_req, res, next) => {
    try {
      if (demo || local) {
        res.redirect(origin);
        return;
      }
      const d = await discover(),
        state = randomBytes(24).toString('base64url'),
        nonce = randomBytes(24).toString('base64url'),
        verifier = randomBytes(48).toString('base64url');
      res.cookie('bilim_oidc', await token({ state, nonce, verifier }, '10m'), {
        ...cookie,
        maxAge: 600000,
      });
      const url = new URL(d.authorization_endpoint);
      url.search = new URLSearchParams({
        client_id: process.env.OIDC_CLIENT_ID!,
        redirect_uri: process.env.OIDC_REDIRECT_URI!,
        response_type: 'code',
        scope: 'openid profile',
        state,
        nonce,
        code_challenge: createHash('sha256').update(verifier).digest('base64url'),
        code_challenge_method: 'S256',
      }).toString();
      res.redirect(url.toString());
    } catch (e) {
      next(e);
    }
  });
  router.get('/callback', async (req, res, next) => {
    try {
      if (demo || local) {
        res.sendStatus(404);
        return;
      }
      const { payload } = await jwtVerify(req.cookies.bilim_oidc, secret, {
        algorithms: ['HS256'],
      });
      res.clearCookie('bilim_oidc', cookie);
      if (
        typeof req.query.state !== 'string' ||
        payload.state !== req.query.state ||
        typeof req.query.code !== 'string'
      )
        throw Error('OIDC state mismatch');
      const d = await discover();
      const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code: req.query.code,
        redirect_uri: process.env.OIDC_REDIRECT_URI!,
        client_id: process.env.OIDC_CLIENT_ID!,
        code_verifier: String(payload.verifier),
      });
      const response = await fetch(d.token_endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          Authorization: `Basic ${Buffer.from(`${process.env.OIDC_CLIENT_ID}:${process.env.OIDC_CLIENT_SECRET}`).toString('base64')}`,
        },
        body,
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw Error('OIDC token exchange failed');
      const tokens = await response.json();
      const verified = await jwtVerify(tokens.id_token, createRemoteJWKSet(new URL(d.jwks_uri)), {
        issuer: d.issuer,
        audience: process.env.OIDC_CLIENT_ID,
        requiredClaims: ['exp', 'iat', 'sub'],
        algorithms: ['RS256', 'ES256'],
      });
      if (
        verified.payload.nonce !== payload.nonce ||
        (Array.isArray(verified.payload.aud) &&
          verified.payload.aud.length > 1 &&
          verified.payload.azp !== process.env.OIDC_CLIENT_ID)
      )
        throw Error('OIDC nonce/audience mismatch');
      const s = await store.read(),
        user = s.users.find((u) => u.sub === verified.payload.sub);
      if (!user) {
        res
          .status(403)
          .send('Учётная запись не подключена к BI Group. Обратитесь к администратору.');
        return;
      }
      res
        .cookie('bilim_session', await token({ uid: user.id, kind: 'oidc' }), cookie)
        .redirect(origin);
    } catch (e) {
      next(e);
    }
  });
  return { router, middleware };
}
