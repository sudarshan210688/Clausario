import { getEncoding, type Tiktoken } from 'js-tiktoken';
import { REGULATIONS } from '../config/chapterMap.js';
import { BadRequestError } from '../errors.js';
import type { Graph } from '../okf/graph.js';
import type { LoadedDoc } from '../okf/loader.js';
import type { PackManifest } from '../schemas/scenario.schema.js';

// PACK (Architecture.md §7.4): selected articles + linked recitals / annexes in full, cross-refs as title +
// description, within a token budget. Deterministic: same `articleIds` (rank order) → same pack, so generate and
// evaluate rebuild it independently.

export interface Pack {
  text: string;
  /** Citable clause label → article / annex id, e.g. `Art. 17(1)(a) GDPR` → `gdpr:art-017`. */
  anchors: ReadonlyMap<string, string>;
  /** Article ids still packed, rank order (step 5 may drop some). */
  articleIds: string[];
  manifest: PackManifest;
}

interface Section {
  anchor: string;
  text: string;
}

type AnnexMode = { kind: 'full' } | { kind: 'points'; anchors: string[] } | { kind: 'summary' };

interface State {
  articles: LoadedDoc[];
  recitals: LoadedDoc[];
  annexes: { doc: LoadedDoc; mode: AnnexMode }[];
  crossRefs: { doc: LoadedDoc; withDescription: boolean }[];
}

