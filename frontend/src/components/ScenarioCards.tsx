import { useState } from 'react';
import type { EvaluateResponse, InvalidClause, Priority, Scenario, ScenarioEvaluation, Verdict } from '../types/api';
import { Meter } from './Meter';

interface Props {
  scenarios: Scenario[];
  invalidClauses: InvalidClause[];
  evaluation?: EvaluateResponse;
}

type Filter = 'all' | Verdict | Priority;

const FIT_LABEL = { too_low: 'Priority too low', correct: 'Priority fits', too_high: 'Priority too high' } as const;

function Scores({ e }: { e: ScenarioEvaluation }) {
  return (
    <div className="score-grid">
      {(['traceability', 'testability', 'clarity'] as const).map((name) => {
        const value = e.scores[name];
        return value === null ? (
          <div key={name} className="meter">
            <div className="meter-head">
              <span>{name}</span>
              <strong>refused</strong>
            </div>
          </div>
        ) : (
          <Meter key={name} label={name[0].toUpperCase() + name.slice(1)} value={value} max={2} />
        );
      })}
      <div className="score-meta">
        <span className={`badge ${e.priorityFit === 'correct' ? 'tone-ok' : 'tone-warn'}`}>
          {e.priorityFit ? FIT_LABEL[e.priorityFit] : 'Priority fit refused'}
        </span>
        <span className={`badge ${e.duplicateP >= 0.5 ? 'tone-warn' : 'tone-neutral'}`}>
          Duplicate p {e.duplicateP.toFixed(2)}
        </span>
      </div>
    </div>
  );
}

/** Scenario cards (title, clauses, priority; steps on expand) with evaluation scores once evaluated. */
export function ScenarioCards({ scenarios, invalidClauses, evaluation }: Props) {
  const [filter, setFilter] = useState<Filter>('all');
  const [open, setOpen] = useState<Set<string>>(new Set());
  const invalid = new Set(invalidClauses.map((c) => `${c.scenarioId}\u0000${c.clause}`));
  const evalById = new Map(evaluation?.scenarios.map((e) => [e.id, e]));

  const filters: Filter[] = evaluation ? ['all', 'pass', 'warn', 'fail', 'High', 'Medium', 'Low'] : ['all', 'High', 'Medium', 'Low'];
  const visible = scenarios.filter(
    (s) => filter === 'all' || s.priority === filter || evalById.get(s.id)?.verdict === filter,
  );
  const allOpen = visible.length > 0 && visible.every((s) => open.has(s.id));

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="stack">
      <div className="row spread">
        <div className="segmented" role="group" aria-label="Filter scenarios">
          {filters.map((f) => (
            <button key={f} type="button" className={filter === f ? 'on' : undefined} onClick={() => setFilter(f)}>
              {f === 'all' ? `All ${scenarios.length}` : f}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="ghost"
          onClick={() => setOpen(allOpen ? new Set() : new Set(visible.map((s) => s.id)))}
        >
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>

      {visible.length === 0 && <p className="muted">No scenario matches this filter.</p>}
      <div className="scenario-list">
        {visible.map((s) => {
          const e = evalById.get(s.id);
          const isOpen = open.has(s.id);
          return (
            <article key={s.id} className={`scenario ${e ? `verdict-edge-${e.verdict}` : ''}`}>
              <button type="button" className="scenario-head" aria-expanded={isOpen} onClick={() => toggle(s.id)}>
                <span className="scenario-id">{s.id}</span>
                <span className="scenario-title">{s.title}</span>
                <span className="scenario-tags">
                  <span className={`badge priority-${s.priority.toLowerCase()}`}>{s.priority}</span>
                  {e && <span className={`badge verdict-${e.verdict}`}>{e.verdict}</span>}
                  <span className={`chevron ${isOpen ? 'up' : ''}`} aria-hidden="true">
                    ▾
                  </span>
                </span>
              </button>
              <div className="clause-chips">
                <span className="reg-tag">{s.regulation}</span>
                {s.mappedClauses.map((clause) => {
                  const bad = invalid.has(`${s.id}\u0000${clause}`);
                  return (
                    <span
                      key={clause}
                      className={bad ? 'clause invalid' : 'clause'}
                      title={bad ? 'Not a clause in the packed regulation text' : undefined}
                    >
                      {clause}
                      {bad && ' ⚠'}
                    </span>
                  );
                })}
              </div>
              {isOpen && (
                <div className="scenario-body">
                  <div>
                    <h4>Prerequisites</h4>
                    <ul>
                      {s.prerequisites.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h4>Steps</h4>
                    <ol>
                      {s.steps.map((step, i) => (
                        <li key={i}>{step}</li>
                      ))}
                    </ol>
                  </div>
                  <div className="expected">
                    <h4>Expected result</h4>
                    <p>{s.expectedResult}</p>
                  </div>
                  {e && (
                    <div>
                      <h4>Evaluation</h4>
                      <Scores e={e} />
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
    </div>
  );
}

/** KPI tiles: verdict counts + article coverage. */
export function EvaluationSummary({ evaluation }: { evaluation: EvaluateResponse }) {
  const { summary, coverage, refusals } = evaluation;
  const total = coverage.covered.length + coverage.uncovered.length;
  return (
    <div className="stack">
      <div className="kpis">
        <div className="kpi tone-ok">
          <span className="kpi-value">{summary.pass}</span>
          <span className="kpi-label">Pass</span>
        </div>
        <div className="kpi tone-warn">
          <span className="kpi-value">{summary.warn}</span>
          <span className="kpi-label">Warn</span>
        </div>
        <div className="kpi tone-bad">
          <span className="kpi-value">{summary.fail}</span>
          <span className="kpi-label">Fail</span>
        </div>
        <div className="kpi coverage">
          <div className="ring" style={{ ['--pct' as string]: `${coverage.pct}` }}>
            <span>{coverage.pct}%</span>
          </div>
          <span className="kpi-label">
            Coverage · {coverage.covered.length}/{total} articles
          </span>
        </div>
      </div>
      {coverage.uncovered.length > 0 && (
        <p className="note warn">
          <strong>Not covered:</strong> {coverage.uncovered.join(', ')}
        </p>
      )}
      {refusals.length > 0 && <p className="muted small">Refused questions: {refusals.join(', ')}</p>}
    </div>
  );
}
