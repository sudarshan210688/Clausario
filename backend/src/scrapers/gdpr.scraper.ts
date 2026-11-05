import { articleList, chapterOf, REGULATIONS } from '../config/chapterMap.js';
import { env } from '../config/env.js';
import type { Job } from '../jobs/jobStore.js';
import { articleFileId, chapterFileId, omnibusRecitalFileId, recitalFileId } from '../okf/ids.js';
import { isoWithOffset } from '../okf/time.js';
import { buildArticleBody, buildChapterBody, buildRecitalBody, type DocDraft } from '../okf/writer.js';
import { extractCrossRefs, extractGdprArticle, extractGdprRecital, type GdprArticle, type GdprRecital } from './extract.js';
import { createFetcher, draft, planAndCommit, Progress, runScrapeJob, SCRAPER, type ScrapeOptions } from './scrapeRun.js';

const REG = 'gdpr';

/** Background job body: never throws; outcome is recorded on the job. */
export function runGdprScrape(job: Job, options: ScrapeOptions): Promise<void> {
  return runScrapeJob(job, options, scrape);
}

async function scrape(job: Job, options: ScrapeOptions): Promise<void> {
  const started = new Date();
  const generated = { by: SCRAPER, at: isoWithOffset(started) };
  const base = env.GDPR_BASE_URL;
  const progress = new Progress(job, articleList(REG).length);
  const fetchPage = createFetcher();

  // 1. Articles
  const articles: { url: string; data: GdprArticle }[] = [];
  for (const num of articleList(REG)) {
    const url = `${base}/art-${num}-gdpr/`;
    const data = await fetchPage(url, extractGdprArticle);
    if (data.number !== num) throw new Error(`${url}: expected Art. ${num}, page shows Art. ${data.number}`);
    articles.push({ url, data });
    progress.tick();
  }

  // 2. Recitals linked from in-scope articles, each fetched once; back-links collected on the way.
  const recitalUrls = new Map<string, { num: number; url: string; omnibus: boolean; articles: number[] }>();
  for (const { data } of articles) {
    for (const [links, omnibus] of [[data.recitals, false], [data.omnibusRecitals, true]] as const) {
      for (const link of links) {
        const key = `${omnibus ? 'o' : 'r'}${link.num}`;
        const entry = recitalUrls.get(key) ?? { ...link, omnibus, articles: [] };
        entry.articles.push(data.number);
        recitalUrls.set(key, entry);
      }
    }
  }
  const recitalRefs = [...recitalUrls.values()].sort((a, b) => Number(a.omnibus) - Number(b.omnibus) || a.num - b.num);
  progress.grow(recitalRefs.length);
  const recitals: { ref: (typeof recitalRefs)[number]; data: GdprRecital }[] = [];
  for (const ref of recitalRefs) {
    const data = await fetchPage(ref.url, extractGdprRecital);
    if (data.number !== ref.num) throw new Error(`${ref.url}: expected Recital ${ref.num}, page shows ${data.number}`);
    recitals.push({ ref, data });
    progress.tick();
  }

  // 3. Drafts: chapters (from chapterMap), articles, recitals.
  const drafts: DocDraft[] = [
    ...REGULATIONS[REG].chapters.map((ch) => {
      const members = articles.filter((a) => a.data.number >= ch.from && a.data.number <= ch.to);
      return draft(REG, 'chapters', chapterFileId(ch.num), `Chapter ${ch.roman}`, {
        type: 'Chapter',
        title: `Chapter ${ch.roman} — ${ch.title}`,
        resource: `${base}/chapter-${ch.num}/`,
        tags: [REG, `chapter-${ch.num}`],
        regulation: 'GDPR',
        chapter: ch.num,
        articles: members.map((a) => a.data.number),
        content_hash: '',
        generated,
        status: 'stable',
      }, buildChapterBody(REG, members.map((a) => ({ num: a.data.number, title: articleTitle(a.data) }))));
    }),
    ...articles.map(({ url, data }) => {
      const chapter = chapterOf(REG, data.number)!;
      const crossRefs = extractCrossRefs(data.paragraphs.map((p) => p.text).join('\n'), REG, data.number);
      const recitalNums = data.recitals.map((r) => r.num);
      const omnibusNums = data.omnibusRecitals.map((r) => r.num);
      return draft(REG, 'articles', articleFileId(data.number), `Art. ${data.number}`, {
        type: 'Article',
        title: articleTitle(data),
        resource: url,
        tags: [REG, `chapter-${chapter.num}`],
        regulation: 'GDPR',
        chapter: chapter.num,
        article: data.number,
        recitals: recitalNums,
        omnibus_recitals: omnibusNums,
        annexes: [],
        external_annexes: [],
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
        recitals: recitalNums,
        omnibusRecitals: omnibusNums,
        annexes: [],
        externalAnnexes: [],
        crossRefs,
      }));
    }),
    ...recitals.map(({ ref, data }) => {
      const fileId = ref.omnibus ? omnibusRecitalFileId(ref.num) : recitalFileId(ref.num);
      const label = ref.omnibus ? `Omnibus Recital ${ref.num}` : `Recital ${ref.num}`;
      const backLinks = [...new Set(ref.articles)].sort((a, b) => a - b);
      return draft(REG, 'recitals', fileId, label, {
        type: 'Recital',
        title: `${label} GDPR — ${data.title}`,
        resource: ref.url,
        tags: ref.omnibus ? [REG, 'recital', 'omnibus'] : [REG, 'recital'],
        regulation: 'GDPR',
        recital: ref.num,
        articles: backLinks,
        content_hash: '',
        generated,
        status: ref.omnibus ? 'draft' : 'stable',
      }, buildRecitalBody(REG, data.text, backLinks));
    }),
  ];

  // 4–5. Plan against disk; unless dryRun, describe + commit, rebuild indexes, append logs.
  await planAndCommit({ job, reg: REG, drafts, options, started, progress });
}

function articleTitle(data: GdprArticle): string {
  return `Art. ${data.number} GDPR — ${data.title}`;
}