/** `## <anchor>` sections of a `# Text` body (stops at `# Related`). */
export function parseSections(body: string): Section[] {
  const sections: Section[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (line.startsWith('# ') && line.trim() !== '# Text') break;
    const heading = line.match(/^## (.+)$/);
    if (heading) sections.push({ anchor: heading[1].trim(), text: '' });
    else if (sections.length > 0) sections[sections.length - 1].text += `${line}\n`;
  }
  return sections.map((s) => ({ anchor: s.anchor, text: s.text.trim() }));
}

/** Body text between `# Text` and `# Related` (recitals). */
const plainText = (body: string) => body.replace(/^# Text\s*/, '').split(/\n# Related\b/)[0].trim();

const regName = (doc: LoadedDoc) => REGULATIONS[doc.reg].name;
export const articleClause = (doc: LoadedDoc, anchor: string) => `Art. ${anchor} ${regName(doc)}`;
export const annexClause = (doc: LoadedDoc, anchor: string) => `Annex ${anchor} ${regName(doc)}`;

/** `Annex III — High-risk …` → `Annex III EU AI Act — High-risk …`. */
const annexHeading = (doc: LoadedDoc) => {
  const [, ...rest] = doc.frontmatter.title.split(' — ');
  return [annexClause(doc, doc.frontmatter.type === 'Annex' ? doc.frontmatter.annex : ''), ...rest].join(' — ');
};

/**
 * Annex points cited in article text: `point 2 of Annex III` → `III(2)`, `points 8 and 9 of Annex VIII` →
 * `VIII(8)`, `VIII(9)`, `point 2(f) of Annex IV` → `IV(2)(f)`.
 */
export function referencedPoints(text: string, annex: string): string[] {
  const points = new Set<string>();
  const re = /\bpoints?\s+(\d+(?:\([a-z0-9]+\))*(?:(?:\s*,\s*|\s+and\s+|\s+or\s+)\d+(?:\([a-z0-9]+\))*)*)\s+(?:of|in)\s+Annex\s+([IVX]+)\b/g;
  for (const m of text.matchAll(re)) {
    if (m[2] !== annex) continue;
    for (const point of m[1].split(/\s*,\s*|\s+and\s+|\s+or\s+/)) {
      points.add(`${annex}${point.replace(/^(\d+)/, '($1)')}`);
    }
  }
  return [...points];
}

let encoder: Tiktoken | undefined;
const tokenCache = new Map<string, number>();

/** js-tiktoken o200k_base count (approximate for non-OpenAI models). */
export function countTokens(text: string): number {
  encoder ??= getEncoding('o200k_base');
  let n = tokenCache.get(text);
  if (n === undefined) {
    n = encoder.encode(text).length;
    tokenCache.set(text, n);
  }
  return n;
}

function articleBlock(doc: LoadedDoc): string {
  const paras = parseSections(doc.body).map((s) => `[${articleClause(doc, s.anchor)}] ${s.text}`);
  return [`## ${doc.frontmatter.title}`, ...paras].join('\n\n');
}

function recitalBlock(doc: LoadedDoc): string {
  const draft = doc.frontmatter.status === 'draft' ? ' (draft, Digital Omnibus)' : '';
  return `## ${doc.frontmatter.title}${draft}\n\n${plainText(doc.body)}`;
}

function annexBlock(doc: LoadedDoc, mode: AnnexMode): { text: string; anchors: string[] } {
  if (mode.kind === 'summary') {
    return { text: `## ${annexHeading(doc)}\n\n${doc.frontmatter.description} (text omitted)`, anchors: [] };
  }
  const sections = parseSections(doc.body).filter((s) => mode.kind === 'full' || mode.anchors.includes(s.anchor));
  const note = mode.kind === 'points' ? ' (trimmed to referenced points)' : '';
  const paras = sections.map((s) => `[${annexClause(doc, s.anchor)}] ${s.text}`);
  return { text: [`## ${annexHeading(doc)}${note}`, ...paras].join('\n\n'), anchors: sections.map((s) => s.anchor) };
}

function crossRefLine(doc: LoadedDoc, withDescription: boolean): string {
  return `- ${doc.frontmatter.title}${withDescription ? `: ${doc.frontmatter.description}` : ''}`;
}

interface Rendered {
  text: string;
  anchors: Map<string, string>;
  included: { id: string; tokens: number }[];
  totalTokens: number;
}

function render(state: State): Rendered {
  const anchors = new Map<string, string>();
  const included: { id: string; tokens: number }[] = [];
  const parts: string[] = [];
  const section = (heading: string, blocks: { id: string; text: string }[]) => {
    if (blocks.length === 0) return;
    parts.push(heading);
    for (const block of blocks) {
      parts.push(block.text);
      included.push({ id: block.id, tokens: countTokens(`${block.text}\n\n`) });
    }
  };

  section(
    '# Articles',
    state.articles.map((doc) => {
      for (const s of parseSections(doc.body)) anchors.set(articleClause(doc, s.anchor), doc.id);
      return { id: doc.id, text: articleBlock(doc) };
    }),
  );
  section('# Recitals (context, not citable)', state.recitals.map((doc) => ({ id: doc.id, text: recitalBlock(doc) })));
  section(
    '# Annexes',
    state.annexes.map(({ doc, mode }) => {
      const block = annexBlock(doc, mode);
      for (const anchor of block.anchors) anchors.set(annexClause(doc, anchor), doc.id);
      return { id: doc.id, text: block.text };
    }),
  );
  section(
    '# Cross-referenced articles (context, not citable)',
    state.crossRefs.map(({ doc, withDescription }) => ({ id: doc.id, text: crossRefLine(doc, withDescription) })),
  );

  const headings = parts.filter((p) => p.startsWith('# ')).reduce((n, h) => n + countTokens(`${h}\n\n`), 0);
  const totalTokens = headings + included.reduce((n, i) => n + i.tokens, 0);
  return { text: `${parts.join('\n\n')}\n`, anchors, included, totalTokens };
}

/**
 * Builds the pack for `articleIds` (rank order). Token total = per-block js-tiktoken sum. Over budget → drop in
 * order: (1) cross-ref descriptions → (2) omnibus recitals → (3) recitals beyond the first 2 per article →
 * (4) annex text trimmed to referenced points (none → title + description) → (5) articles from the end.
 * Each step works from the end of its list and stops as soon as the pack fits.
 */
export function buildPack(articleIds: readonly string[], graph: Graph, budget: number): Pack {
  const docOf = (id: string) => graph.docs.get(id);
  const articles = articleIds.map((id) => {
    const doc = docOf(id);
    if (!doc || doc.frontmatter.type !== 'Article') throw new BadRequestError(`Unknown article: ${id}`);
    return doc;
  });
  const selected = new Set(articleIds);
  const ordered = (pick: (id: string) => string[]) => {
    const ids = new Set(articleIds.flatMap(pick));
    return [...ids].flatMap((id) => docOf(id) ?? []);
  };
  const edges = (id: string) => graph.edges.get(id)!;

  const state: State = {
    articles,
    recitals: ordered((id) => [...edges(id).recitals, ...edges(id).omnibusRecitals]),
    annexes: ordered((id) => edges(id).annexes).map((doc) => ({ doc, mode: { kind: 'full' } })),
    crossRefs: ordered((id) => edges(id).crossRefs.filter((ref) => !selected.has(ref))).map((doc) => ({
      doc,
      withDescription: true,
    })),
  };
  const dropped: { id: string; reason: string }[] = [];
  const over = () => render(state).totalTokens > budget;

  // (1) cross-ref descriptions
  for (const ref of [...state.crossRefs].reverse()) {
    if (!over()) break;
    ref.withDescription = false;
    dropped.push({ id: ref.doc.id, reason: 'cross-ref description dropped (over budget)' });
  }

  // (2) omnibus recitals
  for (const doc of [...state.recitals].reverse()) {
    if (!over()) break;
    if (doc.frontmatter.status !== 'draft') continue;
    state.recitals = state.recitals.filter((r) => r !== doc);
    dropped.push({ id: doc.id, reason: 'omnibus recital dropped (over budget)' });
  }

  // (3) recitals beyond the first 2 per article (frontmatter order)
  const firstTwo = new Set(state.articles.flatMap((a) => edges(a.id).recitals.slice(0, 2)));
  for (const doc of [...state.recitals].reverse()) {
    if (!over()) break;
    if (firstTwo.has(doc.id)) continue;
    state.recitals = state.recitals.filter((r) => r !== doc);
    dropped.push({ id: doc.id, reason: 'recital beyond first 2 per article dropped (over budget)' });
  }

  // (4) annex text trimmed to referenced points
  for (const annex of [...state.annexes].reverse()) {
    if (!over()) break;
    const fm = annex.doc.frontmatter;
    if (fm.type !== 'Annex') continue;
    const articleText = state.articles.map((a) => parseSections(a.body).map((s) => s.text).join('\n')).join('\n');
    const points = referencedPoints(articleText, fm.annex);
    const keep = parseSections(annex.doc.body)
      .map((s) => s.anchor)
      .filter((anchor) => anchor === fm.annex || points.some((p) => anchor === p || anchor.startsWith(`${p}(`)));
    if (keep.some((anchor) => anchor !== fm.annex)) {
      annex.mode = { kind: 'points', anchors: keep };
      dropped.push({ id: annex.doc.id, reason: `annex trimmed to referenced points ${points.join(', ')} (over budget)` });
    } else {
      annex.mode = { kind: 'summary' };
      dropped.push({ id: annex.doc.id, reason: 'annex text replaced by title + description (over budget)' });
    }
  }

  // (5) lowest-ranked articles, with what only they linked
  while (over() && state.articles.length > 1) {
    const doc = state.articles.pop()!;
    dropped.push({ id: doc.id, reason: 'article dropped, lowest rank (over budget)' });
    const linked = new Set(state.articles.flatMap((a) => Object.values(edges(a.id)).flat()));
    const orphan = (d: LoadedDoc) => {
      if (linked.has(d.id)) return false;
      dropped.push({ id: d.id, reason: `linked only from dropped ${doc.id}` });
      return true;
    };
    state.recitals = state.recitals.filter((d) => !orphan(d));
    state.annexes = state.annexes.filter((a) => !orphan(a.doc));
    state.crossRefs = state.crossRefs.filter((c) => !orphan(c.doc));
  }

  const result = render(state);
  if (result.totalTokens > budget) {
    throw new BadRequestError(
      `PACK_TOKEN_BUDGET ${budget} is too small: the minimal pack (${state.articles[0].id} + first 2 recitals) needs ${result.totalTokens} tokens`,
    );
  }
  return {
    text: result.text,
    anchors: result.anchors,
    articleIds: state.articles.map((a) => a.id),
    manifest: { included: result.included, dropped, totalTokens: result.totalTokens, budget },
  };
}
