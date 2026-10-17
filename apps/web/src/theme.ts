import { useSyncExternalStore } from 'react';
export type Theme = 'light' | 'dark';
/** Shared with public/theme.js, which applies the same choice before the first paint. */
const storageKey = 'bilim-theme';
const listeners = new Set<() => void>();
const media =
  typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : undefined;
// An explicit choice wins; without one the page follows the OS setting, live.
let saved: Theme | null = null;
try {
  const value = localStorage.getItem(storageKey);
  if (value === 'light' || value === 'dark') saved = value;
} catch {}
export const getTheme = (): Theme => saved ?? (media?.matches ? 'dark' : 'light');
const syncDocument = () => {
  if (typeof document === 'undefined') return;
  const theme = getTheme();
  document.documentElement.dataset.theme = theme;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', theme === 'dark' ? '#171c28' : '#304fe5');
};
syncDocument();
const notify = () => {
  syncDocument();
  listeners.forEach((listener) => listener());
};
media?.addEventListener('change', () => {
  if (!saved) notify();
});
const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => void listeners.delete(listener);
};
export function setTheme(next: Theme) {
  saved = next;
  try {
    localStorage.setItem(storageKey, next);
  } catch {}
  notify();
}
export const useTheme = () => useSyncExternalStore(subscribe, getTheme);
