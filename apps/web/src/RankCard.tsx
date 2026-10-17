import { useState } from 'react';
import { api } from './api';
import { rankName, recText, recTitle } from './content';
import { t } from './localization';
import type { Portrait } from './shared';

export default function RankCard({
  portrait: p,
  tasks = false,
  review = false,
  refresh,
}: {
  portrait: Portrait;
  tasks?: boolean;
  review?: boolean;
  refresh?: () => Promise<void>;
}) {
  const { rank, records } = p.development;
  const [active, setActive] = useState('');
  const [evidence, setEvidence] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function act(url: string, body: unknown) {
    setBusy(true);
    setError('');
    try {
      await api(url, 'POST', body);
      await refresh?.();
      setActive('');
      setEvidence('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rank-card panel" aria-label={t('rank.label')}>
      <div className="rank-heading">
        <div>
          <span className="card-category">{t('rank.label')}</span>
          <h2>{rankName(rank.current)}</h2>
        </div>
        <span className="rank-count">{t('rank.completed', { count: rank.completed })}</span>
      </div>
      <ol className="rank-ladder" aria-label={t('rank.levels')}>
        {rank.ranks.map((r) => (
          <li
            key={r.id}
            className={rank.points >= r.points ? 'reached' : ''}
            aria-current={rank.current.id === r.id ? 'step' : undefined}
          >
            {rankName(r)}
          </li>
        ))}
      </ol>
      {rank.next ? (
        <>
          <div className="rank-progress-label">
            <span>{t('rank.next', { name: rankName(rank.next) })}</span>
            <span>
              {p.result ? rank.completed : 0} / {p.result ? rank.next.points - 1 : 1}
            </span>
          </div>
          <progress
            aria-label={t('rank.next', { name: rankName(rank.next) })}
            value={rank.progress}
            max={100}
          />
          <p className="rank-hint">
            {p.result ? t('rank.remaining', { count: rank.remaining }) : t('rank.first')}
          </p>
        </>
      ) : (
        <p className="rank-hint">{t('rank.top')}</p>
      )}
      <details className="explanation rank-rules">
        <summary>{t('rank.rules')}</summary>
        <p>{t('rank.explanation')}</p>
      </details>
      {tasks && p.result && (
        <details className="rank-tasks">
          <summary>{t('rank.tasks')}</summary>
          <div className="rank-task-list">
            {p.development.tasks.map((task) => {
              const record = records.find((r) => r.recommendationId === task.id);
              return (
                <article key={task.id} className="rank-task">
                  <div className="rank-task-heading">
                    <h3>{recTitle(task)}</h3>
                    {record && (
                      <span className={`rank-status ${record.status}`}>
                        {t(`rank.${record.status}`)}
                      </span>
                    )}
                  </div>
                  <details className="explanation">
                    <summary>{t('details')}</summary>
                    <p>{recText(task)}</p>
                    <p>
                      {task.durationDays}
                      {t('text097')}
                    </p>
                  </details>
                  {(!record || record.status === 'returned') &&
                    (active === task.id ? (
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          void act('/development/submit', { recommendationId: task.id, evidence });
                        }}
                      >
                        <label>
                          {t('rank.evidence')}
                          <textarea
                            required
                            minLength={10}
                            maxLength={1000}
                            value={evidence}
                            onChange={(e) => setEvidence(e.target.value)}
                          />
                        </label>
                        <div className="rank-actions">
                          <button
                            className="button primary"
                            disabled={busy || evidence.trim().length < 10}
                          >
                            {t('rank.send')}
                          </button>
                          <button
                            className="text-button"
                            type="button"
                            disabled={busy}
                            onClick={() => setActive('')}
                          >
                            {t('rank.cancel')}
                          </button>
                        </div>
                      </form>
                    ) : (
                      <button
                        className="text-button"
                        disabled={busy}
                        onClick={() => {
                          setActive(task.id);
                          setEvidence(record?.evidence ?? '');
                        }}
                      >
                        {t('rank.done')}
                      </button>
                    ))}
                </article>
              );
            })}
          </div>
        </details>
      )}
      {review && (
        <div className="rank-review">
          {records
            .filter((r) => r.status === 'pending')
            .map((record) => (
              <article className="rank-task" key={record.id}>
                <span className="card-category">{t('rank.pending')}</span>
                <h3>{recTitle({ id: record.recommendationId, title: record.title })}</h3>
                <p className="rank-evidence">{record.evidence}</p>
                <div className="rank-actions">
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() =>
                      void act(`/development/${record.id}/review`, { decision: 'approved' })
                    }
                  >
                    {t('rank.approve')}
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void act(`/development/${record.id}/review`, { decision: 'returned' })
                    }
                  >
                    {t('rank.return')}
                  </button>
                </div>
              </article>
            ))}
        </div>
      )}
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
