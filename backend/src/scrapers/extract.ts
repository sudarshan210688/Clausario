import type { CheerioAPI } from 'cheerio';
import {
  compareArticleRefs,
  inScope,
  parseArticleRef,
  REGULATIONS,
  type ArticleRef,
  type RegId,
} from '../config/chapterMap.js';
import { romanToInt } from '../okf/roman.js';
import type { Paragraph } from '../okf/writer.js';

// Deterministic extraction (Architecture.md §6.1). GDPR selectors confirmed against tests/fixtures/gdpr (P1).

export interface RecitalLink {
  num: number;
  url: string;
}

export interface GdprArticle {
  number: number;
  /** Site title without the "Art. N GDPR" prefix, e.g. "Right to erasure (‘right to be forgotten’)". */
  title: string;
  paragraphs: Paragraph[];
  recitals: RecitalLink[];
  omnibusRecitals: RecitalLink[];
}

export interface GdprRecital {
  number: number;
  title: string;
  /** Sentences joined; `<p>` blocks separated by a blank line. */
  text: string;
}

/** Element selection as returned by `find()`. */
type Elements = ReturnType<ReturnType<CheerioAPI['root']>['find']>;

const clean = (text: string) => text.replace(/\s+/g, ' ').trim();

function headerNumber($: CheerioAPI, prefix: RegExp): number {
  const match = clean($('.dsgvo-number').first().text()).match(prefix);
  if (!match) throw new Error('`.dsgvo-number` not found');
  return Number(match[1]);
}

function headerTitle($: CheerioAPI): string {
  // Recital titles end in "*" (site marks them unofficial).
  const title = clean($('.dsgvo-title').first().text()).replace(/\*+$/, '').trim();
  if (!title) throw new Error('`.dsgvo-title` not found');
  return title;
}

/** `.entry-content` copy with sentence-number `<sup>`s removed. */
function content($: CheerioAPI) {
  const entry = $('.entry-content').first();
  if (entry.length === 0) throw new Error('`.entry-content` not found');
  const copy = entry.clone();
  copy.find('sup').remove();
  return copy;
}

function recitalLinks($: CheerioAPI, links: Elements): RecitalLink[] {
  const byNum = new Map<number, string>();
  links.each((_, a) => {
    const href = $(a).attr('href') ?? '';
    const match = href.match(/\/recitals\/no-(\d+)\/?/);
    if (match) byNum.set(Number(match[1]), href);
  });
  return [...byNum].sort(([a], [b]) => a - b).map(([num, url]) => ({ num, url }));
}

const ROMAN_LOWER = ['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv'];

/** Depth 0 → 1, 2…; depth 1 → a, b…; depth 2 → i, ii… */
function listLabel(depth: number, index: number): string {
  if (depth === 0) return String(index);
  if (depth === 1) return String.fromCharCode(96 + index);
  return ROMAN_LOWER[index - 1] ?? String(index);
}

export function extractGdprArticle($: CheerioAPI): GdprArticle {
  const number = headerNumber($, /^Art\.\s*(\d+)/);
  const title = headerTitle($);
  const body = content($);
  const paragraphs: Paragraph[] = [];

  // Nested `ol > li` → 17(1), 17(1)(a), 17(1)(a)(i). Text after a nested list (e.g. 49(1) second
  // subparagraph) stays with its parent anchor.
  const walkList = (ol: Elements, prefix: string, depth: number) => {
    let index = Number(ol.attr('start') ?? 1);
    ol.children('li').each((_, li) => {
      const anchor = `${prefix}(${listLabel(depth, index++)})`;
      const own = $(li).clone();
      own.children('ol').remove();
      paragraphs.push({ anchor, text: clean(own.text()) });
      $(li).children('ol').each((_, nested) => walkList($(nested), anchor, depth + 1));
    });
  };

  // Top-level `<p>` = unnumbered article text (e.g. Art. 4 intro, Art. 63) → anchor "N".
  const intro: string[] = [];
  body.children().each((_, el) => {
    const tag = (el as { tagName?: string }).tagName;
    if (tag === 'ol') walkList($(el), String(number), 0);
    else if (tag === 'p') intro.push(clean($(el).text()));
  });
  const introText = intro.filter(Boolean).join(' ');
  if (introText) paragraphs.unshift({ anchor: String(number), text: introText });
  if (paragraphs.length === 0) throw new Error(`no article text found for Art. ${number}`);

  const omnibusLinks = body.find('[class*="omnibus" i] a[href]');
  const recitalAnchors = body
    .find('.empfehlung-erwaegungsgruende a[href]')
    .filter((_, a) => $(a).closest('[class*="omnibus" i]').length === 0);

  return {
    number,
    title,
    paragraphs,
    recitals: recitalLinks($, recitalAnchors),
    omnibusRecitals: recitalLinks($, omnibusLinks),
  };
}

