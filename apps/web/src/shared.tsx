import uiRu from '../../../config/ui.ru.json';
import uiEn from '../../../config/ui.en.json';
import uiKk from '../../../config/ui.kk.json';
import {
  buildAvatar,
  type Level,
  type Result,
  type Scale,
  type Scores,
  type TestConfig,
} from '../../../packages/core/src/index';
import type { DevelopmentRank } from '../../../packages/core/src/ranks';
import type { DevelopmentRecord, Session, User } from '../../api/src/store';
import { getLanguage, locale, t } from './localization';
const uiTexts: Record<string, typeof uiRu> = { ru: uiRu, en: uiEn, kk: uiKk };
export const ui = () => uiTexts[getLanguage()];
export const levelLabel = (level: Level) =>
  t(level === 'low' ? 'text036' : level === 'medium' ? 'text037' : 'text038');
/** Visual lockup only; the surrounding link carries the accessible name "BI Group". */
export function Brand() {
  return (
    <span className="brand-lockup" aria-hidden="true">
      <span className="brand-mark">BI</span>
      <span className="brand-word">GROUP</span>
    </span>
  );
}
export type Portrait = {
  development: {
    rank: DevelopmentRank;
    records: DevelopmentRecord[];
    tasks: { id: string; title: string; text: string; durationDays: number }[];
  };
  user: User;
  result: Result | null;
  writtenReview?: {
    summary?: string;
    scales?: { scale: Scale; explanation: string }[];
    model?: string;
    rubricVersion?: string;
    items: { id: string; text: string; answer: string }[];
  };
  answerStatistics?: {
    average: number;
    count: number;
    distribution: { value: number; count: number }[];
    items: { id: string; text: string; scales: Scale[]; answer: number }[];
  } | null;
  completedAt?: string;
  sessionId?: string;
  avatar: AvatarView | null;
  history: {
    at: string;
    percentages: Scores;
    testVersion: string;
    responseFormat: 'written' | 'likert';
  }[];
  nextAllowedAt: string | null;
  scales: TestConfig['scales'];
  retakeDays: number;
};
export type AvatarView = {
  id: string;
  name: string;
  status: string;
  imageUrl: string;
  fixed: boolean;
  config: any;
};
export type Draft = {
  session: Session;
  answers: Record<string, string | number>;
  index: number;
};
// Chromium's Intl has no Kazakh month names (it prints "2026 M10 16"), so kk is formatted by hand.
const kazakhMonths = [
  'қаңтар',
  'ақпан',
  'наурыз',
  'сәуір',
  'мамыр',
  'маусым',
  'шілде',
  'тамыз',
  'қыркүйек',
  'қазан',
  'қараша',
  'желтоқсан',
];
export function date(value: string) {
  const d = new Date(value);
  return getLanguage() === 'kk'
    ? `${d.getDate()} ${kazakhMonths[d.getMonth()]} ${d.getFullYear()} ж.`
    : d.toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
}
const example = {
  universe: 'animals',
  gender: 'neutral',
  style: 'tech',
  archetype: 'strategist',
  accessory: 'confidence',
  boosted: true,
} as const;
export const placeholder = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildAvatar(example).fallbackSvg)}`;
export function readDraft(id: string): Draft | null {
  try {
    return JSON.parse(localStorage.getItem(`bilim-draft-${id}`) ?? 'null');
  } catch {
    return null;
  }
}
export function Disclaimer() {
  return (
    <details className="disclaimer">
      <summary>{ui().disclaimer}</summary>
      <p>{ui().methodology}</p>
    </details>
  );
}
