import { access, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { z } from 'zod';
import { REGULATIONS, type RegId } from '../config/chapterMap.js';
import { AnnexFrontmatter, ArticleFrontmatter, ChapterFrontmatter, RecitalFrontmatter } from '../schemas/okf.schema.js';
import type { DocFolder } from './ids.js';
import { romanToInt } from './roman.js';
import { parseDoc } from './writer.js';

interface IndexedDoc<T> {
  frontmatter: T;
  /** Bundle-relative link, e.g. `/gdpr/articles/art-017.md`. */
  href: string;
}

/** Reads + Zod-validates every `.md` in `<reg>/<folder>/`, sorted by file name. Missing folder → []. */
async function readFolder<S extends z.ZodType>(
  knowledgeDir: string,
  reg: RegId,
  folder: DocFolder,
  schema: S,
): Promise<IndexedDoc<z.infer<S>>[]> {
  const dir = path.join(knowledgeDir, reg, folder);
  let names: string[];
  try {
    names = (await readdir(dir)).filter((name) => name.endsWith('.md')).sort();
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  return Promise.all(
    names.map(async (name) => {
      const { frontmatter } = parseDoc(await readFile(path.join(dir, name), 'utf8'));
      const result = schema.safeParse(frontmatter);
      if (!result.success) throw new Error(`${reg}/${folder}/${name}: ${result.error.message}`);
      return { frontmatter: result.data, href: `/${reg}/${folder}/${name}` };
    }),
  );
}

/** "Art. 17 GDPR — Right to erasure" → "Art. 17 — Right to erasure". */
function shortArticleTitle(fm: ArticleFrontmatter): string {
  const rest = fm.title.split(' — ').slice(1).join(' — ');
  return rest ? `Art. ${fm.article} — ${rest}` : `Art. ${fm.article}`;
}

/** Rebuilds `<reg>/index.md` from files on disk, then the root `index.md`. */
export async function buildIndexes(knowledgeDir: string, reg: RegId): Promise<void> {
  const [chapters, articles, recitals, annexes] = await Promise.all([
    readFolder(knowledgeDir, reg, 'chapters', ChapterFrontmatter),
    readFolder(knowledgeDir, reg, 'articles', ArticleFrontmatter),
    readFolder(knowledgeDir, reg, 'recitals', RecitalFrontmatter),
    readFolder(knowledgeDir, reg, 'annexes', AnnexFrontmatter),
  ]);

  const out = [`# ${REGULATIONS[reg].name}`, ''];
  for (const chapter of chapters) {
    out.push(`## ${chapter.frontmatter.title}`, '');
    for (const article of articles.filter((a) => a.frontmatter.chapter === chapter.frontmatter.chapter)) {
      out.push(`- [${shortArticleTitle(article.frontmatter)}](${article.href}) — ${article.frontmatter.description}`);
    }
    out.push('');
  }
  if (recitals.length > 0) {
    out.push('## Recitals', '');
    for (const recital of recitals) {
      const { recital: num, status, description } = recital.frontmatter;
      const label = status === 'draft' ? `Omnibus Recital ${num} (draft)` : `Recital ${num}`;
      out.push(`- [${label}](${recital.href}) — ${description}`);
    }
    out.push('');
  }
  if (annexes.length > 0) {
    out.push('## Annexes', '');
    // File names sort annex-ix before annex-v; order by numeral value instead.
    annexes.sort((a, b) => romanToInt(a.frontmatter.annex) - romanToInt(b.frontmatter.annex));
    for (const annex of annexes) {
      out.push(`- [Annex ${annex.frontmatter.annex}](${annex.href}) — ${annex.frontmatter.description}`);
    }
    out.push('');
  }
  // The bundle folder may not exist yet if the first commit of a run failed.
  await mkdir(path.join(knowledgeDir, reg), { recursive: true });
  await writeFile(path.join(knowledgeDir, reg, 'index.md'), out.join('\n'), 'utf8');
  await buildRootIndex(knowledgeDir);
}

/** Root index lists only sub-bundles that exist on disk. */
async function buildRootIndex(knowledgeDir: string): Promise<void> {
  const present: RegId[] = [];
  for (const reg of Object.keys(REGULATIONS) as RegId[]) {
    try {
      await access(path.join(knowledgeDir, reg, 'index.md'));
      present.push(reg);
    } catch {
      // bundle not scraped yet
    }
  }
  const out = ['---', 'okf_version: "0.2"', '---', '', '# Clausario Knowledge', '', '## Regulations', ''];
  for (const reg of present) {
    out.push(`- [${REGULATIONS[reg].name}](/${reg}/index.md) — ${REGULATIONS[reg].summary}`);
  }
  out.push('');
  await writeFile(path.join(knowledgeDir, 'index.md'), out.join('\n'), 'utf8');
}
