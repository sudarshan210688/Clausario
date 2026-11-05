import type { UsageStep } from '../services/download';
import type { Usage } from '../types/api';

export type RunUsage = Partial<Record<UsageStep, Usage>>;

const STEPS: { id: UsageStep; label: string }[] = [
  { id: 'route', label: 'Route' },
  { id: 'select', label: 'Select' },
  { id: 'review', label: 'Review' },
  { id: 'generate', label: 'Generate' },
  { id: 'evaluate', label: 'Evaluate' },
];

const int = (n: number) => n.toLocaleString();

/** `$0.000123` for tiny amounts, `$1.23` otherwise; `—` without a price. */
export function usd(value: number | null): string {
  if (value === null) return '—';
  if (value === 0) return '$0.00';
  return value < 0.01 ? `$${value.toFixed(6)}` : `$${value.toFixed(4)}`;
}

export function totals(run: RunUsage) {
  const steps = Object.values(run);
  const priced = steps.every((u) => u.costUsd !== null);
  return {
    inputTokens: steps.reduce((n, u) => n + u.inputTokens, 0),
    outputTokens: steps.reduce((n, u) => n + u.outputTokens, 0),
    totalTokens: steps.reduce((n, u) => n + u.totalTokens, 0),
    costUsd: steps.reduce((n, u) => n + (u.costUsd ?? 0), 0),
    /** Some step has no price → total is a lower bound. */
    partial: !priced,
    steps: steps.length,
  };
}

/** Compact "1,234 tok · $0.0012" pill shown next to a finished step. */
export function UsageChip({ usage }: { usage: Usage }) {
  return (
    <span
      className="usage-chip"
      title={`${usage.model} · ${usage.calls} call(s) · in ${int(usage.inputTokens)} / out ${int(usage.outputTokens)} tokens`}
    >
      <span aria-hidden="true">⚡</span> {int(usage.totalTokens)} tok · {usd(usage.costUsd)}
    </span>
  );
}

/** Per-step token + cost breakdown with a run total. */
export function UsagePanel({ run }: { run: RunUsage }) {
  const sum = totals(run);
  return (
    <section className="panel usage-panel" aria-labelledby="usage-title">
      <div className="panel-head">
        <h3 id="usage-title">Token cost</h3>
        <span className="usage-total">
          {usd(sum.costUsd)}
          {sum.partial && <sup title="Some models have no price in MODEL_PRICING">*</sup>}
        </span>
      </div>
      {sum.steps === 0 ? (
        <p className="muted small">Costs appear here as each step runs.</p>
      ) : (
        <div className="table-wrap">
          <table className="usage-table">
            <thead>
              <tr>
                <th>Step</th>
                <th className="num">Input</th>
                <th className="num">Output</th>
                <th className="num">Total</th>
                <th className="num">Cost</th>
              </tr>
            </thead>
            <tbody>
              {STEPS.map(({ id, label }) => {
                const u = run[id];
                return (
                  <tr key={id} className={u ? undefined : 'muted'}>
                    <td title={u ? `${u.model} · ${u.calls} call(s)` : undefined}>
                      {label}
                      {u && <span className="muted small"> · {u.model}{u.fallbackUsed ? ' (fallback)' : ''}</span>}
                    </td>
                    <td className="num">{u ? int(u.inputTokens) : '–'}</td>
                    <td className="num">{u ? int(u.outputTokens) : '–'}</td>
                    <td className="num">{u ? int(u.totalTokens) : '–'}</td>
                    <td className="num">{u ? usd(u.costUsd) : '–'}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td className="num">{int(sum.inputTokens)}</td>
                <td className="num">{int(sum.outputTokens)}</td>
                <td className="num">{int(sum.totalTokens)}</td>
                <td className="num">{usd(sum.costUsd)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      {sum.partial && <p className="muted small">* A model has no price in MODEL_PRICING; its cost is not counted.</p>}
    </section>
  );
}
