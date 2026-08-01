// Language preference. Persisted in localStorage. Changing it requires a reload
// because the dictionary is bundled at module init time.

export type LangCode = 'en' | 'sw';

const KEY = 'risip.lang';
const DEFAULT: LangCode = 'en';

export function getLang(): LangCode {
  if (typeof window === 'undefined') return DEFAULT;
  const v = window.localStorage.getItem(KEY);
  return v === 'sw' || v === 'en' ? v : DEFAULT;
}

export function setLang(code: LangCode) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(KEY, code);
}

export const LANG_OPTIONS: { code: LangCode; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'sw', label: 'Kiswahili' },
];
