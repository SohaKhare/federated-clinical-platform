/**
 * Supported UI languages for runtime auto-translation.
 * All listed codes are supported by Google Translate / MyMemory free endpoints.
 */
export interface Language {
  /** Short code used by translation APIs (Google gtx / MyMemory langpair) */
  code: string;
  /** English name */
  name: string;
  /** Native label rendered in the dropdown */
  nativeName: string;
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', nativeName: 'English' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी' },
  { code: 'bn', name: 'Bengali', nativeName: 'বাংলা' },
  { code: 'ta', name: 'Tamil', nativeName: 'தமிழ்' },
  { code: 'te', name: 'Telugu', nativeName: 'తెలుగు' },
  { code: 'mr', name: 'Marathi', nativeName: 'मराठी' },
  { code: 'gu', name: 'Gujarati', nativeName: 'ગુજરાતી' },
  { code: 'kn', name: 'Kannada', nativeName: 'ಕನ್ನಡ' },
  { code: 'ml', name: 'Malayalam', nativeName: 'മലയാളം' },
  { code: 'pa', name: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ' },
];

export const DEFAULT_LANGUAGE = LANGUAGES[0];
export const LANGUAGE_STORAGE_KEY = 'fcp-lang';

/** English is the source language — selecting it disables translation. */
export const SOURCE_LANGUAGE = 'en';

export function getLanguageByCode(code: string | null | undefined): Language {
  return (
    LANGUAGES.find((l) => l.code === code) ?? DEFAULT_LANGUAGE
  );
}
