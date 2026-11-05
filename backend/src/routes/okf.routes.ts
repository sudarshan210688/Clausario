import { Router, type Request, type Response } from 'express';
import type { RegId } from '../config/chapterMap.js';
import { env } from '../config/env.js';
import { createJob, getJob, type Job } from '../jobs/jobStore.js';
import { compareDocs } from '../okf/graph.js';
import { articleFileId, globalId } from '../okf/ids.js';
import { getKnowledge, type LoadedDoc } from '../okf/loader.js';
import { readLog } from '../okf/logWriter.js';
import {
  ArticleParam,
  JobParam,
  RegParam,
  RegQuery,
  ScrapeRequest,
  type ArticleResponse,
  type ErrorResponse,
  type IndexResponse,
  type JobResponse,
  type LogResponse,
  type ScrapeAccepted,
} from '../schemas/api.schema.js';
import type { OkfFrontmatter } from '../schemas/okf.schema.js';
import { runEuAiActScrape } from '../scrapers/euAiAct.scraper.js';
import { runGdprScrape } from '../scrapers/gdpr.scraper.js';
import type { ScrapeOptions } from '../scrapers/scrapeRun.js';

const scrapers: Record<RegId, (job: Job, options: ScrapeOptions) => Promise<void>> = {
  gdpr: runGdprScrape,
  'eu-ai-act': runEuAiActScrape,
};

export const okfRouter = Router();

okfRouter.post('/scrape/:reg', (req: Request, res: Response<ScrapeAccepted>) => {
  const { reg } = RegParam.parse(req.params);
  const { dryRun = false, redescribe = false } = ScrapeRequest.parse(req.body ?? {});
  const job = createJob(reg, dryRun);
  // Runs in the background; outcome is recorded on the job.
  void scrapers[reg](job, { dryRun, redescribe });
  res.status(202).json({ jobId: job.id });
});

okfRouter.get('/jobs/:id', (req: Request, res: Response<JobResponse | ErrorResponse>) => {
  const { id } = JobParam.parse(req.params);
  const job = getJob(id);
  if (!job) {
    res.status(404).json({ error: `Job not found: ${id}` });
    return;
  }
  res.json(job);
});

okfRouter.get('/log', async (req: Request, res: Response<LogResponse>) => {
  const { reg, limit } = RegQuery.parse(req.query);
  res.json({ entries: await readLog(env.KNOWLEDGE_DIR, reg, limit) });
});

okfRouter.get('/:reg/index', (req: Request, res: Response<IndexResponse>) => {
  const { reg } = RegParam.parse(req.params);
  const graph = getKnowledge();
  const docs = [...graph.docs.values()].filter((doc) => doc.reg === reg).sort(compareDocs);
  const summary = (doc: LoadedDoc) => ({
    id: doc.id,
    title: doc.frontmatter.title,
    description: doc.frontmatter.description,
  });
  const ofType = (type: OkfFrontmatter['type']) => docs.filter((doc) => doc.frontmatter.type === type);
  const articles = ofType('Article');
  res.json({
    chapters: ofType('Chapter').map((chapter) => ({
      ...summary(chapter),
      articles: articles.filter((a) => graph.edges.get(a.id)?.chapter === chapter.id).map(summary),
    })),
    recitals: ofType('Recital').map(summary),
    annexes: ofType('Annex').map(summary),
  });
});

okfRouter.get('/:reg/articles/:num', (req: Request, res: Response<ArticleResponse | ErrorResponse>) => {
  const { reg, num } = ArticleParam.parse(req.params);
  const graph = getKnowledge();
  const id = globalId(reg, articleFileId(num));
  const doc = graph.docs.get(id);
  const edges = graph.edges.get(id);
  if (doc?.frontmatter.type !== 'Article' || !edges) {
    res.status(404).json({ error: `Article not found: ${id}` });
    return;
  }
  res.json({ frontmatter: doc.frontmatter, body: doc.body, edges });
});
