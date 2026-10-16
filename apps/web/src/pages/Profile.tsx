import {
  ArrowRight,
  ArrowUpRight,
  Brain,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Compass,
  Info,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { scaleIds, type Scores, type TestConfig } from '../../../../packages/core/src/index';
import { api } from '../api';
import { t } from '../localization';
import {
  date,
  Disclaimer,
  icons,
  levelLabels,
  placeholder,
  Route,
  ui,
  type AvatarView,
  type Portrait,
} from '../shared';
export default function Profile({
  portrait: p,
  config,
  onStart,
  hasDraft,
  refresh,
  readOnly = false,
}: {
  portrait: Portrait;
  config: TestConfig;
  onStart?: () => void;
  hasDraft?: boolean;
  refresh?: () => Promise<void>;
  readOnly?: boolean;
}) {
  const r = p.result,
    [recPage, setRecPage] = useState(0),
    [variants, setVariants] = useState<AvatarView[]>([]),
    [regens, setRegens] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const [avatar, setAvatar] = useState(p.avatar);
  useEffect(() => {
    setAvatar(p.avatar);
    setRecPage(0);
  }, [p]);
  async function loadAvatars() {
    const data = await api(`/avatar/${p.user.id}`);
    setVariants(data.avatars);
    setRegens(data.regenerationsLeft);
    const chosen =
      data.avatars.find((a: AvatarView) => a.fixed) ?? data.avatars[data.avatars.length - 1];
    if (chosen) setAvatar(chosen);
    return data;
  }
  useEffect(() => {
    if (!r) return;
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const data = await loadAvatars();
        if (
          live &&
          data.avatars.some((a: AvatarView) => ['queued', 'generating'].includes(a.status))
        )
          timer = setTimeout(() => void poll(), 1500);
      } catch (e) {
        if (live) setError((e as Error).message);
      }
    };
    void poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [p.sessionId, p.avatar?.id]);
  const pending = !!avatar && ['queued', 'generating'].includes(avatar.status);
  async function openModule(link: string) {
    try {
      const data = await api(`/learning/link?path=${encodeURIComponent(link)}`);
      if (data.url) window.location.assign(data.url);
      else setNotice(t('text039', { v0: link }));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function regenerate() {
    setBusy(true);
    setError('');
    try {
      await api(`/avatar/${p.user.id}/regenerate`, 'POST');
      await loadAvatars();
      await refresh?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function fix() {
    setBusy(true);
    setError('');
    try {
      await api(`/avatars/${avatar!.id}/fix`, 'POST');
      await loadAvatars();
      await refresh?.();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  const canRetake = !p.nextAllowedAt || Date.parse(p.nextAllowedAt) <= Date.now();
  return (
    <>
      <div className="page-title">
        <div>
          <div className="eyebrow">{t('text040')}</div>
          <h1>
            {readOnly ? p.user.name : t('text041')}
            <span className="heading-dot">.</span>
          </h1>
          <p>{r ? t('text042') : t('text043')}</p>
        </div>
        {r && (
          <div className="date-tag">
            <Clock size={15} /> {date(p.completedAt!)}
          </div>
        )}
      </div>
      {!r ? (
        <>
          <section className="welcome-hero">
            <div className="hero-copy">
              <span className="hero-label">
                <Sparkles size={16} />
                {t('text044')}
              </span>
              <h2>
                {t('text045')}
                <br />
                {t('text046')}
                <em>{t('text047')}</em>
              </h2>
              <p>{t('text048')}</p>
              <button className="button primary" onClick={onStart}>
                {hasDraft ? t('text049') : t('text050')}
                <ArrowUpRight size={19} />
              </button>
              <div className="hero-meta">
                <span>
                  <Clock size={15} />
                  {t('text051')}
                </span>
                <span>
                  <ShieldCheck size={15} />
                  {t('text052')}
                </span>
              </div>
            </div>
            <div className="hero-art">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <span className="float-tag tag-one">
                <Brain size={17} />
                {t('text053')}
              </span>
              <span className="float-tag tag-two">
                <Users size={17} />
                {t('text054')}
              </span>
              <div className="hero-spark">✧</div>
              <img src={placeholder} alt={t('text055')} />
              <div className="art-caption">
                <span className="status-dot" />
                {t('text056')}
              </div>
            </div>
          </section>
          <div className="section-heading">
            <h2>{t('text057')}</h2>
            <span>{t('text058')}</span>
          </div>
          <div className="steps-grid">
            {[
              { icon: Compass, n: '01', title: t('text059'), text: t('text060') },
              { icon: MessageCircle, n: '02', title: t('text061'), text: t('text062') },
              { icon: Target, n: '03', title: t('text063'), text: t('text064') },
            ].map((x) => (
              <div className="panel step-card" key={x.n}>
                <div className="step-top">
                  <span className="icon-tile">
                    <x.icon size={22} />
                  </span>
                  <span className="step-number">{x.n}</span>
                </div>
                <h3>{x.title}</h3>
                <p>{x.text}</p>
              </div>
            ))}
          </div>
          <div className="route-panel">
            <div className="icon-tile">
              <ArrowUpRight size={23} />
            </div>
            <div>
              <h3>{t('text065')}</h3>
              <p>{t('text066')}</p>
            </div>
            <Route />
          </div>
        </>
      ) : (
        <>
          <div className="result-grid">
            <section className="avatar-panel panel">
              <div className="panel-top">
                <span className="eyebrow">{t('text067')}</span>
                <span className="edition">
                  {avatar?.config.boosted ? t('text068') : t('text069')}
                </span>
              </div>
              <div className={`avatar-stage ${pending ? 'pending' : ''}`}>
                <div className="avatar-halo" />
                <img src={avatar?.imageUrl ?? placeholder} alt={avatar?.name ?? t('text070')} />
                {pending && (
                  <div className="generation-overlay">
                    <div className="spinner" />
                    <span>{t('text071')}</span>
                    <small>{t('text072')}</small>
                  </div>
                )}
              </div>
              <h2>{avatar?.name}</h2>
              <p className="avatar-sub">
                {avatar?.status === 'fallback'
                  ? t('text073')
                  : pending
                    ? t('text074')
                    : t('text075')}
              </p>
              {!readOnly && !avatar?.fixed && (
                <>
                  <div className="variants">
                    {variants.map((a) => (
                      <button
                        key={a.id}
                        className={avatar?.id === a.id ? 'chosen' : ''}
                        aria-label={t('text076', { v0: variants.indexOf(a) + 1 })}
                        onClick={() => setAvatar(a)}
                      >
                        <img src={a.imageUrl} alt={t('text077', { v0: variants.indexOf(a) + 1 })} />
                      </button>
                    ))}
                  </div>
                  <div className="avatar-buttons">
                    <button
                      className="button secondary"
                      disabled={busy || pending || regens === 0}
                      onClick={() => void regenerate()}
                    >
                      <RefreshCw size={16} />
                      {t('text078')}
                      {regens})
                    </button>
                    <button
                      className="button primary"
                      disabled={busy || pending}
                      onClick={() => void fix()}
                    >
                      <Check size={16} />
                      {t('text079')}
                    </button>
                  </div>
                </>
              )}
              {avatar?.fixed && (
                <span className="fixed-note">
                  <CheckCircle2 size={15} />
                  {t('text080')}
                </span>
              )}
              {error && (
                <div className="field-error" role="alert">
                  {error}
                </div>
              )}
            </section>
            <section className="qualities-panel panel">
              <div className="panel-top">
                <h2>{t('text081')}</h2>
                <span className="pill neutral">{t('text082')}</span>
              </div>
              <p className="muted">{t('text083')}</p>
              <div className="score-list">
                {scaleIds.map((s) => {
                  const Icon = icons[s];
                  return (
                    <div className="score-row" key={s}>
                      <div className="score-label">
                        <span>
                          <Icon size={18} />
                          {p.scales[s].label}
                        </span>
                        <b>
                          {r.percentages[s]}
                          <small>%</small>
                        </b>
                      </div>
                      <div
                        className="score-track"
                        role="meter"
                        aria-label={p.scales[s].label}
                        aria-valuemin={0}
                        aria-valuemax={100}
                        aria-valuenow={r.percentages[s]}
                      >
                        <span className={r.levels[s]} style={{ width: `${r.percentages[s]}%` }} />
                      </div>
                      <div className={`level-text ${r.levels[s]}`}>
                        {levelLabels[r.levels[s]]}
                        {t('text084')}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="profile-bottom">
                <Radar scores={r.percentages} labels={p.scales} />
                <div className="radar-caption">
                  <span className="eyebrow">{t('text085')}</span>
                  <p>{t('text086')}</p>
                  <span>{t('text087')}</span>
                </div>
              </div>
            </section>
          </div>
          {r.qualityFlags.length > 0 && (
            <div className="quality-warning">
              <Info size={19} />
              <p>{ui.qualityWarning}</p>
            </div>
          )}
          <div className="insights-grid">
            <section className="panel insight">
              <div className="insight-title">
                <span className="icon-tile green">
                  <Sparkles size={20} />
                </span>
                <h2>{t('text088')}</h2>
              </div>
              {r.strong.map((s) => (
                <div className="interpretation" key={s}>
                  <h3>
                    {p.scales[s].label}
                    <span>{r.percentages[s]}%</span>
                  </h3>
                  <p>{p.scales[s].interpretations[r.levels[s]]}</p>
                </div>
              ))}
            </section>
            <section className="panel insight">
              <div className="insight-title">
                <span className="icon-tile peach">
                  <Target size={20} />
                </span>
                <h2>{t('text089')}</h2>
              </div>
              {r.growth.map((s) => (
                <div className="interpretation" key={s}>
                  <h3>
                    {p.scales[s].label}
                    <span>{r.percentages[s]}%</span>
                  </h3>
                  <p>{p.scales[s].interpretations[r.levels[s]]}</p>
                </div>
              ))}
            </section>
          </div>
          {!readOnly && (
            <>
              <div className="section-heading">
                <div>
                  <div className="eyebrow">{t('text090')}</div>
                  <h2>{t('text091')}</h2>
                </div>
                <span>
                  {r.recommendations.length}
                  {t('text092')}
                </span>
              </div>
              <div className="recommendations-grid">
                {r.recommendations.slice(recPage * 4, recPage * 4 + 4).map((rec, i) => (
                  <article className="panel recommendation" key={rec.id}>
                    <div className="rec-head">
                      <span className="rec-number">
                        {String(recPage * 4 + i + 1).padStart(2, '0')}
                      </span>
                      <span className="pill neutral">
                        {
                          {
                            practice: t('text093'),
                            mentor: t('text094'),
                            microcourse: t('text095'),
                            checklist: t('text096'),
                          }[rec.format]
                        }
                      </span>
                    </div>
                    <span className="rec-scale">{p.scales[rec.scale].label}</span>
                    <h3>{rec.title}</h3>
                    <p>{rec.text}</p>
                    <div className="rec-footer">
                      <span>
                        <Clock size={14} /> {rec.durationDays}
                        {t('text097')}
                      </span>
                      <button className="text-button" onClick={() => void openModule(rec.link)}>
                        {t('text098')}
                        <ArrowUpRight size={17} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
              {r.recommendations.length > 4 && (
                <div className="pagination">
                  <button
                    disabled={recPage === 0}
                    onClick={() => setRecPage(recPage - 1)}
                    aria-label={t('text099')}
                  >
                    <ChevronLeft />
                  </button>
                  <span>
                    {recPage + 1} / {Math.ceil(r.recommendations.length / 4)}
                  </span>
                  <button
                    disabled={(recPage + 1) * 4 >= r.recommendations.length}
                    onClick={() => setRecPage(recPage + 1)}
                    aria-label={t('text100')}
                  >
                    <ChevronRight />
                  </button>
                </div>
              )}
              {r.strongUse && (
                <div className="strong-use">
                  <Sparkles size={20} />
                  {r.strongUse}
                </div>
              )}
              {notice && (
                <div className="alert">
                  {notice}
                  <button aria-label={t('text101')} onClick={() => setNotice('')}>
                    <X size={17} />
                  </button>
                </div>
              )}
              <section className="next-step">
                <div>
                  <span className="eyebrow">{t('text102')}</span>
                  <h2>{r.nextStep.title}</h2>
                  <p>{r.nextStep.text}</p>
                  <button
                    className="button primary"
                    onClick={() => void openModule(r.nextStep.link)}
                  >
                    {t('text103')}
                    <ArrowRight size={18} />
                  </button>
                </div>
                <Route />
              </section>
            </>
          )}
          <section className="panel history">
            <div className="panel-top">
              <h2>{t('text104')}</h2>
              <span className="muted">
                {t('text105')}
                {p.retakeDays}
                {t('text106')}
              </span>
            </div>
            {p.history.length < 2 ? (
              <p className="muted">{t('text107')}</p>
            ) : (
              <div className="history-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>{t('text108')}</th>
                      {scaleIds.map((s) => (
                        <th key={s}>{p.scales[s].short}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {p.history.map((h, i) => (
                      <tr key={h.at}>
                        <td>
                          {date(h.at)}
                          <small>v{h.testVersion}</small>
                        </td>
                        {scaleIds.map((s) => (
                          <td key={s}>
                            {h.percentages[s]}%
                            {i > 0 && (
                              <small
                                className={
                                  h.percentages[s] >= p.history[i - 1].percentages[s]
                                    ? 'positive'
                                    : 'negative'
                                }
                              >
                                {h.percentages[s] - p.history[i - 1].percentages[s] > 0 ? '+' : ''}
                                {h.percentages[s] - p.history[i - 1].percentages[s]}
                                {t('text109')}
                              </small>
                            )}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {!readOnly && (
              <div className="retake-row">
                <span>
                  {canRetake ? t('text110') : t('text111', { v0: date(p.nextAllowedAt!) })}
                </span>
                <button className="button secondary" disabled={!canRetake} onClick={onStart}>
                  {t('text112')}
                  <RefreshCw size={15} />
                </button>
              </div>
            )}
          </section>
        </>
      )}
      <Disclaimer />
    </>
  );
}
function Radar({ scores, labels }: { scores: Scores; labels: TestConfig['scales'] }) {
  const point = (i: number, v: number) => {
    const a = ((i * 90 - 90) * Math.PI) / 180;
    return `${130 + Math.cos(a) * 65 * v},${100 + Math.sin(a) * 65 * v}`;
  };
  return (
    <svg
      className="radar"
      viewBox="0 0 260 205"
      role="img"
      aria-label={t('text113', {
        v0: scaleIds.map((s) => `${labels[s].label} ${scores[s]}%`).join(', '),
      })}
    >
      <title>{t('text114')}</title>
      {[0.25, 0.5, 0.75, 1].map((v) => (
        <polygon
          key={v}
          points={scaleIds.map((_, i) => point(i, v)).join(' ')}
          fill="none"
          stroke="#e2e3ec"
        />
      ))}
      {scaleIds.map((_, i) => (
        <line
          key={i}
          x1="130"
          y1="100"
          x2={point(i, 1).split(',')[0]}
          y2={point(i, 1).split(',')[1]}
          stroke="#e2e3ec"
        />
      ))}
      <polygon
        points={scaleIds.map((s, i) => point(i, scores[s] / 100)).join(' ')}
        fill="#8f8bd6"
        fillOpacity=".25"
        stroke="#8178ca"
        strokeWidth="2"
      />
      {scaleIds.map((s, i) => (
        <circle
          key={s}
          cx={point(i, scores[s] / 100).split(',')[0]}
          cy={point(i, scores[s] / 100).split(',')[1]}
          r="3.5"
          fill="#8178ca"
        />
      ))}
      <g fill="#727489" fontSize="10" fontFamily="sans-serif">
        <text x="130" y="18" textAnchor="middle">
          {t('text115')}
        </text>
        <text x="202" y="104">
          {t('text116')}
        </text>
        <text x="130" y="190" textAnchor="middle">
          {t('text117')}
        </text>
        <text x="0" y="104">
          {t('text118')}
        </text>
      </g>
    </svg>
  );
}
