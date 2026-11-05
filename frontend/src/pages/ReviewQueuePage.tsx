import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ErrorBanner } from '../components/ErrorBanner';
import { fmtDate, PageHeader, regLabel } from '../components/ui';
import { api } from '../services/api';
import type { RunRecord } from '../types/api';

export function ReviewQueuePage() {
  const [runs, setRuns] = useState<RunRecord[]>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    let cancelled = false;
    const load = () => api.reviewQueue().then((q) => !cancelled && setRuns(q.runs), (e) => !cancelled && setError(e));
    void load();
    const timer = window.setInterval(load, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div className="page">
      <PageHeader title="Review queue" subtitle="Runs whose review score is below the threshold. Approve, override the articles, add context, or reject." />
      {error !== undefined && <ErrorBanner error={error} />}
      <section className="panel">
        {runs && runs.length === 0 ? (
          <div className="empty">Nothing to review. 🎉</div>
        ) : (
          <div className="table-wrap">
            <table className="data-table" data-testid="review-table">
              <thead>
                <tr>
                  <th>Story</th>
                  <th className="num">Score</th>
                  <th>Regulations</th>
                  <th className="num">Round</th>
                  <th>Owner</th>
                  <th>Waiting since</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(runs ?? []).map((r) => (
                  <tr key={r.id}>
                    <td className="cell-title">{r.title}</td>
                    <td className="num">
                      <strong className="warn">{r.score ?? '—'}</strong>
                    </td>
                    <td>{r.regulations.length ? r.regulations.map((g) => <span key={g} className={`reg-tag reg-${g}`}>{regLabel(g)}</span>) : <span className="muted">none</span>}</td>
                    <td className="num">{r.rounds + 1}</td>
                    <td>{r.ownerUsername}</td>
                    <td className="muted small nowrap">{fmtDate(r.updatedAt)}</td>
                    <td>
                      <Link className="button small primary" to={`/runs/${r.id}?tab=review`}>
                        Review
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
