import { z } from 'zod';

// OKF 0.2 frontmatter per type (Architecture.md §5.2). Key order here is the order written to disk.

export const RegulationName = z.enum(['GDPR', 'EU AI Act']);
export type RegulationName = z.infer<typeof RegulationName>;

export const Generated = z.strictObject({
  by: z.string().min(1),
  at: z.iso.datetime({ offset: true }),
});

export const Source = z.strictObject({
  id: z.string().min(1),
  resource: z.url(),
});

const OneLine = z.string().trim().min(1).regex(/^[^\r\n]+$/, 'must be a single line');
const ArticleNum = z.number().int().positive();
/** Article number, or `<int><letter>` for an inserted article (e.g. AI Act `"4a"`). */
const ArticleRef = z.union([ArticleNum, z.string().regex(/^\d+[a-z]$/)]);
const Roman = z.string().regex(/^[IVX]+$/);
const ContentHash = z.string().regex(/^sha256:[0-9a-f]{64}$/);
const Status = z.enum(['stable', 'draft']);

export const ChapterFrontmatter = z.strictObject({
  type: z.literal('Chapter'),
  title: OneLine,
  description: OneLine,
  resource: z.url(),
  tags: z.array(z.string().min(1)),
  regulation: RegulationName,
  chapter: ArticleNum,
  articles: z.array(ArticleRef),
  content_hash: ContentHash,
  generated: Generated,
  status: Status,
});

export const ArticleFrontmatter = z.strictObject({
  type: z.literal('Article'),
  title: OneLine,
  description: OneLine,
  description_by: z.string().min(1),
  resource: z.url(),
  tags: z.array(z.string().min(1)),
  regulation: RegulationName,
  chapter: ArticleNum,
  article: ArticleRef,
  recitals: z.array(ArticleNum),
  omnibus_recitals: z.array(ArticleNum),
  annexes: z.array(Roman),
  external_annexes: z.array(z.url()),
  cross_refs: z.array(ArticleRef),
  anchors: z.array(z.string().min(1)).min(1),
  content_hash: ContentHash,
  sources: z.array(Source).min(1),
  generated: Generated,
  status: Status,
});

export const RecitalFrontmatter = z.strictObject({
  type: z.literal('Recital'),
  title: OneLine,
  description: OneLine,
  resource: z.url(),
  tags: z.array(z.string().min(1)),
  regulation: RegulationName,
  recital: ArticleNum,
  articles: z.array(ArticleRef),
  content_hash: ContentHash,
  generated: Generated,
  status: Status,
});

export const AnnexFrontmatter = z.strictObject({
  type: z.literal('Annex'),
  title: OneLine,
  description: OneLine,
  resource: z.url(),
  tags: z.array(z.string().min(1)),
  regulation: RegulationName,
  annex: Roman,
  articles: z.array(ArticleRef),
  anchors: z.array(z.string().min(1)),
  content_hash: ContentHash,
  generated: Generated,
  status: Status,
});

export const OkfFrontmatter = z.discriminatedUnion('type', [
  ChapterFrontmatter,
  ArticleFrontmatter,
  RecitalFrontmatter,
  AnnexFrontmatter,
]);
export type OkfFrontmatter = z.infer<typeof OkfFrontmatter>;
export type ChapterFrontmatter = z.infer<typeof ChapterFrontmatter>;
export type ArticleFrontmatter = z.infer<typeof ArticleFrontmatter>;
export type RecitalFrontmatter = z.infer<typeof RecitalFrontmatter>;
export type AnnexFrontmatter = z.infer<typeof AnnexFrontmatter>;
