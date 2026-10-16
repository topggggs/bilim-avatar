import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  appearanceSchema,
  validateAnswers,
  profile,
  choices,
  avatarConfig,
  buildAvatar,
  avatarName,
  configSchema,
  scaleIds,
  type Scale,
} from '../../../packages/core/src/index.js';
import { audit, type Store, type State, type User, type Avatar, type Session } from './store.js';
import { auth } from './auth.js';
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details: Record<string, unknown> = {},
  ) {
    super(message);
  }
}
function requireRole(user: User, roles: string[]) {
  if (!roles.includes(user.role)) throw new ApiError(403, 'Недостаточно прав');
}
function canView(user: User, target: User) {
  return user.id === target.id || (user.role === 'manager' && target.managerId === user.id);
}
function latest(s: State, id: string) {
  return s.sessions
    .filter((x) => x.userId === id && x.status === 'completed')
    .sort((a, b) => b.completedAt!.localeCompare(a.completedAt!))[0];
}
function ownedSession(s: State, id: string, user: User) {
  const session = s.sessions.find((x) => x.id === id && x.userId === user.id);
  if (!session) throw new ApiError(404, 'Прохождение не найдено');
  return session;
}
function publicAvatar(a: Avatar) {
  return {
    id: a.id,
    sessionId: a.sessionId,
    config: a.config,
    status: a.status,
    name: avatarName(a.config),
    imageUrl: `/api/avatars/${a.id}/image`,
    createdAt: a.createdAt,
    fixed: a.fixed,
    model: a.model,
  };
}
export function createApp(
  store: Store,
  options: {
    demo: boolean;
    origin: string;
    enqueue?: (id: string) => Promise<void>;
    image?: (a: Avatar) => Promise<string>;
  } = { demo: true, origin: 'http://localhost:5173' },
) {
  const app = express();
  app.disable('x-powered-by');
  if (!options.demo) app.set('trust proxy', 1);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:', ...(options.demo ? ['http:'] : [])],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          connectSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use(express.json({ limit: '256kb' }), cookieParser());
  app.use(
    '/api',
    rateLimit({ windowMs: 60000, limit: 240, standardHeaders: 'draft-8', legacyHeaders: false }),
  );
  app.use('/api', (req, _res, next) => {
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin !== options.origin) {
      next(new ApiError(403, 'Запрос должен приходить из Bilim'));
      return;
    }
    next();
  });
  const a = auth(store, options.demo, options.origin);
  app.use('/api/auth', a.router);
  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, mode: options.demo ? 'demo' : 'production' }),
  );
  app.use('/api', a.middleware);
  app.get('/api/me', (req, res) => res.json(req.user));
  app.get('/api/learning/link', (req, res) => {
    const value = z
      .string()
      .regex(/^\/(bilim|buildex|biu)\/[a-z0-9/-]+$/)
      .parse(req.query.path);
    const service = value.split('/')[1];
    const origin = process.env[`${service.toUpperCase()}_BASE_URL`];
    if (!origin) {
      res.json({ url: null, path: value });
      return;
    }
    const base = new URL(origin);
    if (!options.demo && base.protocol !== 'https:')
      throw new ApiError(503, 'Учебный портал должен использовать HTTPS');
    res.json({ url: new URL(value, base).toString() });
  });
  app.get('/api/test/config', async (_req, res) => {
    const s = await store.read();
    res.json(s.versions.find((x) => x.version === s.activeVersion));
  });
  app.get('/api/test/sessions/current', async (req, res) => {
    const s = await store.read(),
      session = s.sessions.find((x) => x.userId === req.user!.id && x.status === 'in_progress');
    res.json(
      session
        ? { ...session, config: s.versions.find((v) => v.version === session.version) }
        : null,
    );
  });
  app.post('/api/test/sessions', async (req, res) => {
    requireRole(req.user!, ['employee', 'manager']);
    const body = z
      .object({ appearance: appearanceSchema, consent: z.literal(true) })
      .strict()
      .parse(req.body);
    const session = await store.tx((s) => {
      const current = s.sessions.find(
        (x) => x.userId === req.user!.id && x.status === 'in_progress',
      );
      if (current) return current;
      const config = s.versions.find((x) => x.version === s.activeVersion)!;
      if (!options.demo && config.contentStatus !== 'approved')
        throw new ApiError(409, 'Методолог должен утвердить методику перед запуском');
      const previous = latest(s, req.user!.id);
      if (previous) {
        const nextAt = new Date(
          Date.parse(previous.completedAt!) + config.retakeDays * 86400000,
        ).toISOString();
        if (Date.parse(nextAt) > Date.now())
          throw new ApiError(409, 'Повторное прохождение пока недоступно', { nextAt });
      }
      const now = new Date().toISOString();
      const session: Session = {
        id: randomUUID(),
        userId: req.user!.id,
        version: config.version,
        appearance: body.appearance,
        answers: {},
        startedAt: now,
        consentAt: now,
        consentVersion: config.consentVersion,
        status: 'in_progress',
      };
      s.sessions.push(session);
      audit(s, req.user!.id, 'test.started', session.id);
      return session;
    });
    res.status(201).json(session);
  });
  app.put('/api/test/sessions/:id/answers', async (req, res) => {
    const body = z
      .object({ answers: z.record(z.string(), z.number()) })
      .strict()
      .parse(req.body);
    const session = await store.tx((s) => {
      const session = ownedSession(s, String(req.params.id), req.user!);
      if (session.status !== 'in_progress') throw new ApiError(409, 'Тест уже завершён');
      const c = s.versions.find((x) => x.version === session.version)!;
      validateAnswers(body.answers, c.questions, false);
      session.answers = { ...session.answers, ...body.answers };
      return session;
    });
    res.json({ savedAt: new Date().toISOString(), answers: session.answers });
  });
  async function enqueue(id: string) {
    try {
      if (options.enqueue) await options.enqueue(id);
      else
        await store.tx((s) => {
          const av = s.avatars.find((x) => x.id === id)!;
          av.status = 'fallback';
          av.model = 'fallback-v1';
        });
    } catch {
      await store.tx((s) => {
        const av = s.avatars.find((x) => x.id === id)!;
        av.status = 'fallback';
        av.error = 'queue_unavailable';
      });
    }
  }
  app.post('/api/test/sessions/:id/submit', async (req, res) => {
    const body = z
      .object({ primary: z.enum(scaleIds).optional(), secondary: z.enum(scaleIds).optional() })
      .strict()
      .parse(req.body ?? {});
    const out = await store.tx((s) => {
      const session = ownedSession(s, String(req.params.id), req.user!);
      if (session.status === 'completed')
        return { session, avatar: s.avatars.find((x) => x.sessionId === session.id)! };
      const c = s.versions.find((v) => v.version === session.version)!;
      const result = profile(
        session.answers,
        c,
        (Date.now() - Date.parse(session.startedAt)) / 1000,
      );
      const opts = choices(result.percentages, body.primary);
      let config;
      try {
        config = avatarConfig(
          session.appearance,
          result.percentages,
          c,
          body.primary,
          body.secondary,
        );
      } catch {
        throw new ApiError(409, 'Выберите качества для героя', {
          code: 'AVATAR_CHOICE_REQUIRED',
          ...opts,
          percentages: result.percentages,
        });
      }
      session.result = result;
      session.status = 'completed';
      session.completedAt = new Date().toISOString();
      const { prompt, fallbackSvg } = buildAvatar(config);
      const av: Avatar = {
        id: randomUUID(),
        sessionId: session.id,
        userId: session.userId,
        config,
        prompt,
        fallbackSvg,
        model: process.env.IMAGE_MODEL ?? 'gpt-image-1',
        status: 'queued',
        createdAt: new Date().toISOString(),
        attempts: 0,
        fixed: false,
      };
      s.avatars.push(av);
      audit(s, req.user!.id, 'test.completed', session.id);
      return { session, avatar: av };
    });
    if (out.avatar.status === 'queued') await enqueue(out.avatar.id);
    res.json({ result: out.session.result, sessionId: out.session.id });
  });
  function portrait(s: State, u: User) {
    const session = latest(s, u.id);
    const av = session
      ? s.avatars
          .filter((x) => x.sessionId === session.id)
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      : [];
    const selected = av.find((x) => x.fixed) ?? av[0];
    const c = s.versions.find((x) => x.version === (session?.version ?? s.activeVersion))!;
    const active = s.versions.find((x) => x.version === s.activeVersion)!;
    return {
      user: { id: u.id, name: u.name, role: u.role, position: u.position },
      result: session?.result ?? null,
      completedAt: session?.completedAt,
      sessionId: session?.id,
      avatar: selected ? publicAvatar(selected) : null,
      history: s.sessions
        .filter((x) => x.userId === u.id && x.status === 'completed')
        .sort((a, b) => a.completedAt!.localeCompare(b.completedAt!))
        .map((x) => ({
          at: x.completedAt,
          percentages: x.result!.percentages,
          testVersion: x.version,
        })),
      nextAllowedAt: session
        ? new Date(Date.parse(session.completedAt!) + active.retakeDays * 86400000).toISOString()
        : null,
      scales: c.scales,
      retakeDays: active.retakeDays,
    };
  }
  app.get('/api/profile/:userId', async (req, res) => {
    const out = await store.tx((s) => {
      const target = s.users.find((x) => x.id === req.params.userId);
      if (!target || !canView(req.user!, target)) throw new ApiError(403, 'Профиль недоступен');
      if (req.user!.id !== target.id) audit(s, req.user!.id, 'profile.viewed', target.id);
      return portrait(s, target);
    });
    res.json(out);
  });
  app.get('/api/team', async (req, res) => {
    requireRole(req.user!, ['manager']);
    res.json(
      await store.tx((s) => {
        audit(s, req.user!.id, 'team.viewed', req.user!.id);
        return s.users.filter((u) => u.managerId === req.user!.id).map((u) => portrait(s, u));
      }),
    );
  });
  app.get('/api/avatar/:userId', async (req, res) => {
    const s = await store.read(),
      target = s.users.find((x) => x.id === req.params.userId);
    if (!target || !canView(req.user!, target)) throw new ApiError(403, 'Аватар недоступен');
    const session = latest(s, target.id);
    const avatars = s.avatars.filter((x) => x.sessionId === session?.id);
    res.json({
      avatars: avatars.map(publicAvatar),
      regenerationsLeft: Math.max(0, 4 - avatars.length),
    });
  });
  app.get('/api/avatars/:id/image', async (req, res) => {
    const s = await store.read(),
      av = s.avatars.find((x) => x.id === req.params.id),
      target = s.users.find((x) => x.id === av?.userId);
    if (!av || !target || !canView(req.user!, target))
      throw new ApiError(403, 'Изображение недоступно');
    res.set('Cache-Control', 'private, max-age=30');
    if (av.imageKey && options.image) {
      res.redirect(await options.image(av));
      return;
    }
    res.type('image/svg+xml').send(av.fallbackSvg);
  });
  app.post('/api/avatar/:userId/regenerate', async (req, res) => {
    if (req.params.userId !== req.user!.id) throw new ApiError(403, 'Нельзя изменять чужой аватар');
    const av = await store.tx((s) => {
      const session = latest(s, req.user!.id);
      if (!session) throw new ApiError(404, 'Сначала пройдите тест');
      const variants = s.avatars.filter((x) => x.sessionId === session.id);
      if (variants.some((x) => x.fixed) || variants.length >= 4)
        throw new ApiError(409, 'Лимит вариантов исчерпан или аватар зафиксирован');
      if (variants.some((x) => ['queued', 'generating'].includes(x.status)))
        throw new ApiError(409, 'Дождитесь текущей генерации');
      const prev = variants[0];
      const next: Avatar = {
        ...prev,
        model: process.env.IMAGE_MODEL ?? 'gpt-image-1',
        id: randomUUID(),
        createdAt: new Date().toISOString(),
        attempts: 0,
        status: 'queued',
        imageKey: undefined,
        error: undefined,
        fixed: false,
      };
      s.avatars.push(next);
      audit(s, req.user!.id, 'avatar.regenerated', next.id);
      return next;
    });
    await enqueue(av.id);
    res.status(202).json(publicAvatar(av));
  });
  app.post('/api/avatars/:id/fix', async (req, res) => {
    await store.tx((s) => {
      const av = s.avatars.find((x) => x.id === req.params.id && x.userId === req.user!.id);
      if (!av) throw new ApiError(404, 'Аватар не найден');
      if (latest(s, req.user!.id)?.id !== av.sessionId)
        throw new ApiError(409, 'Это аватар предыдущего прохождения');
      const all = s.avatars.filter((x) => x.sessionId === av.sessionId);
      if (
        all.some((x) => x.fixed) ||
        !['ready', 'fallback'].includes(av.status) ||
        all.some((x) => ['queued', 'generating'].includes(x.status))
      )
        throw new ApiError(409, 'Выбор сейчас недоступен');
      av.fixed = true;
      audit(s, req.user!.id, 'avatar.fixed', av.id);
    });
    res.json({ ok: true });
  });
  app.get('/api/methodology/config', async (req, res) => {
    requireRole(req.user!, ['methodologist', 'admin']);
    const s = await store.read();
    res.json(s.versions.find((v) => v.version === s.activeVersion));
  });
  app.post('/api/methodology/versions', async (req, res) => {
    requireRole(req.user!, ['methodologist']);
    const config = configSchema.parse(req.body);
    await store.tx((s) => {
      if (s.versions.some((v) => v.version === config.version))
        throw new ApiError(409, 'Создайте новую уникальную версию');
      s.versions.push(config);
      s.activeVersion = config.version;
      audit(s, req.user!.id, 'config.published', config.version);
    });
    res.status(201).json({ ok: true, version: config.version });
  });
  app.get('/api/admin/audit', async (req, res) => {
    requireRole(req.user!, ['admin']);
    const s = await store.read();
    res.json(s.audit.slice().reverse().slice(0, 200));
  });
  app.get('/api/admin/users', async (req, res) => {
    requireRole(req.user!, ['admin']);
    res.json((await store.read()).users);
  });
  app.post('/api/admin/users', async (req, res) => {
    requireRole(req.user!, ['admin']);
    const body = z
      .object({
        id: z.string().regex(/^[a-zA-Z0-9_-]{1,100}$/),
        sub: z.string().min(1),
        name: z.string().min(1).max(100),
        position: z.string().max(100),
        role: z.enum(['employee', 'manager', 'methodologist', 'admin']),
        managerId: z.string().optional(),
      })
      .strict()
      .parse(req.body);
    await store.tx((s) => {
      if (body.managerId && !s.users.some((u) => u.id === body.managerId && u.role === 'manager'))
        throw new ApiError(400, 'Укажите существующего руководителя');
      if (s.users.some((u) => u.sub === body.sub && u.id !== body.id))
        throw new ApiError(409, 'OIDC subject уже занят');
      if (body.id === req.user!.id && body.role !== 'admin')
        throw new ApiError(409, 'Нельзя отозвать собственную роль администратора');
      const index = s.users.findIndex((u) => u.id === body.id);
      if (index >= 0) s.users[index] = body;
      else s.users.push(body);
      audit(s, req.user!.id, 'user.updated', body.id);
    });
    res.json({ ok: true });
  });
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (error instanceof ApiError) {
        res.status(error.status).json({ error: error.message, ...error.details });
        return;
      }
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        res.status(400).json({
          error: 'Проверьте формат данных',
          issues: error instanceof z.ZodError ? error.issues : undefined,
        });
        return;
      }
      if (error instanceof Error && /Ответ|шкал/.test(error.message)) {
        res.status(400).json({ error: error.message });
        return;
      }
      console.error('Request failed:', error instanceof Error ? error.message : 'unknown');
      res.status(500).json({ error: 'Не удалось выполнить запрос. Попробуйте ещё раз.' });
    },
  );
  return app;
}
