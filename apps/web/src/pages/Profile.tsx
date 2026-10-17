import RankCard from '../RankCard';
import AvatarEditor from '../AvatarEditor';
import { Palette, X } from 'lucide-react';
import { useEffect, useState } from 'react';
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
import {
  date,
  Disclaimer,
  levelLabel,
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
  return (
    <>
      <div className="page-title">
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
                    // Keep the edited variant on screen even if it is not the fixed or newest one.
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
          {p.answerStatistics && (
            <section className="panel answer-statistics">
              <div className="panel-top">
                <div>
                  <h2>{t('profile.answerStatistics')}</h2>
                  <p className="muted">{t('profile.answerScale')}</p>
                </div>
                <strong className="answer-average">
                  {p.answerStatistics.average}
                  <small>/ 7</small>
                </strong>
              </div>
              <div className="answer-distribution" aria-label={t('profile.answerDistribution')}>
                {p.answerStatistics.distribution.map(({ value, count }) => (
                  <div className="answer-bin" key={value}>
                    <span>{value}</span>
                    <div
                      className="answer-bin-track"
                      role="meter"
                      aria-label={t('profile.ratingCount', { value })}
                      aria-valuemin={0}
                      aria-valuemax={p.answerStatistics!.count}
                      aria-valuenow={count}
                    >
                      <span
                        style={{
                          height: `${(count / p.answerStatistics!.count) * 100}%`,
                        }}
                      />
                    </div>
                    <small>{count}</small>
                  </div>
                ))}
              </div>
              <details className="answer-details">
                <summary>
                  {t('profile.questionAnswers', { count: p.answerStatistics.count })}
                </summary>
                <ol>
                  {p.answerStatistics.items.map((item, index) => (
                    <li key={item.id}>
                      <div className="answer-question-copy">
                        <small>{t('profile.questionNumber', { number: index + 1 })}</small>
                        <p>{questionText(item)}</p>
                        <span>
                          {item.scales.map((scale) => scaleLabel(p.scales, scale)).join(' · ')}
                        </span>
                      </div>
                      <div className="answer-item-rating">
                        <b>{item.answer}/7</b>
                        <div className="answer-item-track" aria-hidden="true">
                          <span style={{ width: `${(item.answer / 7) * 100}%` }} />
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </details>
            </section>
          )}
          {r.qualityFlags.length > 0 && (
            <div className="quality-warning">
              <p>{ui().qualityWarning}</p>
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
                    <span>{scaleLabel(p.scales, s)}</span>
                    <span>{r.percentages[s]}%</span>
                  </summary>
                  <p>{interpretation(p.scales, s, r.levels[s])}</p>
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
                    <span>{scaleLabel(p.scales, s)}</span>
                    <span>{r.percentages[s]}%</span>
                  </summary>
                  <p>{interpretation(p.scales, s, r.levels[s])}</p>
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
                    <span className="rec-scale">{scaleLabel(p.scales, rec.scale)}</span>
                    <details className="rec-copy explanation">
                      <summary>{recTitle(rec)}</summary>
                      <p>{recText(rec)}</p>
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
                  <h2>{recTitle(r.nextStep)}</h2>
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
        v0: scaleIds.map((s) => `${scaleLabel(labels, s)} ${scores[s]}%`).join(', '),
      })}
    >
      <title>{t('text114')}</title>
      {[0.25, 0.5, 0.75, 1].map((v) => (
        <polygon
          key={v}
          className="radar-grid"
          points={scaleIds.map((_, i) => point(i, v)).join(' ')}
        />
      ))}
      {scaleIds.map((_, i) => (
        <line
          key={i}
          className="radar-grid"
          x1="130"
          y1="100"
          x2={point(i, 1).split(',')[0]}
          y2={point(i, 1).split(',')[1]}
        />
      ))}
      <polygon
        className="radar-shape"
        points={scaleIds.map((s, i) => point(i, scores[s] / 100)).join(' ')}
      />
      {scaleIds.map((s, i) => (
        <circle
          key={s}
          className="radar-dot"
          cx={point(i, scores[s] / 100).split(',')[0]}
          cy={point(i, scores[s] / 100).split(',')[1]}
          r="3.5"
        />
      ))}
      <g fontSize="10" fontFamily="sans-serif">
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
