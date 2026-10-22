import RankCard from '../RankCard';
import AvatarEditor from '../AvatarEditor';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  Check,
  ClipboardList,
  Clock,
  Palette,
  Target,
  UserRound,
  Wrench,
  X,
} from 'lucide-react';
import { useEffect, useState, type CSSProperties } from 'react';
import { scaleIds, type Scores, type TestConfig } from '../../../../packages/core/src/index';
import { api } from '../api';
import {
  avatarName,
  interpretation,
  questionText,
  recText,
  recTitle,
  scaleLabel,
  scaleShort,
  strongUse,
} from '../content';
import { t } from '../localization';
import { date, levelLabel, placeholder, type AvatarView, type Portrait } from '../shared';
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
    [notice, setNotice] = useState(''),
    [editing, setEditing] = useState(false);
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
  const goal = config.thresholds.high;
  return (
    <div className="profile-page">
      <div className="page-title profile-page-title">
        <div>
          <h1>{readOnly ? p.user.name : t('text041')}</h1>
        </div>
        {r && <div className="date-tag">{date(p.completedAt!)}</div>}
      </div>
      <RankCard portrait={p} review={readOnly} refresh={refresh} />
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
                <img
                  src={avatar?.imageUrl ?? placeholder}
                  alt={avatar ? avatarName(avatar) : t('text070')}
                />
                {pending && (
                  <div className="generation-overlay">
                    <div className="spinner" />
                    <span>{t('text071')}</span>
                    <small>{t('text072')}</small>
                  </div>
                )}
              </div>
              <h2>{avatar && avatarName(avatar)}</h2>
              <p className="avatar-sub">
                {avatar?.status === 'fallback'
                  ? t('text073')
                  : pending
                    ? t('text074')
                    : t('text075')}
              </p>
              {!readOnly && avatar && (
                <button
                  className="button secondary customize-button"
                  disabled={busy || pending || !variants.some((a) => a.id === avatar.id)}
                  onClick={() => setEditing(true)}
                >
                  <Palette size={17} aria-hidden="true" />
                  {t('avatar.customize')}
                </button>
              )}
              {editing && avatar && (
                <AvatarEditor
                  avatar={avatar}
                  variant={Math.max(
                    0,
                    variants.findIndex((a) => a.id === avatar.id),
                  )}
                  onClose={() => setEditing(false)}
                  onSaved={async (updated) => {
                    setEditing(false);
                    await loadAvatars().catch(() => undefined);
                    setAvatar(updated);
                  }}
                />
              )}
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
              <div className="qualities-body">
                <div className="score-list">
                  {scaleIds.map((s) => {
                    return (
                      <div className="score-row" key={s}>
                        <div className="score-label">
                          <span>{scaleLabel(p.scales, s)}</span>
                          <b>
                            {r.percentages[s]}
                            <small>%</small>
                          </b>
                        </div>
                        <div
                          className="score-track"
                          role="meter"
                          aria-label={scaleLabel(p.scales, s)}
                          aria-valuemin={0}
                          aria-valuemax={100}
                          aria-valuenow={r.percentages[s]}
                        >
                          <span className={r.levels[s]} style={{ width: `${r.percentages[s]}%` }} />
                        </div>
                        <div className={`level-text ${r.levels[s]}`}>
                          {levelLabel(r.levels[s])}
                          {t('text084')}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="profile-bottom">
                  <Radar scores={r.percentages} labels={p.scales} />
                </div>
              </div>
            </section>
          </div>
          {!readOnly && p.writtenReview && (
            <section className="panel written-review">
              <h2>{t('written.review')}</h2>
              <p>{p.writtenReview.summary}</p>
              <div className="written-insights">
                {p.writtenReview.scales?.map((item) => (
                  <details className="explanation" key={item.scale}>
                    <summary>{scaleLabel(p.scales, item.scale)}</summary>
                    <p>{item.explanation}</p>
                  </details>
                ))}
              </div>
              <details className="answer-details">
                <summary>{t('written.myAnswers')}</summary>
                <ol>
                  {p.writtenReview.items.map((item) => (
                    <li key={item.id}>
                      <div>
                        <h3>{questionText(item)}</h3>
                        <p className="written-response">{item.answer}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </details>
              <p className="muted">{t('written.limits')}</p>
            </section>
          )}
          <div className="insights-grid">
            <section className="panel insight insight-strengths">
              <div className="insight-title">
                <h2>{t('text088')}</h2>
              </div>
              {r.strong.slice(0, 1).map((s) => (
                <div className={`strength-feature ${r.levels[s]}`} key={s}>
                  <div
                    className="strength-donut"
                    role="meter"
                    aria-label={scaleLabel(p.scales, s)}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={r.percentages[s]}
                  >
                    <svg viewBox="0 0 120 120" aria-hidden="true">
                      <circle className="strength-ring-track" cx="60" cy="60" r="51" />
                      <circle
                        className="strength-ring"
                        cx="60"
                        cy="60"
                        r="51"
                        pathLength={100}
                        strokeDasharray={`${r.percentages[s]} 100`}
                        transform="rotate(-90 60 60)"
                      />
                    </svg>
                    <span className="strength-value">
                      {r.percentages[s]}
                      <small>%</small>
                    </span>
                  </div>
                  <div className="strength-copy">
                    <h3>{scaleLabel(p.scales, s)}</h3>
                    <span className={`level-text ${r.levels[s]}`}>
                      {levelLabel(r.levels[s])}
                      {t('text084')}
                    </span>
                    <p>{interpretation(p.scales, s, r.levels[s])}</p>
                  </div>
                </div>
              ))}
              {r.strong.slice(1).map((s) => (
                <details className="strength-extra" key={s}>
                  <summary>
                    <span>{scaleLabel(p.scales, s)}</span>
                    <strong>{r.percentages[s]}%</strong>
                    <span className="insight-track" aria-hidden="true">
                      <span className={r.levels[s]} style={{ width: `${r.percentages[s]}%` }} />
                    </span>
                  </summary>
                  <p>{interpretation(p.scales, s, r.levels[s])}</p>
                </details>
              ))}
            </section>
            <section className="panel insight insight-growth">
              <div className="insight-title">
                <h2>{t('text089')}</h2>
              </div>
              <p className="growth-legend">
                <i aria-hidden="true" />
                {t('growth.goal', { v0: goal })}
              </p>
              <ol className="growth-chart" style={{ '--goal': `${goal}%` } as CSSProperties}>
                {[...scaleIds]
                  .sort((a, b) => r.percentages[a] - r.percentages[b])
                  .map((s, i) => {
                    const value = r.percentages[s];
                    const gap = goal - value;
                    const focus = i === 0 && gap > 0;
                    return (
                      <li className={`growth-item${focus ? ' is-focus' : ''}`} key={s}>
                        <span className="growth-label">{syllables(scaleLabel(p.scales, s))}</span>
                        <span className="growth-head">
                          {focus && <span className="growth-focus">{t('growth.focus')}</span>}
                          <strong className="growth-value">{value}%</strong>
                          <span className={`growth-gap${gap > 0 ? '' : ' is-reached'}`}>
                            {gap > 0 ? (
                              <>
                                <ArrowUp size={13} strokeWidth={2.6} aria-hidden="true" />+{gap}
                                <span className="visually-hidden"> {t('growth.toGoal')}</span>
                              </>
                            ) : (
                              <>
                                <Check size={14} strokeWidth={2.8} aria-hidden="true" />
                                <span className="visually-hidden">{t('growth.reached')}</span>
                              </>
                            )}
                          </span>
                        </span>
                        <span className="growth-column" aria-hidden="true">
                          {Array.from({ length: 10 }, (_, k) => (
                            <span
                              key={k}
                              className={`growth-seg ${
                                (k + 1) * 10 <= value
                                  ? 'is-full'
                                  : k * 10 < value
                                    ? 'is-part'
                                    : k * 10 < goal
                                      ? 'to-goal'
                                      : 'is-empty'
                              }`}
                              style={{ '--i': k } as CSSProperties}
                            />
                          ))}
                        </span>
                      </li>
                    );
                  })}
              </ol>
            </section>
          </div>
          {!readOnly && (
            <>
              <div className="section-heading">
                <div>
                  <h2>{t('text091')}</h2>
                </div>
              </div>
              <div
                className={`recommendations-carousel${r.recommendations.length > 1 ? ' has-arrows' : ''}`}
              >
                {r.recommendations.length > 1 && (
                  <button
                    className="carousel-arrow"
                    disabled={recPage === 0}
                    onClick={() => setRecPage(recPage - 1)}
                    aria-label={t('text099')}
                  >
                    <ArrowLeft size={18} aria-hidden="true" />
                  </button>
                )}
                <div className="recommendations-grid">
                  {r.recommendations.slice(recPage, recPage + 1).map((rec) => {
                    const RecommendationIcon = {
                      practice: Target,
                      mentor: UserRound,
                      microcourse: BookOpen,
                      checklist: ClipboardList,
                    }[rec.format];
                    return (
                      <article
                        className={`recommendation recommendation-${rec.format}`}
                        key={rec.id}
                      >
                        <div className="recommendation-top">
                          <span className="recommendation-icon" aria-hidden="true">
                            <RecommendationIcon size={19} />
                          </span>
                          <span className="rec-category">
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
                        <span className="rec-scale">{scaleLabel(p.scales, rec.scale)}</span>
                        <details className="rec-copy explanation">
                          <summary>{recTitle(rec)}</summary>
                          <p>{recText(rec)}</p>
                        </details>
                        <div className="rec-footer">
                          <span className="rec-duration">
                            <Clock size={15} aria-hidden="true" />
                            {rec.durationDays}
                            {t('text097')}
                          </span>
                          <button
                            className="button primary"
                            onClick={() => void openModule(rec.link)}
                          >
                            {t('text098')}
                            <ArrowRight size={15} aria-hidden="true" />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
                {r.recommendations.length > 1 && (
                  <button
                    className="carousel-arrow"
                    disabled={recPage + 1 >= r.recommendations.length}
                    onClick={() => setRecPage(recPage + 1)}
                    aria-label={t('text100')}
                  >
                    <ArrowRight size={18} aria-hidden="true" />
                  </button>
                )}
              </div>
              {r.recommendations.length > 1 && (
                <div className="carousel-progress" aria-live="polite">
                  <span>{recPage + 1}</span>
                  <i aria-hidden="true" />
                  {r.recommendations.length}
                </div>
              )}
              {r.strongUse && (
                <details className="strong-use explanation">
                  <summary>{t('applyStrength')}</summary>
                  <p>{strongUse(r, p.scales)}</p>
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
                  <span className="next-step-icon" aria-hidden="true">
                    <Wrench size={30} />
                  </span>
                  <h2>{recTitle(r.nextStep)}</h2>
                  <button className="button" onClick={() => void openModule(r.nextStep.link)}>
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
                        <th key={s}>{scaleShort(p.scales, s)}</th>
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
                            {i > 0 && h.responseFormat === p.history[i - 1].responseFormat && (
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
    </div>
  );
}
// Add soft hyphens between syllables for narrow columns.
const syllables = (text: string) =>
  text.replace(/\p{L}{10,}/gu, (word) =>
    word.replace(
      /(?<=\p{L}{3})(?=[^aeiouyаеёиоуыэюяәіөүұьъй\P{L}][aeiouyаеёиоуыэюяәіөүұ]\p{L})/giu,
      '­',
    ),
  );

function Radar({ scores, labels }: { scores: Scores; labels: TestConfig['scales'] }) {
  const cx = 215,
    cy = 150,
    R = 104;
  const point = (i: number, v: number) => {
    const a = ((i * 90 - 90) * Math.PI) / 180;
    return [cx + Math.cos(a) * R * v, cy + Math.sin(a) * R * v] as const;
  };
  const names = [t('text115'), t('text116'), t('text117'), t('text118')];
  const tags = [
    { x: cx, name: cy - R - 30, value: cy - R - 12, anchor: 'middle' },
    { x: cx + R + 16, name: cy - 5, value: cy + 14, anchor: 'start' },
    { x: cx, name: cy + R + 42, value: cy + R + 24, anchor: 'middle' },
    { x: cx - R - 16, name: cy - 5, value: cy + 14, anchor: 'end' },
  ] as const;
  return (
    <svg
      className="radar"
      viewBox="0 0 430 304"
      role="img"
      aria-label={t('text113', {
        v0: scaleIds.map((s) => `${scaleLabel(labels, s)} ${scores[s]}%`).join(', '),
      })}
    >
      <title>{t('text114')}</title>
      <defs>
        <linearGradient id="radar-fill" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--accent)', stopOpacity: 0.34 }} />
          <stop offset="100%" style={{ stopColor: '#6d5dfc', stopOpacity: 0.12 }} />
        </linearGradient>
      </defs>
      <circle className="radar-disc" cx={cx} cy={cy} r={R} />
      {[0.25, 0.5, 0.75, 1].map((v) => (
        <circle key={v} className="radar-grid" cx={cx} cy={cy} r={R * v} />
      ))}
      {scaleIds.map((_, i) => (
        <line
          key={i}
          className="radar-grid"
          x1={cx}
          y1={cy}
          x2={point(i, 1)[0]}
          y2={point(i, 1)[1]}
        />
      ))}
      <polygon
        className="radar-shape"
        points={scaleIds.map((s, i) => point(i, scores[s] / 100).join(',')).join(' ')}
      />
      {scaleIds.map((s, i) => (
        <circle
          key={s}
          className="radar-dot"
          cx={point(i, scores[s] / 100)[0]}
          cy={point(i, scores[s] / 100)[1]}
          r="5.5"
          tabIndex={0}
          role="img"
          aria-label={`${scaleLabel(labels, s)} ${scores[s]}%`}
        >
          <title>{`${scaleLabel(labels, s)} ${scores[s]}%`}</title>
        </circle>
      ))}
      {scaleIds.map((s, i) => (
        <g key={s} className="radar-tag" textAnchor={tags[i].anchor} aria-hidden="true">
          <text className="radar-name" x={tags[i].x} y={tags[i].name}>
            {names[i]}
          </text>
          <text className="radar-value" x={tags[i].x} y={tags[i].value}>
            {scores[s]}%
          </text>
        </g>
      ))}
    </svg>
  );
}
