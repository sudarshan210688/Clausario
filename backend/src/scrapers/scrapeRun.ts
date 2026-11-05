import { setTimeout as sleep } from 'node:timers/promises';
import { CheerioWebBaseLoader } from '@langchain/community/document_loaders/web/cheerio';
import type { CheerioAPI } from 'cheerio';
import { chapterOf, REGULATIONS, type RegId } from '../config/chapterMap.js';
import { env } from '../config/env.js';
import { fail, finish, updateProgress, type Job } from '../jobs/jobStore.js';
import { contentHash, hashInputOf } from '../okf/hash.js';
import { globalId, relPath, type DocFolder } from '../okf/ids.js';
import { buildIndexes } from '../okf/indexBuilder.js';
import { appendRunLogs, type LogDocRef } from '../okf/logWriter.js';
import { localDate } from '../okf/time.js';
import { commit, planWrite, type DocDraft, type DraftFrontmatter, type WritePlan } from '../okf/writer.js';
import { UsageMeter } from '../usage.js';
import { describe, descriptionSource } from './describe.js';

// Steps shared by the per-regulation scrapers: job wrapper, progress, polite fetching, drafts, plan + commit.

export const SCRAPER = 'clausario-scraper/0.1';
const FETCH_TIMEOUT_MS = 30_000;

export interface ScrapeOptions {
  dryRun: boolean;
  /** Also rewrite descriptions of unchanged docs. */
  redescribe: boolean;
}

/** Background job body: never throws; outcome is recorded on the job. */
export async function runScrapeJob(
  job: Job,
  options: ScrapeOptions,
  scrape: (job: Job, options: ScrapeOptions) => Promise<void>,
): Promise<void> {
  try {
    // Fail fast before minutes of fetching if descriptions cannot be generated (model set, key missing).
    if (!options.dryRun) descriptionSource();
    await scrape(job, options);
  } catch (err) {
    await fail(job, message(err));
  }
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** Job progress; `total` grows as later stages discover work. */
export class Progress {
  private done = 0;

  constructor(
    private readonly job: Job,
    private total: number,
  ) {
    updateProgress(job, 0, total);
  }

  grow(n: number): void {
    this.total += n;
    updateProgress(this.job, this.done, this.total);
  }

  tick(): void {
    updateProgress(this.job, ++this.done, this.total);
  }
}

/** Sequential fetch + extract with SCRAPE_DELAY_MS between requests; errors are prefixed with the URL. */
export function createFetcher(): <T>(url: string, extract: ($: CheerioAPI) => T) => Promise<T> {
  let fetched = 0;
  return async (url, extract) => {
    if (fetched++ > 0) await sleep(env.SCRAPE_DELAY_MS);
    try {
      return extract(await new CheerioWebBaseLoader(url, { timeout: FETCH_TIMEOUT_MS }).scrape());
    } catch (err) {
      throw new Error(`${url}: ${err instanceof Error ? err.message : String(err)}`);
    }
  };
}

/** Assembles a DocDraft and fills `content_hash` from the final body + edges. */
export function draft(
  reg: RegId,
  folder: DocFolder,
  fileId: string,
  label: string,
  frontmatter: DraftFrontmatter,
  body: string,
): DocDraft {
  frontmatter.content_hash = contentHash(hashInputOf(frontmatter, body));
  return { id: globalId(reg, fileId), relPath: relPath(reg, folder, fileId), label, frontmatter, body };
}

export interface CommitRun {
  job: Job;
  reg: RegId;
  drafts: DocDraft[];
  options: ScrapeOptions;
  started: Date;
  progress: Progress;
}

/**
 * Plans drafts against disk. dryRun stops there (no writes, no LLM). Otherwise describes + writes
 * add/update/redescribe docs; indexes and logs reflect whatever was committed, even on failure.
 */
export async function planAndCommit({ job, reg, drafts, options, started, progress }: CommitRun): Promise<void> {
  const plans = (await Promise.all(drafts.map((doc) => planWrite(doc, env.KNOWLEDGE_DIR)))).map(
    (plan): WritePlan => (options.redescribe && plan.action === 'skip' ? { ...plan, action: 'redescribe' } : plan),
  );
  const idsFor = (action: WritePlan['action']) => plans.filter((p) => p.action === action).map((p) => p.doc.id);
  const result = {
    added: idsFor('add'),
    updated: idsFor('update'),
    skipped: idsFor('skip'),
    redescribed: idsFor('redescribe'),
  };
  if (options.dryRun) {
    await finish(job, result);
    return;
  }

  const changed = plans.filter((p) => p.action !== 'skip');
  progress.grow(changed.length);
  const committed: Record<'add' | 'update' | 'redescribe', LogDocRef[]> = { add: [], update: [], redescribe: [] };
  const meter = new UsageMeter();
  let failure: unknown;
  try {
    for (const plan of changed) {
      const { doc } = plan;
      const fm = doc.frontmatter;
      const { description, tokens } = await describe({
        regulation: REGULATIONS[reg].name,
        kind: fm.type,
        title: fm.title,
        body: doc.body,
        chapterTitle: fm.type === 'Article' ? chapterOf(reg, fm.article)?.title : undefined,
      });
      meter.add(tokens);
      await commit(plan, env.KNOWLEDGE_DIR, description);
      committed[plan.action as keyof typeof committed].push({ label: doc.label, relPath: doc.relPath });
      progress.tick();
    }
  } catch (err) {
    failure = err; // reported after indexes + logs, so a cleanup error cannot hide it
  }
  // Description token count + cost (Architecture.md §10.4); null when only templates were used.
  job.usage = meter.usage(env.DESCRIPTION_MODEL ?? 'template');
  await buildIndexes(env.KNOWLEDGE_DIR, reg);
  await appendRunLogs(env.KNOWLEDGE_DIR, {
    reg,
    jobId: job.id,
    date: localDate(started),
    added: committed.add,
    updated: committed.update,
    redescribed: committed.redescribe,
    skipped: result.skipped.length,
    usage: job.usage,
  });
  if (failure) {
    const written = committed.add.length + committed.update.length + committed.redescribe.length;
    await fail(job, message(failure), written > 0);
    return;
  }
  await finish(job, result);
}
