import { beforeEach, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../apps/api/src/app';
import { MemoryStore, initialState, type State } from '../apps/api/src/store';
import { AVATAR_VARIANT_LIMIT } from '../packages/core/src/index';
import raw from '../config/test.legacy.ru.json';
const origin = 'http://localhost:5173';
let store: MemoryStore;
let app: ReturnType<typeof createApp>;
beforeEach(() => {
  store = new MemoryStore(initialState(true, raw));
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
    expect(p.answerStatistics.average).toBe(4);
    expect(p.answerStatistics.count).toBe(15);
    expect(p.answerStatistics.items).toHaveLength(15);
    expect(
      p.answerStatistics.distribution.find((x: { value: number }) => x.value === 4).count,
    ).toBe(15);
    expect(JSON.stringify(p)).not.toContain('\"answers\":');
    expect(p.history).toHaveLength(1);
    await a
      .put(`/api/test/sessions/${s.id}/answers`)
      .set('Origin', origin)
      .send({ answers: { '1': 1 } })
      .expect(409);
  });
  it('заменённый ответ перезаписывается и учитывается при расчёте результата', async () => {
    const a = await login();
    const s = await start(a);
    const original = Object.fromEntries(raw.questions.map((question) => [question.id, 7]));
    await a
      .put(`/api/test/sessions/${s.id}/answers`)
      .set('Origin', origin)
      .send({ answers: original })
      .expect(200);
    await a
      .put(`/api/test/sessions/${s.id}/answers`)
      .set('Origin', origin)
      .send({ answers: { '1': 1 } })
      .expect(200);

    const saved = (await a.get('/api/test/sessions/current').expect(200)).body;
    expect(saved.answers['1']).toBe(1);
    expect(saved.answers['2']).toBe(7);
    await a
      .post(`/api/test/sessions/${s.id}/submit`)
      .set('Origin', origin)
      .send({ primary: 'critical', secondary: 'confidence' })
      .expect(200);

    const profile = (await a.get('/api/profile/employee').expect(200)).body;
    expect(profile.answerStatistics.items[0].answer).toBe(1);
    expect(profile.answerStatistics.average).toBeLessThan(7);
    expect(profile.result.percentages.discipline).toBe(50);
  });
  it('все ответы 1 сразу создают аватар соискателя без выбора равных качеств', async () => {
    const a = await login();
    const s = await start(a);
    await a
      .put(`/api/test/sessions/${s.id}/answers`)
      .set('Origin', origin)
      .send({ answers: Object.fromEntries(raw.questions.map((question) => [question.id, 1])) })
      .expect(200);

    await a.post(`/api/test/sessions/${s.id}/submit`).set('Origin', origin).send({}).expect(200);

    const profile = (await a.get('/api/profile/employee').expect(200)).body;
    expect(profile.answerStatistics.average).toBe(1);
    expect(profile.answerStatistics.distribution[0].count).toBe(15);
    expect(profile.avatar.name).toBe('Панда-безработный');
    expect(profile.avatar.config.archetype).toBe('jobseeker');
    expect(profile.avatar.config.accessory).toBe('critical');
  });
  it('менеджер видит свою команду, но не ответы и не чужой профиль', async () => {
    const a = await login();
    const s = await complete(a);
    const m = await login('manager');
    const team = await m.get('/api/team').expect(200);
    expect(team.body).toHaveLength(3);
    expect(JSON.stringify(team.body)).not.toContain('\"answers\":');
    expect(JSON.stringify(team.body)).not.toContain('\"answerStatistics\":');
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
  it('владелец настраивает образ: схема, обновление картинки, новый вариант без чужого образа', async () => {
    const a = await login();
    await complete(a);
    const [first] = (await a.get('/api/avatar/employee')).body.avatars;
    const look = {
      headwear: 'cap',
      eyewear: 'sunglasses',
      extra: 'medal',
      expression: 'wink',
      background: 'night',
      skin: 'tan',
    };
    const put = (agent: typeof a, body: object) =>
      agent.put(`/api/avatars/${first.id}/look`).set('Origin', origin).send(body);
    await put(a, { look: { ...look, headwear: 'crown' }, style: 'calm' }).expect(400);
    await put(a, { look, style: 'neon' }).expect(400);
    await put(a, { look, style: 'calm', fixed: true }).expect(400);
    const saved = (await put(a, { look, style: 'calm' }).expect(200)).body;
    expect(saved.config).toMatchObject({ look, style: 'calm' });
    expect(saved.imageUrl).toMatch(/\/image\?v=\d+$/);
    const image = (await a.get(saved.imageUrl).expect(200)).body.toString('utf8');
    expect(image).toContain('data-part="headwear-cap"');
    expect(image).toContain('data-part="extra-medal"');
    const stored = (await store.read()).avatars.find((x) => x.id === first.id)!;
    expect(stored.fallbackSvg).toBe(image);
    expect(stored.prompt).toContain('gold medal');
    const next = (
      await a.post('/api/avatar/employee/regenerate').set('Origin', origin).send({}).expect(202)
    ).body;
    expect(next.config.look).toBeUndefined();
    expect(next.imageUrl).not.toContain('?v=');
    const nextImage = (await a.get(next.imageUrl).expect(200)).body.toString('utf8');
    expect(nextImage).toContain('data-part="headwear-helmet"');
    expect(nextImage).toContain('data-part="eyewear-sunglasses"');
    await put(await login('manager'), { look, style: 'calm' }).expect(404);
  });
  it('показывает восемь разных вариантов, выбор фиксируется и изображение защищено', async () => {
    const a = await login();
    await complete(a);
    for (let index = 1; index < AVATAR_VARIANT_LIMIT; index++)
      await a.post('/api/avatar/employee/regenerate').set('Origin', origin).send({}).expect(202);
    const data = (await a.get('/api/avatar/employee')).body;
    expect(data.avatars).toHaveLength(AVATAR_VARIANT_LIMIT);
    expect(data.regenerationsLeft).toBe(0);
    const stored = await store.read();
    const variants = stored.avatars.filter((x) => x.userId === 'employee');
    expect(new Set(variants.map((x) => x.prompt)).size).toBe(AVATAR_VARIANT_LIMIT);
    expect(new Set(variants.map((x) => x.fallbackSvg)).size).toBe(AVATAR_VARIANT_LIMIT);
    await a.post('/api/avatar/employee/regenerate').set('Origin', origin).send({}).expect(409);
    await a
      .post(`/api/avatars/${data.avatars[1].id}/fix`)
      .set('Origin', origin)
      .send({})
      .expect(200);
    await a.post('/api/avatar/employee/regenerate').set('Origin', origin).send({}).expect(409);
    const images = await Promise.all(
      data.avatars.map((avatar: { imageUrl: string }) => a.get(avatar.imageUrl).expect(200)),
    );
    expect(images.every((image) => image.headers['content-type'].includes('image/svg+xml'))).toBe(
      true,
    );
    expect(new Set(images.map((image) => image.body.toString('utf8'))).size).toBe(
      AVATAR_VARIANT_LIMIT,
    );
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

describe('практики и ранги', () => {
  it('повышает ранг только после подтверждения руководителем, без повторного зачёта', async () => {
    const employee = await login();
    expect((await employee.get('/api/profile/employee')).body.development.rank.current.id).toBe(
      'start',
    );
    await complete(employee);
    let p = (await employee.get('/api/profile/employee')).body;
    expect(p.development.rank.current.id).toBe('practitioner');
    const task = p.development.tasks[0];
    const payload = {
      recommendationId: task.id,
      evidence: 'В течение двух недель применял практику, обсудил результаты на планёрке.',
    };
    const record = (
      await employee.post('/api/development/submit').set('Origin', origin).send(payload).expect(201)
    ).body;
    await employee.post('/api/development/submit').set('Origin', origin).send(payload).expect(409);
    await employee
      .post(`/api/development/${record.id}/review`)
      .set('Origin', origin)
      .send({ decision: 'approved' })
      .expect(403);
    p = (await employee.get('/api/profile/employee')).body;
    expect(p.development.rank.current.id).toBe('practitioner');
    const manager = await login('manager');
    await manager
      .post(`/api/development/${record.id}/review`)
      .set('Origin', origin)
      .send({ decision: 'returned' })
      .expect(200);
    const resubmitted = (
      await employee.post('/api/development/submit').set('Origin', origin).send(payload).expect(201)
    ).body;
    expect(resubmitted.id).toBe(record.id);
    expect(resubmitted.reviewedBy).toBeUndefined();
    await manager
      .post(`/api/development/${record.id}/review`)
      .set('Origin', origin)
      .send({ decision: 'approved' })
      .expect(200);
    await manager
      .post(`/api/development/${record.id}/review`)
      .set('Origin', origin)
      .send({ decision: 'returned' })
      .expect(409);
    await employee.post('/api/development/submit').set('Origin', origin).send(payload).expect(409);
    p = (await employee.get('/api/profile/employee')).body;
    expect(p.development.rank.current.id).toBe('specialist');
    expect(p.development.rank.completed).toBe(1);
    expect(
      (await manager.get('/api/team')).body.find((x: any) => x.user.id === 'employee').development
        .rank.current.id,
    ).toBe('specialist');
    expect(
      (await store.read()).audit.filter((x) => x.action === 'development.approved'),
    ).toHaveLength(1);
  });
  it('проверяет практику, результат, доступ и не разрешает самостоятельное подтверждение', async () => {
    const employee = await login();
    const body = {
      recommendationId: raw.recommendations[0].id,
      evidence: 'Результат выполнения практики.',
    };
    await employee.post('/api/development/submit').set('Origin', origin).send(body).expect(409);
    await complete(employee);
    await employee
      .post('/api/development/submit')
      .set('Origin', origin)
      .send({ ...body, evidence: '  ' })
      .expect(400);
    await employee
      .post('/api/development/submit')
      .set('Origin', origin)
      .send({ ...body, status: 'approved' })
      .expect(400);
    await employee
      .post('/api/development/submit')
      .set('Origin', origin)
      .send({ ...body, recommendationId: 'unknown' })
      .expect(404);
    const record = (await employee.post('/api/development/submit').set('Origin', origin).send(body))
      .body;
    const manager = await login('manager');
    await store.tx((s) => {
      s.users.find((x) => x.id === 'employee')!.managerId = 'someone-else';
    });
    await manager
      .post(`/api/development/${record.id}/review`)
      .set('Origin', origin)
      .send({ decision: 'approved' })
      .expect(403);
    await manager.get('/api/profile/employee').expect(403);
    await manager
      .post('/api/development/missing/review')
      .set('Origin', origin)
      .send({ decision: 'approved' })
      .expect(403);
    await complete(manager);
    const own = (
      await manager.post('/api/development/submit').set('Origin', origin).send(body).expect(201)
    ).body;
    await store.tx((s) => {
      s.users.find((x) => x.id === 'manager')!.managerId = 'manager';
    });
    await manager
      .post(`/api/development/${own.id}/review`)
      .set('Origin', origin)
      .send({ decision: 'approved' })
      .expect(403);
  });
  it('параллельная отправка не создаёт повторные практики', async () => {
    const a = await login();
    await complete(a);
    const body = {
      recommendationId: raw.recommendations[0].id,
      evidence: 'Практика выполнена, результат обсуждён с наставником.',
    };
    const responses = await Promise.all(
      [1, 2].map(() => a.post('/api/development/submit').set('Origin', origin).send(body)),
    );
    expect(responses.map((r) => r.status).sort()).toEqual([201, 409]);
    expect((await store.read()).development).toHaveLength(1);
  });
});
