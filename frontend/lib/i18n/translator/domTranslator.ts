/**
 * DOM-level auto-translation engine.
 *
 * Walks visible text nodes + common attributes (placeholder / title /
 * aria-label), translates them through translateService and swaps the values
 * in place — mirroring how browser translate widgets work. Originals are kept
 * so switching back to English restores instantly, and a MutationObserver
 * re-applies cached translations to React-rendered / API-fetched content as
 * it appears (dynamic patient names, logs, chart labels — zero component
 * changes required).
 */

import { SOURCE_LANGUAGE } from '../languages';
import { translateStrings } from './translateService';

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

interface TextRecord {
  node: Text;
  /** full original nodeValue */
  original: string;
}
interface AttrRecord {
  el: Element;
  attr: string;
  original: string;
}

const textRecords: TextRecord[] = [];
const attrRecords: AttrRecord[] = [];

/** Nodes whose current value WE wrote (loop-suppression for the observer) */
const lastApplied = new WeakMap<Text, string>();

let observer: MutationObserver | null = null;
let activeLang = SOURCE_LANGUAGE;
let sessionToken = 0;
let pendingCount = 0;

type BusyListener = (busy: boolean) => void;
const busyListeners = new Set<BusyListener>();

export function onTranslatingChange(listener: BusyListener): () => void {
  busyListeners.add(listener);
  return () => busyListeners.delete(listener);
}

function setBusy(v: boolean): void {
  const was = pendingCount > 0;
  pendingCount += v ? 1 : -1;
  const is = pendingCount > 0;
  if (was !== is) {
    for (const l of busyListeners) l(is);
  }
}

// ---------------------------------------------------------------------------
// Skip rules
// ---------------------------------------------------------------------------

const SKIP_TAGS = new Set([
  'SCRIPT',
  'STYLE',
  'NOSCRIPT',
  'CODE',
  'PRE',
  'TEXTAREA',
  'SVG',
]);

function insideSkippedSubtree(node: Node): boolean {
  let cur: Node | null = node;
  while (cur) {
    if (cur.nodeType === Node.ELEMENT_NODE) {
      const el = cur as Element;
      const tag = el.tagName;
      if (
        SKIP_TAGS.has(tag) ||
        el.hasAttribute('data-no-translate') ||
        el.getAttribute('translate') === 'no'
      ) {
        return true;
      }
    }
    cur = cur.parentNode;
  }
  return false;
}

/** Heuristic: true when text should NOT be sent to any MT provider. */
export function isUntranslatable(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 400) return true;
  // Needs at least one letter anywhere
  if (!/\p{L}/u.test(t)) return true;
  // Pure numbers / quantities / ranges / percentages
  if (/^[\d\s.,:%+\-–—/()]+$/.test(t)) return true;
  // IDs, UUID fragments, model keys (e.g. PAT-0042, fcp-a1b2c3)
  if (/^[A-Za-z]{1,6}-\d+[-_A-Za-z0-9]*$/.test(t)) return true;
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i.test(t)) return true;
  // URLs, emails, file paths
  if (/^(https?:\/\/|www\.|\S+@\S+\.\S+|\/[\w./-]+)$/.test(t)) return true;
  // Common date formats (12 Aug 2026, 2026-08-12, 12/08/26)
  if (/^\d{1,4}[\/.-]\d{1,2}[\/.-]\d{1,4}$/.test(t)) return true;
  if (/^\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4}$/i.test(t)) {
    return true;
  }
  // Single symbols / short standalone punctuation
  if (/^[^a-zA-Z0-9]+$/.test(t)) return true;
  return false;
}

/** Preserve surrounding whitespace exactly as authored in JSX. */
function splitWhitespace(raw: string): { pre: string; core: string; post: string } {
  const preMatch = raw.match(/^\s*/);
  const postMatch = raw.match(/\s*$/);
  return {
    pre: preMatch ? preMatch[0] : '',
    core: raw.slice((preMatch ? preMatch[0].length : 0), raw.length - (postMatch ? postMatch[0].length : 0)),
    post: postMatch ? postMatch[0] : '',
  };
}

// ---------------------------------------------------------------------------
// Collection
// ---------------------------------------------------------------------------

const TRANSLATABLE_ATTRS = ['placeholder', 'title', 'aria-label'];

/** Tracks which language each text node was last rendered in */
const nodeLanguage = new WeakMap<Text, string>();

function collectTextNodes(root: ParentNode): Text[] {
  const out: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const textNode = node as Text;
    const value = textNode.nodeValue ?? '';
    if (
      value.trim() !== '' &&
      !insideSkippedSubtree(textNode) &&
      !isUntranslatable(value)
    ) {
      out.push(textNode);
    }
    node = walker.nextNode();
  }
  return out;
}

interface Candidate {
  node: Text;
  pre: string;
  core: string;
  post: string;
}

/**
 * Build candidates for a pass. For nodes previously translated this session,
 * the TRUE English original is used as the translation source so switching
 * between two non-English languages works correctly.
 */
function collectCandidates(root: ParentNode): {
  candidates: Candidate[];
  cores: string[];
} {
  // Index known originals once for O(1) lookups
  const knownOriginals = new Map<Text, string>();
  for (const rec of textRecords) knownOriginals.set(rec.node, rec.original);

  const candidates: Candidate[] = [];
  for (const node of collectTextNodes(root)) {
    if (nodeLanguage.get(node) === activeLang) continue;

    const sourceRaw = knownOriginals.get(node) ?? node.nodeValue ?? '';
    const { pre, core, post } = splitWhitespace(sourceRaw);
    if (!core || isUntranslatable(core)) continue;

    candidates.push({ node, pre, core, post });
  }

  const cores = Array.from(new Set(candidates.map((c) => c.core)));
  return { candidates, cores };
}

