/**
 * Runtime translation service using FREE, keyless public MT APIs.
 *
 * Primary : Google's public `gtx` endpoint (translate.googleapis.com) — fast,
 *           supports newline-batched requests.
 * Fallback: MyMemory API free tier (api.mymemory.translated.net).
 *
 * Everything is cached in-memory + localStorage; identical strings are
 * de-duplicated both within a page pass and across in-flight requests.
 * All failures degrade gracefully: unresolved strings stay English.
 */

import { loadPersistedCache, persistCache } from './cache';

export type TranslationResult = Map<string, string | null>;

const SOURCE_LANG = 'en';
const MAX_CONCURRENT_REQUESTS = 3;
const REQUEST_TIMEOUT_MS = 8000;
/** Google gtx handles ~1800 chars per GET comfortably; stay under it */
const BATCH_CHAR_LIMIT = 1400;
const BATCH_MAX_ITEMS = 60;
/** MyMemory free tier caps single queries around 500 chars */
const MYMEMORY_CHAR_LIMIT = 450;

// ---------------------------------------------------------------------------
// Low-level fetch with timeout + gentle retry
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function fetchJson(url: string): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Cache layers (memory + localStorage)
// ---------------------------------------------------------------------------

/** lang -> original -> translated */
const memoryCache = new Map<string, Map<string, string>>();
const loadedFromDisk = new Set<string>();

function ensureLangCache(lang: string): Map<string, string> {
  let store = memoryCache.get(lang);
  if (!store) {
    store = new Map<string, string>();
    memoryCache.set(lang, store);
  }
  if (!loadedFromDisk.has(lang)) {
    loadedFromDisk.add(lang);
    const persisted = loadPersistedCache(lang);
    for (const [k, v] of Object.entries(persisted)) {
      if (!store.has(k)) store.set(k, v);
    }
  }
  return store;
}

let persistTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePersist(lang: string): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const store = ensureLangCache(lang);
    persistCache(lang, Object.fromEntries(store.entries()));
  }, 400);
}

// ---------------------------------------------------------------------------
// Provider calls (cascade: dict-chrome-ex → gtx → MyMemory)
// ---------------------------------------------------------------------------

const DICT_ENDPOINT = 'https://clients5.google.com/translate_a/t';
const DICT_BATCH_MAX_ITEMS = 40;

/**
 * Chrome-dictionary public endpoint. Free, keyless, CORS `*`, returns clean
 * JSON with one translation per requested `q` parameter (no newline games).
 * Accepts both flat [".."] and nested [["..",".."]] array shapes.
 */
function dictNormalizeEntry(entry: unknown): string {
  if (typeof entry === 'string') return entry.trim();
  if (Array.isArray(entry)) {
    const first = entry[0];
    if (typeof first === 'string') return first.trim();
    if (Array.isArray(first) && typeof first[0] === 'string') {
      return first[0].trim();
    }
  }
  return '';
}

async function dictTranslate(
  texts: string[],
  target: string,
): Promise<string[]> {
  if (texts.length > DICT_BATCH_MAX_ITEMS) {
    throw new Error('dict batch too large');
  }
  const qs = texts.map((t) => `q=${encodeURIComponent(t)}`).join('&');
  const url =
    `${DICT_ENDPOINT}?client=dict-chrome-ex&sl=${SOURCE_LANG}` +
    `&tl=${encodeURIComponent(target)}&${qs}`;

  const data = await fetchJson(url);

  let arr: unknown[];
  if (Array.isArray(data)) {
    arr = data;
  } else if (
    data &&
    typeof data === 'object' &&
    Array.isArray((data as { sentences?: unknown[] }).sentences)
  ) {
    // Rare envelope variant
    const sents = (data as { sentences: Array<{ trans?: string }> }).sentences;
    const lines = sents.map((s) => (typeof s.trans === 'string' ? s.trans : ''));
    arr = lines.join('\n').split('\n');
  } else if (data && typeof data === 'object') {
    arr = Object.values(data as Record<string, unknown>);
  } else {
    throw new Error('Unexpected dict-chrome-ex response');
  }

  const lines = arr.map(dictNormalizeEntry);
  if (lines.length !== texts.length || lines.some((l) => l === '')) {
    throw new Error('dict-chrome-ex parity mismatch');
  }
  return lines;
}


