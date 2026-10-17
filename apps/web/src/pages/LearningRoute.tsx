import RankCard from '../RankCard';
import { useState } from 'react';
import { api } from '../api';
import { recText, recTitle, scaleLabel } from '../content';
import { t } from '../localization';
import { Disclaimer, type Portrait } from '../shared';

export default function LearningRoute({
  portrait: p,
  onStart,
  refresh,
}: {
  portrait: Portrait;
  onStart: () => void;
  refresh: () => Promise<void>;
}) {
  const [notice, setNotice] = useState('');
  const [recPage, setRecPage] = useState(0);
  const currentStage = p.result?.nextStep.link.split('/')[1];
  async function open(link: string) {
    try {
      const data = await api(`/learning/link?path=${encodeURIComponent(link)}`);
      if (data.url) window.location.assign(data.url);
      else setNotice(t('text039'));
    } catch (e) {
      setNotice((e as Error).message);
    }
  }
  const steps = [
    {
      name: 'Bilim',
      title: t('route.bilim'),
      detail: t('route.bilimDetail'),
      status: currentStage === 'bilim' ? 'current' : 'pending',
    },
    {
      name: 'BuildEX',
      title: t('route.buildex'),
      detail: t('route.buildexDetail'),
      status: currentStage === 'buildex' ? 'current' : 'pending',
    },
    {
      name: 'BIU',
      title: t('route.biu'),
      detail: t('route.biuDetail'),
      status: currentStage === 'biu' ? 'current' : 'pending',
    },
    { name: 'KPI', title: t('route.kpi'), detail: t('route.kpiDetail'), status: 'pending' },
  ];
  return (
    <div className="learning-route">
      <div className="page-title">
        <h1>{t('home.routeNav')}</h1>
      </div>
      <RankCard portrait={p} tasks refresh={refresh} />
      <div className="route-stages">
        {steps.map((s, i) => (
          <article key={s.name} className={`route-stage ${s.status}`}>
            <div className="route-stage-top">
              <span>{String(i + 1).padStart(2, '0')}</span>
              <span>{s.name}</span>
            </div>
            <h2>{s.title}</h2>
            <p>{s.detail}</p>
            <span className="route-stage-state">
              {s.status === 'current' ? t('route.current') : t('route.planned')}
            </span>
          </article>
        ))}
      </div>
      {!p.result ? (
        <section className="route-empty panel">
          <h2>{t('route.needProfile')}</h2>
          <button className="button primary" onClick={onStart}>
            {t('text050')}
          </button>
        </section>
      ) : (
        <>
          <div className="section-heading">
            <h2>{t('text091')}</h2>
            <span>{scaleLabel(p.scales, p.result.weakest)}</span>
          </div>
          <div className="route-recommendations">
            {p.result.recommendations.slice(recPage * 4, recPage * 4 + 4).map((rec) => (
              <article key={rec.id} className="route-rec panel">
                <span>{scaleLabel(p.scales, rec.scale)}</span>
                <h3>{recTitle(rec)}</h3>
                <details className="explanation">
                  <summary>{t('details')}</summary>
                  <p>{recText(rec)}</p>
                </details>
                <div className="route-rec-bottom">
                  <span>
                    {rec.durationDays}
                    {t('text097')}
                  </span>
                  <button className="button secondary" onClick={() => void open(rec.link)}>
                    {t('text098')}
                  </button>
                </div>
              </article>
            ))}
          </div>
          {p.result.recommendations.length > 4 && (
            <div className="pagination">
              <button
                aria-label={t('text099')}
                disabled={recPage === 0}
                onClick={() => setRecPage(recPage - 1)}
              >
                {t('text163')}
              </button>
              <span>
                {recPage + 1} / {Math.ceil(p.result.recommendations.length / 4)}
              </span>
              <button
                aria-label={t('text100')}
                disabled={(recPage + 1) * 4 >= p.result.recommendations.length}
                onClick={() => setRecPage(recPage + 1)}
              >
                {t('text193')}
              </button>
            </div>
          )}
        </>
      )}
      {notice && (
        <div className="alert" role="status">
          {notice}
          <button onClick={() => setNotice('')} aria-label={t('text101')}>
            ×
          </button>
        </div>
      )}
      <Disclaimer />
    </div>
  );
}