// ---------------------------------------------------------------------------
// Attributes (placeholder / title / aria-label)
// ---------------------------------------------------------------------------

function registerAttr(rec: AttrRecord): void {
  const exists = attrRecords.some((r) => r.el === rec.el && r.attr === rec.attr);
  if (!exists) attrRecords.push(rec);
}

function collectAttrs(root: ParentNode): void {
  for (const attr of TRANSLATABLE_ATTRS) {
    root.querySelectorAll(`[${attr}]`).forEach((el) => {
      if (insideSkippedSubtree(el)) return;
      const value = el.getAttribute(attr);
      if (!value || !value.trim() || isUntranslatable(value)) return;
      registerAttr({ el, attr, original: value });
    });
  }
}

// ---------------------------------------------------------------------------
// Main pass
// ---------------------------------------------------------------------------

async function runPass(lang: string, token: number): Promise<void> {
  const body = typeof document !== 'undefined' ? document.body : null;
  if (!body) return;

  setBusy(true);
  try {
    const { candidates } = collectCandidates(body);

    // Record true originals before any mutation
    for (const c of candidates) {
      if (!textRecords.some((r) => r.node === c.node)) {
        textRecords.push({ node: c.node, original: c.pre + c.core + c.post });
      }
    }

    collectAttrs(body);

    // Collect unique attribute source values (always the English originals)
    const attrTargets: Array<{ rec: AttrRecord }> = [];
    const attrCores = new Set<string>();
    for (const rec of attrRecords) {
      if (!rec.el.isConnected) continue;
      const current = rec.el.getAttribute(rec.attr);
      if (current === rec.original && nodeLangForAttr(rec) === lang) continue;
      attrTargets.push({ rec });
      attrCores.add(rec.original);
    }

    const allStrings = Array.from(
      new Set([...candidates.map((c) => c.core), ...attrCores]),
    );
    if (allStrings.length === 0) return;

    const results = await translateStrings(lang, allStrings);

    // Stale guard — user switched language mid-request
    if (token !== sessionToken || activeLang !== lang) return;

    // Apply text-node translations
    for (const c of candidates) {
      if (!c.node.isConnected) continue;
      const translated = results.get(c.core);
      if (!translated) continue;
      const nextValue = c.pre + translated + c.post;
      lastApplied.set(c.node, nextValue);
      c.node.nodeValue = nextValue;
      nodeLanguage.set(c.node, lang);
    }

    // Apply attribute translations
    for (const { rec } of attrTargets) {
      if (!rec.el.isConnected) continue;
      const translated = results.get(rec.original);
      if (!translated) continue;
      try {
        rec.el.setAttribute(rec.attr, translated);
        attrLangState.set(`${rec.el.tagName}\u0000${rec.attr}\u0000${rec.original}`, lang);
      } catch {
        /* detached mid-write */
      }
    }
  } finally {
    setBusy(false);
  }
}

/** Per-attribute language marker (avoids redundant writes across rescans) */
const attrLangState = new Map<string, string>();

function nodeLangForAttr(rec: AttrRecord): string | undefined {
  return attrLangState.get(
    `${rec.el.tagName}\u0000${rec.attr}\u0000${rec.original}`,
  );
}

// ---------------------------------------------------------------------------
// Mutation observer — translates dynamically-rendered content
// ---------------------------------------------------------------------------

let rescanTimer: ReturnType<typeof setTimeout> | null = null;

function startObserver(): void {
  if (observer || typeof document === 'undefined' || !document.body) return;
  observer = new MutationObserver((mutations) => {
    let relevant = false;
    for (const m of mutations) {
      if (m.type === 'characterData') {
        // Ignore writes WE performed (loop protection)
        const t = m.target as Text;
        const applied = lastApplied.get(t);
        if (applied !== undefined && applied === t.nodeValue) continue;
        relevant = true;
      } else if (m.type === 'childList') {
        if (m.addedNodes.length > 0) relevant = true;
      }
      if (relevant) break;
    }
    if (!relevant) return;
    scheduleRescan();
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

function scheduleRescan(): void {
  if (rescanTimer) return;
  rescanTimer = setTimeout(() => {
    rescanTimer = null;
    if (activeLang !== SOURCE_LANGUAGE) {
      void runPass(activeLang, sessionToken);
    }
  }, 150);
}

export function stopDomTranslation(): void {
  observer?.disconnect();
  observer = null;
  if (rescanTimer) {
    clearTimeout(rescanTimer);
    rescanTimer = null;
  }
}

// ---------------------------------------------------------------------------
// Restore + public API
// ---------------------------------------------------------------------------

function restoreOriginals(): void {
  for (const r of textRecords) {
    if (r.node.isConnected) {
      r.node.nodeValue = r.original;
    }
    lastApplied.delete(r.node);
    nodeLanguage.delete(r.node);
  }
  textRecords.length = 0;

  for (const r of attrRecords) {
    if (r.el.isConnected) {
      try {
        r.el.setAttribute(r.attr, r.original);
      } catch {
        /* ignore */
      }
    }
  }
  attrRecords.length = 0;
  attrLangState.clear();
}

/** Switch the whole DOM to `lang`. English restores originals instantly. */
export function applyDomTranslation(lang: string): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve();
  }

  activeLang = lang;
  sessionToken += 1;

  startObserver(); // stays on for both directions so language switches flow

  if (lang === SOURCE_LANGUAGE) {
    restoreOriginals();
    return Promise.resolve();
  }

  return runPass(lang, sessionToken).then(() => undefined);
}

export function getCurrentDomLanguage(): string {
  return activeLang;
}



