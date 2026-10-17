import { beforeEach, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../apps/api/src/app';
import { MemoryStore, initialState, FileStore } from '../apps/api/src/store';
import { configSchema } from '../packages/core/src/index';
import raw from '../config/test.ru.json';
import legacy from '../config/test.legacy.ru.json';
import { reportFor, writtenAnswer } from './fixtures/written';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
const c = configSchema.parse(raw),
  origin = 'http://localhost:5173';
let store: MemoryStore;
beforeEach(() => {
  store = new MemoryStore(initialState(true));
});
async function setup(analyze?: NonNullable<Parameters<typeof createApp>[1]>['analyze']) {
  const app = createApp(store, { demo: true, origin, analyze });
  const owner = request.agent(app);
  await owner.post('/api/auth/demo').set('Origin', origin).send({ userId: 'employee' }).expect(200);
  const session = (
    await owner
      .post('/api/test/sessions')
      .set('Origin', origin)
      .send({
        appearance: { universe: 'animals', gender: 'neutral', style: 'tech' },
        consent: true,
      })
      .expect(201)
  ).body;
  const answers = Object.fromEntries(c.questions.map((q) => [q.id, writtenAnswer]));
  const save = (a = answers) =>
    owner
      .put(`/api/test/sessions/${session.id}/answers`)
      .set('Origin', origin)
      .send({ answers: a });
  const submit = (body: object = {}) =>
    owner.post(`/api/test/sessions/${session.id}/submit`).set('Origin', origin).send(body);
  return { app, owner, session, answers, save, submit };
}
it('сохраняет текст, отклоняет числа/длинные ответы, без ключа сохраняет прогресс', async () => {
  const f = await setup();
  expect((await f.owner.get('/api/test/analysis-status')).body.available).toBe(false);
  await f.save({ '1': 'коротко' }).expect(200);
  await f.save({ '1': 4 } as any).expect(400);
  await f.save({ '1': 'a'.repeat(2001) }).expect(400);
  await f.submit().expect(400);
  await f.save().expect(200);
  const unavailable = await f.submit().expect(503);
  expect(unavailable.body.code).toBe('AI_NOT_CONFIGURED');
  expect((await f.owner.get('/api/test/sessions/current')).body.answers).toEqual(f.answers);
  expect((await store.read()).sessions.find((s) => s.id === f.session.id)?.result).toBeUndefined();
});
it('один вызов ИИ при параллельной отправке; готовый анализ переиспользуется при выборе героя', async () => {
  let release!: (value: ReturnType<typeof reportFor>) => void;
  const analyze = vi.fn(() => new Promise<ReturnType<typeof reportFor>>((r) => (release = r)));
  const f = await setup(analyze);
  await f.save();
  await f.submit().expect(202);
  await f.submit().expect(202);
  expect(analyze).toHaveBeenCalledTimes(1);
  // A delayed autosave of the submitted snapshot is idempotent during analysis.
  await f.save().expect(200);
  expect((await store.read()).sessions.find((s) => s.id === f.session.id)?.analysis?.status).toBe(
    'running',
  );
  await f.save({ '1': writtenAnswer + ' другой вариант' }).expect(409);
  release(reportFor(c));
  await vi.waitFor(async () =>
    expect((await store.read()).sessions.find((s) => s.id === f.session.id)?.analysis?.status).toBe(
      'ready',
    ),
  );
  const tie = await f.submit().expect(409);
  expect(tie.body.code).toBe('AVATAR_CHOICE_REQUIRED');
  await f.submit({ primary: 'critical', secondary: 'confidence' }).expect(200);
  await f.submit({ primary: 'critical', secondary: 'confidence' }).expect(200);
  expect(analyze).toHaveBeenCalledTimes(1);
  const own = (await f.owner.get('/api/profile/employee')).body;
  expect(own.writtenReview.items[0].answer).toBe(writtenAnswer);
  expect(own.writtenReview.summary).toContain('Тестовая фикстура');
  expect(own.answerStatistics).toBeUndefined();
  expect(own.result.percentages.critical).toBe(50);
  expect(own.result.qualityFlags).toEqual([]);
  const manager = request.agent(f.app);
  await manager.post('/api/auth/demo').set('Origin', origin).send({ userId: 'manager' });
  const team = (await manager.get('/api/profile/employee').expect(200)).body;
  expect(team.writtenReview).toBeUndefined();
  expect(JSON.stringify(team)).not.toContain(writtenAnswer);
  await manager
    .put(`/api/test/sessions/${f.session.id}/answers`)
    .set('Origin', origin)
    .send({ answers: { '1': writtenAnswer } })
    .expect(404);
  await f.owner
    .post('/api/test/sessions')
    .set('Origin', origin)
    .send({ appearance: { universe: 'animals', gender: 'neutral', style: 'tech' }, consent: true })
    .expect(409);
});
it('ошибка ИИ требует явного повтора; изменение ответа сбрасывает кэш', async () => {
  const analyze = vi
    .fn()
    .mockRejectedValueOnce(Error('private-provider-body'))
    .mockResolvedValue(reportFor(c));
  const f = await setup(analyze);
  await f.save();
  await f.submit().expect(202);
  await vi.waitFor(async () =>
    expect((await store.read()).sessions.find((s) => s.id === f.session.id)?.analysis?.status).toBe(
      'failed',
    ),
  );
  const failed = await f.submit().expect(422);
  expect(JSON.stringify(failed.body)).not.toContain('private-provider');
  expect(analyze).toHaveBeenCalledTimes(1);
  await f.submit({ retryAnalysis: true }).expect(202);
  await vi.waitFor(async () =>
    expect((await store.read()).sessions.find((s) => s.id === f.session.id)?.analysis?.status).toBe(
      'ready',
    ),
  );
  await f.save({ '1': writtenAnswer + ' Проверю итог.' });
  expect(
    (await store.read()).sessions.find((s) => s.id === f.session.id)?.analysis,
  ).toBeUndefined();
});
it('недостаток данных возвращает конкретный вопрос, без результата и без потери ответа', async () => {
  const report = reportFor(c);
  report.ratings[0].value = null;
  const f = await setup(async () => report);
  await f.save();
  await f.submit().expect(202);
  await vi.waitFor(async () =>
    expect((await store.read()).sessions.find((s) => s.id === f.session.id)?.analysis?.status).toBe(
      'failed',
    ),
  );
  expect((await f.submit().expect(422)).body.questionIds).toEqual(['1']);
  expect((await f.owner.get('/api/profile/employee')).body.result).toBeNull();
  expect((await f.owner.get('/api/test/sessions/current')).body.answers).toEqual(f.answers);
});
it('после перезапуска устаревший запуск можно повторить', async () => {
  const analyze = vi.fn(async () => reportFor(c));
  const f = await setup(analyze);
  await f.save();
  await store.tx((s) => {
    const session = s.sessions.find((s) => s.id === f.session.id)!;
    session.analysis = {
      status: 'running',
      runId: 'old',
      startedAt: new Date(Date.now() - 120000).toISOString(),
    };
  });
  await f.submit().expect(202);
  expect(analyze).toHaveBeenCalledTimes(1);
});
it('новая версия сохраняет старую историю и архивирует старый незавершённый черновик', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'bilim-written-'));
  try {
    const state = initialState(true, legacy);
    state.sessions.push({
      id: 'draft',
      userId: 'employee',
      version: '0.1.0',
      appearance: { universe: 'animals', gender: 'neutral', style: 'tech' },
      answers: { '1': 4 },
      startedAt: new Date().toISOString(),
      consentAt: new Date().toISOString(),
      consentVersion: 'old',
      status: 'in_progress',
    });
    const filename = path.join(dir, 'state.json');
    await writeFile(filename, JSON.stringify(state));
    const reopened = await FileStore.open(filename, true);
    const saved = await reopened.read();
    expect(saved.activeVersion).toBe('0.2.0');
    expect(saved.sessions.find((s) => s.id === 'draft')).toMatchObject({
      status: 'superseded',
      answers: { '1': 4 },
    });
    expect(saved.sessions.filter((s) => s.status === 'completed')).toHaveLength(2);
    await reopened.close();
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
