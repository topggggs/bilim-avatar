import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import seed from '../../../config/test.ru.json';
import {
  configSchema,
  profile,
  avatarConfig,
  buildAvatar,
  type Answers,
  type Appearance,
  type TestConfig,
  type Result,
  type AvatarConfig,
} from '../../../packages/core/src/index.js';
export type Role = 'employee' | 'manager' | 'methodologist' | 'admin';
export type User = {
  id: string;
  sub?: string;
  name: string;
  role: Role;
  managerId?: string;
  position: string;
};
export type Session = {
  id: string;
  userId: string;
  version: string;
  appearance: Appearance;
  answers: Answers;
  startedAt: string;
  completedAt?: string;
  consentAt: string;
  consentVersion: string;
  status: 'in_progress' | 'completed';
  result?: Result;
};
export type Avatar = {
  id: string;
  sessionId: string;
  userId: string;
  config: AvatarConfig;
  prompt: string;
  model: string;
  status: 'queued' | 'generating' | 'ready' | 'fallback';
  imageKey?: string;
  fallbackSvg: string;
  createdAt: string;
  attempts: number;
  fixed: boolean;
  error?: string;
};
export type DevelopmentRecord = {
  id: string;
  userId: string;
  recommendationId: string;
  title: string;
  evidence: string;
  status: 'pending' | 'approved' | 'returned';
  submittedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
};
export type Audit = { id: string; at: string; actorId: string; action: string; target: string };
export type State = {
  development: DevelopmentRecord[];
  users: User[];
  sessions: Session[];
  avatars: Avatar[];
  versions: TestConfig[];
  activeVersion: string;
  audit: Audit[];
};
export function audit(s: State, actorId: string, action: string, target: string) {
  s.audit.push({ id: randomUUID(), at: new Date().toISOString(), actorId, action, target });
}
export function initialState(demo: boolean): State {
  const config = configSchema.parse(seed);
  const s: State = {
    development: [],
    users: [],
    sessions: [],
    avatars: [],
    versions: [config],
    activeVersion: config.version,
    audit: [],
  };
  if (!demo) return s;
  s.users = [
    {
      id: 'employee',
      name: 'Александр Ким',
      role: 'employee',
      managerId: 'manager',
      position: 'Инженер участка',
    },
    { id: 'manager', name: 'Дана Садыкова', role: 'manager', position: 'Руководитель проекта' },
    {
      id: 'methodologist',
      name: 'Алия Муратова',
      role: 'methodologist',
      position: 'Методолог L&D',
    },
    { id: 'admin', name: 'Администратор', role: 'admin', position: 'BI Academy' },
    {
      id: 'employee-2',
      name: 'Алина Нурланова',
      role: 'employee',
      managerId: 'manager',
      position: 'Мастер строительных работ',
    },
    {
      id: 'employee-3',
      name: 'Данияр Омаров',
      role: 'employee',
      managerId: 'manager',
      position: 'Прораб',
    },
    {
      id: 'outsider',
      name: 'Другой сотрудник',
      role: 'employee',
      managerId: 'other-manager',
      position: 'Другая команда',
    },
  ];
  for (const [i, userId] of ['employee-2', 'employee-3'].entries()) {
    const answers = Object.fromEntries(
      config.questions.map((q, j) => [q.id, q.reverse ? 2 + i : Math.max(2, 7 - (j % 3) - i)]),
    );
    const result = profile(answers, config, 340),
      appearance: Appearance = {
        universe: 'animals',
        gender: 'neutral',
        style: i ? 'calm' : 'tech',
      };
    const session: Session = {
      id: randomUUID(),
      userId,
      version: config.version,
      answers,
      appearance,
      startedAt: new Date(Date.now() - 86400000 - 340000).toISOString(),
      completedAt: new Date(Date.now() - 86400000).toISOString(),
      consentAt: new Date().toISOString(),
      consentVersion: config.consentVersion,
      status: 'completed',
      result,
    };
    s.sessions.push(session);
    const ranked = Object.keys(result.percentages).sort(
      (a, b) =>
        result.percentages[b as keyof typeof result.percentages] -
        result.percentages[a as keyof typeof result.percentages],
    ) as (keyof typeof result.percentages)[];
    const conf = avatarConfig(appearance, result.percentages, config, ranked[0], ranked[1]);
    const { prompt, fallbackSvg } = buildAvatar(conf);
    s.avatars.push({
      id: randomUUID(),
      sessionId: session.id,
      userId,
      config: conf,
      prompt,
      fallbackSvg,
      model: 'fallback-v1',
      status: 'fallback',
      createdAt: new Date().toISOString(),
      attempts: 0,
      fixed: true,
    });
  }
  return s;
}
export interface Store {
  read(): Promise<State>;
  tx<T>(fn: (s: State) => T | Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export class MemoryStore implements Store {
  protected state: State;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(state = initialState(true)) {
    this.state = { ...state, development: state.development ?? [] };
  }
  async read() {
    await this.tail;
    return structuredClone(this.state);
  }
  protected async persist(_s: State) {}
  tx<T>(fn: (s: State) => T | Promise<T>): Promise<T> {
    const next = this.tail.then(async () => {
      const draft = structuredClone(this.state);
      const result = await fn(draft);
      await this.persist(draft);
      this.state = draft;
      return structuredClone(result);
    });
    this.tail = next.catch(() => {});
    return next;
  }
  async close() {}
}
export class FileStore extends MemoryStore {
  constructor(
    private filename: string,
    state: State,
  ) {
    super(state);
  }
  static async open(filename: string, demo: boolean) {
    let s: State;
    try {
      s = JSON.parse(await fs.readFile(filename, 'utf8'));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
      s = initialState(demo);
    }
    s.development ??= [];
    const store = new FileStore(filename, s);
    await store.persist(s);
    return store;
  }
  protected async persist(s: State) {
    await fs.mkdir(path.dirname(this.filename), { recursive: true });
    const tmp = `${this.filename}.${randomUUID()}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(s), { mode: 0o600 });
    await fs.rename(tmp, this.filename);
  }
}
export const schema = `
CREATE TABLE IF NOT EXISTS test_versions(id text PRIMARY KEY,payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS app_settings(id text PRIMARY KEY,payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS users(id text PRIMARY KEY,subject text UNIQUE,manager_id text,payload jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS users_manager_idx ON users(manager_id);
CREATE TABLE IF NOT EXISTS sessions(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),version text NOT NULL REFERENCES test_versions(id),payload jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
CREATE TABLE IF NOT EXISTS answers(session_id text PRIMARY KEY REFERENCES sessions(id),payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS results(session_id text PRIMARY KEY REFERENCES sessions(id),payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS recommendations_shown(session_id text PRIMARY KEY REFERENCES sessions(id),payload jsonb NOT NULL);
CREATE TABLE IF NOT EXISTS avatars(id text PRIMARY KEY,session_id text NOT NULL REFERENCES sessions(id),user_id text NOT NULL REFERENCES users(id),payload jsonb NOT NULL);
CREATE INDEX IF NOT EXISTS avatars_user_idx ON avatars(user_id);
CREATE TABLE IF NOT EXISTS development_records(id text PRIMARY KEY,user_id text NOT NULL REFERENCES users(id),recommendation_id text NOT NULL,payload jsonb NOT NULL,UNIQUE(user_id,recommendation_id));
CREATE TABLE IF NOT EXISTS audit_log(id text PRIMARY KEY,at timestamptz NOT NULL,actor_id text NOT NULL,action text NOT NULL,target text NOT NULL);
`;
export class PostgresStore implements Store {
  pool: pg.Pool;
  constructor(url: string) {
    this.pool = new pg.Pool({ connectionString: url, max: 10 });
  }
  async init() {
    await this.pool.query(schema);
    await this.tx((s) => {
      if (!s.versions.length) {
        const c = configSchema.parse(seed);
        s.versions.push(c);
        s.activeVersion = c.version;
      }
    });
  }
  async read() {
    return this.tx((s) => s);
  }
  async tx<T>(fn: (s: State) => T | Promise<T>): Promise<T> {
    const db = await this.pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(746219)');
      const get = async (table: string) =>
        (await db.query(`SELECT payload FROM ${table}`)).rows.map((r) => r.payload);
      const versions = await get('test_versions'),
        users = await get('users'),
        sessions = await get('sessions'),
        avatars = await get('avatars');
      const a = (await db.query('SELECT * FROM answers')).rows,
        r = (await db.query('SELECT * FROM results')).rows;
      for (const s of sessions) {
        s.answers = a.find((x) => x.session_id === s.id)?.payload ?? {};
        s.result = r.find((x) => x.session_id === s.id)?.payload;
      }
      const settings = await db.query("SELECT payload FROM app_settings WHERE id='active'");
      const auditRows = (
        await db.query('SELECT id,at,actor_id AS "actorId",action,target FROM audit_log')
      ).rows.map((x) => ({ ...x, at: new Date(x.at).toISOString() }));
      const s: State = {
        development: await get('development_records'),
        versions,
        users,
        sessions,
        avatars,
        activeVersion: settings.rows[0]?.payload?.version ?? '',
        audit: auditRows,
      };
      const out = await fn(s);
      for (const v of s.versions)
        await db.query('INSERT INTO test_versions VALUES($1,$2) ON CONFLICT(id) DO NOTHING', [
          v.version,
          v,
        ]);
      await db.query(
        "INSERT INTO app_settings VALUES('active',$1) ON CONFLICT(id) DO UPDATE SET payload=$1",
        [{ version: s.activeVersion }],
      );
      for (const u of s.users)
        await db.query(
          'INSERT INTO users VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET subject=$2,manager_id=$3,payload=$4',
          [u.id, u.sub ?? null, u.managerId ?? null, u],
        );
      for (const record of s.development)
        await db.query(
          'INSERT INTO development_records VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET payload=$4',
          [record.id, record.userId, record.recommendationId, record],
        );
      for (const session of s.sessions) {
        const { answers, result, ...payload } = session;
        await db.query(
          'INSERT INTO sessions VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET payload=$4',
          [session.id, session.userId, session.version, payload],
        );
        await db.query(
          'INSERT INTO answers VALUES($1,$2) ON CONFLICT(session_id) DO UPDATE SET payload=$2',
          [session.id, answers],
        );
        if (result) {
          await db.query('INSERT INTO results VALUES($1,$2) ON CONFLICT(session_id) DO NOTHING', [
            session.id,
            result,
          ]);
          await db.query(
            'INSERT INTO recommendations_shown VALUES($1,$2) ON CONFLICT(session_id) DO NOTHING',
            [session.id, JSON.stringify(result.recommendations)],
          );
        }
      }
      for (const av of s.avatars)
        await db.query(
          'INSERT INTO avatars VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET payload=$4',
          [av.id, av.sessionId, av.userId, av],
        );
      for (const item of s.audit)
        await db.query('INSERT INTO audit_log VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING', [
          item.id,
          item.at,
          item.actorId,
          item.action,
          item.target,
        ]);
      await db.query('COMMIT');
      return structuredClone(out);
    } catch (e) {
      await db.query('ROLLBACK');
      throw e;
    } finally {
      db.release();
    }
  }
  async close() {
    await this.pool.end();
  }
}
export async function createStore() {
  if (process.env.STORAGE_MODE === 'postgres') {
    const s = new PostgresStore(process.env.DATABASE_URL!);
    await s.init();
    return s;
  }
  return FileStore.open(
    path.resolve(process.env.DATA_DIR ?? '.data', 'state.json'),
    process.env.AUTH_MODE !== 'oidc',
  );
}
