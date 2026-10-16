import { Brain, ChevronRight, MessageCircle, ShieldCheck, Users } from 'lucide-react';
import ui from '../../../config/ui.ru.json';
import {
  buildAvatar,
  type Result,
  type Scores,
  type TestConfig,
} from '../../../packages/core/src/index';
import type { Session, User } from '../../api/src/store';
import { t } from './localization';
export { ui };
export const icons = {
  critical: Brain,
  confidence: MessageCircle,
  discipline: ShieldCheck,
  engagement: Users,
};
export const levelLabels = { low: t('text036'), medium: t('text037'), high: t('text038') };
export type Portrait = {
  user: User;
  result: Result | null;
  completedAt?: string;
  sessionId?: string;
  avatar: AvatarView | null;
  history: {
    at: string;
    percentages: Scores;
    testVersion: string;
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
  answers: Record<string, number>;
  index: number;
};
export const date = (value: string) =>
  new Date(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
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
    <div className="disclaimer">
      <ShieldCheck size={19} />
      <div>
        <strong>{ui.disclaimer}</strong>
        <p>{ui.methodology}</p>
      </div>
    </div>
  );
}
export function Route() {
  return (
    <div className="route">
      <span className="current">Bilim</span>
      <ChevronRight size={14} />
      <span>BuildEX</span>
      <ChevronRight size={14} />
      <span>BIU</span>
      <ChevronRight size={14} />
      <span>KPI</span>
    </div>
  );
}
