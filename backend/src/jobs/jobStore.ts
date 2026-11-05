import { randomUUID } from 'node:crypto';
import type { RegId } from '../config/chapterMap.js';
import { refreshKnowledge } from '../okf/loader.js';
import type { Usage } from '../usage.js';

// In-memory scrape jobs (lost on restart; re-running a scrape is idempotent).

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

/** Global ids, e.g. `gdpr:art-017`. */
export interface ScrapeResult {
  added: string[];
  updated: string[];
  skipped: string[];
  redescribed: string[];
}

export interface Job {
  id: string;
  reg: RegId;
  dryRun: boolean;
  status: JobStatus;
  progress: { done: number; total: number };
  result?: ScrapeResult;
  error?: string;
  /** Description model tokens + cost; `null` when no model call was made, absent before commit (and on dry runs). */
  usage?: Usage | null;
}

export class JobConflictError extends Error {
  constructor(reg: RegId) {
    super(`A scrape job for ${reg} is already running`);
    this.name = 'JobConflictError';
  }
}

const jobs = new Map<string, Job>();

const isActive = (job: Job) => job.status === 'queued' || job.status === 'running';

/** Throws JobConflictError if a job for `reg` is queued or running. */
export function createJob(reg: RegId, dryRun = false): Job {
  for (const job of jobs.values()) {
    if (job.reg === reg && isActive(job)) throw new JobConflictError(reg);
  }
  const job: Job = { id: randomUUID(), reg, dryRun, status: 'queued', progress: { done: 0, total: 0 } };
  jobs.set(job.id, job);
  return job;
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

/** Marks the job running and records progress. */
export function updateProgress(job: Job, done: number, total: number): void {
  job.status = 'running';
  job.progress = { done, total };
}

/** Reloads the in-memory knowledge so reads reflect the files just written; returns an error message on failure. */
async function reload(): Promise<string | undefined> {
  try {
    await refreshKnowledge();
  } catch (err) {
    return `reloading knowledge failed: ${err instanceof Error ? err.message : String(err)}`;
  }
}

/** Marks done; a non-dry run that changed files reloads knowledge first (failure → job failed). */
export async function finish(job: Job, result: ScrapeResult): Promise<void> {
  const changed = result.added.length + result.updated.length + result.redescribed.length > 0;
  const error = !job.dryRun && changed ? await reload() : undefined;
  job.status = error ? 'failed' : 'done';
  job.result = result;
  if (error) job.error = error;
}

/** Marks failed; `committed` = the run wrote files before failing, so knowledge is reloaded too. */
export async function fail(job: Job, error: string, committed = false): Promise<void> {
  const reloadError = committed ? await reload() : undefined;
  job.status = 'failed';
  job.error = reloadError ? `${error}; ${reloadError}` : error;
}
