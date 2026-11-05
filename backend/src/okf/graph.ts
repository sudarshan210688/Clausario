import { annexFileId, articleFileId, chapterFileId, globalId, omnibusRecitalFileId, recitalFileId } from './ids.js';
import type { LoadedDoc } from './loader.js';
import { romanToInt } from './roman.js';

// In-memory adjacency built from frontmatter keys (the source of truth); no graph.json (Architecture.md §5.1, §7.3).

/** Global ids in frontmatter order (pack step 3 keeps the first 2 recitals). */
export interface ArticleEdges {
  chapter: string;
  recitals: string[];
  omnibusRecitals: string[];
  annexes: string[];
  crossRefs: string[];
}

export interface Graph {
  docs: ReadonlyMap<string, LoadedDoc>;
  /** Article id → 1-hop edges. */
  edges: ReadonlyMap<string, ArticleEdges>;
  /** Dangling targets and back-link mismatches; reported, not fatal. */
  warnings: string[];
}

export interface ExpandedRef {
  id: string;
  title: string;
}

export interface Expansion {
  /** Omnibus recitals included, `draft: true`. */
  recitals: (ExpandedRef & { draft: boolean })[];
  annexes: ExpandedRef[];
  /** Cross-referenced articles not already in the selection. */
  crossRefs: ExpandedRef[];
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
const annexRank = (doc: LoadedDoc) => (doc.frontmatter.type === 'Annex' ? romanToInt(doc.frontmatter.annex) : 0);

/** Deterministic doc order: regulation, annex numeral value (annex-ix after annex-v), then file id. */
export const compareDocs = (a: LoadedDoc, b: LoadedDoc) =>
  cmp(a.reg, b.reg) || annexRank(a) - annexRank(b) || cmp(a.id, b.id);

export function buildGraph(docs: ReadonlyMap<string, LoadedDoc>): Graph {
  const edges = new Map<string, ArticleEdges>();
  for (const doc of docs.values()) {
    const fm = doc.frontmatter;
    if (fm.type !== 'Article') continue;
    const id = (fileId: string) => globalId(doc.reg, fileId);
    edges.set(doc.id, {
      chapter: id(chapterFileId(fm.chapter)),
      recitals: fm.recitals.map((n) => id(recitalFileId(n))),
      omnibusRecitals: fm.omnibus_recitals.map((n) => id(omnibusRecitalFileId(n))),
      annexes: fm.annexes.map((roman) => id(annexFileId(roman))),
      crossRefs: fm.cross_refs.map((ref) => id(articleFileId(ref))),
    });
  }

  const warnings: string[] = [];
  // Chapter / recital / annex docs back-link their articles (`articles: [...]`); both directions must agree.
  const linked = new Set<string>();
  for (const [articleId, e] of edges) {
    for (const target of [e.chapter, ...e.recitals, ...e.omnibusRecitals, ...e.annexes, ...e.crossRefs]) {
      if (!docs.has(target)) warnings.push(`${articleId} → ${target}: target missing`);
    }
    for (const target of [e.chapter, ...e.recitals, ...e.omnibusRecitals, ...e.annexes]) {
      linked.add(`${target} ${articleId}`);
    }
  }
  const backLinked = new Set<string>();
  for (const doc of docs.values()) {
    if (doc.frontmatter.type === 'Article') continue;
    for (const ref of doc.frontmatter.articles) {
      const articleId = globalId(doc.reg, articleFileId(ref));
      backLinked.add(`${doc.id} ${articleId}`);
      if (!linked.has(`${doc.id} ${articleId}`)) warnings.push(`${doc.id} back-links ${articleId}, which does not link it`);
    }
  }
  for (const pair of linked) {
    const [target, articleId] = pair.split(' ');
    if (docs.has(target) && !backLinked.has(pair)) warnings.push(`${target} does not back-link ${articleId}`);
  }

  return { docs, edges, warnings };
}

/** 1-hop expansion of the selected articles: deduped, sorted, same output for the same ids in any order. */
export function expand(graph: Graph, articleIds: readonly string[]): Expansion {
  const selected = new Set(articleIds);
  const recitals = new Set<string>();
  const annexes = new Set<string>();
  const crossRefs = new Set<string>();
  for (const id of selected) {
    const e = graph.edges.get(id);
    if (!e) throw new Error(`Unknown article: ${id}`);
    for (const target of [...e.recitals, ...e.omnibusRecitals]) recitals.add(target);
    for (const target of e.annexes) annexes.add(target);
    for (const target of e.crossRefs) if (!selected.has(target)) crossRefs.add(target);
  }

  // Dangling targets are skipped here; buildGraph already reported them.
  const docsOf = (ids: Set<string>) =>
    [...ids].flatMap((id) => graph.docs.get(id) ?? []).sort(compareDocs);
  const ref = (doc: LoadedDoc): ExpandedRef => ({ id: doc.id, title: doc.frontmatter.title });
  return {
    recitals: docsOf(recitals).map((doc) => ({ ...ref(doc), draft: doc.frontmatter.status === 'draft' })),
    annexes: docsOf(annexes).map(ref),
    crossRefs: docsOf(crossRefs).map(ref),
  };
}
