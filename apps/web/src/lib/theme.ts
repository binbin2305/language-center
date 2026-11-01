import { useSyncExternalStore } from 'react';

/** R15 / DESIGN section 1: default follows prefers-color-scheme live; the user may force light or dark. */
export type ThemePreference = 'system' | 'light' | 'dark';
export const THEME_STORAGE_KEY = 'lc-theme';

const QUERY = '(prefers-color-scheme: dark)';
const listeners = new Set<() => void>();
let preference: ThemePreference = 'system';

function readStored(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const osDark = () => typeof window.matchMedia === 'function' && window.matchMedia(QUERY).matches;

function apply() {
  const dark = preference === 'dark' || (preference === 'system' && osDark());
  document.documentElement.classList.toggle('dark', dark);
}

export const getThemePreference = () => preference;

export function setThemePreference(next: ThemePreference) {
  preference = next;
  try {
    if (next === 'system') localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    /* storage unavailable: the choice still applies for this page */
  }
  apply();
  listeners.forEach((l) => l());
}

/** Reads the stored choice, applies it and follows the OS while on "system". Returns a disposer. */
export function initTheme(): () => void {
  preference = readStored();
  apply();
  if (typeof window.matchMedia !== 'function') return () => undefined;
  const mq = window.matchMedia(QUERY);
  const onChange = () => apply();
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => preference,
  );
}
