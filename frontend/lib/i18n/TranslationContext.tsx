'use client';

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  DEFAULT_LANGUAGE,
  getLanguageByCode,
  LANGUAGE_STORAGE_KEY,
  SOURCE_LANGUAGE,
  type Language,
} from './languages';
import { applyDomTranslation } from './translator/domTranslator';

interface TranslationContextType {
  /** Currently selected UI language */
  language: Language;
  /** Switch language, persists + applies everywhere */
  setLanguage: (code: string) => void;
  /** True while background translation requests are in flight */
  translating: boolean;
}

const TranslationContext = createContext<TranslationContextType | undefined>(
  undefined,
);

export function TranslationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  // Start at default on server & first render to avoid hydration mismatch;
  // the stored preference is applied right after mount.
  const [language, setLanguageState] = useState<Language>(DEFAULT_LANGUAGE);
  const [translating, setTranslating] = useState(false);

  // Restore persisted preference + keep <html lang> in sync.
  // setState deferred into a callback (not synchronous in effect body) —
  // follows the repo-wide react-hooks/set-state-in-effect policy.
  useEffect(() => {
    let stored: string | null = null;
    try {
      stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    } catch {
      /* private mode etc. */
    }
    document.documentElement.lang =
      getLanguageByCode(stored).code === SOURCE_LANGUAGE ? 'en' : stored ?? 'en';
    if (!stored) return;
    Promise.resolve().then(() => {
      setLanguageState(getLanguageByCode(stored));
    });
  }, []);

  useEffect(() => {
    document.documentElement.lang = language.code;
    void applyDomTranslation(language.code);
  }, [language]);

  // Reflect busy state from the engine into React
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    // Lazy import avoidance: direct static import already loads engine.
    import('./translator/domTranslator').then(({ onTranslatingChange }) => {
      unsubscribe = onTranslatingChange(setTranslating);
    });
    return () => unsubscribe?.();
  }, []);

  const setLanguage = (code: string) => {
    const next = getLanguageByCode(code);
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, next.code);
    } catch {
      /* ignore */
    }
    setLanguageState(next);
  };

  const value = useMemo(
    () => ({ language, setLanguage, translating }),
    [language, translating],
  );

  return (
    <TranslationContext.Provider value={value}>
      {children}
    </TranslationContext.Provider>
  );
}

export function useTranslation() {
  const ctx = useContext(TranslationContext);
  if (!ctx) {
    throw new Error('useTranslation must be used within a TranslationProvider');
  }
  return ctx;
}
