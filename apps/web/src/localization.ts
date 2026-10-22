import { useSyncExternalStore } from 'react';
import ru from '../../../config/interface.ru.json';
import en from '../../../config/interface.en.json';
import kk from '../../../config/interface.kk.json';
export type Key = keyof typeof ru;
export const languages = [
  { id: 'ru', code: 'RU', name: 'Русский', locale: 'ru-RU' },
  { id: 'en', code: 'EN', name: 'English', locale: 'en-GB' },
  { id: 'kk', code: 'KZ', name: 'Қазақша', locale: 'kk-KZ' },
] as const;
export type Language = (typeof languages)[number]['id'];

const dictionaries: Record<Language, Record<Key, string>> = { ru, en, kk };
const storageKey = 'bilim-language';
const listeners = new Set<() => void>();
let current: Language = 'ru';
try {
  const saved = localStorage.getItem(storageKey);
  if (languages.some((l) => l.id === saved)) current = saved as Language;
} catch {}
const syncDocument = () => {
  if (typeof document !== 'undefined') document.documentElement.lang = current;
};
syncDocument();
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
export const getLanguage = () => current;
export function setLanguage(next: Language) {
  if (next === current) return;
  current = next;
  try {
    localStorage.setItem(storageKey, next);
  } catch {}
  syncDocument();
  listeners.forEach((listener) => listener());
}

export const useLanguage = () => useSyncExternalStore(subscribe, getLanguage);
export const locale = () => languages.find((l) => l.id === current)!.locale;
export function t(key: Key, values: Record<string, unknown> = {}): string {
  return (dictionaries[current][key] ?? dictionaries.ru[key] ?? key).replace(
    /\{\{(\w+)\}\}/g,
    (_match, name: string) => String(values[name] ?? ''),
  );
}
export const hasKey = (key: string): key is Key => key in dictionaries.ru;
const serverKeys = new Map(
  Object.entries(ru)
    .filter(([key]) => key.startsWith('server.'))
    .map(([key, text]) => [text, key as Key]),
);
export function translateServer(message: string) {
  const key = serverKeys.get(message);
  return key ? t(key) : message;
}
