import { AnalysisUnavailableError, type AnalyzeAnswers } from './analysis.js';
import {
  validateWrittenAnswers,
  writtenProfile,
  InsufficientAnswersError,
  type WrittenAnswers,
} from '../../../packages/core/src/written.js';
import type { Answers } from '../../../packages/core/src/index.js';
import type { SendAuthSms } from './sms.js';
import { AuthError, type SendAuthMail } from './local-auth.js';
import { developmentRank } from '../../../packages/core/src/ranks.js';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  appearanceSchema,
  lookSchema,
  validateAnswers,
  profile,
  choices,
  avatarConfig,
  buildAvatar,
  avatarName,
  configSchema,
  AVATAR_VARIANT_LIMIT,
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
    // The image is cached for 30 s, so a saved look must change the URL.
    imageUrl: `/api/avatars/${a.id}/image${a.customizedAt ? `?v=${Date.parse(a.customizedAt)}` : ''}`,
    createdAt: a.createdAt,
    fixed: a.fixed,
    model: a.model,
  };
}
export function createApp(
  store: Store,
  options: {
    analyze?: AnalyzeAnswers;
    demo: boolean;
    localAuth?: boolean;
    sendAuthMail?: SendAuthMail;
    sendAuthSms?: SendAuthSms;
    origin: string;
    enqueue?: (id: string) => Promise<void>;
    image?: (a: Avatar) => Promise<string>;
  } = { demo: true, origin: 'http://localhost:5173' },
) {
  const app = express();
  app.disable('x-powered-by');
  const configuredOrigin = new URL(options.origin);
  const allowedOrigins = new Set([configuredOrigin.origin]);
  // `npm run dev` serves Vite on 127.0.0.1 while APP_ORIGIN usually says localhost.
  if (options.demo || process.env.NODE_ENV === 'development') {
    const hosts = [configuredOrigin.hostname];
    if (configuredOrigin.hostname === 'localhost') hosts.push('127.0.0.1');
    else if (configuredOrigin.hostname === '127.0.0.1') hosts.push('localhost');
    const ports = new Set([configuredOrigin.port, process.env.PORT ?? '3001']);
    for (const hostname of hosts)
      for (const port of ports) {
        const candidate = new URL(configuredOrigin);
        candidate.hostname = hostname;
        candidate.port = port;
        allowedOrigins.add(candidate.origin);
      }
  }
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
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      !allowedOrigins.has(req.headers.origin ?? '')
    ) {
      next(new ApiError(403, 'Запрос должен приходить из BI Group'));
      return;
    }
    next();
  });
  const a = auth(store, options.demo, options.origin, {
    local: options.localAuth,
    sendMail: options.sendAuthMail,
    sendSms: options.sendAuthSms,
  });
  app.use('/api/auth', a.router);
  app.get('/api/health', (_req, res) =>
    res.json({ ok: true, mode: options.demo ? 'demo' : 'production' }),
  );
  app.use('/api', (_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });
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
  app.get('/api/test/analysis-status', (_req, res) => res.json({ available: !!options.analyze }));
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
      const previous = latest(s, req.user!.id);
      if (previous) {
        const nextAt = new Date(
          Date.parse(previous.completedAt!) + config.retakeDays * 86400000,
        ).toISOString();
        if (
          (s.versions.find((v) => v.version === previous.version)?.responseFormat ?? 'likert') ===
            (config.responseFormat ?? 'likert') &&
          Date.parse(nextAt) > Date.now()
        )
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
      .object({
        answers: z.union([z.record(z.string(), z.string()), z.record(z.string(), z.number())]),
      })
      .strict()
      .parse(req.body);
    const session = await store.tx((s) => {
      const session = ownedSession(s, String(req.params.id), req.user!);
      if (session.status !== 'in_progress') throw new ApiError(409, 'Тест уже завершён');
      const c = s.versions.find((x) => x.version === session.version)!;
      if (c.responseFormat === 'written') {
        try {
          validateWrittenAnswers(body.answers as WrittenAnswers, c, false);
        } catch (e) {
          throw new ApiError(400, (e as Error).message);
        }
      } else validateAnswers(body.answers as Answers, c.questions, false);
      const changed = Object.entries(body.answers).some(
        ([id, value]) => session.answers[id] !== value,
      );
      if (
        changed &&
        session.analysis?.status === 'running' &&
        Date.now() - Date.parse(session.analysis.startedAt) < 90000
      )
        throw new ApiError(409, 'Дождитесь окончания анализа');
      session.answers = { ...session.answers, ...body.answers } as typeof session.answers;
      if (changed) delete session.analysis;
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
      .object({
        primary: z.enum(scaleIds).optional(),
        secondary: z.enum(scaleIds).optional(),
        retryAnalysis: z.boolean().optional(),
      })
      .strict()
      .parse(req.body ?? {});
    const pending = await store.tx((s) => {
      const session = ownedSession(s, String(req.params.id), req.user!);
      const c = s.versions.find((v) => v.version === session.version)!;
      if (
        c.responseFormat !== 'written' ||
        session.status === 'completed' ||
        session.analysis?.status === 'ready'
      )
        return null;
      try {
        validateWrittenAnswers(session.answers as WrittenAnswers, c);
      } catch (e) {
        throw new ApiError(400, (e as Error).message);
      }
      if (!options.analyze)
        throw new ApiError(503, new AnalysisUnavailableError().message, {
          code: 'AI_NOT_CONFIGURED',
        });
      if (
        session.analysis?.status === 'running' &&
        Date.now() - Date.parse(session.analysis.startedAt) < 90000
      )
        return { running: true as const };
      if (session.analysis?.status === 'failed' && !body.retryAnalysis)
        throw new ApiError(422, session.analysis.error!, {
          code: 'ANALYSIS_FAILED',
          questionIds: session.analysis.questionIds,
        });
      const runId = randomUUID();
      session.analysis = { status: 'running', runId, startedAt: new Date().toISOString() };
      audit(s, req.user!.id, 'test.analysis_started', session.id);
      return {
        running: false as const,
        sessionId: session.id,
        runId,
        answers: session.answers as WrittenAnswers,
        config: c,
      };
    });
    if (pending) {
      if (!pending.running) {
        const job = pending;
        // The provider call runs outside the store transaction; no lock is held over the network.
        void (async () => {
          try {
            const report = await options.analyze!(job.answers, job.config);
            writtenProfile(report, job.config);
            await store.tx((s) => {
              const session = s.sessions.find((x) => x.id === job.sessionId)!;
              if (session.analysis?.runId !== job.runId) return;
              session.analysis = { ...session.analysis, status: 'ready', report };
              audit(s, session.userId, 'test.analysis_completed', session.id);
            });
          } catch (error) {
            await store.tx((s) => {
              const session = s.sessions.find((x) => x.id === job.sessionId)!;
              if (session.analysis?.runId !== job.runId) return;
              session.analysis = {
                ...session.analysis,
                status: 'failed',
                error:
                  error instanceof InsufficientAnswersError
                    ? error.message
                    : 'Не удалось завершить ИИ-анализ. Ответы сохранены. Попробуйте ещё раз.',
                questionIds:
                  error instanceof InsufficientAnswersError ? error.questionIds : undefined,
              };
              audit(s, session.userId, 'test.analysis_failed', session.id);
            });
          }
        })().catch(() => console.error('Analysis state could not be persisted'));
      }
      res.status(202).json({ status: 'analyzing' });
      return;
    }
    const out = await store.tx((s) => {
      const session = ownedSession(s, String(req.params.id), req.user!);
      if (session.status === 'completed')
        return { session, avatar: s.avatars.find((x) => x.sessionId === session.id)! };
      const c = s.versions.find((v) => v.version === session.version)!;
      const result =
        c.responseFormat === 'written'
          ? writtenProfile(session.analysis!.report!, c)
          : profile(
              session.answers as Answers,
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
          c.responseFormat !== 'written' &&
            c.questions.every((question) => session.answers[question.id] === 1),
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
  function portrait(s: State, u: User, includeAnswerStatistics = false) {
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
      development: {
        rank: developmentRank(
          !!session,
          s.development
            .filter((x) => x.userId === u.id && x.status === 'approved')
            .map((x) => x.recommendationId),
        ),
        records: s.development.filter((x) => x.userId === u.id),
        tasks: session
          ? c.recommendations.map(({ id, title, text, durationDays }) => ({
              id,
              title,
              text,
              durationDays,
            }))
          : [],
      },
      result: session?.result ?? null,
      answerStatistics:
        includeAnswerStatistics && session && c.responseFormat !== 'written'
          ? (() => {
              const items = c.questions.map((question) => ({
                id: question.id,
                text: question.text,
                scales: question.scales,
                answer: (session.answers as Answers)[question.id]!,
              }));
              const distribution = Array.from({ length: 7 }, (_, index) => ({
                value: index + 1,
                count: items.filter((item) => item.answer === index + 1).length,
              }));
              return {
                average: Number(
                  (items.reduce((sum, item) => sum + item.answer, 0) / items.length).toFixed(1),
                ),
                count: items.length,
                distribution,
                items,
              };
            })()
          : undefined,
      writtenReview:
        includeAnswerStatistics && session && c.responseFormat === 'written'
          ? {
              summary: session.analysis?.report?.summary,
              scales: session.analysis?.report?.scales,
              model: session.analysis?.report?.model,
              rubricVersion: session.analysis?.report?.rubricVersion,
              items: c.questions.map((q) => ({
                id: q.id,
                text: q.text,
                answer: session.answers[q.id],
              })),
            }
          : undefined,
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
          responseFormat:
            s.versions.find((v) => v.version === x.version)?.responseFormat ?? 'likert',
        })),
      nextAllowedAt:
        session && (c.responseFormat ?? 'likert') === (active.responseFormat ?? 'likert')
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
      return portrait(s, target, req.user!.id === target.id);
    });
    res.json(out);
  });
  app.post('/api/development/submit', async (req, res) => {
    const body = z
      .object({
        recommendationId: z.string().min(1).max(100),
        evidence: z.string().trim().min(10).max(1000),
      })
      .strict()
      .parse(req.body);
    const record = await store.tx((s) => {
      const session = latest(s, req.user!.id);
      if (!session) throw new ApiError(409, 'Сначала пройдите тест');
      const config = s.versions.find((x) => x.version === session.version)!;
      const task = config.recommendations.find((x) => x.id === body.recommendationId);
      if (!task) throw new ApiError(404, 'Практика не найдена');
      const previous = s.development.find(
        (x) => x.userId === req.user!.id && x.recommendationId === task.id,
      );
      if (previous && previous.status !== 'returned')
        throw new ApiError(409, 'Практика уже отправлена или подтверждена');
      const next = {
        id: previous?.id ?? randomUUID(),
        userId: req.user!.id,
        recommendationId: task.id,
        title: task.title,
        evidence: body.evidence,
        status: 'pending' as const,
        submittedAt: new Date().toISOString(),
      };
      if (previous) s.development[s.development.indexOf(previous)] = next;
      else s.development.push(next);
      audit(s, req.user!.id, 'development.submitted', next.id);
      return next;
    });
    res.status(201).json(record);
  });
  app.post('/api/development/:id/review', async (req, res) => {
    requireRole(req.user!, ['manager']);
    const body = z
      .object({ decision: z.enum(['approved', 'returned']) })
      .strict()
      .parse(req.body);
    await store.tx((s) => {
      const record = s.development.find((x) => x.id === req.params.id);
      const target = s.users.find((x) => x.id === record?.userId);
      if (!record || !target || target.id === req.user!.id || target.managerId !== req.user!.id)
        throw new ApiError(403, 'Практика недоступна');
      if (record.status !== 'pending') throw new ApiError(409, 'Практика уже проверена');
      record.status = body.decision;
      record.reviewedAt = new Date().toISOString();
      record.reviewedBy = req.user!.id;
      audit(s, req.user!.id, `development.${body.decision}`, record.id);
    });
    res.json({ ok: true });
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
      regenerationsLeft: Math.max(0, AVATAR_VARIANT_LIMIT - avatars.length),
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
    const variants = s.avatars
      .filter((x) => x.sessionId === av.sessionId)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const variantIndex = variants.findIndex((x) => x.id === av.id);
    res.type('image/svg+xml').send(buildAvatar(av.config, Math.max(variantIndex, 0)).fallbackSvg);
  });
  app.post('/api/avatar/:userId/regenerate', async (req, res) => {
    if (req.params.userId !== req.user!.id) throw new ApiError(403, 'Нельзя изменять чужой аватар');
    const av = await store.tx((s) => {
      const session = latest(s, req.user!.id);
      if (!session) throw new ApiError(404, 'Сначала пройдите тест');
      const variants = s.avatars.filter((x) => x.sessionId === session.id);
      if (variants.some((x) => x.fixed) || variants.length >= AVATAR_VARIANT_LIMIT)
        throw new ApiError(409, 'Лимит вариантов исчерпан или аватар зафиксирован');
      if (variants.some((x) => ['queued', 'generating'].includes(x.status)))
        throw new ApiError(409, 'Дождитесь текущей генерации');
      const prev = variants[0];
      // A new variant shows the next preset, not a look someone saved on another variant.
      const { look: _look, ...config } = prev.config;
      const { prompt, fallbackSvg } = buildAvatar(config, variants.length);
      const next: Avatar = {
        ...prev,
        config,
        customizedAt: undefined,
        prompt,
        fallbackSvg,
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
  app.put('/api/avatars/:id/look', async (req, res) => {
    const body = z
      .object({ look: lookSchema, style: appearanceSchema.shape.style })
      .strict()
      .parse(req.body);
    const av = await store.tx((s) => {
      const av = s.avatars.find((x) => x.id === req.params.id && x.userId === req.user!.id);
      if (!av) throw new ApiError(404, 'Аватар не найден');
      if (latest(s, req.user!.id)?.id !== av.sessionId)
        throw new ApiError(409, 'Это аватар предыдущего прохождения');
      if (!['ready', 'fallback'].includes(av.status))
        throw new ApiError(409, 'Дождитесь текущей генерации');
      const variants = s.avatars
        .filter((x) => x.sessionId === av.sessionId)
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      av.config = { ...av.config, style: body.style, look: body.look };
      const built = buildAvatar(av.config, variants.indexOf(av));
      av.prompt = built.prompt;
      av.fallbackSvg = built.fallbackSvg;
      // The saved look is drawn as an illustration; an earlier AI image would no longer match it.
      av.imageKey = undefined;
      av.status = 'fallback';
      av.customizedAt = new Date().toISOString();
      audit(s, req.user!.id, 'avatar.customized', av.id);
      return av;
    });
    res.json(publicAvatar(av));
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
        sub: z.string().min(1).optional(),
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
      if (body.sub && s.users.some((u) => u.sub === body.sub && u.id !== body.id))
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
      if (error instanceof AuthError) {
        res.status(error.status).json({ error: error.message, fields: error.fields });
        return;
      }
      if (error instanceof ApiError) {
        res.status(error.status).json({ error: error.message, ...error.details });
        return;
      }
      if (error instanceof z.ZodError || error instanceof SyntaxError) {
        res.status(400).json({
          error: 'Проверьте формат данных',
          issues: error instanceof z.ZodError ? error.issues : undefined,
          fields:
            error instanceof z.ZodError && _req.path.startsWith('/api/auth')
              ? Object.fromEntries(error.issues.map((i) => [i.path[0], i.message]))
              : undefined,
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
