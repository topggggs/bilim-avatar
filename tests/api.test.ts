import { beforeEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../apps/api/src/app';
import { MemoryStore, initialState, type State } from '../apps/api/src/store';
import raw from '../config/test.ru.json';
const origin = 'http://localhost:5173';
let store: MemoryStore;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  store = new MemoryStore(initialState(true));
  app = createApp(store, { demo: true, origin });
});
async function login(role = 'employee') {
  const agent = request.agent(app);
  await agent.post('/api/auth/demo').set('Origin', origin).send({ userId: role }).expect(200);
  return agent;
}
async function start(agent: Awaited<ReturnType<typeof login>>) {
  return (
    await agent
      .post('/api/test/sessions')
      .set('Origin', origin)
      .send({
        appearance: { universe: 'animals', gender: 'neutral', style: 'tech' },
        consent: true,
      })
      .expect(201)
  ).body;
}
async function complete(agent: Awaited<ReturnType<typeof login>>) {
  const s = await start(agent);
  await agent
    .put(`/api/test/sessions/${s.id}/answers`)
    .set('Origin', origin)
    .send({ answers: Object.fromEntries(raw.questions.map((q) => [q.id, 4])) })
    .expect(200);
  await agent
    .post(`/api/test/sessions/${s.id}/submit`)
    .set('Origin', origin)
    .send({ primary: 'critical', secondary: 'confidence' })
    .expect(200);
  return s;
}
describe('REST и права', () => {
  it('требует вход, согласие и разрешённый Origin', async () => {
    await request(app).get('/api/me').expect(401);
    const a = await login();
    await a.post('/api/test/sessions').send({}).expect(403);
    await a.post('/api/test/sessions').set('Origin', origin).send({ consent: false }).expect(400);
  });
  it('восстанавливает частичные ответы и запрещает неизвестные вопросы', async () => {
    const a = await login(),
      s = await start(a);
    await a
      .put(`/api/test/sessions/${s.id}/answers`)
      .set('Origin', origin)
      .send({ answers: { '1': 7, '2': 2 } })
      .expect(200);
    const fresh = request.agent(app);
    await fresh.post('/api/auth/demo').set('Origin', origin).send({}).expect(200);
    const current = await fresh.get('/api/test/sessions/current').expect(200);
    expect(current.body.answers).toEqual({ '1': 7, '2': 2 });
    expect((await start(a)).id).toBe(s.id);
    await a
      .put(`/api/test/sessions/${s.id}/answers`)
      .set('Origin', origin)
      .send({ answers: { '99': 1 } })
      .expect(400);
    await a.post(`/api/test/sessions/${s.id}/submit`).set('Origin', origin).send({}).expect(400);
  });
  it('сервер считает, запрашивает выбор равных качеств и сохраняет версию', async () => {
    const a = await login(),
      s = await start(a);
    await a
      .put(`/api/test/sessions/${s.id}/answers`)
      .set('Origin', origin)
      .send({ answers: Object.fromEntries(raw.questions.map((q) => [q.id, 4])) });
    const tie = await a
      .post(`/api/test/sessions/${s.id}/submit`)
      .set('Origin', origin)
      .send({})
      .expect(409);
    expect(tie.body.code).toBe('AVATAR_CHOICE_REQUIRED');
    await a
      .post(`/api/test/sessions/${s.id}/submit`)
      .set('Origin', origin)
      .send({ primary: 'discipline', secondary: 'engagement' })
      .expect(200);
    const p = (await a.get('/api/profile/employee').expect(200)).body;
    expect(p.result.percentages).toEqual({
      critical: 50,
      confidence: 50,
      discipline: 50,
      engagement: 50,
    });
    expect(p.result.testVersion).toBe('0.1.0');
    expect(p.avatar.status).toBe('fallback');
    expect(JSON.stringify(p)).not.toContain('\"answers\":');
    expect(p.history).toHaveLength(1);
    await a
      .put(`/api/test/sessions/${s.id}/answers`)
      .set('Origin', origin)
      .send({ answers: { '1': 1 } })
      .expect(409);
  });
  it('менеджер видит свою команду, но не ответы и не чужой профиль', async () => {
    const a = await login();
    const s = await complete(a);
    const m = await login('manager');
    const team = await m.get('/api/team').expect(200);
    expect(team.body).toHaveLength(3);
    expect(JSON.stringify(team.body)).not.toContain('\"answers\":');
    await m.get('/api/profile/outsider').expect(403);
    await m.get('/api/avatar/outsider').expect(403);
    await m.get('/api/profile/employee').expect(200);
    expect((await m.get('/api/test/sessions/current')).body).toBeNull();
    await m
      .put(`/api/test/sessions/${s.id}/answers`)
      .set('Origin', origin)
      .send({ answers: { '1': 1 } })
      .expect(404);
    const av = (await a.get('/api/avatar/employee')).body.avatars[0];
    await m.post(`/api/avatars/${av.id}/fix`).set('Origin', origin).send({}).expect(404);
    expect((await store.read()).audit.some((l) => l.action === 'profile.viewed')).toBe(true);
    await a.get('/api/team').expect(403);
  });
  it('лимит 90 дней, история и идемпотентная отправка', async () => {
    const a = await login(),
      s = await complete(a);
    await a.post(`/api/test/sessions/${s.id}/submit`).set('Origin', origin).send({}).expect(200);
    expect((await store.read()).avatars.filter((x) => x.userId === 'employee')).toHaveLength(1);
    await a
      .post('/api/test/sessions')
      .set('Origin', origin)
      .send({ appearance: s.appearance, consent: true })
      .expect(409);
    await store.tx((state) => {
      state.sessions.find((x) => x.id === s.id)!.completedAt = new Date(
        Date.now() - 91 * 86400000,
      ).toISOString();
    });
    await complete(a);
    const p = (await a.get('/api/profile/employee')).body;
    expect(p.history).toHaveLength(2);
  });
  it('лимит вариантов атомарен, выбор фиксируется и изображение защищено', async () => {
    const a = await login();
    await complete(a);
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        a.post('/api/avatar/employee/regenerate').set('Origin', origin).send({}),
      ),
    );
    expect(responses.filter((r) => r.status === 202)).toHaveLength(3);
    const data = (await a.get('/api/avatar/employee')).body;
    expect(data.avatars).toHaveLength(4);
    expect(data.regenerationsLeft).toBe(0);
    await a
      .post(`/api/avatars/${data.avatars[1].id}/fix`)
      .set('Origin', origin)
      .send({})
      .expect(200);
    await a.post('/api/avatar/employee/regenerate').set('Origin', origin).send({}).expect(409);
    await a.get(data.avatars[1].imageUrl).expect('Content-Type', /svg/).expect(200);
    const m = await login('manager');
    const outsider = await store.tx((s) => {
      const av = { ...s.avatars[0], id: 'other-avatar', userId: 'outsider' };
      s.avatars.push(av);
      return av;
    });
    await m.get(`/api/avatars/${outsider.id}/image`).expect(403);
  });
  it('методолог публикует новую версию, начатая сессия сохраняет старую', async () => {
    const a = await login(),
      s = await start(a),
      m = await login('methodologist');
    const next = { ...raw, version: '0.1.1', thresholds: { medium: 35, high: 65 } };
    await a.post('/api/methodology/versions').set('Origin', origin).send(next).expect(403);
    await m.post('/api/methodology/versions').set('Origin', origin).send(next).expect(201);
    await m.post('/api/methodology/versions').set('Origin', origin).send(next).expect(409);
    expect((await a.get('/api/test/config')).body.version).toBe('0.1.1');
    expect((await a.get('/api/test/sessions/current')).body.config.version).toBe('0.1.0');
    expect((await store.read()).versions).toHaveLength(2);
  });
  it('администратор управляет ролями, но не получает ответы или портреты', async () => {
    const a = await login('admin');
    await a.get('/api/admin/audit').expect(200);
    await a.get('/api/profile/employee-2').expect(403);
    await a
      .post('/api/admin/users')
      .set('Origin', origin)
      .send({
        id: 'new',
        sub: 'corp-123',
        name: 'Test',
        position: 'Engineer',
        role: 'employee',
        managerId: 'manager',
      })
      .expect(200);
    expect((await a.get('/api/admin/users')).body.some((u: any) => u.id === 'new')).toBe(true);
    await a
      .post('/api/admin/users')
      .set('Origin', origin)
      .send({
        id: 'new',
        sub: 'corp-123',
        name: 'Test',
        position: 'Engineer',
        role: 'employee',
        managerId: 'outsider',
      })
      .expect(400);
  });
  it('демо-переключатель закрыт в OIDC режиме', async () => {
    const production = createApp(store, { demo: false, origin });
    await request(production)
      .post('/api/auth/demo')
      .set('Origin', origin)
      .send({ userId: 'admin' })
      .expect(404);
    await request(production).get('/api/admin/users').set('x-user-id', 'admin').expect(401);
  });
});
