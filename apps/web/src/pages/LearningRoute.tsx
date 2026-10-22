import RankCard from '../RankCard';
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  Clock,
  GraduationCap,
  HardHat,
  Target,
  TrendingUp,
  UserRound,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { api } from '../api';
import { recText, recTitle, scaleLabel } from '../content';
import { t } from '../localization';
import type { Portrait } from '../shared';

const formatIcon = {
  practice: Target,
  mentor: UserRound,
  microcourse: BookOpen,
  checklist: ClipboardList,
};

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
      id: 'bilim',
      name: 'Bilim',
      icon: BookOpen,
      title: t('route.bilim'),
      detail: t('route.bilimDetail'),
    },
    {
      id: 'buildex',
      name: 'BuildEX',
      icon: HardHat,
      title: t('route.buildex'),
      detail: t('route.buildexDetail'),
    },
    {
      id: 'biu',
      name: 'BIU',
      icon: GraduationCap,
      title: t('route.biu'),
      detail: t('route.biuDetail'),
    },
    {
      id: 'kpi',
      name: 'KPI',
      icon: TrendingUp,
      title: t('route.kpi'),
      detail: t('route.kpiDetail'),
    },
  ];
  return (
    <div className="learning-route">
      <div className="page-title">
        <h1>{t('home.routeNav')}</h1>
      </div>
      <ol className="route-stages" aria-label={t('route.stages')}>
        {steps.map((s, i) => {
          const current = s.id === currentStage;
          const Icon = s.icon;
          return (
            <li
              key={s.id}
              className={`route-stage ${current ? 'current' : 'pending'}`}
              aria-current={current ? 'step' : undefined}
            >
              <span className="route-stage-node" aria-hidden="true">
                {String(i + 1).padStart(2, '0')}
              </span>
              <div className="route-stage-card">
                <div className="route-stage-top">
                  <span className="route-stage-icon" aria-hidden="true">
                    <Icon size={20} />
                  </span>
                  <span className="route-stage-platform">{s.name}</span>
                </div>
                <h2>{s.title}</h2>
                <p>{s.detail}</p>
                <span className="route-stage-state">
                  {current ? t('route.current') : t('route.planned')}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <RankCard portrait={p} tasks refresh={refresh} />
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
            <span className="route-focus">
              <Target size={14} aria-hidden="true" />
              {scaleLabel(p.scales, p.result.weakest)}
            </span>
          </div>
          <div className="route-recommendations">
            {p.result.recommendations.slice(recPage * 4, recPage * 4 + 4).map((rec) => {
              const Icon = formatIcon[rec.format];
              return (
                <article key={rec.id} className={`route-rec panel route-rec-${rec.format}`}>
                  <div className="route-rec-top">
                    <span className="recommendation-icon" aria-hidden="true">
                      <Icon size={19} />
                    </span>
                    <span className="route-rec-meta">
                      <span>
                        {
                          {
                            practice: t('text093'),
                            mentor: t('text094'),
                            microcourse: t('text095'),
                            checklist: t('text096'),
                          }[rec.format]
                        }
                      </span>
                      <span>{scaleLabel(p.scales, rec.scale)}</span>
                    </span>
                  </div>
                  <h3>{recTitle(rec)}</h3>
                  <details className="explanation">
                    <summary>{t('details')}</summary>
                    <p>{recText(rec)}</p>
                  </details>
                  <div className="route-rec-bottom">
                    <span className="route-rec-duration">
                      <Clock size={15} aria-hidden="true" />
                      {rec.durationDays}
                      {t('text097')}
                    </span>
                    <button className="button secondary" onClick={() => void open(rec.link)}>
                      {t('text098')}
                      <ArrowRight size={15} aria-hidden="true" />
                    </button>
                  </div>
                </article>
              );
            })}
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
            <X size={18} />
          </button>
        </div>
      )}
    </div>
  );
}