export function extractGdprRecital($: CheerioAPI): GdprRecital {
  const number = headerNumber($, /^Recital\s*(\d+)/);
  const title = headerTitle($);
  const text = content($)
    .children('p')
    .map((_, p) => clean($(p).text()))
    .get()
    .filter(Boolean)
    .join('\n\n');
  if (!text) throw new Error(`no recital text found for Recital ${number}`);
  return { number, title, text };
}

/** In-scope article refs (incl. inserted `4a`) referenced in text, excluding `self`; sorted unique. */
export function extractCrossRefs(text: string, reg: RegId, self: ArticleRef): ArticleRef[] {
  const refs = new Set<ArticleRef>();
  for (const match of text.matchAll(/Articles?\s+(\d+[a-z]?)\b/g)) {
    const ref = parseArticleRef(match[1]);
    if (ref !== self && inScope(reg, ref)) refs.add(ref);
  }
  return [...refs].sort(compareArticleRefs);
}

/** Roman annex numerals referenced in text; sorted by value, unique. */
export function extractAnnexRefs(text: string): string[] {
  const refs = new Set<string>();
  for (const match of text.matchAll(/\bAnnex(?:es)?\s+([IVX]+)\b/g)) refs.add(match[1]);
  return [...refs].sort((a, b) => romanToInt(a) - romanToInt(b));
}

/** Scraped annexes (I–X) → `annexes`; any other numeral (XI–XIII, Omnibus XIV) → `external_annexes` URL. */
export function splitAnnexRefs(
  romans: string[],
  reg: RegId,
  baseUrl: string,
): { annexes: string[]; externalAnnexes: string[] } {
  const scraped = new Set(REGULATIONS[reg].annexes.map((a) => a.roman));
  return {
    annexes: romans.filter((r) => scraped.has(r)),
    externalAnnexes: romans.filter((r) => !scraped.has(r)).map((r) => `${baseUrl}/annex/${romanToInt(r)}/`),
  };
}

// ---- EU AI Act (artificialintelligenceact.eu). Selectors confirmed against tests/fixtures/eu-ai-act (P2).

export interface AiActArticle {
  ref: ArticleRef;
  /** Site title without the "Article N:" prefix, e.g. "Classification Rules for High-Risk AI Systems". */
  title: string;
  paragraphs: Paragraph[];
  /** "Related recitals" of the article and its paragraphs; sorted unique. */
  recitals: number[];
}

export interface AiActAnnex {
  roman: string;
  title: string;
  paragraphs: Paragraph[];
}

export interface AiActRecital {
  number: number;
  /** `.recital-text` blocks separated by a blank line. */
  text: string;
}

/** `.item-heading` → label ("Article 6") + title (": Classification …" without the colon). */
function itemHeading($: CheerioAPI, section: Elements): { label: string; title: string } {
  const heading = section.children('.item-heading').first();
  const label = clean(heading.children('.heading-label').text());
  const title = clean(heading.children('.heading-title').text()).replace(/^:\s*/, '');
  if (!label || !title) throw new Error('`.item-heading` label/title not found');
  return { label, title };
}

/** Text without defined-term tooltips (`.term-tip` sits inside the term). */
function plainText($: CheerioAPI, el: Elements): string {
  const copy = el.clone();
  copy.find('.term-tip').remove();
  return clean(copy.text());
}

/**
 * In-force paragraph text. Paragraphs amended by Digital Omnibus Reg. (EU) 2026/1744 carry both versions;
 * the `om-new` one applies. `om-absent` on it means the paragraph was deleted → undefined.
 */
function paraText($: CheerioAPI, para: Elements): string | undefined {
  const text = para.children('.para-text').not('.om-old').first();
  if (text.length === 0 || text.hasClass('om-absent')) return undefined;
  return plainText($, text) || undefined;
}

/**
 * `.para` rows of an article/annex `<section>` → anchored paragraphs. Labels ("1.", "1a.", "(a)", "(i)") stack
 * by `depth-N` class: `6(1)`, `6(1)(a)`, `6(1a)`. Unlabeled rows: annex section header (id `…-<X>.0`) →
 * `VIII(A)`, children `VIII(A)(1)`; first row → intro anchor `base`; continuation / nested body → appended to
 * the anchor at its depth (6(3) second subparagraph → `6(3)`); other → previous paragraph. A label repeated in a
 * later subparagraph (43(1) second list (a)–(d)) is kept inline in its parent. Ids are not unique on annex pages,
 * so only labels count.
 */
