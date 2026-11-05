import { useCallback, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../app/auth';
import { ErrorBanner } from '../components/ErrorBanner';
import { Meter } from '../components/Meter';
import { PackManifestView } from '../components/PackManifestView';
import { ReviewPanel } from '../components/ReviewPanel';
import { EvaluationSummary, ScenarioCards } from '../components/ScenarioCards';
import { fmtDate, regLabel, ScoreGauge, StatusPill, StepTracker, Tabs, type TabDef } from '../components/ui';
import { totals, usd, UsagePanel } from '../components/Usage';
import { downloadCsv, downloadJson } from '../services/download';
import { api } from '../services/api';
import type { RunDetail } from '../types/api';

// Run detail (Architecture.md §14.3): header with status, step tracker, score gauge and actions; results in tabs.

const POLL_MS = 2000;
const CHOICE_LABEL: Record<string, string> = { gdpr: 'GDPR', 'eu-ai-act': 'EU AI Act', both: 'Both', none: 'None' };
const ACTION_LABEL = { approve: 'Approved', override: 'Overrode', context: 'Added context', reject: 'Rejected' } as const;

export function RunDetailPage() {
  const { id = '' } = useParams();
  const { config } = useAuth();
  const [params, setParams] = useSearchParams();
  const [detail, setDetail] = useState<RunDetail>();
  const [error, setError] = useState<unknown>();
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setDetail(await api.run(id));
      setError(undefined);
    } catch (err) {
      setError(err);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const running = detail?.run.status === 'running';
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(load, POLL_MS);
    return () => window.clearInterval(timer);
  }, [running, load]);

  if (error !== undefined && !detail) return <div className="page"><ErrorBanner error={error} /></div>;
  if (!detail) return <div className="page-loading">Loading run…</div>;

  const { run, state, canReview } = detail;
  const threshold = state?.review?.threshold ?? config?.review.threshold ?? 70;
  const maxRounds = config?.review.maxRounds ?? 3;
  const evaluate = state?.options.evaluate ?? true;
  const gen = state?.generation ?? null;
  const evaluation = state?.evaluation ?? null;

  const tabs: TabDef[] = [
    { id: 'summary', label: 'Summary' },
    { id: 'classification', label: 'Classification', disabled: !state?.route },
    { id: 'articles', label: 'Articles', badge: state?.articleIds.length || undefined, disabled: !state?.route },
    { id: 'review', label: 'Review', badge: run.status === 'awaiting_review' ? '!' : undefined, disabled: !state?.review },
    { id: 'scenarios', label: 'Scenarios', badge: gen?.scenarios.length, disabled: !gen },
    ...(evaluate ? [{ id: 'evaluation', label: 'Evaluation', disabled: !evaluation }] : []),
    { id: 'pack', label: 'Context pack', disabled: !gen },
    { id: 'cost', label: 'Cost', badge: state ? usd(totals(state.usage).costUsd) : undefined },
  ];
  const fallbackTab = run.status === 'awaiting_review' ? 'review' : gen ? 'scenarios' : 'summary';
  const requested = params.get('tab');
  const active = tabs.find((t) => t.id === requested && !t.disabled)?.id ?? fallbackTab;
  const setTab = (tab: string) => setParams({ tab }, { replace: true });

  const exportInput = state && gen ? { story: state.story, articleIds: state.articleIds, scenarios: gen.scenarios, evaluation: evaluation ?? undefined, usage: state.usage } : null;

  async function retry() {
    setBusy(true);
    try {
      await api.retryRun(run.id);
      await load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page run-page">
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link to="/runs">Runs</Link> <span aria-hidden="true">/</span> <span>{run.id.slice(0, 8)}</span>
      </nav>
      <header className="run-head panel">
        <div className="run-head-main">
          <div className="row tight">
            <StatusPill status={run.status} />
            {run.regulations.map((g) => (
              <span key={g} className={`reg-tag reg-${g}`}>
                {regLabel(g)}
              </span>
            ))}
            <span className="muted small">
              {run.ownerUsername} · {fmtDate(run.createdAt)}
            </span>
          </div>
          <h1 className="run-title" title={state?.story}>
            {state?.story ?? run.title}
          </h1>
          <StepTracker run={run} evaluate={evaluate} />
        </div>
        <div className="run-head-side">
          <ScoreGauge score={run.score} threshold={threshold} />
          <div className="row end">
            {run.status === 'failed' && (
              <button type="button" className="primary small" onClick={retry} disabled={busy}>
                ↻ Retry
              </button>
            )}
            <button type="button" className="small" disabled={!exportInput} onClick={() => exportInput && downloadJson(exportInput)}>
              ↓ JSON
            </button>
            <button type="button" className="small" disabled={!exportInput} onClick={() => exportInput && downloadCsv(exportInput)}>
              ↓ CSV
            </button>
          </div>
        </div>
      </header>
      {error !== undefined && <ErrorBanner error={error} onDismiss={() => setError(undefined)} />}
      {run.status === 'awaiting_review' && !canReview && <p className="note warn">Waiting for a reviewer. The run continues after a human decision.</p>}
      {run.error && <ErrorBanner error={new Error(run.error)} />}

      <Tabs tabs={tabs} active={active} onChange={setTab} />
      <section className="panel tab-panel" role="tabpanel" id={`panel-${active}`} aria-labelledby={`tab-${active}`} data-testid={`panel-${active}`}>
        {active === 'summary' && state && (
          <div className="stack">
            <div>
              <h3>Story</h3>
              <p className="story-text">{state.story}</p>
            </div>
            {state.contextRounds.length > 0 && (
              <div>
                <h3>Added context</h3>
                <ol>
                  {state.contextRounds.map((c, i) => (
                    <li key={i}>{c}</li>
                  ))}
                </ol>
              </div>
            )}
            <dl className="facts">
              <div>
                <dt>Engines</dt>
                <dd>
                  route {run.engines.route} · select {run.engines.select} · review {run.engines.review} · eval {run.engines.eval}
                </dd>
              </div>
              <div>
                <dt>Generation</dt>
                <dd>
                  {state.options.provider}:{state.options.model} · {state.options.count} scenarios
                  {run.servedModel && run.servedModel !== `${state.options.provider}:${state.options.model}` && <span className="badge tone-warn"> served by {run.servedModel}</span>}
                </dd>
              </div>
              <div>
                <dt>Outcome</dt>
                <dd>{state.outcome ? state.outcome.replace('_', ' ') : run.status.replace('_', ' ')}</dd>
              </div>
              <div>
                <dt>Cost</dt>
                <dd>{usd(totals(state.usage).costUsd)}</dd>
              </div>
            </dl>
            {run.status === 'needs_rework' && <p className="note warn">A reviewer rejected this run. Rewrite the story and start a new analysis.</p>}
            {run.status === 'not_applicable' && <p className="note">Neither GDPR nor the EU AI Act applies to this story, so no scenarios were generated.</p>}
          </div>
        )}

        {active === 'classification' && state?.route && (
          <div className="stack">
            <div className="meters">
              <Meter label="Personal data" value={state.route.probabilities.personalData} />
              <Meter label="AI system" value={state.route.probabilities.aiSystem} />
              <Meter label={`Choice: ${state.route.choice.value ? CHOICE_LABEL[state.route.choice.value] : 'refused'}`} value={state.route.choice.confidence} />
            </div>
            {state.route.needsReview && <p className="note warn">The engine's choice and its predicates disagree, or its confidence is low.</p>}
            <p className="muted small">
              Engine {state.route.usage.engine ?? run.engines.route} · {state.route.usage.model}
              {state.route.usage.fallbackUsed ? ' (fallback)' : ''}
            </p>
          </div>
        )}

        {active === 'articles' && state && (
          <div className="stack">
            {state.selection ? (
              <>
                <ul className="article-rank">
                  {state.selection.selected.map((a) => (
                    <li key={a.id} className={state.articleIds.includes(a.id) ? '' : 'muted'}>
                      <span className={`reg-tag reg-${a.regulation}`}>{regLabel(a.regulation)}</span>
                      <span className="article-rank-title">{a.title}</span>
                      <span className="mini-bar" aria-hidden="true">
                        <span style={{ width: `${a.p * 100}%` }} />
                      </span>
                      <strong>{a.p.toFixed(2)}</strong>
                    </li>
                  ))}
                </ul>
                {state.articleIds.some((id) => !state.selection!.selected.some((s) => s.id === id)) && (
                  <p className="note">Reviewer override: {state.articleIds.join(', ')}</p>
                )}
                <details className="disclosure">
                  <summary>Chapter relevance ({state.selection.chapters.filter((c) => c.kept).length} kept)</summary>
                  <div className="chapter-grid">
                    {state.selection.chapters.map((c) => (
                      <span key={c.id} className={c.kept ? 'chapter kept' : 'chapter'}>
                        <code>{c.id}</code> {c.p.toFixed(2)}
                      </span>
                    ))}
                  </div>
                </details>
                <details className="disclosure">
                  <summary>
                    Linked context · {state.selection.expansion.recitals.length} recitals · {state.selection.expansion.annexes.length} annexes · {state.selection.expansion.crossRefs.length} cross-refs
                  </summary>
                  <ul className="plain ref-list two-col">
                    {[...state.selection.expansion.annexes, ...state.selection.expansion.crossRefs, ...state.selection.expansion.recitals].map((r) => (
                      <li key={r.id}>
                        <code>{r.id}</code> {r.title}
                      </li>
                    ))}
                  </ul>
                </details>
              </>
            ) : (
              <p className="muted">No regulation applies, so no articles were selected.</p>
            )}
          </div>
        )}

        {active === 'review' && state?.review && (
          <div className="stack">
            <div className="meters">
              <Meter label="Agreement (35)" value={state.review.components.agreement} />
              <Meter label="Specificity (15)" value={state.review.components.specificity} />
              <Meter label="Relevance (30)" value={state.review.components.relevance} />
              <Meter label="Completeness (20)" value={state.review.components.completeness} />
            </div>
            <p className="muted small">
              Score {state.review.score} vs threshold {state.review.threshold} · round {state.review.round} · {state.review.engine}:{state.review.model}
            </p>
            {state.reviews.length > 0 && (
              <ul className="timeline">
                {state.reviews.map((r, i) => (
                  <li key={i}>
                    <span className="timeline-date">{fmtDate(r.at)}</span>
                    <span className="timeline-line">
                      <strong>{r.by}</strong> {ACTION_LABEL[r.action]} (round {r.round}, score {r.score ?? '—'}){r.note ? ` — ${r.note}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {canReview && <ReviewPanel detail={detail} maxRounds={maxRounds} onDone={load} />}
          </div>
        )}

        {active === 'scenarios' && gen && (
          <div className="stack">
            {gen.invalidClauses.length > 0 && <p className="note warn">{gen.invalidClauses.length} clause reference(s) are not in the packed text (marked ⚠).</p>}
            <ScenarioCards scenarios={gen.scenarios} invalidClauses={gen.invalidClauses} evaluation={evaluation ?? undefined} />
          </div>
        )}

        {active === 'evaluation' && evaluation && <EvaluationSummary evaluation={evaluation} />}

        {active === 'pack' && gen && <PackManifestView manifest={gen.packManifest} />}

        {active === 'cost' && state && (
          <div className="stack">
            <UsagePanel run={state.usage} />
            {gen?.attempts && gen.attempts.length > 1 && (
              <div>
                <h3>Generation attempts</h3>
                <ul className="plain">
                  {gen.attempts.map((a, i) => (
                    <li key={i}>
                      <span className={`badge ${a.ok ? 'tone-ok' : 'tone-bad'}`}>{a.ok ? 'ok' : 'failed'}</span> {a.provider}:{a.model} {a.error && <span className="muted small">{a.error}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {!state && <p className="muted">The run is starting…</p>}
      </section>
    </div>
  );
}
