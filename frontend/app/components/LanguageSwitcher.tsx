'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { LANGUAGES } from '@/lib/i18n/languages';
import { useTranslation } from '@/lib/i18n/TranslationContext';
import styles from './LanguageSwitcher.module.css';

interface LanguageSwitcherProps {
  /** 'header' matches the top bar pills; 'floating' sits over full-page screens */
  variant?: 'header' | 'floating';
}

/**
 * Language dropdown that triggers runtime auto-translation.
 * Marked data-no-translate so the engine never re-translates its own labels
 * (they are already written in each language's native script).
 */
export default function LanguageSwitcher({
  variant = 'header',
}: LanguageSwitcherProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { language, setLanguage, translating } = useTranslation();

  // Close on outside click / Escape
  useEffect(() => {
    if (!open) return;
    function handleClickOutside(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  const handleSelect = (code: string) => {
    setLanguage(code);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className={`${styles.wrapper} ${
        variant === 'floating' ? styles.floating : ''
      }`}
      data-no-translate="true"
      translate="no"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={styles.button}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language: ${language.name}`}
        title={translating ? 'Translating…' : `Language: ${language.name}`}
      >
        <Globe size={16} />
        <span className={styles.label}>{language.nativeName}</span>
        {translating ? (
          <span className={styles.spinner} aria-label="Translating" />
        ) : (
          <ChevronDown size={14} />
        )}
      </button>

      {open && (
        <div className={styles.menu} role="listbox" aria-label="Select language">
          {LANGUAGES.map((lang) => (
            <button
              key={lang.code}
              type="button"
              role="option"
              aria-selected={lang.code === language.code}
              className={`${styles.item} ${
                lang.code === language.code ? styles.itemActive : ''
              }`}
              onClick={() => handleSelect(lang.code)}
            >
              <span className={styles.nameNative}>{lang.nativeName}</span>
              <span className={styles.nameEnglish}>{lang.name}</span>
              <span className={styles.check}>
                {lang.code === language.code && <Check size={14} />}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
