import { articleList, chapterOf, compareArticleRefs, REGULATIONS, type ArticleRef } from '../config/chapterMap.js';
import { env } from '../config/env.js';
import type { Job } from '../jobs/jobStore.js';
import { annexFileId, articleFileId, chapterFileId, recitalFileId } from '../okf/ids.js';
import { romanToInt } from '../okf/roman.js';
import { isoWithOffset } from '../okf/time.js';
import { buildAnnexBody, buildArticleBody, buildChapterBody, buildRecitalBody, type DocDraft } from '../okf/writer.js';
import {
  extractAiActAnnex,
  extractAiActArticle,
  extractAiActRecital,
  extractAnnexRefs,
  extractCrossRefs,
  splitAnnexRefs,
  type AiActAnnex,
  type AiActArticle,
  type AiActRecital,
} from './extract.js';
import { createFetcher, draft, planAndCommit, Progress, runScrapeJob, SCRAPER, type ScrapeOptions } from './scrapeRun.js';

// EU AI Act as amended by Digital Omnibus Reg. (EU) 2026/1744: Ch. I–X incl. inserted articles, Annex I–X, recitals.

const REG = 'eu-ai-act';

/** Background job body: never throws; outcome is recorded on the job. */
export function runEuAiActScrape(job: Job, options: ScrapeOptions): Promise<void> {
  return runScrapeJob(job, options, scrape);
}

async function scrape(job: Job, options: ScrapeOptions): Promise<void> {
  const started = new Date();
  const generated = { by: SCRAPER, at: isoWithOffset(started) };
  const base = env.EU_AI_ACT_BASE_URL;
  const annexDefs = REGULATIONS[REG].annexes;
  const progress = new Progress(job, articleList(REG).length + annexDefs.length);
  const fetchPage = createFetcher();

  // 1. Articles, with annex refs (I–X files, others external) and cross-refs from their text.
  const articles: { url: string; data: AiActArticle; annexes: string[]; externalAnnexes: string[]; crossRefs: ArticleRef[] }[] = [];
  for (const ref of articleList(REG)) {
    const url = `${base}/article/${ref}/`;
    const data = await fetchPage(url, extractAiActArticle);
    if (data.ref !== ref) throw new Error(`${url}: expected Art. ${ref}, page shows Art. ${data.ref}`);
    const text = data.paragraphs.map((p) => p.text).join('\n');
    articles.push({
      url,
      data,
      ...splitAnnexRefs(extractAnnexRefs(text), REG, base),
      crossRefs: extractCrossRefs(text, REG, ref),
    });
    progress.tick();
  }

  // 2. Annexes I–X, written once; back-links = articles referring to them.
  const annexes: { url: string; data: AiActAnnex; title: string }[] = [];
  for (const def of annexDefs) {
    const url = `${base}/annex/${romanToInt(def.roman)}/`;
    const data = await fetchPage(url, extractAiActAnnex);
    if (data.roman !== def.roman) throw new Error(`${url}: expected Annex ${def.roman}, page shows Annex ${data.roman}`);
    annexes.push({ url, data, title: def.title });
    progress.tick();
  }

  // 3. Recitals linked from in-scope articles, each fetched once; back-links collected on the way.
  const recitalArticles = new Map<number, ArticleRef[]>();
  for (const { data } of articles) {
    for (const num of data.recitals) recitalArticles.set(num, [...(recitalArticles.get(num) ?? []), data.ref]);
  }
  const recitalNums = [...recitalArticles.keys()].sort((a, b) => a - b);
  progress.grow(recitalNums.length);
  const recitals: { url: string; data: AiActRecital }[] = [];
  for (const num of recitalNums) {
    const url = `${base}/recital/${num}/`;
    const data = await fetchPage(url, extractAiActRecital);
    if (data.number !== num) throw new Error(`${url}: expected Recital ${num}, page shows ${data.number}`);
    recitals.push({ url, data });
    progress.tick();
  }

  // 4. Drafts: chapters (from chapterMap), articles, annexes, recitals.
  const drafts: DocDraft[] = [
    ...REGULATIONS[REG].chapters.map((ch) => {
      const members = articles.filter((a) => chapterOf(REG, a.data.ref)?.num === ch.num);
      return draft(REG, 'chapters', chapterFileId(ch.num), `Chapter ${ch.roman}`, {
        type: 'Chapter',
        title: `Chapter ${ch.roman} — ${ch.title}`,
        resource: `${base}/chapter/${ch.num}/`,
        tags: [REG, `chapter-${ch.num}`],
        regulation: 'EU AI Act',
        chapter: ch.num,
        articles: members.map((a) => a.data.ref),
        content_hash: '',
        generated,
        status: 'stable',
      }, buildChapterBody(REG, members.map((a) => ({ num: a.data.ref, title: articleTitle(a.data) }))));
    }),
    ...articles.map(({ url, data, annexes: annexRefs, externalAnnexes, crossRefs }) => {
      const chapter = chapterOf(REG, data.ref)!;
      return draft(REG, 'articles', articleFileId(data.ref), `Art. ${data.ref}`, {
        type: 'Article',
        title: articleTitle(data),
        resource: url,
        tags: [REG, `chapter-${chapter.num}`],
        regulation: 'EU AI Act',
        chapter: chapter.num,
        article: data.ref,
        recitals: data.recitals,
        omnibus_recitals: [],
        annexes: annexRefs,
        external_annexes: externalAnnexes,
        cross_refs: crossRefs,
        anchors: data.paragraphs.map((p) => p.anchor),
        content_hash: '',
        sources: [{ id: 's1', resource: url }],
        generated,
        status: 'stable',
      }, buildArticleBody({
        reg: REG,
        paragraphs: data.paragraphs,
        chapter,
        recitals: data.recitals,
        omnibusRecitals: [],
        annexes: annexRefs,
        externalAnnexes,
        crossRefs,
      }));
    }),
    ...annexes.map(({ url, data, title }) => {
      const backLinks = articles
        .filter((a) => a.annexes.includes(data.roman))
        .map((a) => a.data.ref)
        .sort(compareArticleRefs);
      return draft(REG, 'annexes', annexFileId(data.roman), `Annex ${data.roman}`, {
        type: 'Annex',
        title: `Annex ${data.roman} — ${title}`,
        resource: url,
        tags: [REG, 'annex'],
        regulation: 'EU AI Act',
        annex: data.roman,
        articles: backLinks,
        anchors: data.paragraphs.map((p) => p.anchor),
        content_hash: '',
        generated,
        status: 'stable',
      }, buildAnnexBody(REG, data.paragraphs, backLinks));
    }),
    ...recitals.map(({ url, data }) => {
      const backLinks = [...new Set(recitalArticles.get(data.number))].sort(compareArticleRefs);
      return draft(REG, 'recitals', recitalFileId(data.number), `Recital ${data.number}`, {
        type: 'Recital',
        title: `Recital ${data.number} EU AI Act`,
        resource: url,
        tags: [REG, 'recital'],
        regulation: 'EU AI Act',
        recital: data.number,
        articles: backLinks,
        content_hash: '',
        generated,
        status: 'stable',
      }, buildRecitalBody(REG, data.text, backLinks));
    }),
  ];

  // 5. Plan against disk; unless dryRun, describe + commit, rebuild indexes, append logs.
  await planAndCommit({ job, reg: REG, drafts, options, started, progress });
}

function articleTitle(data: AiActArticle): string {
  return `Art. ${data.ref} EU AI Act — ${data.title}`;
}
