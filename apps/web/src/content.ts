import seed from '../../../config/test.ru.json';
import en from '../../../config/test.en.json';
import kk from '../../../config/test.kk.json';
import type { Level, Result, Scale, TestConfig } from '../../../packages/core/src/index';
import { getLanguage, hasKey, locale, t } from './localization';
type ContentTranslation = {
  scales: Record<Scale, { label: string; short: string; interpretations: Record<Level, string> }>;
  questions: Record<string, string>;
  recommendations: Record<string, { title: string; text: string }>;
};
const translations: Record<'en' | 'kk', ContentTranslation> = { en, kk };
const seedScales = seed.scales as ContentTranslation['scales'];
const seedQuestions = new Map(seed.questions.map((q) => [q.id, q.text]));
const seedRecommendations = new Map(seed.recommendations.map((r) => [r.id, r]));
const translation = () => {
  const language = getLanguage();
  return language === 'ru' ? undefined : translations[language];
};
/**
 * Methodology texts are edited in Russian. A translation is shown only while the server text still
 * matches the bundled original, so an edited question never shows an outdated translation.
 */
const localized = (text: string, original?: string, translated?: string) =>
  translated && text === original ? translated : text;
export const scaleLabel = (scales: TestConfig['scales'], s: Scale) =>
  localized(scales[s].label, seedScales[s].label, translation()?.scales[s].label);
export const scaleShort = (scales: TestConfig['scales'], s: Scale) =>
  localized(scales[s].short, seedScales[s].short, translation()?.scales[s].short);
export const interpretation = (scales: TestConfig['scales'], s: Scale, level: Level) =>
  localized(
    scales[s].interpretations[level],
    seedScales[s].interpretations[level],
    translation()?.scales[s].interpretations[level],
  );
export const questionText = (q: { id: string; text: string }) =>
  localized(q.text, seedQuestions.get(q.id), translation()?.questions[q.id]);
export const recTitle = (r: { id: string; title: string }) =>
  localized(
    r.title,
    seedRecommendations.get(r.id)?.title,
    translation()?.recommendations[r.id]?.title,
  );
export const recText = (r: { id: string; text: string }) =>
  localized(
    r.text,
    seedRecommendations.get(r.id)?.text,
    translation()?.recommendations[r.id]?.text,
  );
/** The server writes this hint in Russian; other languages rebuild it from the strongest scale. */
export function strongUse(result: Result, scales: TestConfig['scales']) {
  if (!result.strongUse || getLanguage() === 'ru') return result.strongUse;
  return t('content.strongUse', {
    quality: scaleLabel(scales, result.strong[0]).toLocaleLowerCase(locale()),
  });
}
export function rankName(rank: { id: string; name: string }) {
  const key = `rank.name.${rank.id}`;
  return getLanguage() !== 'ru' && hasKey(key) ? t(key) : rank.name;
}
export function avatarName(avatar: {
  name: string;
  config?: { universe?: string; archetype?: string };
}) {
  const { universe, archetype } = avatar.config ?? {};
  const base =
    universe === 'animals' ? `avatar.animal.${archetype}` : `avatar.universe.${universe}`;
  const role = `avatar.role.${archetype}`;
  if (getLanguage() === 'ru' || !hasKey(base) || !hasKey(role)) return avatar.name;
  return t('avatar.name', { base: t(base), role: t(role) });
}
