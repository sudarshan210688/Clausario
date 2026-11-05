import { useCallback, useEffect, useRef, useState } from 'react';
import { LEGAL } from '../components/Brand';
import { ErrorBanner } from '../components/ErrorBanner';
import { Tabs } from '../components/ui';
import { UsageChip } from '../components/Usage';
import { api } from '../services/api';
import type { IndexResponse, JobResponse, LogResponse, RegId, ScrapeResult } from '../types/api';

const POLL_MS = 2000;
const LOG_LIMIT = 30;

const REGS: { id: RegId; name: string; source: string; scope: string }[] = [
  {
    id: 'gdpr',
    name: 'GDPR',
    source: 'gdpr-info.eu',
    scope: 'Chapters I–X · Art. 1–93 · linked recitals',
  },
  {
    id: 'eu-ai-act',
    name: 'EU AI Act',
    source: 'artificialintelligenceact.eu',
    scope: 'Chapters I–X · Annex I–X · consolidated with the Digital Omnibus',
  },
];

const isFinal = (job: JobResponse) => job.status === 'done' || job.status === 'failed';

interface BundleStats {
  chapters: number;
  articles: number;
  recitals: number;
  annexes: number;
}

const toStats = (index: IndexResponse): BundleStats => ({
  chapters: index.chapters.length,
  articles: index.chapters.reduce((n, ch) => n + ch.articles.length, 0),
  recitals: index.recitals.length,
  annexes: index.annexes.length,
});

