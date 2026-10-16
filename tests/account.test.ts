import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../apps/api/src/app';
import { initialState, MemoryStore } from '../apps/api/src/store';
const origin = 'http://localhost:5173',
  password = 'Рабочая длинная фраза для входа';
let store: MemoryStore, app: ReturnType<typeof createApp>;
beforeEach(() => {
  store = new MemoryStore(initialState(true));
  app = createApp(store, { demo: true, origin });
});
async function register() {
  const agent = request.agent(app);
  const r = await agent
    .post('/api/auth/register/request')
    .set('Origin', origin)
    .send({ email: 'account@example.test' });
  const token = r.body.previewLink.split('=')[1];
  await agent
    .post('/api/auth/register/complete')
    .set('Origin', origin)
    .send({ token, name: 'Test User', password, consent: true })
    .expect(201);
  return agent;
}
describe('аккаунт и подключение сотрудника', () => {
  it('обновляет только свои данные и не раскрывает хеш', async () => {
    const a = await register();
    const account = (await a.get('/api/account')).body;
    expect(account.contact.email).toBe('account@example.test');
    expect(account.passwordHash).toBeUndefined();
    await a
      .put('/api/account')
      .set('Origin', origin)
      .send({ name: 'Новый сотрудник', position: 'Прораб' })
      .expect(200);
    expect((await a.get('/api/me')).body.name).toBe('Новый сотрудник');
    await a
      .put('/api/account')
      .set('Origin', origin)
      .send({ name: 'Test', position: '', role: 'admin' })
      .expect(400);
  });
  it('смена пароля требует текущий и отзывает сессию', async () => {
    const a = await register();
    await a
      .post('/api/account/password')
      .set('Origin', origin)
      .send({ currentPassword: 'wrong', password: 'Новая длинная фраза для входа' })
      .expect(400);
    await a
      .post('/api/account/password')
      .set('Origin', origin)
      .send({ currentPassword: password, password: 'Новая длинная фраза для входа' })
      .expect(200);
    await a.get('/api/me').expect(401);
    await a
      .post('/api/auth/password/login')
      .set('Origin', origin)
      .send({ email: 'account@example.test', password: 'Новая длинная фраза для входа' })
      .expect(200);
  });
  it('pending блокирует корпоративный API, администратор подтверждает доступ', async () => {
    const a = await register(),
      u = (await a.get('/api/me')).body;
    await store.tx((s) => {
      s.users.find((x) => x.id === u.id)!.access = 'pending';
    });
    await a.get('/api/account').expect(200);
    await a.get('/api/test/config').expect(403);
    await a.get(`/api/profile/${u.id}`).expect(403);
    const admin = request.agent(app);
    await admin.post('/api/auth/demo').set('Origin', origin).send({ userId: 'admin' });
    await admin
      .post('/api/admin/users')
      .set('Origin', origin)
      .send({
        id: u.id,
        name: u.name,
        position: u.position,
        role: 'employee',
        managerId: 'manager',
        access: 'active',
      })
      .expect(200);
    await a.get('/api/test/config').expect(200);
    await admin
      .post('/api/admin/users')
      .set('Origin', origin)
      .send({ id: u.id, name: u.name, position: u.position, role: 'employee', access: 'suspended' })
      .expect(200);
    await a.get('/api/test/config').expect(403);
    await admin
      .post('/api/admin/users')
      .set('Origin', origin)
      .send({ id: 'admin', name: 'Admin', position: '', role: 'admin', access: 'suspended' })
      .expect(409);
  });
  it('production регистрация создаёт только ожидающий доступ аккаунт', async () => {
    let link = '';
    const production = createApp(store, {
      demo: false,
      localAuth: true,
      origin,
      sendAuthMail: async (mail) => {
        link = mail.link;
      },
    });
    await request(production)
      .post('/api/auth/register/request')
      .set('Origin', origin)
      .send({ email: 'prod@example.test' })
      .expect(200);
    await request(production)
      .post('/api/auth/register/complete')
      .set('Origin', origin)
      .send({ token: link.split('=')[1], name: 'Test User', password, consent: true })
      .expect(201);
    const state = await store.read();
    expect(state.users.find((u) => u.id === state.accounts[0].userId)?.access).toBe('pending');
  });
});
