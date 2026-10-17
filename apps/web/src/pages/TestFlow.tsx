import { useEffect, useRef, useState } from 'react';
import {
  choices,
  type Appearance,
  type Scale,
  type Scores,
  type TestConfig,
} from '../../../../packages/core/src/index';
import { MIN_ANSWER_LENGTH, MAX_ANSWER_LENGTH } from '../../../../packages/core/src/written';
import type { Session, User } from '../../../api/src/store';
import { api, HttpError } from '../api';
import { questionText, scaleLabel } from '../content';
import { t, type Key } from '../localization';
import { ui, type Draft } from '../shared';
const universes: { id: Appearance['universe']; title: Key }[] = [
  { id: 'cinema', title: 'text119' },
  { id: 'anime', title: 'text121' },
  { id: 'animals', title: 'text123' },
  { id: 'sport', title: 'text125' },
  { id: 'fantasy', title: 'text127' },
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
    [analysisProvider, setAnalysisProvider] = useState<'gemini' | 'openai' | ''>(''),
    [analysisProviderName, setAnalysisProviderName] = useState(''),
    [analysisAvailable, setAnalysisAvailable] = useState<boolean | null>(null),
    [syncStatus, setSyncStatus] = useState<Key>('text129'),
    [tie, setTie] = useState<{
      percentages: Scores;
    } | null>(null),
    [primary, setPrimary] = useState<Scale | ''>(''),
    [secondary, setSecondary] = useState<Scale | ''>('');
  const saveChain = useRef<Promise<unknown>>(Promise.resolve()),
    revision = useRef(0),
    answersRef = useRef(draft?.answers ?? {});
  const q = c.questions[index];
  const written = c.responseFormat === 'written';
  const active = useRef(true);
  const consentText = (text: string) => text.replace('{{provider}}', analysisProviderName || '…');
  const needsProviderConsent =
    written &&
    session &&
    analysisProvider &&
    !session.analysis?.report &&
    session.analysisProvider !== analysisProvider;
  async function confirmAnalysisConsent() {
    if (!session || !analysisProvider) return;
    setBusy(true);
    setError('');
    try {
      const updated = await api<Session>(`/test/sessions/${session.id}/analysis-consent`, 'PUT', {
        consent: true,
        provider: analysisProvider,
      });
      setSession(updated);
      setConsent(false);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    active.current = true;
    void api('/test/analysis-status')
      .then((data) => {
        if (active.current) {
          setAnalysisAvailable(data.available);
          setAnalysisProvider(data.provider);
          setAnalysisProviderName(data.providerLabel);
        }
      })
      .catch(() => {
        if (active.current) setError(t('api.offline'));
      });
    return () => {
      active.current = false;
    };
  }, []);
  useEffect(() => {
    if (draft?.session.analysis?.status === 'running') void submit(true);
  }, []);
  function sync(snapshot: Record<string, string | number>, id: string) {
    const rev = ++revision.current;
    setSyncStatus('text130');
    saveChain.current = saveChain.current
      .catch(() => {})
      .then(() => api(`/test/sessions/${id}/answers`, 'PUT', { answers: snapshot }))
      .then(() => {
        if (rev === revision.current) setSyncStatus('text131');
      })
      .catch(() => {
        if (rev === revision.current) setSyncStatus('text132');
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
    if (!session || session.analysis?.status === 'running') return;
    if (offline) {
      setSyncStatus('text134');
      return;
    }
    const timer = setTimeout(() => void sync(answers, session.id), 600);
    return () => clearTimeout(timer);
  }, [offline, session?.id, answers]);
  function answer(value: string | number) {
    const next = { ...answersRef.current, [q.id]: value };
    answersRef.current = next;
    setAnswers(next);
    setError('');
    setSyncStatus(offline ? 'text134' : 'text130');
  }
  async function start() {
    setBusy(true);
    setError('');
    try {
      const s = await api<Session>('/test/sessions', 'POST', {
        appearance,
        consent: true,
        ...(written ? { analysisProvider } : {}),
      });
      setSession(s);
      answersRef.current = s.answers;
      setAnswers(s.answers);
      setStage(4);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function submit(resuming = false) {
    if (!session) return;
    setBusy(true);
    setError('');
    try {
      await saveChain.current;
      const latestAnswers = answersRef.current;
      if (!resuming)
        await api(`/test/sessions/${session.id}/answers`, 'PUT', { answers: latestAnswers });
      const deadline = Date.now() + 120000;
      let first = true;
      while (active.current) {
        const result = await api(`/test/sessions/${session.id}/submit`, 'POST', {
          ...(primary ? { primary } : {}),
          ...(secondary ? { secondary } : {}),
          ...(first ? { retryAnalysis: true } : {}),
        });
        first = false;
        if (result.status !== 'analyzing') {
          onDone();
          break;
        }
        if (Date.now() > deadline) throw new Error(t('written.timeout'));
        await new Promise((resolve) => setTimeout(resolve, 1800));
      }
    } catch (e) {
      if (e instanceof HttpError && e.data.code === 'ANALYSIS_CONSENT_REQUIRED') {
        try {
          const [status, current] = await Promise.all([
            api('/test/analysis-status'),
            api<Session>('/test/sessions/current'),
          ]);
          setAnalysisProvider(status.provider);
          setAnalysisProviderName(status.providerLabel);
          setAnalysisAvailable(status.available);
          setSession(current);
          setConsent(false);
        } catch (error) {
          setError((error as Error).message);
        }
      } else if (e instanceof HttpError && e.data.code === 'AVATAR_CHOICE_REQUIRED') {
        const scores = e.data.percentages as Scores;
        setTie({ percentages: scores });
        const options = choices(scores);
        setPrimary(options.primaryOptions.length === 1 ? options.primaryOptions[0] : '');
        setSecondary('');
      } else {
        setError(e instanceof Error ? e.message : t('text135'));
        if (e instanceof HttpError && e.data.questionIds?.length) {
          setIndex(
            Math.max(
              0,
              c.questions.findIndex((q) => q.id === e.data.questionIds[0]),
            ),
          );
          setError(`${e.message}: ${e.data.questionIds.join(', ')}`);
        }
      }
    } finally {
      setBusy(false);
    }
  }
  const tieOptions = tie ? choices(tie.percentages, primary || undefined) : null;
  return (
    <div className="flow" aria-busy={busy}>
      <div className="flow-top">
        <button className="text-button" disabled={busy} onClick={onExit}>
          {t('text136')}
        </button>
        <span className="flow-progress-text">
          {busy && written ? t('written.analyzing') : stage < 4 ? t('text138') : t('text139')}
        </span>
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
            <p>{ui().methodology}</p>
            <p>{consentText(ui().consent)}</p>
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
            <span>{consentText(ui().consentSummary)}</span>
          </label>
          <button
            className="button primary"
            disabled={!consent || (written && !analysisProvider)}
            onClick={() => setStage(1)}
          >
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
                  <h3>{t(u.title)}</h3>
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
      ) : needsProviderConsent ? (
        <section className="onboarding panel">
          <h1>{t('written.consentTitle')}</h1>
          <p>{consentText(ui().consent)}</p>
          <label className="consent">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
            />
            <span>{consentText(ui().consentSummary)}</span>
          </label>
          <button
            className="button primary"
            disabled={!consent || busy}
            onClick={() => void confirmAnalysisConsent()}
          >
            {t('text165')}
          </button>
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
                  {scaleLabel(c.scales, s)} · {tie.percentages[s]}%
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
                  {scaleLabel(c.scales, s)} · {tie.percentages[s]}%
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
              {t(syncStatus)}
            </span>
          </div>
          <div className="question-progress">
            <span style={{ width: `${((index + 1) / c.questions.length) * 100}%` }} />
          </div>
          <div className="question-area">
            <h1 key={q.id}>{questionText(q)}</h1>
          </div>
          {written ? (
            <div className="written-answer">
              <label htmlFor="written-answer">{t('written.label')}</label>
              <textarea
                id="written-answer"
                key={q.id}
                value={typeof answers[q.id] === 'string' ? String(answers[q.id]) : ''}
                onChange={(e) => answer(e.target.value)}
                placeholder={t('written.placeholder')}
                maxLength={MAX_ANSWER_LENGTH}
                rows={7}
                disabled={busy}
                aria-describedby="answer-hint answer-length"
              />
              <div className="written-answer-meta">
                <span id="answer-hint">{t('written.hint')}</span>
                <span id="answer-length">
                  {String(answers[q.id] ?? '').length} / {MAX_ANSWER_LENGTH}
                </span>
              </div>
              {analysisAvailable === false && <p className="muted">{t('written.unavailable')}</p>}
            </div>
          ) : (
            <>
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
            </>
          )}
          {busy && written && (
            <p className="analysis-progress" role="status">
              {t('written.analyzing')}
            </p>
          )}
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
              disabled={
                (written
                  ? String(answers[q.id] ?? '').trim().length < MIN_ANSWER_LENGTH
                  : !answers[q.id]) ||
                busy ||
                (index === 14 && offline)
              }
              onClick={() => (index === 14 ? void submit() : setIndex(index + 1))}
            >
              {busy
                ? written
                  ? t('written.analyzing')
                  : t('text191')
                : index === 14
                  ? written
                    ? t('written.submit')
                    : t('text192')
                  : t('text193')}
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
