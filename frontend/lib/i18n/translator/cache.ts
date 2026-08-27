/**
 * localStorage-backed translation cache, one bucket per target language.
 * Survives reloads so previously seen strings render instantly.
 */

const CACHE_PREFIX = 'fcp-translations';

export type TranslationMap = Record<string, string>;

/** Hard cap per language to stay well within the ~5MB localStorage budget */
const MAX_ENTRIES_PER_LANG = 2000;

function storageKey(lang: string): string {
  return `${CACHE_PREFIX}:${lang}`;
}

function isBrowser(): boolean {
  return typeof window !== 'undefined' && typeof window.localStorage !== 'undefined';
}

/** Load all cached translations for a language. Returns {} on any failure. */
export function loadPersistedCache(lang: string): TranslationMap {
  if (!isBrowser()) return {};
  try {
    const raw = window.localStorage.getItem(storageKey(lang));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object') {
      return parsed as TranslationMap;
    }
  } catch {
    // Corrupted entry — drop it rather than crash
    try {
      window.localStorage.removeItem(storageKey(lang));
    } catch {
      /* ignore */
    }
  }
  return {};
}

/** Persist a whole cache bucket; silently degrades if quota is exhausted. */
export function persistCache(lang: string, store: TranslationMap): void {
  if (!isBrowser()) return;
  try {
    const keys = Object.keys(store);
    // Trim oldest-inserted entries when over budget
    const trimmed =
      keys.length > MAX_ENTRIES_PER_LANG
        ? keys.slice(keys.length - MAX_ENTRIES_PER_LANG)
        : keys;
    const out: TranslationMap = {};
    for (const k of trimmed) out[k] = store[k];
    window.localStorage.setItem(storageKey(lang), JSON.stringify(out));
  } catch {
    // QuotaExceededError etc. — cache is best-effort, never fatal
  }
}
