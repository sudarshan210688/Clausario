import { createHash } from 'node:crypto';
import type { ArticleRef } from '../config/chapterMap.js';
import { normalizeText } from './normalize.js';

/** Content + edges that define a document's identity (Architecture.md §6.2). */
export interface HashInput {
  text: string;
  chapter?: number;
  recitals?: number[];
  omnibus_recitals?: number[];
  annexes?: string[];
  external_annexes?: string[];
  cross_refs?: ArticleRef[];
  /** Back-links on chapter / recital / annex docs. */
  articles?: ArticleRef[];
}

/** JSON with object keys sorted recursively; undefined values dropped; array order kept. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** `sha256:<hex>` over canonical JSON; text is normalized first. */
export function contentHash(input: HashInput): string {
  const canonical = canonicalJson({ ...input, text: normalizeText(input.text) });
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`;
}

/** Picks the hashed fields from a frontmatter object — never description or generated. */
export function hashInputOf(frontmatter: Record<string, unknown>, body: string): HashInput {
  const pick = <K extends keyof HashInput>(key: K) => frontmatter[key] as HashInput[K];
  return {
    text: body,
    chapter: pick('chapter'),
    recitals: pick('recitals'),
    omnibus_recitals: pick('omnibus_recitals'),
    annexes: pick('annexes'),
    external_annexes: pick('external_annexes'),
    cross_refs: pick('cross_refs'),
    articles: pick('articles'),
  };
}
