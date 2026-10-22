import Auth, { readAuthLink, type AuthMode } from './pages/Auth';
import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { scaleIds, type TestConfig } from '../../../packages/core/src/index';
import type { Session, User } from '../../api/src/store';
import { api, HttpError } from './api';
import { avatarName, rankName, scaleShort } from './content';
import { t, useLanguage } from './localization';
import { LanguageMenu, ThemeToggle, UserMenu } from './Menus';
import Admin from './pages/Admin';
import Methodology from './pages/Methodology';
import Profile from './pages/Profile';
import Home from './pages/Home';
import LearningRoute from './pages/LearningRoute';
import TestFlow from './pages/TestFlow';
import { Brand, readDraft, type Draft, type Portrait } from './shared';
import { useTheme } from './theme';
export default function App() {
  useLanguage();
  const isDarkMode = useTheme() === 'dark';
  const [authLink, setAuthLink] = useState(readAuthLink);
  const [authMode, setAuthMode] = useState<AuthMode>({
    demo: false,
    local: false,
    oidc: true,
    preview: false,
    phone: false,
  });
  const [user, setUser] = useState<User | null>(null),
    [demo, setDemo] = useState(false),
    [config, setConfig] = useState<TestConfig | null>(null),
    [portrait, setPortrait] = useState<Portrait | null>(null),
    [page, setPage] = useState('home'),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [offline, setOffline] = useState(!navigator.onLine),
    [draft, setDraft] = useState<Draft | null>(null),
    [team, setTeam] = useState<Portrait[]>([]),
    [selected, setSelected] = useState<Portrait | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [teamQuery, setTeamQuery] = useState('');
  const [teamFilter, setTeamFilter] = useState('all');
  async function load() {
    setLoading(true);
    setError('');
    try {
      const mode = await api('/auth/mode');
      setDemo(mode.demo);
      setAuthMode(mode);
      const u = await api<User>('/me');
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
      setPage(u.role === 'methodologist' ? 'method' : u.role === 'admin' ? 'admin' : 'home');
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
      if (!restored) {
        if (e instanceof HttpError && e.status === 401) {
          setUser(null);
          setPortrait(null);
          setDraft(null);
          sessionStorage.removeItem('bilim-bootstrap');
        } else setError(e instanceof Error ? e.message : t('text001'));
      }
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
    const online = () => setOffline(!navigator.onLine);
    const authHash = () => {
      const next = readAuthLink();
      if (next) setAuthLink(next);
    };
    window.addEventListener('hashchange', authHash);
    window.addEventListener('online', online);
    window.addEventListener('offline', online);
    return () => {
      window.removeEventListener('hashchange', authHash);
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
        <span className="brand-mark" aria-hidden="true">
          BI
        </span>
        <div className="spinner" />
        <p>{t('text002')}</p>
      </div>
    );
  if (!user || authLink)
    return (
      <Auth
        key={authLink?.token ?? 'entry'}
        mode={authMode}
        link={authLink}
        initialError={error}
        onDone={async () => {
          setAuthLink(null);
          await load();
        }}
      />
    );
  const nav = [
    { id: 'home', text: t('home.nav'), show: ['employee', 'manager'].includes(user.role) },
    {
      id: 'profile',
      text: t('text006'),
      show: ['employee', 'manager'].includes(user.role),
    },
    { id: 'route', text: t('home.routeNav'), show: ['employee', 'manager'].includes(user.role) },
    { id: 'team', text: t('text007'), show: user.role === 'manager' },
    {
      id: 'method',
      text: t('text008'),
      show: ['methodologist', 'admin'].includes(user.role),
    },
    { id: 'admin', text: t('text009'), show: user.role === 'admin' },
  ];
  const showNav = page !== 'create';
  return (
    <div
      className={`app-shell ${page === 'profile' ? 'profile-shell' : ''} ${page === 'home' ? 'home-shell' : ''}`}
    >
      <header className="site-header">
        <div className="site-main-header">
          {showNav && (
            <button
              className="site-menu-toggle"
              aria-expanded={menuOpen}
              aria-controls="site-navigation"
              onClick={() => setMenuOpen(!menuOpen)}
            >
              {t('header.sections')}
              <span aria-hidden="true">{menuOpen ? '−' : '+'}</span>
            </button>
          )}
          <a className="brand" href="/" aria-label="BI Group">
            <Brand />
          </a>
          <div className="header-actions">
            <ThemeToggle />
            <LanguageMenu />
            <UserMenu
              name={user.name}
              detail={
                {
                  employee: t('text020'),
                  manager: t('text021'),
                  methodologist: t('text022'),
                  admin: t('text023'),
                }[user.role]
              }
              onProfile={
                ['employee', 'manager'].includes(user.role)
                  ? () => void navigate('profile')
                  : undefined
              }
              onLogout={async () => {
                await api('/auth/logout', 'POST');
                sessionStorage.removeItem('bilim-bootstrap');
                localStorage.removeItem(`bilim-draft-${user.id}`);
                setUser(null);
              }}
            />
          </div>
        </div>
        {showNav && (
          <nav id="site-navigation" className={`site-nav ${menuOpen ? 'is-open' : ''}`}>
            {nav
              .filter((n) => n.show)
              .map((n) => (
                <button
                  key={n.id}
                  onClick={() => {
                    void navigate(n.id);
                    setMenuOpen(false);
                  }}
                  className={page === n.id ? 'active' : ''}
                  aria-current={page === n.id ? 'page' : undefined}
                >
                  {n.text}
                </button>
              ))}
          </nav>
        )}
      </header>
      <div
        className={`main-shell ${page === 'home' ? 'page-bg' : ''}`}
        style={
          page === 'home'
            ? {
                backgroundColor: isDarkMode ? '#0b0f17' : '#f8fafc',
                backgroundImage: `radial-gradient(ellipse 80% 50% at 50% -20%, rgba(59, 130, 246, ${isDarkMode ? '0.2' : '0.12'}), transparent), radial-gradient(circle at 100% 100%, rgba(37, 99, 235, ${isDarkMode ? '0.1' : '0.08'}), transparent 40%), url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noiseFilter'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noiseFilter)' opacity='${isDarkMode ? '0.05' : '0.04'}'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'no-repeat, no-repeat, repeat',
                minHeight: '100vh',
                width: '100%',
              }
            : undefined
        }
      >
        {demo && ['employee', 'manager', 'methodologist', 'admin'].includes(user.id) && (
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
          {page === 'home' && portrait && (
            <Home
              portrait={portrait}
              hasDraft={!!draft}
              onNavigate={(p) => void navigate(p)}
              onStart={() => setPage('create')}
            />
          )}
          {page === 'route' && portrait && (
            <LearningRoute
              portrait={portrait}
              onStart={() => setPage('create')}
              refresh={async () => setPortrait(await api(`/profile/${user.id}`))}
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
                <span className="count-badge">{t('team.count', { count: team.length })}</span>
              </div>
              {selected ? (
                <>
                  <button className="text-button back-team" onClick={() => setSelected(null)}>
                    {t('text030')}
                  </button>
                  <Profile
                    key={selected.user.id}
                    portrait={selected}
                    config={config!}
                    readOnly
                    refresh={async () => {
                      const updated = await api<Portrait>(`/profile/${selected.user.id}`);
                      setSelected(updated);
                      setTeam((items) =>
                        items.map((item) => (item.user.id === updated.user.id ? updated : item)),
                      );
                    }}
                  />
                </>
              ) : (
                <>
                  <div className="team-toolbar">
                    <input
                      type="search"
                      aria-label={t('home.searchTeam')}
                      placeholder={t('home.searchTeam')}
                      value={teamQuery}
                      onChange={(e) => setTeamQuery(e.target.value)}
                    />
                    <select
                      aria-label={t('home.teamFilter')}
                      value={teamFilter}
                      onChange={(e) => setTeamFilter(e.target.value)}
                    >
                      <option value="all">{t('home.teamAll')}</option>
                      <option value="ready">{t('home.teamReady')}</option>
                      <option value="empty">{t('home.teamEmpty')}</option>
                    </select>
                  </div>
                  <div className="team-grid">
                    {team
                      .filter(
                        (p) =>
                          `${p.user.name} ${p.user.position}`
                            .toLocaleLowerCase('ru')
                            .includes(teamQuery.trim().toLocaleLowerCase('ru')) &&
                          (teamFilter === 'all' ||
                            (teamFilter === 'ready' ? !!p.result : !p.result)),
                      )
                      .map((p) => (
                        <button
                          className="team-card panel"
                          key={p.user.id}
                          onClick={() => setSelected(p)}
                        >
                          <div className="team-avatar">
                            {p.avatar && <img src={p.avatar.imageUrl} alt={avatarName(p.avatar)} />}
                          </div>
                          <h3>{p.user.name}</h3>
                          <p>{p.user.position}</p>
                          <span className="team-rank">{rankName(p.development.rank.current)}</span>
                          {p.result ? (
                            <div className="mini-scores">
                              {scaleIds.map((s) => (
                                <div key={s}>
                                  <span>{scaleShort(p.scales, s)}</span>
                                  <b>{p.result!.percentages[s]}%</b>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <span className="pill neutral">{t('text032')}</span>
                          )}
                          {p.development.records.some((r) => r.status === 'pending') && (
                            <span className="rank-status">
                              {t('rank.pending')}:{' '}
                              {p.development.records.filter((r) => r.status === 'pending').length}
                            </span>
                          )}
                          <span className="team-link">{t('text033')}</span>
                        </button>
                      ))}
                  </div>
                  {!team.some(
                    (p) =>
                      `${p.user.name} ${p.user.position}`
                        .toLocaleLowerCase('ru')
                        .includes(teamQuery.trim().toLocaleLowerCase('ru')) &&
                      (teamFilter === 'all' || (teamFilter === 'ready' ? !!p.result : !p.result)),
                  ) && <p className="empty-state">{t('home.noMatches')}</p>}
                </>
              )}
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