function ResultLists({ result, dryRun }: { result: ScrapeResult; dryRun: boolean }) {
  const groups: { key: keyof ScrapeResult; label: string; tone: string }[] = [
    { key: 'added', label: dryRun ? 'Would add' : 'Added', tone: 'tone-ok' },
    { key: 'updated', label: dryRun ? 'Would update' : 'Updated', tone: 'tone-info' },
    { key: 'redescribed', label: dryRun ? 'Would redescribe' : 'Redescribed', tone: 'tone-info' },
    { key: 'skipped', label: 'Unchanged', tone: 'tone-neutral' },
  ];
  return (
    <div className="stack tight">
      <div className="result-tiles">
        {groups.map(({ key, label, tone }) => (
          <div key={key} className={`result-tile ${tone}`}>
            <strong>{result[key].length}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      {groups
        .filter(({ key }) => key !== 'skipped' && result[key].length > 0)
        .map(({ key, label }) => (
          <details key={key} className="disclosure">
            <summary>
              {label} ({result[key].length})
            </summary>
            <p className="id-list">{result[key].join(', ')}</p>
          </details>
        ))}
    </div>
  );
}

function ScrapePanel({
  reg,
  name,
  source,
  scope,
  stats,
  onFinished,
}: {
  reg: RegId;
  name: string;
  source: string;
  scope: string;
  stats?: BundleStats;
  onFinished: () => void;
}) {
  const [redescribe, setRedescribe] = useState(false);
  const [jobId, setJobId] = useState<string>();
  const [job, setJob] = useState<JobResponse>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();

  // Latest callback without restarting the poll loop when the parent re-renders.
  const onFinishedRef = useRef(onFinished);
  useEffect(() => {
    onFinishedRef.current = onFinished;
  });

  async function start(dryRun: boolean) {
    setError(undefined);
    setBusy(true);
    try {
      const { jobId } = await api.scrape(reg, { dryRun, redescribe });
      setJob(undefined);
      setJobId(jobId);
    } catch (err) {
      setError(err);
      setBusy(false);
    }
  }

  // Poll the job at a fixed interval until it is done or failed.
  useEffect(() => {
    if (!jobId) return;
    let cancelled = false;
    let timer: number | undefined;
    const tick = async () => {
      try {
        const next = await api.job(jobId);
        if (cancelled) return;
        setJob(next);
        if (isFinal(next)) {
          setBusy(false);
          onFinishedRef.current();
          return;
        }
      } catch (err) {
        if (cancelled) return;
        setError(err);
        setBusy(false);
        return;
      }
      timer = window.setTimeout(tick, POLL_MS);
    };
    void tick();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [jobId]);

  const pct = job && job.progress.total > 0 ? Math.round((job.progress.done / job.progress.total) * 100) : 0;

  return (
    <section className="panel bundle">
      <header className="panel-head">
        <div>
          <h2>{name}</h2>
          <p className="muted small">
            Source <code>{source}</code> · {scope}
          </p>
          <p className="muted small" data-testid={`credit-${reg}`}>
            Text from{' '}
            <a href={LEGAL.sources[reg].siteUrl} target="_blank" rel="noopener noreferrer">
              {LEGAL.sources[reg].site}
            </a>{' '}
            · Official text © European Union,{' '}
            <a href={LEGAL.sources[reg].official} target="_blank" rel="noopener noreferrer">
              EUR-Lex
            </a>
          </p>
        </div>
        <span className={`badge ${stats && stats.articles > 0 ? 'tone-ok' : 'tone-neutral'}`}>
          {stats && stats.articles > 0 ? 'Loaded' : 'Empty'}
        </span>
      </header>

      <div className="bundle-stats">
        {(['chapters', 'articles', 'recitals', 'annexes'] as const).map((k) => (
          <div key={k}>
            <strong>{stats ? stats[k] : '–'}</strong>
            <span>{k}</span>
          </div>
        ))}
      </div>

      <div className="row">
        <button type="button" disabled={busy} onClick={() => start(true)} title="Fetch and diff, write nothing">
          Preview changes
        </button>
        <button type="button" className="primary" disabled={busy} onClick={() => start(false)}>
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
        <label className="check small">
          <input type="checkbox" checked={redescribe} onChange={(e) => setRedescribe(e.target.checked)} />
          Also rewrite descriptions of unchanged docs
        </label>
      </div>

      {error !== undefined && <ErrorBanner error={error} onDismiss={() => setError(undefined)} />}

      {job && (
        <div className="job">
          <div className="row spread">
            <span>
              {job.dryRun ? 'Preview' : 'Sync'} <span className={`badge job-${job.status}`}>{job.status}</span>
            </span>
            <span className="muted small">
              {job.progress.done}/{job.progress.total} requests · job {job.id.slice(0, 8)}
              {job.usage && (
                <>
                  {' · description '}
                  <UsageChip usage={job.usage} />
                </>
              )}
            </span>
          </div>
          {!isFinal(job) && (
            <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${pct}%` }} />
            </div>
          )}
          {job.error && <ErrorBanner error={new Error(job.error)} />}
          {job.result && <ResultLists result={job.result} dryRun={job.dryRun} />}
        </div>
      )}
    </section>
  );
}

export function KnowledgePage() {
  const [logReg, setLogReg] = useState<RegId | ''>('');
  const [log, setLog] = useState<LogResponse>();
  const [logError, setLogError] = useState<unknown>();
  const [stats, setStats] = useState<Partial<Record<RegId, BundleStats>>>({});
  const [tab, setTab] = useState<string>('gdpr');

  const loadLog = useCallback(async () => {
    setLogError(undefined);
    try {
      setLog(await api.log({ reg: logReg || undefined, limit: LOG_LIMIT }));
    } catch (err) {
      setLogError(err);
    }
  }, [logReg]);

  const loadStats = useCallback(async () => {
    const entries = await Promise.all(
      REGS.map(async (r) => [r.id, await api.index(r.id).then(toStats).catch(() => undefined)] as const),
    );
    setStats(Object.fromEntries(entries.filter(([, s]) => s)));
  }, []);

  useEffect(() => {
    void loadLog();
  }, [loadLog]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  const onFinished = useCallback(() => {
    void loadLog();
    void loadStats();
  }, [loadLog, loadStats]);

  // The backend reloads when KNOWLEDGE_DIR changes on disk; pick that up when the user comes back to the page.
  useEffect(() => {
    window.addEventListener('focus', onFinished);
    return () => window.removeEventListener('focus', onFinished);
  }, [onFinished]);

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>Knowledge base</h1>
          <p className="muted">Regulation text behind every scenario. Sync rewrites only changed articles.</p>
        </div>
      </header>

      <Tabs
        tabs={[...REGS.map((r) => ({ id: r.id, label: r.name, badge: stats[r.id]?.articles })), { id: 'log', label: 'Activity log' }]}
        active={tab}
        onChange={setTab}
      />
      {/* Panels stay mounted so a running job keeps polling while another tab is open. */}
      {REGS.map((r) => (
        <div key={r.id} hidden={tab !== r.id}>
          <ScrapePanel reg={r.id} name={r.name} source={r.source} scope={r.scope} stats={stats[r.id]} onFinished={onFinished} />
        </div>
      ))}

      <section className="panel" hidden={tab !== 'log'}>
        <header className="panel-head">
          <div>
            <h2>Activity log</h2>
            <p className="muted small">Newest first, last {LOG_LIMIT} entries.</p>
          </div>
          <div className="row">
            <select value={logReg} onChange={(e) => setLogReg(e.target.value as RegId | '')} aria-label="Log source">
              <option value="">All runs</option>
              {REGS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </select>
            <button type="button" className="ghost" onClick={onFinished} title="Reload counts and log">
              ↻ Refresh
            </button>
          </div>
        </header>
        {logError !== undefined && <ErrorBanner error={logError} />}
        {log && log.entries.length === 0 && <div className="empty">No activity yet.</div>}
        {log && log.entries.length > 0 && (
          <ul className="timeline">
            {log.entries.map((entry, i) => (
              <li key={i}>
                <span className="timeline-date">{entry.date}</span>
                <span className="timeline-line">{entry.line}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
