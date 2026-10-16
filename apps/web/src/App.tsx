import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { scaleIds, type TestConfig } from '../../../packages/core/src/index';
import type { Session, User } from '../../api/src/store';
import { api } from './api';
import { t } from './localization';
import Admin from './pages/Admin';
import Methodology from './pages/Methodology';
import Profile from './pages/Profile';
import TestFlow from './pages/TestFlow';
import { Disclaimer, readDraft, type Draft, type Portrait } from './shared';
export default function App() {
  const [user, setUser] = useState<User | null>(null),
    [demo, setDemo] = useState(false),
    [config, setConfig] = useState<TestConfig | null>(null),
    [portrait, setPortrait] = useState<Portrait | null>(null),
    [page, setPage] = useState('profile'),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [offline, setOffline] = useState(!navigator.onLine),
    [draft, setDraft] = useState<Draft | null>(null),
    [team, setTeam] = useState<Portrait[]>([]),
    [selected, setSelected] = useState<Portrait | null>(null);
  const [busy, setBusy] = useState(false);
  async function load() {
    setLoading(true);
    setError('');
    try {
      const mode = await api('/auth/mode');
      setDemo(mode.demo);
      let u: User;
      try {
        u = await api('/me');
      } catch (e) {
        if (mode.demo) {
          await api('/auth/demo', 'POST', { userId: 'employee' });
          u = await api('/me');
        } else throw e;
      }
      setUser(u);
      const c = await api<TestConfig>('/test/config');
      setConfig(c);
      if (['employee', 'manager'].includes(u.role)) {
        const p = await api<Portrait>(`/profile/${u.id}`);
        setPortrait(p);
        const current = await api<
          | (Session & {
              config: TestConfig;
            })
          | null
        >('/test/sessions/current');
        const local = readDraft(u.id);
        if (current) {
          setConfig(current.config);
          setDraft({
            session: current,
            answers: {
              ...current.answers,
              ...(local?.session.id === current.id ? local.answers : {}),
            },
            index: local?.session.id === current.id ? local.index : 0,
          });
        } else {
          setDraft(null);
          localStorage.removeItem(`bilim-draft-${u.id}`);
        }
        sessionStorage.setItem(
          'bilim-bootstrap',
          JSON.stringify({ user: u, config: current?.config ?? c, portrait: p }),
        );
      }
      setPage(u.role === 'methodologist' ? 'method' : u.role === 'admin' ? 'admin' : 'profile');
    } catch (e) {
      let restored = false;
      if (!navigator.onLine) {
        try {
          const cached = JSON.parse(sessionStorage.getItem('bilim-bootstrap') ?? 'null');
          if (cached) {
            setUser(cached.user);
            setConfig(cached.config);
            setPortrait(cached.portrait);
            setDraft(readDraft(cached.user.id));
            setPage('profile');
            restored = true;
          }
        } catch {}
      }
      if (!restored) setError(e instanceof Error ? e.message : t('text001'));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const online = () => setOffline(!navigator.onLine);
    window.addEventListener('online', online);
    window.addEventListener('offline', online);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', online);
    };
  }, []);
  async function switchRole(id: string) {
    setBusy(true);
    try {
      await api('/auth/demo', 'POST', { userId: id });
      sessionStorage.removeItem('bilim-bootstrap');
      setSelected(null);
      setPortrait(null);
      setDraft(null);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }
  async function navigate(p: string) {
    setPage(p);
    setSelected(null);
    if (p === 'team')
      try {
        setTeam(await api('/team'));
      } catch (e) {
        setError((e as Error).message);
      }
  }
  async function completed() {
    setDraft(null);
    localStorage.removeItem(`bilim-draft-${user!.id}`);
    setPortrait(await api(`/profile/${user!.id}`));
    setPage('profile');
  }
  if (loading)
    return (
      <div className="boot">
        <div className="brand-badge">BI</div>
        <div className="spinner" />
        <p>{t('text002')}</p>
      </div>
    );
  if (!user)
    return (
      <main className="login">
        <div className="brand-badge">BI</div>
        <h1>{t('text003')}</h1>
        <p>{error || t('text004')}</p>
        <a className="button primary" href="/api/auth/login">
          {t('text005')}
        </a>
      </main>
    );
  const nav = [
    {
      id: 'profile',
      text: t('text006'),
      show: ['employee', 'manager'].includes(user.role),
    },
    { id: 'team', text: t('text007'), show: user.role === 'manager' },
    {
      id: 'method',
      text: t('text008'),
      show: ['methodologist', 'admin'].includes(user.role),
    },
    { id: 'admin', text: t('text009'), show: user.role === 'admin' },
  ];
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="/" aria-label="Bilim">
          <span className="brand-badge">BI</span>
          <span>
            <strong>
              bilim<span className="brand-dot">.</span>
            </strong>
            <small>ACADEMY</small>
          </span>
        </a>

        <nav>
          {nav
            .filter((n) => n.show)
            .map((n) => (
              <button
                key={n.id}
                onClick={() => void navigate(n.id)}
                className={page === n.id ? 'active' : ''}
              >
                {n.text}
              </button>
            ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="logout"
            onClick={async () => {
              await api('/auth/logout', 'POST');
              sessionStorage.removeItem('bilim-bootstrap');
              localStorage.removeItem(`bilim-draft-${user.id}`);
              setUser(null);
            }}
          >
            {t('text014')}
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="top-actions">
            <div className="user-info">
              <strong>{user.name}</strong>
              <small>{user.position}</small>
            </div>
          </div>
        </header>
        {demo && (
          <div className="demo-bar">
            <span>{t('text017')}</span>
            <label>
              {t('text018')}
              <select
                aria-label={t('text019')}
                disabled={busy}
                value={user.id}
                onChange={(e) => void switchRole(e.target.value)}
              >
                <option value="employee">{t('text020')}</option>
                <option value="manager">{t('text021')}</option>
                <option value="methodologist">{t('text022')}</option>
                <option value="admin">{t('text023')}</option>
              </select>
            </label>
          </div>
        )}
        {offline && <div className="offline-bar">{t('text024')}</div>}
        <main className="content">
          {error && (
            <div className="alert" role="alert">
              {error}
              <button aria-label={t('text025')} onClick={() => setError('')}>
                <X size={18} />
              </button>
            </div>
          )}
          {page === 'create' && config && (
            <TestFlow
              user={user}
              config={config}
              draft={draft}
              onExit={() => setPage('profile')}
              onDone={() => void completed()}
              onDraft={setDraft}
              offline={offline}
            />
          )}
          {page === 'profile' && portrait && (
            <Profile
              portrait={portrait}
              config={config!}
              onStart={() => setPage('create')}
              hasDraft={!!draft}
              refresh={async () => setPortrait(await api(`/profile/${user.id}`))}
            />
          )}
          {page === 'team' && (
            <>
              <div className="page-title">
                <div>
                  <h1>{t('text027')}</h1>
                </div>
                <span className="count-badge">
                  {team.length}
                  {t('text029')}
                </span>
              </div>
              {selected ? (
                <>
                  <button className="text-button back-team" onClick={() => setSelected(null)}>
                    {t('text030')}
                  </button>
                  <Profile portrait={selected} config={config!} readOnly />
                </>
              ) : (
                <div className="team-grid">
                  {team.map((p) => (
                    <button
                      className="team-card panel"
                      key={p.user.id}
                      onClick={() => setSelected(p)}
                    >
                      <div className="team-avatar">
                        {p.avatar && <img src={p.avatar.imageUrl} alt={p.avatar.name} />}
                      </div>
                      <h3>{p.user.name}</h3>
                      <p>{p.user.position}</p>
                      {p.result ? (
                        <div className="mini-scores">
                          {scaleIds.map((s) => (
                            <div key={s}>
                              <span>{p.scales[s].short}</span>
                              <b>{p.result!.percentages[s]}%</b>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="pill neutral">{t('text032')}</span>
                      )}
                      <span className="team-link">{t('text033')}</span>
                    </button>
                  ))}
                </div>
              )}
              {!selected && <Disclaimer />}
            </>
          )}
          {page === 'method' && (
            <Methodology
              config={config!}
              canEdit={user.role === 'methodologist'}
              onSave={setConfig}
            />
          )}
          {page === 'admin' && <Admin />}
        </main>
      </div>
    </div>
  );
}
