import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../app/auth';
import { ErrorBanner } from '../components/ErrorBanner';
import { Kpi, PageHeader } from '../components/ui';
import { usd } from '../components/Usage';
import { api } from '../services/api';
import type { DashboardResponse } from '../types/api';
import { RunsTable } from './RunsPage';

export function OverviewPage() {
  const { me, has } = useAuth();
  const [data, setData] = useState<DashboardResponse>();
  const [error, setError] = useState<unknown>();

  useEffect(() => {
    api.dashboard().then(setData, setError);
  }, []);

  return (
    <div className="page">
      <PageHeader
        title={`Welcome, ${me?.user.username ?? ''}`}
        subtitle={data?.scope === 'all' ? 'All runs across Clausario.' : 'Your runs at a glance.'}
        actions={
          has('analyze') && (
            <Link className="button primary" to="/analyze">
              ＋ New analysis
            </Link>
          )
        }
      />
      {error !== undefined && <ErrorBanner error={error} />}
      <div className="kpi-row">
        <Kpi label="Running" value={data?.byStatus.running ?? '–'} tone="info" />
        <Kpi label="Awaiting review" value={data?.awaitingReview ?? '–'} tone="warn" />
        <Kpi label="Completed" value={data?.byStatus.completed ?? '–'} tone="ok" />
        <Kpi label="Failed" value={data?.byStatus.failed ?? '–'} tone="bad" />
        <Kpi label="Total cost" value={data ? usd(data.costUsd) : '–'} />
      </div>
      <section className="panel">
        <header className="panel-head">
          <h2>Recent runs</h2>
          {has('runs') && (
            <Link to="/runs" className="small">
              View all →
            </Link>
          )}
        </header>
        {data && data.recent.length === 0 ? (
          <div className="empty">No runs yet. Start with New analysis.</div>
        ) : (
          <RunsTable runs={data?.recent ?? []} showOwner={data?.scope === 'all'} />
        )}
      </section>
    </div>
  );
}