function aiActParagraphs($: CheerioAPI, section: Elements, base: string): Paragraph[] {
  const paragraphs = new Map<string, Paragraph>();
  let sectionKey = '';
  let stack: { depth: number; label: string }[] = [];
  /** Set by a repeated label: deeper rows go inline into this anchor until a row at its depth or above. */
  let inline: { anchor: string; depth: number } | undefined;
  const anchorOf = (entries: typeof stack) => `${base}${sectionKey}${entries.map((s) => `(${s.label})`).join('')}`;
  const appendTo = (anchor: string | undefined, text: string) => {
    const target = (anchor && paragraphs.get(anchor)) || [...paragraphs.values()].pop();
    if (target) target.text += `\n\n${text}`;
    else paragraphs.set(base, { anchor: base, text });
  };

  section.children('.para').each((_, el) => {
    const para = $(el);
    const text = paraText($, para);
    if (!text) return;
    const rawLabel = clean(para.children('.para-label').text());
    const label = rawLabel.replace(/\.$/, '').replace(/^\((.+)\)$/, '$1');
    const depth = Number(para.attr('class')?.match(/\bdepth-(\d+)\b/)?.[1] ?? 0);

    if (para.hasClass('continuation') || para.hasClass('nested-body')) {
      stack = stack.filter((s) => s.depth <= depth);
      appendTo(anchorOf(stack), text);
      return;
    }
    if (!label) {
      const header = (para.attr('id') ?? '').match(/-(\w+)\.0$/);
      if (header) {
        sectionKey = `(${header[1]})`;
        stack = [];
        paragraphs.set(anchorOf([]), { anchor: anchorOf([]), text });
      } else {
        appendTo(undefined, text);
      }
      return;
    }

    if (inline && depth > inline.depth) {
      appendTo(inline.anchor, `${rawLabel} ${text}`);
      return;
    }
    inline = undefined;
    while (stack.length > 0 && stack[stack.length - 1].depth >= depth) stack.pop();
    const parent = { anchor: anchorOf(stack), depth: stack[stack.length - 1]?.depth ?? -1 };
    stack.push({ depth, label });
    const anchor = anchorOf(stack);
    if (paragraphs.has(anchor)) {
      inline = parent;
      appendTo(parent.anchor, `${rawLabel} ${text}`);
    } else {
      paragraphs.set(anchor, { anchor, text });
    }
  });
  return [...paragraphs.values()];
}

function recitalNumbers($: CheerioAPI, links: Elements): number[] {
  const nums = new Set<number>();
  links.each((_, a) => {
    const match = ($(a).attr('href') ?? '').match(/\/recital\/(\d+)\/?/);
    if (match) nums.add(Number(match[1]));
  });
  return [...nums].sort((a, b) => a - b);
}

export function extractAiActArticle($: CheerioAPI): AiActArticle {
  const section = $('section[id^="article-"]').first();
  if (section.length === 0) throw new Error('`section[id^=article-]` not found');
  const { label, title } = itemHeading($, section);
  const match = label.match(/^Article\s+(\d+[a-z]?)$/);
  if (!match) throw new Error(`unexpected article heading "${label}"`);
  const ref = parseArticleRef(match[1]);
  const paragraphs = aiActParagraphs($, section, String(ref));
  if (paragraphs.length === 0) throw new Error(`no article text found for Art. ${ref}`);
  return { ref, title, paragraphs, recitals: recitalNumbers($, section.find('.related-refs a.related-link')) };
}

export function extractAiActAnnex($: CheerioAPI): AiActAnnex {
  const section = $('section[id^="annex-"]').first();
  if (section.length === 0) throw new Error('`section[id^=annex-]` not found');
  const { label, title } = itemHeading($, section);
  const match = label.match(/^Annex\s+([IVX]+)$/);
  if (!match) throw new Error(`unexpected annex heading "${label}"`);
  const paragraphs = aiActParagraphs($, section, match[1]);
  if (paragraphs.length === 0) throw new Error(`no annex text found for Annex ${match[1]}`);
  return { roman: match[1], title, paragraphs };
}

export function extractAiActRecital($: CheerioAPI): AiActRecital {
  const block = $('.recital-block').first();
  const match = clean(block.find('.recital-header-label').first().text()).match(/^Recital\s+(\d+)$/);
  if (!match) throw new Error('`.recital-header-label` not found');
  const number = Number(match[1]);
  const text = block
    .find('.recital .recital-text')
    .map((_, el) => plainText($, $(el)))
    .get()
    .filter(Boolean)
    .join('\n\n');
  if (!text) throw new Error(`no recital text found for Recital ${number}`);
  return { number, text };
}
