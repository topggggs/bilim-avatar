import { useState } from 'react';
import { scaleIds } from '../../../../packages/core/src/index';
import { avatarName, rankName, recTitle, scaleLabel } from '../content';
import { t } from '../localization';
import { date, type Portrait } from '../shared';

export default function Home({
  portrait: p,
  hasDraft,
  onNavigate,
  onStart,
}: {
  portrait: Portrait;
  hasDraft: boolean;
  onNavigate: (page: string) => void;
  onStart: () => void;
}) {
  const [slide, setSlide] = useState(0);
  const slides = [
    {
      title: t('home.heroOne'),
      label: t('home.heroOneAction'),
      action: () => (hasDraft || !p.result ? onStart() : onNavigate('route')),
    },
    {
      title: t('home.heroTwo'),
      label: t('home.heroTwoAction'),
      action: () => onNavigate('profile'),
    },
    {
      title: t('home.heroThree'),
      label: t('home.heroThreeAction'),
      action: () => onNavigate('route'),
    },
  ];
  const current = slides[slide];
  const canStart = !p.nextAllowedAt || Date.parse(p.nextAllowedAt) <= Date.now();
  const startLabel = hasDraft
    ? t('text049')
    : p.result
      ? canStart
        ? t('text112')
        : t('home.viewProfile')
      : t('text050');
  const start = () => (hasDraft || !p.result || canStart ? onStart() : onNavigate('profile'));
  return (
    <div className="home-page">
      <div className="home-hero-grid">
        <section className="home-hero" aria-label={t('home.heroLabel')}>
          <div className="home-hero-content">
            <h1>{current.title}</h1>
            <button className="button hero-cta" onClick={current.action}>
              {current.label}
            </button>
          </div>
          <div className="hero-controls">
            <div className="hero-dots">
              {slides.map((s, i) => (
                <button
                  key={s.title}
                  onClick={() => setSlide(i)}
                  aria-label={t('home.slide', { number: i + 1 })}
                  aria-pressed={slide === i}
                >
                  <span />
                </button>
              ))}
            </div>
            <div className="hero-arrows">
              <button
                aria-label={t('home.previous')}
                onClick={() => setSlide((slide + slides.length - 1) % slides.length)}
              >
                ‹
              </button>
              <button
                aria-label={t('home.next')}
                onClick={() => setSlide((slide + 1) % slides.length)}
              >
                ›
              </button>
            </div>
          </div>
        </section>
        <div className="home-side-cards">
          <section className="home-action-card blue">
            <span className="card-category">
              {t('home.profileLabel')} · {rankName(p.development.rank.current)}
            </span>
            <h2>
              {p.result
                ? p.avatar
                  ? avatarName(p.avatar)
                  : t('home.profileReady')
                : t('home.profileCreate')}
            </h2>
            <p>{p.result ? `${t('home.updated')} ${date(p.completedAt!)}` : t('home.testMeta')}</p>
            <button className="button" onClick={start}>
              {startLabel}
            </button>
          </section>
          <section className="home-action-card">
            <span className="card-category">{t('home.nextStep')}</span>
            <h2>{p.result ? recTitle(p.result.nextStep) : t('home.routeTitle')}</h2>
            <button className="button primary" onClick={() => onNavigate('route')}>
              {t('home.routeOpen')}
            </button>
          </section>
        </div>
      </div>
      <div className="home-shortcuts">
        <button onClick={onStart} disabled={!!p.result && !canStart && !hasDraft}>
          <span>{t('home.test')}</span>
          <span>{hasDraft ? t('home.continue') : t('home.questions')}</span>
        </button>
        <button onClick={() => onNavigate('profile')}>
          <span>{t('home.profileLabel')}</span>
          <span>{t('home.qualities')}</span>
        </button>
        <button onClick={() => onNavigate('route')}>
          <span>{t('home.routeNav')}</span>
          <span>Bilim → BuildEX → BIU</span>
        </button>
      </div>
      <section className="home-overview">
        <div className="section-heading">
          <h2>{t('home.yourProfile')}</h2>
          <button className="text-button" onClick={() => onNavigate('profile')}>
            {t('home.viewProfile')}
          </button>
        </div>
        <div className="home-quality-grid">
          {scaleIds.map((s) => (
            <article className="home-quality-card" key={s}>
              <span>{scaleLabel(p.scales, s)}</span>
              <strong>{p.result ? `${p.result.percentages[s]}%` : '—'}</strong>
              <div className="home-quality-track">
                <span style={{ width: `${p.result?.percentages[s] ?? 0}%` }} />
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
