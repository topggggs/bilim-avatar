import { useEffect, useRef, useState } from 'react';
import {
  choices,
  type Appearance,
  type Scale,
  type Scores,
  type TestConfig,
} from '../../../../packages/core/src/index';
import type { Session, User } from '../../../api/src/store';
import { api, HttpError } from '../api';
import { t } from '../localization';
import { ui, type Draft } from '../shared';
const universes = [
  { id: 'cinema', title: t('text119') },
  { id: 'anime', title: t('text121') },
  { id: 'animals', title: t('text123') },
  { id: 'sport', title: t('text125') },
  { id: 'fantasy', title: t('text127') },
];
export default function TestFlow({
  user,
  config: c,
  draft,
  onExit,
  onDone,
  onDraft,
  offline,
}: {
  user: User;
  config: TestConfig;
  draft: Draft | null;
  onExit: () => void;
  onDone: () => void;
  onDraft: (d: Draft) => void;
  offline: boolean;
}) {
  const [stage, setStage] = useState(draft ? 4 : 0),
    [appearance, setAppearance] = useState<Appearance>(
      draft?.session.appearance ?? { universe: 'animals', gender: 'neutral', style: 'tech' },
    ),
    [consent, setConsent] = useState(false),
    [session, setSession] = useState(draft?.session ?? null),
    [answers, setAnswers] = useState(draft?.answers ?? {}),
    [index, setIndex] = useState(draft?.index ?? 0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [syncStatus, setSyncStatus] = useState(t('text129')),
    [tie, setTie] = useState<{
      percentages: Scores;
    } | null>(null),
    [primary, setPrimary] = useState<Scale | ''>(''),
    [secondary, setSecondary] = useState<Scale | ''>('');
  const saveChain = useRef<Promise<unknown>>(Promise.resolve()),
    revision = useRef(0);
  const count = Object.keys(answers).length,
    q = c.questions[index];
  function sync(snapshot: Record<string, number>, id: string) {
    const rev = ++revision.current;
    setSyncStatus(t('text130'));
    saveChain.current = saveChain.current
      .catch(() => {})
      .then(() => api(`/test/sessions/${id}/answers`, 'PUT', { answers: snapshot }))
      .then(() => {
        if (rev === revision.current) setSyncStatus(t('text131'));
      })
      .catch(() => {
        if (rev === revision.current) setSyncStatus(t('text132'));
      });
    return saveChain.current;
  }
  useEffect(() => {
    if (!session) return;
    const d = { session, answers, index };
    try {
      localStorage.setItem(`bilim-draft-${user.id}`, JSON.stringify(d));
      onDraft(d);
    } catch {
      setError(t('text133'));
    }
  }, [session, answers, index]);
  useEffect(() => {
    if (session && !offline) void sync(answers, session.id);
  }, [offline, session?.id]);
  function answer(value: number) {
    const next = { ...answers, [q.id]: value };
    setAnswers(next);
    if (session && !offline) void sync(next, session.id);
    else setSyncStatus(t('text134'));
  }
  async function start() {
    setBusy(true);
    setError('');
    try {
      const s = await api<Session>('/test/sessions', 'POST', { appearance, consent: true });
      setSession(s);
      setAnswers(s.answers);
      setStage(4);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit() {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      await saveChain.current;
      await api(`/test/sessions/${session.id}/answers`, 'PUT', { answers });
      await api(`/test/sessions/${session.id}/submit`, 'POST', {
        ...(primary ? { primary } : {}),
        ...(secondary ? { secondary } : {}),
      });
      onDone();
    } catch (e) {
      if (e instanceof HttpError && e.data.code === 'AVATAR_CHOICE_REQUIRED') {
        const scores = e.data.percentages as Scores;
        setTie({ percentages: scores });
        const options = choices(scores);
        setPrimary(options.primaryOptions.length === 1 ? options.primaryOptions[0] : '');
        setSecondary('');
      } else setError(e instanceof Error ? e.message : t('text135'));
    } finally {
      setBusy(false);
    }
  }
  const tieOptions = tie ? choices(tie.percentages, primary || undefined) : null;
  return (
    <div className="flow">
      <div className="flow-top">
        <button className="text-button" onClick={onExit}>
          {t('text136')}
        </button>
        <span className="flow-progress-text">{stage < 4 ? t('text138') : t('text139')}</span>
      </div>
      {error && (
        <div role="alert" className="alert">
          {error}
        </div>
      )}
      {stage === 0 ? (
        <section className="onboarding panel">
          <h1>{t('text143')}</h1>
          <p>{t('text144')}</p>
          <p>{t('text146')}</p>
          <details className="consent-details">
            <summary>{t('processingTerms')}</summary>
            <p>{ui.methodology}</p>
            <p>{ui.consent}</p>
            <p>
              {t('text147')}
              {c.consentVersion}
              {t('text148')}
            </p>
          </details>
          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>{ui.consentSummary}</span>
          </label>
          <button className="button primary" disabled={!consent} onClick={() => setStage(1)}>
            {t('text149')}
          </button>
        </section>
      ) : stage < 4 ? (
        <section className="appearance panel">
          <div className="appearance-count">{String(stage).padStart(2, '0')} / 03</div>
          <h1>{stage === 1 ? t('text150') : stage === 2 ? t('text151') : t('text152')}</h1>
          {stage === 1 ? (
            <div className="option-grid universe-grid">
              {universes.map((u) => (
                <button
                  key={u.id}
                  aria-pressed={appearance.universe === u.id}
                  className={`option-card ${appearance.universe === u.id ? 'selected' : ''}`}
                  onClick={() =>
                    setAppearance({ ...appearance, universe: u.id as Appearance['universe'] })
                  }
                >
                  <h3>{u.title}</h3>
                </button>
              ))}
            </div>
          ) : stage === 2 ? (
            <div className="option-grid gender-grid">
              {[
                { id: 'male', title: t('text156') },
                { id: 'female', title: t('text157') },
                { id: 'neutral', title: t('text158') },
              ].map((g) => (
                <button
                  aria-pressed={appearance.gender === g.id}
                  className={`option-card ${appearance.gender === g.id ? 'selected' : ''}`}
                  key={g.id}
                  onClick={() =>
                    setAppearance({ ...appearance, gender: g.id as Appearance['gender'] })
                  }
                >
                  <h3>{g.title}</h3>
                </button>
              ))}
            </div>
          ) : (
            <div className="option-grid style-grid">
              {[
                { id: 'bright', title: t('text159'), colors: ['#f07b47', '#ffc64c', '#e7b7e9'] },
                { id: 'strict', title: t('text160'), colors: ['#3d485c', '#c5cedc', '#f0f1f6'] },
                { id: 'calm', title: t('text161'), colors: ['#60a39b', '#d5e9c9', '#f0e4d5'] },
                { id: 'tech', title: t('text162'), colors: ['#6376e8', '#8de3ef', '#303952'] },
              ].map((s) => (
                <button
                  aria-pressed={appearance.style === s.id}
                  className={`option-card ${appearance.style === s.id ? 'selected' : ''}`}
                  key={s.id}
                  onClick={() =>
                    setAppearance({ ...appearance, style: s.id as Appearance['style'] })
                  }
                >
                  <span className="swatches">
                    {s.colors.map((color) => (
                      <i key={color} style={{ background: color }} />
                    ))}
                  </span>
                  <h3>{s.title}</h3>
                </button>
              ))}
            </div>
          )}
          <div className="flow-buttons">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setStage(stage - 1)}
            >
              {t('text163')}
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() => (stage === 3 ? void start() : setStage(stage + 1))}
            >
              {stage === 3 ? t('text164') : t('text165')}
            </button>
          </div>
        </section>
      ) : tie ? (
        <section className="panel tie-panel">
          <h1>{t('text166')}</h1>
          <p>{t('text167')}</p>
          <label className="form-label">
            {t('text168')}
            <select
              aria-label={t('text169')}
              value={primary}
              onChange={(e) => {
                setPrimary(e.target.value as Scale);
                setSecondary('');
              }}
            >
              <option value="">{t('text170')}</option>
              {tieOptions!.primaryOptions.map((s) => (
                <option key={s} value={s}>
                  {c.scales[s].label} · {tie.percentages[s]}%
                </option>
              ))}
            </select>
          </label>
          <label className="form-label">
            {t('text171')}
            <select
              aria-label={t('text172')}
              disabled={!primary}
              value={secondary}
              onChange={(e) => setSecondary(e.target.value as Scale)}
            >
              <option value="">{t('text173')}</option>
              {tieOptions!.secondaryOptions.map((s) => (
                <option key={s} value={s}>
                  {c.scales[s].label} · {tie.percentages[s]}%
                </option>
              ))}
            </select>
          </label>
          <button
            className="button primary"
            disabled={!primary || !secondary || busy || offline}
            onClick={() => void submit()}
          >
            {t('text174')}
          </button>
        </section>
      ) : (
        <section className="question-panel panel">
          <div className="question-meta">
            <span>
              {t('text175')}
              {String(index + 1).padStart(2, '0')} / 15
            </span>
            <span className="sync-status" role="status">
              {syncStatus}
            </span>
          </div>
          <div className="question-progress">
            <span style={{ width: `${(count / 15) * 100}%` }} />
          </div>
          <div className="question-area">
            <h1 key={q.id}>{q.text}</h1>
          </div>
          <div className="likert" role="radiogroup" aria-label={t('text178')}>
            {[1, 2, 3, 4, 5, 6, 7].map((v) => (
              <button
                role="radio"
                aria-checked={answers[q.id] === v}
                aria-label={`${v} — ${v === 1 ? t('text179') : v === 7 ? t('text180') : v === 4 ? t('text181') : v < 4 ? t('text182') : t('text183')}`}
                key={v}
                className={`likert-point point-${v} ${answers[q.id] === v ? 'checked' : ''}`}
                onClick={() => answer(v)}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="likert-labels">
            <span>
              {t('text184')}
              <br />
              {t('text185')}
            </span>
            <span>{t('text186')}</span>
            <span>
              {t('text187')}
              <br />
              {t('text188')}
            </span>
          </div>
          <div className="flow-buttons">
            <button
              className="button secondary"
              disabled={index === 0 || busy}
              onClick={() => setIndex(index - 1)}
            >
              {t('text189')}
            </button>

            <button
              className="button primary"
              disabled={!answers[q.id] || busy || (index === 14 && offline)}
              onClick={() => (index === 14 ? void submit() : setIndex(index + 1))}
            >
              {busy ? t('text191') : index === 14 ? t('text192') : t('text193')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
