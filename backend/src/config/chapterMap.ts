// Static chapter → article ranges. GDPR verified against gdpr-info.eu home page (P1); EU AI Act against the
// artificialintelligenceact.eu explorer ToC (P2), incl. articles inserted by Digital Omnibus Reg. (EU) 2026/1744.

/** Article number, or `<int><letter>` for an inserted article, e.g. `"4a"`. */
export type ArticleRef = number | string;

export interface ChapterDef {
  num: number;
  roman: string;
  title: string;
  from: number;
  to: number;
  /** Lettered articles inserted into this chapter, e.g. `["4a"]`. */
  inserted?: readonly string[];
}

export interface AnnexDef {
  roman: string;
  title: string;
}

export interface RegulationDef {
  /** Frontmatter `regulation` value. */
  name: 'GDPR' | 'EU AI Act';
  /** One-line summary used in the root index.md. */
  summary: string;
  chapters: readonly ChapterDef[];
  /** Annexes scraped into `annexes/`; higher-numbered annexes are linked as `external_annexes`. */
  annexes: readonly AnnexDef[];
}

export type RegId = 'gdpr' | 'eu-ai-act';

export const REGULATIONS: Record<RegId, RegulationDef> = {
  gdpr: {
    name: 'GDPR',
    summary: 'Regulation (EU) 2016/679, Chapters I–X',
    chapters: [
      { num: 1, roman: 'I', title: 'General provisions', from: 1, to: 4 },
      { num: 2, roman: 'II', title: 'Principles', from: 5, to: 11 },
      { num: 3, roman: 'III', title: 'Rights of the data subject', from: 12, to: 23 },
      { num: 4, roman: 'IV', title: 'Controller and processor', from: 24, to: 43 },
      {
        num: 5,
        roman: 'V',
        title: 'Transfers of personal data to third countries or international organisations',
        from: 44,
        to: 50,
      },
      { num: 6, roman: 'VI', title: 'Independent supervisory authorities', from: 51, to: 59 },
      { num: 7, roman: 'VII', title: 'Cooperation and consistency', from: 60, to: 76 },
      { num: 8, roman: 'VIII', title: 'Remedies, liability and penalties', from: 77, to: 84 },
      { num: 9, roman: 'IX', title: 'Provisions relating to specific processing situations', from: 85, to: 91 },
      { num: 10, roman: 'X', title: 'Delegated acts and implementing acts', from: 92, to: 93 },
    ],
    annexes: [],
  },
  'eu-ai-act': {
    name: 'EU AI Act',
    summary: 'Regulation (EU) 2024/1689 as amended by Regulation (EU) 2026/1744, Chapters I–X + Annex I–X',
    chapters: [
      { num: 1, roman: 'I', title: 'General provisions', from: 1, to: 4, inserted: ['4a'] },
      { num: 2, roman: 'II', title: 'Prohibited AI practices', from: 5, to: 5 },
      { num: 3, roman: 'III', title: 'High-risk AI systems', from: 6, to: 49 },
      {
        num: 4,
        roman: 'IV',
        title: 'Transparency obligations for providers and deployers of certain AI systems',
        from: 50,
        to: 50,
      },
      { num: 5, roman: 'V', title: 'General-purpose AI models', from: 51, to: 56 },
      { num: 6, roman: 'VI', title: 'Measures in support of innovation', from: 57, to: 63, inserted: ['60a'] },
      { num: 7, roman: 'VII', title: 'Governance', from: 64, to: 70 },
      { num: 8, roman: 'VIII', title: 'EU database for high-risk AI systems', from: 71, to: 71 },
      {
        num: 9,
        roman: 'IX',
        title: 'Post-market monitoring, information sharing and market surveillance',
        from: 72,
        to: 94,
        inserted: ['75a', '75b', '75c', '75d'],
      },
      { num: 10, roman: 'X', title: 'Codes of conduct and guidelines', from: 95, to: 96 },
    ],
    annexes: [
      { roman: 'I', title: 'List of Union harmonisation legislation' },
      { roman: 'II', title: 'List of criminal offences referred to in Article 5(1), first subparagraph, point (h)(iii)' },
      { roman: 'III', title: 'High-risk AI systems referred to in Article 6(2)' },
      { roman: 'IV', title: 'Technical documentation referred to in Article 11(1)' },
      { roman: 'V', title: 'EU declaration of conformity' },
      { roman: 'VI', title: 'Conformity assessment procedure based on internal control' },
      {
        roman: 'VII',
        title:
          'Conformity based on an assessment of the quality management system and an assessment of the technical documentation',
      },
      {
        roman: 'VIII',
        title: 'Information to be submitted upon the registration of high-risk AI systems in accordance with Article 49',
      },
      {
        roman: 'IX',
        title:
          'Information to be submitted upon the registration of high-risk AI systems listed in Annex III in relation to testing in real world conditions in accordance with Article 60',
      },
      {
        roman: 'X',
        title: 'Union legislative acts on large-scale IT systems in the area of freedom, security and justice',
      },
    ],
  },
};

/** `"17"` → 17; `"4a"` stays `"4a"`. */
export const parseArticleRef = (text: string): ArticleRef => (/^\d+$/.test(text) ? Number(text) : text);

/** Numeric part of an article ref: `"4a"` → 4. */
export const articleNumber = (ref: ArticleRef): number => (typeof ref === 'number' ? ref : parseInt(ref, 10));

/** Number first, then letter: 4 < "4a" < "4b" < 5. */
export function compareArticleRefs(a: ArticleRef, b: ArticleRef): number {
  return articleNumber(a) - articleNumber(b) || String(a).localeCompare(String(b));
}

/** Lettered refs belong to a chapter only if listed in its `inserted`. */
export function chapterOf(reg: RegId, article: ArticleRef): ChapterDef | undefined {
  const num = articleNumber(article);
  const chapter = REGULATIONS[reg].chapters.find((ch) => num >= ch.from && num <= ch.to);
  if (typeof article === 'string' && !chapter?.inserted?.includes(article)) return undefined;
  return chapter;
}

export function inScope(reg: RegId, article: ArticleRef): boolean {
  return chapterOf(reg, article) !== undefined;
}

/** All in-scope articles in order, inserted lettered articles included. */
export function articleList(reg: RegId): ArticleRef[] {
  return REGULATIONS[reg].chapters
    .flatMap((ch): ArticleRef[] => [
      ...Array.from({ length: ch.to - ch.from + 1 }, (_, i) => ch.from + i),
      ...(ch.inserted ?? []),
    ])
    .sort(compareArticleRefs);
}