/** Google gtx batch call — one request for many newline-joined strings. */
async function gtxBatch(texts: string[], target: string): Promise<string[]> {
  const joined = texts.join('\n');
  const url =
    'https://translate.googleapis.com/translate_a/single' +
    `?client=gtx&sl=${SOURCE_LANG}&tl=${encodeURIComponent(target)}&dt=t&dj=1&q=${encodeURIComponent(joined)}`;

  // dj=1 returns clean JSON: { sentences: [{ trans, orig }, ...] }
  const data = (await fetchJson(url)) as {
    sentences?: Array<{ trans?: string; orig?: string }>;
  };
  if (!data || !Array.isArray(data.sentences)) {
    throw new Error('Unexpected gtx-dj response shape');
  }

  const translated = data.sentences
    .map((s) => (typeof s.trans === 'string' ? s.trans : ''))
    .join('');

  const lines = translated.split('\n').map((l) => l.replace(/\u00a0/g, ' ').trim());

  // Validate line parity; fall back to orig-based echo check
  if (lines.length !== texts.length || lines.some((l) => l === '')) {
    // Try to salvage via per-sentence segmentation when counts allow alignment
    const orig = data.sentences
      .map((s) => (typeof s.orig === 'string' ? s.orig : ''))
      .join('');
    void orig;
    throw new Error('Batch segment parity mismatch');
  }
  return lines;
}

/** Single-string gtx call (same dj JSON envelope). */
async function gtxSingle(text: string, target: string): Promise<string> {
  const url =
    'https://translate.googleapis.com/translate_a/single' +
    `?client=gtx&sl=${SOURCE_LANG}&tl=${encodeURIComponent(target)}&dt=t&dj=1&q=${encodeURIComponent(text)}`;
  const data = (await fetchJson(url)) as {
    sentences?: Array<{ trans?: string }>;
  };
  if (!data || !Array.isArray(data.sentences)) {
    throw new Error('Unexpected gtx-dj response shape');
  }
  const out = data.sentences
    .map((s) => (typeof s.trans === 'string' ? s.trans : ''))
    .join('')
    .trim();
  if (!out) throw new Error('gtx returned empty translation');
  return out;
}

/** MyMemory free-tier fallback (single string). */
async function mymemorySingle(text: string, target: string): Promise<string> {
  const email = process.env.NEXT_PUBLIC_MYMEMORY_EMAIL;
  const params = new URLSearchParams({
    q: text.slice(0, MYMEMORY_CHAR_LIMIT),
    langpair: `${SOURCE_LANG}|${target}`,
  });
  if (email) params.set('de', email); // raises free quota from 5k → 50k chars/day

  const url = `https://api.mymemory.translated.net/get?${params.toString()}`;
  const data = (await fetchJson(url)) as {
    responseData?: { translatedText?: string };
  };
  const out = data?.responseData?.translatedText;
  if (typeof out !== 'string' || !out.trim()) {
    throw new Error('MyMemory returned no translation');
  }
  if (out.trim() === text.trim()) throw new Error('MyMemory echoed input');

  return out
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim();
}

// ---------------------------------------------------------------------------
// Batched request queue with dedupe
// ---------------------------------------------------------------------------

interface QueueItem {
  lang: string;
  text: string;
  resolve: (value: string | null) => void;
}

const queue: QueueItem[] = [];
/** key `lang::text` -> shared in-flight promise (dedupes identical strings) */
const inflight = new Map<string, Promise<string | null>>();
let runningBatches = 0;

function inflightKey(lang: string, text: string): string {
  return `${lang}::${text}`;
}

