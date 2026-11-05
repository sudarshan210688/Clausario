import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../app/auth';
import { ErrorBanner } from '../components/ErrorBanner';
import { fmtDate, PageHeader, Pager, regLabel, StatusPill } from '../components/ui';
import { usd } from '../components/Usage';
import { api } from '../services/api';
import type { RunRecord, RunsPage as RunsPageData, RunStatus } from '../types/api';

const FILTERS: (RunStatus | 'all')[] = ['all', 'running', 'awaiting_review', 'completed', 'needs_rework', 'not_applicable', 'failed'];
const FILTER_LABEL: Record<string, string> = {
  all: 'All',
  running: 'Running',
  awaiting_review: 'In review',
  completed: 'Completed',
  needs_rework: 'Rework',
  not_applicable: 'N/A',
  failed: 'Failed',
};

export function RunsTable({ runs, showOwner }: { runs: RunRecord[]; showOwner: boolean }) {
  return (
    <div className="table-wrap">
      <table className="data-table" data-testid="runs-table">
        <thead>
          <tr>
            <th>Story</th>
            <th>Status</th>
            <th>Regulations</th>
            <th className="num">Score</th>
            <th>Verdicts</th>
            <th className="num">Cost</th>
            {showOwner && <th>Owner</th>}
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id}>
              <td className="cell-title">
                <Link to={`/runs/${r.id}`}>{r.title}</Link>
              </td>
              <td>
                <StatusPill status={r.status} />
              </td>
              <td>{r.regulations.length ? r.regulations.map((g) => <span key={g} className={`reg-tag reg-${g}`}>{regLabel(g)}</span>) : <span className="muted">—</span>}</td>
              <td className="num">{r.score ?? '—'}</td>
              <td>
                {r.verdicts ? (
                  <span className="verdict-mini">
                    <span className="v-pass">{r.verdicts.pass}</span>/<span className="v-warn">{r.verdicts.warn}</span>/<span className="v-fail">{r.verdicts.fail}</span>
                  </span>
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td className="num">{usd(r.costUsd)}</td>
              {showOwner && <td>{r.ownerUsername}</td>}
              <td className="muted small nowrap">{fmtDate(r.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function RunsPage() {
  const { me, has } = useAuth();
  const [status, setStatus] = useState<RunStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RunsPageData>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      api.runs({ status: status === 'all' ? undefined : status, page, pageSize: 15 }).then(
        (d) => !cancelled && setData(d),
        (e) => !cancelled && setError(e),
      );
    void load();
    const timer = window.setInterval(load, 5000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [status, page]);

  return (
    <div className="page">
      <PageHeader
        title="Runs"
        subtitle={me?.user.role === 'Admin' ? 'Every run in Clausario.' : 'Your analyses. Open one to see its results.'}
        actions={
          has('analyze') && (
            <Link className="button primary" to="/analyze">
              ＋ New analysis
            </Link>
          )
        }
      />
      {error !== undefined && <ErrorBanner error={error} />}
      <section className="panel">
        <div className="segmented wrap" role="group" aria-label="Filter by status">
          {FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={status === f ? 'on' : undefined}
              onClick={() => {
                setStatus(f);
                setPage(1);
              }}
            >
              {FILTER_LABEL[f]}
            </button>
          ))}
        </div>
        {data && data.runs.length === 0 ? <div className="empty">No runs match this filter.</div> : <RunsTable runs={data?.runs ?? []} showOwner={me?.user.role === 'Admin'} />}
        {data && <Pager page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} />}
      </section>
    </div>
  );
}
