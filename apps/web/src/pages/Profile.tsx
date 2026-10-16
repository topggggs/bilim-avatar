import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { scaleIds, type Scores, type TestConfig } from '../../../../packages/core/src/index';
import { api } from '../api';
import { t } from '../localization';
import {
  date,
  Disclaimer,
  levelLabels,
  placeholder,
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
          <h1>{readOnly ? p.user.name : t('text041')}</h1>
        </div>
        {r && <div className="date-tag">{date(p.completedAt!)}</div>}
      </div>
      {!r ? (
        <>
          <section className="welcome-hero">
            <div className="hero-copy">
              <h2>{t('text062')}</h2>
              <p>{t('text051')}</p>
              <button className="button primary" onClick={onStart}>
                {hasDraft ? t('text049') : t('text050')}
              </button>
            </div>
          </section>
        </>
      ) : (
        <>
          <div className="result-grid">
            <section className="avatar-panel panel">
              <div className={`avatar-stage ${pending ? 'pending' : ''}`}>
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
                      {t('text078')}
                      {regens})
                    </button>
                    <button
                      className="button primary"
                      disabled={busy || pending}
                      onClick={() => void fix()}
                    >
                      {t('text079')}
                    </button>
                  </div>
                </>
              )}
              {avatar?.fixed && <span className="fixed-note">{t('text080')}</span>}
              {error && (
                <div className="field-error" role="alert">
                  {error}
                </div>
              )}
            </section>
            <section className="qualities-panel panel">
              <div className="panel-top">
                <h2>{t('text081')}</h2>
              </div>
              <div className="score-list">
                {scaleIds.map((s) => {
                  return (
                    <div className="score-row" key={s}>
                      <div className="score-label">
                        <span>{p.scales[s].label}</span>
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
              </div>
            </section>
          </div>
          {r.qualityFlags.length > 0 && (
            <div className="quality-warning">
              <p>{ui.qualityWarning}</p>
            </div>
          )}
          <div className="insights-grid">
            <section className="panel insight">
              <div className="insight-title">
                <h2>{t('text088')}</h2>
              </div>
              {r.strong.map((s) => (
                <details className="interpretation explanation" key={s}>
                  <summary>
                    <span>{p.scales[s].label}</span>
                    <span>{r.percentages[s]}%</span>
                  </summary>
                  <p>{p.scales[s].interpretations[r.levels[s]]}</p>
                </details>
              ))}
            </section>
            <section className="panel insight">
              <div className="insight-title">
                <h2>{t('text089')}</h2>
              </div>
              {r.growth.map((s) => (
                <details className="interpretation explanation" key={s}>
                  <summary>
                    <span>{p.scales[s].label}</span>
                    <span>{r.percentages[s]}%</span>
                  </summary>
                  <p>{p.scales[s].interpretations[r.levels[s]]}</p>
                </details>
              ))}
            </section>
          </div>
          {!readOnly && (
            <>
              <div className="section-heading">
                <div>
                  <h2>{t('text091')}</h2>
                </div>
              </div>
              <div className="recommendations-grid">
                {r.recommendations.slice(recPage * 4, recPage * 4 + 4).map((rec, i) => (
                  <article className="panel recommendation" key={rec.id}>
                    <div className="rec-head">
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
                    <details className="rec-copy explanation">
                      <summary>{rec.title}</summary>
                      <p>{rec.text}</p>
                    </details>
                    <div className="rec-footer">
                      <span>
                        {rec.durationDays}
                        {t('text097')}
                      </span>
                      <button className="text-button" onClick={() => void openModule(rec.link)}>
                        {t('text098')}
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
                    {t('text163')}
                  </button>
                  <span>
                    {recPage + 1} / {Math.ceil(r.recommendations.length / 4)}
                  </span>
                  <button
                    disabled={(recPage + 1) * 4 >= r.recommendations.length}
                    onClick={() => setRecPage(recPage + 1)}
                    aria-label={t('text100')}
                  >
                    {t('text193')}
                  </button>
                </div>
              )}
              {r.strongUse && (
                <details className="strong-use explanation">
                  <summary>{t('applyStrength')}</summary>
                  <p>{r.strongUse}</p>
                </details>
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
                  <h2>{r.nextStep.title}</h2>
                  <button
                    className="button primary"
                    onClick={() => void openModule(r.nextStep.link)}
                  >
                    {t('text103')}
                  </button>
                </div>
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
          stroke="#e1e6f1"
        />
      ))}
      {scaleIds.map((_, i) => (
        <line
          key={i}
          x1="130"
          y1="100"
          x2={point(i, 1).split(',')[0]}
          y2={point(i, 1).split(',')[1]}
          stroke="#e1e6f1"
        />
      ))}
      <polygon
        points={scaleIds.map((s, i) => point(i, scores[s] / 100)).join(' ')}
        fill="#304fe5"
        fillOpacity=".25"
        stroke="#304fe5"
        strokeWidth="2"
      />
      {scaleIds.map((s, i) => (
        <circle
          key={s}
          cx={point(i, scores[s] / 100).split(',')[0]}
          cy={point(i, scores[s] / 100).split(',')[1]}
          r="3.5"
          fill="#304fe5"
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
