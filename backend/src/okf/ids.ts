import { articleNumber, type ArticleRef, type RegId } from '../config/chapterMap.js';

// File ids and bundle-relative links (CLAUDE.md "OKF 0.2 bundle layout").

const pad = (n: number, width: number) => String(n).padStart(width, '0');

export const chapterFileId = (n: number) => `ch-${pad(n, 2)}`;
/** 17 → `art-017`; inserted `"4a"` → `art-004a`. */
export const articleFileId = (ref: ArticleRef) =>
  `art-${pad(articleNumber(ref), 3)}${String(ref).replace(/^\d+/, '')}`;
export const recitalFileId = (n: number) => `rec-${pad(n, 3)}`;
export const omnibusRecitalFileId = (n: number) => `omnibus-rec-${pad(n, 3)}`;
export const annexFileId = (roman: string) => `annex-${roman.toLowerCase()}`;

export type DocFolder = 'chapters' | 'articles' | 'recitals' | 'annexes';

/** Path relative to KNOWLEDGE_DIR, e.g. `gdpr/articles/art-017.md`. */
export const relPath = (reg: RegId, folder: DocFolder, fileId: string) => `${reg}/${folder}/${fileId}.md`;

/** Bundle-relative link, e.g. `/gdpr/articles/art-017.md`. */
export const link = (reg: RegId, folder: DocFolder, fileId: string) => `/${relPath(reg, folder, fileId)}`;

/** Global API id, e.g. `gdpr:art-017`. */
export const globalId = (reg: RegId, fileId: string) => `${reg}:${fileId}`;
