import { it, expect } from 'vitest';
import { PostgresStore, initialState } from '../apps/api/src/store';
it.skipIf(!process.env.TEST_DATABASE_URL)(
  'PostgreSQL: миграции, параллельные транзакции, история и восстановление после подключения заново',
  async () => {
    const url = process.env.TEST_DATABASE_URL!;
    if (!new URL(url).pathname.endsWith('/bilim_test'))
      throw Error('Use isolated bilim_test database');
    const store = new PostgresStore(url);
    await store.init();
    await store.pool.query(
      'TRUNCATE audit_log,avatars,recommendations_shown,results,answers,sessions,users,test_versions,app_settings CASCADE',
    );
    const seed = initialState(true);
    await store.tx((s) => Object.assign(s, seed));
    const before = await store.read();
    expect(before.sessions).toHaveLength(2);
    expect(before.sessions[0].answers).toBeTruthy();
    await Promise.all(
      Array.from({ length: 10 }, (_, i) =>
        store.tx((s) => {
          s.audit.push({
            id: `qa-${i}`,
            at: new Date().toISOString(),
            actorId: 'admin',
            action: 'qa',
            target: String(i),
          });
        }),
      ),
    );
    await store.close();
    const reopened = new PostgresStore(url);
    const state = await reopened.read();
    expect(state.audit).toHaveLength(10);
    expect(state.sessions[0].result?.percentages).toEqual(before.sessions[0].result?.percentages);
    expect(state.avatars).toHaveLength(2);
    expect((await reopened.pool.query('SELECT * FROM recommendations_shown')).rows).toHaveLength(2);
    await reopened.close();
  },
);
