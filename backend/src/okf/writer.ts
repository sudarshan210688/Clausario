import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import YAML from 'yaml';
import type { ArticleRef, RegId } from '../config/chapterMap.js';
import { OkfFrontmatter } from '../schemas/okf.schema.js';
import { annexFileId, articleFileId, chapterFileId, link, omnibusRecitalFileId, recitalFileId } from './ids.js';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** Frontmatter before the LLM description is known (dryRun never gets one). */
export type DraftFrontmatter = DistributiveOmit<OkfFrontmatter, 'description' | 'description_by'>;

export interface DocDraft {
  /** Global id, e.g. `gdpr:art-017`. */
  id: string;
  /** Relative to KNOWLEDGE_DIR, e.g. `gdpr/articles/art-017.md`. */
  relPath: string;
  /** Short link text for logs, e.g. `Art. 17`. */
  label: string;
  frontmatter: DraftFrontmatter;
  body: string;
}

/** `redescribe` = unchanged content, description rewritten (scrape option `redescribe`). */
export type WriteAction = 'add' | 'update' | 'skip' | 'redescribe';

export interface WritePlan {
  action: WriteAction;
  doc: DocDraft;
}

export interface Description {
  text: string;
  /** `template` or `openai/<DESCRIPTION_MODEL>`; written as `description_by` on articles. */
  by: string;
}

export interface Paragraph {
  anchor: string;
  text: string;
}

/** Validates frontmatter (Zod) and renders `---\n<yaml>---\n\n<body>\n`. Keys follow schema order. */
export function serializeDoc(frontmatter: OkfFrontmatter, body: string): string {
  const doc = new YAML.Document(OkfFrontmatter.parse(frontmatter));
  // Nested collections inline: `recitals: [65, 66]`, `generated: { by: …, at: … }`.
  YAML.visit(doc, {
    Map: (_, node, ancestors) => void (ancestors.length > 1 && (node.flow = true)),
    Seq: (_, node) => void (node.flow = true),
  });
  return `---\n${doc.toString({ lineWidth: 0 })}---\n\n${body.trim()}\n`;
}

/** Splits a doc into raw (unvalidated) frontmatter and body. */
export function parseDoc(text: string): { frontmatter: unknown; body: string } {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) throw new Error('missing YAML frontmatter');
  return { frontmatter: YAML.parse(match[1]), body: match[2].trim() };
}

/** add if no file; skip if on-disk content_hash matches; else update. Reads only. */
export async function planWrite(doc: DocDraft, knowledgeDir: string): Promise<WritePlan> {
  let existing: string;
  try {
    existing = await readFile(path.join(knowledgeDir, doc.relPath), 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { action: 'add', doc };
    throw err;
  }
  const { frontmatter } = parseDoc(existing);
  const hash = (frontmatter as { content_hash?: unknown } | null)?.content_hash;
  return { action: hash === doc.frontmatter.content_hash ? 'skip' : 'update', doc };
}

/** Writes add/update/redescribe plans with their description; skip leaves the existing file untouched. */
export async function commit(plan: WritePlan, knowledgeDir: string, description: Description): Promise<void> {
  if (plan.action === 'skip') return;
  const { doc } = plan;
  const frontmatter = {
    ...doc.frontmatter,
    description: description.text,
    ...(doc.frontmatter.type === 'Article' ? { description_by: description.by } : {}),
  } as OkfFrontmatter;
  const file = path.join(knowledgeDir, doc.relPath);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, serializeDoc(frontmatter, doc.body), 'utf8');
}

export interface ArticleBodyInput {
  reg: RegId;
  paragraphs: Paragraph[];
  chapter: { num: number; roman: string };
  recitals: number[];
  omnibusRecitals: number[];
  annexes: string[];
  externalAnnexes: string[];
  crossRefs: ArticleRef[];
}

/** `## <anchor>` section per paragraph. */
const anchoredText = (paragraphs: Paragraph[]) => paragraphs.flatMap((p) => [`## ${p.anchor}`, '', p.text, '']);

/** `# Text` with `## <anchor>` sections, then `# Related` bundle-relative links with prose. */
export function buildArticleBody(input: ArticleBodyInput): string {
  const { reg } = input;
  const text = anchoredText(input.paragraphs);
  const related = [
    `- Part of [Chapter ${input.chapter.roman}](${link(reg, 'chapters', chapterFileId(input.chapter.num))})`,
    ...input.recitals.map((n) => `- Interpreted by [Recital ${n}](${link(reg, 'recitals', recitalFileId(n))})`),
    ...input.omnibusRecitals.map(
      (n) => `- Interpreted by [Omnibus Recital ${n}](${link(reg, 'recitals', omnibusRecitalFileId(n))}) (draft)`,
    ),
    ...input.annexes.map((roman) => `- Refers to [Annex ${roman}](${link(reg, 'annexes', annexFileId(roman))})`),
    ...input.externalAnnexes.map((url) => `- Refers to external annex <${url}>`),
    ...input.crossRefs.map((n) => `- Refers to [Art. ${n}](${link(reg, 'articles', articleFileId(n))})`),
  ];
  return ['# Text', '', ...text, '# Related', '', ...related, ''].join('\n');
}

/** `# Articles` list for a chapter doc. */
export function buildChapterBody(reg: RegId, articles: { num: ArticleRef; title: string }[]): string {
  const lines = articles.map((a) => `- [${a.title}](${link(reg, 'articles', articleFileId(a.num))})`);
  return ['# Articles', '', ...lines, ''].join('\n');
}

/** `# Text` then `# Related` back-links to the articles that cite the recital. */
export function buildRecitalBody(reg: RegId, text: string, articles: ArticleRef[]): string {
  const related = articles.map((n) => `- Interprets [Art. ${n}](${link(reg, 'articles', articleFileId(n))})`);
  return ['# Text', '', text, '', '# Related', '', ...related, ''].join('\n');
}

/** `# Text` with `## <anchor>` sections, then `# Related` back-links to the articles that refer to the annex. */
export function buildAnnexBody(reg: RegId, paragraphs: Paragraph[], articles: ArticleRef[]): string {
  const related = articles.map((n) => `- Referred to by [Art. ${n}](${link(reg, 'articles', articleFileId(n))})`);
  return ['# Text', '', ...anchoredText(paragraphs), '# Related', '', ...related, ''].join('\n');
}