function takeBatch(): QueueItem[] {
  if (queue.length === 0) return [];
  const first = queue.shift()!;
  const batch = [first];
  let chars = first.text.length + 1;
  // Pull same-language neighbours for one newline-batched request
  let i = 0;
  while (
    i < queue.length &&
    batch.length < BATCH_MAX_ITEMS &&
    chars + queue[i].text.length + 1 <= BATCH_CHAR_LIMIT &&
    queue[i].lang === first.lang
  ) {
    chars += queue[i].text.length + 1;
    batch.push(queue[i]);
    i += 1;
  }
  // Remove consumed items
  if (i > 0) queue.splice(0, i);
  return batch;
}

async function translateBatchChain(
  texts: string[],
  lang: string,
): Promise<string[]> {
  try {
    return await withRetry(() => dictTranslate(texts, lang));
  } catch {
    /* fall through */
  }
  return withRetry(() => gtxBatch(texts, lang));
}

async function translateItemChain(
  text: string,
  lang: string,
): Promise<string | null> {
  try {
    return (await withRetry(() => dictTranslate([text], lang)))[0];
  } catch {
    /* fall through */
  }
  try {
    return await withRetry(() => gtxSingle(text, lang));
  } catch {
    /* fall through */
  }
  try {
    return await mymemorySingle(text, lang);
  } catch {
    return null; // all providers failed — caller keeps English text
  }
}

async function processBatch(batch: QueueItem[]): Promise<void> {
  const { lang } = batch[0];
  const texts = batch.map((b) => b.text);
  const store = ensureLangCache(lang);

  let wholeBatch: string[] | null = null;
  try {
    wholeBatch = await translateBatchChain(texts, lang);
    if (wholeBatch.length !== texts.length) wholeBatch = null;
  } catch {
    wholeBatch = null;
  }

  if (wholeBatch) {
    settle(batch, lang, wholeBatch);
  } else {
    // Whole-batch providers unusable → per-string cascade across all three
    for (const item of batch) {
      const value = await translateItemChain(item.text, lang);
      resolveItem(lang, item, value, store);
    }
  }
  schedulePersist(lang);
}

function settle(batch: QueueItem[], lang: string, translations: string[]): void {
  const store = ensureLangCache(lang);
  batch.forEach((item, idx) => {
    const value = (translations[idx] ?? '').trim();
    resolveItem(lang, item, value || null, store);
  });
}

function resolveItem(
  lang: string,
  item: QueueItem,
  value: string | null,
  store: Map<string, string>,
): void {
  if (value) store.set(item.text, value);
  inflight.delete(inflightKey(lang, item.text));
  item.resolve(value);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Translate unique strings into `lang`. Resolves a Map containing an entry
 * for every requested text; values are `null` when all providers failed
 * (callers keep the original English text — UI never breaks).
 * English requests short-circuit immediately.
 */
export async function translateStrings(
  lang: string,
  texts: string[],
): Promise<TranslationResult> {
  const result: TranslationResult = new Map();

  if (lang === SOURCE_LANG || texts.length === 0) {
    for (const t of texts) result.set(t, null);
    return result;
  }

  const store = ensureLangCache(lang);
  const pending: Promise<void>[] = [];

  for (const text of texts) {
    const cached = store.get(text);
    if (cached !== undefined) {
      result.set(text, cached);
      continue;
    }

    const key = inflightKey(lang, text);
    let shared = inflight.get(key);
    if (!shared) {
      shared = new Promise<string | null>((resolve) => {
        queue.push({ lang, text, resolve });
      });
      inflight.set(key, shared);
    }

    const p = shared;
    pending.push(
      p.then((value) => {
        result.set(text, value);
      }),
    );
  }

  // Kick the pump until saturation; resolves as batches complete
  startPump();
  await Promise.allSettled(pending);
  return result;
}

function startPump(): void {
  while (runningBatches < MAX_CONCURRENT_REQUESTS && queue.length > 0) {
    const batch = takeBatch();
    if (batch.length === 0) return;
    runningBatches += 1;
    processBatch(batch)
      .catch(() => {
        // Safety net: never leave callers hanging on unexpected throw
        for (const item of batch) {
          resolveItem(batch[0].lang, item, null, ensureLangCache(batch[0].lang));
        }
      })
      .finally(() => {
        runningBatches -= 1;
        startPump();
      });
  }
}


async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    await sleep(600); // light backoff before exactly one retry
    return fn();
  }
}
