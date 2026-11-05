import { useAuth } from '../app/auth';
import { PageHeader } from '../components/ui';

/** Read-only view of /api/config (Architecture.md §14.3). Settings change only in backend/.env. */
export function SettingsPage() {
  const { config } = useAuth();
  if (!config) return <div className="page-loading">Loading…</div>;
  const e = config.engines;
  return (
    <div className="page">
      <PageHeader title="Engines & models" subtitle="Read-only. Change these in backend/.env and restart the backend." />
      <div className="card-grid">
        <section className="panel">
          <h2>Decision engines</h2>
          <dl className="facts">
            {e.available.map((a) => (
              <div key={a.id}>
                <dt>{a.id === 'jev' ? 'Jev (TypeSafe)' : 'OpenAI Decisions'}</dt>
                <dd>
                  {a.model} <span className={`badge ${a.keyed ? 'tone-ok' : 'tone-neutral'}`}>{a.keyed ? 'key set' : 'no key'}</span>
                </dd>
              </div>
            ))}
            <div>
              <dt>Per stage</dt>
              <dd>
                route {e.stages.route} · select {e.stages.select} · review {e.stages.review} · eval {e.stages.eval}
              </dd>
            </div>
            <div>
              <dt>Per-run switch</dt>
              <dd>{e.uiSwitch ? 'On' : 'Off'}</dd>
            </div>
            <div>
              <dt>Retries · fallbacks</dt>
              <dd>
                {e.maxRetries} · {e.fallbacks.length ? e.fallbacks.join(' → ') : 'none'}
              </dd>
            </div>
          </dl>
        </section>
        <section className="panel">
          <h2>Generation</h2>
          <dl className="facts">
            {config.generation.providers.map((p) => (
              <div key={p.id}>
                <dt>{p.id}</dt>
                <dd>{p.models.join(', ')}</dd>
              </div>
            ))}
            <div>
              <dt>Retries · fallbacks</dt>
              <dd>
                {config.generation.maxRetries} · {config.generation.fallbacks.length ? config.generation.fallbacks.join(' → ') : 'none'}
              </dd>
            </div>
            <div>
              <dt>Pack budget · max scenarios</dt>
              <dd>
                {config.generation.packTokenBudget.toLocaleString()} tokens · {config.generation.scenarioMaxCount}
              </dd>
            </div>
            <div>
              <dt>Description model</dt>
              <dd>{config.description.model ?? 'template (no model)'}</dd>
            </div>
          </dl>
        </section>
        <section className="panel">
          <h2>Review & evaluation</h2>
          <dl className="facts">
            <div>
              <dt>Review threshold</dt>
              <dd>{config.review.threshold} / 100</dd>
            </div>
            <div>
              <dt>Add-context rounds</dt>
              <dd>{config.review.maxRounds}</dd>
            </div>
            <div>
              <dt>Evaluation</dt>
              <dd>{config.evaluation.enabled ? `On (${config.evaluation.engine})` : 'Off'}</dd>
            </div>
            {Object.entries(config.thresholds).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
