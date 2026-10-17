import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { reportFor, writtenAnswer } from './fixtures/written';
import { writtenProfile } from '../packages/core/src/written';
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
      'TRUNCATE auth_tokens,phone_challenges,local_accounts,development_records,audit_log,avatars,recommendations_shown,results,answers,sessions,users,test_versions,app_settings CASCADE',
    );
    const seed = initialState(true);
    await store.tx((s) => Object.assign(s, seed));
    await store.tx((s) =>
      s.development.push({
        id: 'practice-1',
        userId: 'employee-2',
        recommendationId: 'rec-1',
        title: 'Практика',
        evidence: 'Проверил план и обсудил результат',
        status: 'approved',
        submittedAt: new Date().toISOString(),
        reviewedBy: 'manager',
      }),
    );
    await store.tx((s) => {
      const at = new Date().toISOString();
      s.accounts.push({
        id: 'account-1',
        userId: 'employee',
        email: 'qa@example.test',
        passwordHash: 'synthetic-hash',
        sessionVersion: 2,
        createdAt: at,
        verifiedAt: at,
        consentAt: at,
        consentVersion: 'registration-1',
      });
      s.accounts.push({
        id: 'account-2',
        userId: 'employee-2',
        phone: '+77011234567',
        passwordHash: 'synthetic-hash',
        sessionVersion: 1,
        createdAt: at,
        verifiedAt: at,
        consentAt: at,
        consentVersion: 'registration-1',
      });
      s.authTokens.push({
        id: 'token-1',
        email: 'qa@example.test',
        hash: 'hash-only',
        kind: 'reset',
        createdAt: at,
        expiresAt: at,
      });
      s.phoneChallenges.push({
        id: 'challenge-1',
        phone: '+77011234567',
        hash: 'hmac-only',
        attempts: 3,
        kind: 'signup',
        createdAt: at,
        expiresAt: at,
      });
    });
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
    expect(state.development).toEqual(before.development);
    expect(state.accounts).toEqual(before.accounts);
    expect(state.authTokens).toEqual(before.authTokens);
    expect(state.phoneChallenges).toEqual(before.phoneChallenges);
    expect((await reopened.pool.query('SELECT * FROM recommendations_shown')).rows).toHaveLength(2);
    await promisify(execFile)(
      process.execPath,
      ['--import', 'tsx', 'scripts/role.ts', 'qa@example.test', 'admin'],
      { env: { ...process.env, STORAGE_MODE: 'postgres', DATABASE_URL: url, AUTH_MODE: 'local' } },
    );
    expect((await reopened.read()).users.find((u) => u.id === 'employee')!.role).toBe('admin');
    await reopened.tx((s) => {
      const config = s.versions.find((v) => v.version === s.activeVersion)!;
      const report = reportFor(config);
      s.sessions.push({
        id: 'written-session',
        userId: 'employee',
        version: config.version,
        appearance: { universe: 'animals', gender: 'neutral', style: 'tech' },
        answers: Object.fromEntries(config.questions.map((q) => [q.id, writtenAnswer])),
        status: 'completed',
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        consentAt: new Date().toISOString(),
        consentVersion: config.consentVersion,
        analysis: {
          status: 'ready',
          runId: 'analysis-run',
          startedAt: new Date().toISOString(),
          report,
        },
        result: writtenProfile(report, config),
      });
    });
    await reopened.close();
    const final = new PostgresStore(url);
    const saved = (await final.read()).sessions.find((s) => s.id === 'written-session')!;
    expect(saved.answers['1']).toBe(writtenAnswer);
    expect(saved.analysis?.report?.rubricVersion).toBe('written-v1');
    expect(saved.result?.percentages.critical).toBe(50);
    await final.close();
  },
);
