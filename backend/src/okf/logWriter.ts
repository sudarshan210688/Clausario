import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { RegId } from '../config/chapterMap.js';
import type { Usage } from '../usage.js';

/** A changed file, for per-file log lines. */
export interface LogDocRef {
  label: string;
  relPath: string;
}

export interface RunLog {
  reg: RegId;
  jobId: string;
  /** YYYY-MM-DD */
  date: string;
  added: LogDocRef[];
  updated: LogDocRef[];
  redescribed: LogDocRef[];
  skipped: number;
  /** Description model usage (Architecture.md §10.4); omitted from the log when null/absent. */
  usage?: Usage | null;
}

const DATE_HEADING = /^## (\d{4}-\d{2}-\d{2})\s*$/;

/** Log file text, or '' if it does not exist yet. */
async function readLogFile(file: string): Promise<string> {
  try {
    return await readFile(file, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    return '';
  }
}

/** `## <date>` groups → their non-empty lines, in file order. */
function parseLog(text: string): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  let current: string[] | undefined;
  for (const line of text.split(/\r?\n/)) {
    const heading = line.match(DATE_HEADING);
    if (heading) {
      current = groups.get(heading[1]) ?? [];
      groups.set(heading[1], current);
    } else if (current && line.trim()) {
      current.push(line);
    }
  }
  return groups;
}

/** Inserts lines at the top of the `## <date>` group; groups sorted newest first. */
export async function appendLog(file: string, date: string, lines: string[]): Promise<void> {
  if (lines.length === 0) return;
  const groups = parseLog(await readLogFile(file));
  groups.set(date, [...lines, ...(groups.get(date) ?? [])]);

  const out = ['# Log', ''];
  for (const day of [...groups.keys()].sort().reverse()) {
    out.push(`## ${day}`, '', ...groups.get(day)!, '');
  }
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, out.join('\n'), 'utf8');
}

/** Per-file events → `<reg>/log.md`; run summary → root `log.md`. */
export async function appendRunLogs(knowledgeDir: string, run: RunLog): Promise<void> {
  const linkTo = (doc: LogDocRef) => `[${doc.label}](/${doc.relPath})`;
  const events = [
    ...run.added.map((doc) => `- added ${linkTo(doc)}`),
    ...run.updated.map((doc) => `- updated ${linkTo(doc)} — hash changed`),
    ...run.redescribed.map((doc) => `- redescribed ${linkTo(doc)}`),
    ...(run.skipped > 0 ? [`- skipped ${run.skipped} unchanged`] : []),
  ];
  await appendLog(path.join(knowledgeDir, run.reg, 'log.md'), run.date, events);

  const redescribed = run.redescribed.length > 0 ? `, redescribed ${run.redescribed.length}` : '';
  const cost = run.usage
    ? `, description tokens ${run.usage.totalTokens}, cost ${run.usage.costUsd === null ? 'n/a' : `$${run.usage.costUsd.toFixed(6)}`}`
    : '';
  const summary = `- scrape ${run.reg} (job ${run.jobId.slice(0, 8)}): added ${run.added.length}, updated ${run.updated.length}, skipped ${run.skipped}${redescribed}${cost}`;
  await appendLog(path.join(knowledgeDir, 'log.md'), run.date, [summary]);
}

export interface LogEntry {
  /** YYYY-MM-DD */
  date: string;
  /** Log line without the `- ` list marker. */
  line: string;
}

/** Newest `limit` entries of `<reg>/log.md`, or of the root `log.md` when `reg` is absent. Missing log → []. */
export async function readLog(knowledgeDir: string, reg: RegId | undefined, limit: number): Promise<LogEntry[]> {
  const file = reg ? path.join(knowledgeDir, reg, 'log.md') : path.join(knowledgeDir, 'log.md');
  const groups = parseLog(await readLogFile(file));
  return [...groups.keys()]
    .sort()
    .reverse()
    .flatMap((date) => groups.get(date)!.map((line) => ({ date, line: line.replace(/^- /, '') })))
    .slice(0, limit);
}
