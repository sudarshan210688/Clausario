import { useEffect, type ReactNode } from 'react';
import type { RunRecord, RunStatus, RunStep } from '../types/api';

// Small building blocks for the pages (Architecture.md §14.3).

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="page-head">
      <div>
        <h1>{title}</h1>
        {subtitle && <p className="muted">{subtitle}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

const STATUS_LABEL: Record<RunStatus, string> = {
  running: 'Running',
  awaiting_review: 'Awaiting review',
  completed: 'Completed',
  needs_rework: 'Needs rework',
  not_applicable: 'Not applicable',
  failed: 'Failed',
};

export function StatusPill({ status }: { status: RunStatus }) {
  return (
    <span className={`pill pill-${status}`} data-testid="status-pill">
      {status === 'running' && <span className="spinner tiny" aria-hidden="true" />}
      {STATUS_LABEL[status]}
    </span>
  );
}

const STEPS: { id: RunStep; label: string }[] = [
  { id: 'classify', label: 'Classify' },
  { id: 'select', label: 'Articles' },
  { id: 'review', label: 'Review' },
  { id: 'generate', label: 'Generate' },
  { id: 'evaluate', label: 'Evaluate' },
];

/** Horizontal step tracker from the run's step and status. */
export function StepTracker({ run, evaluate }: { run: RunRecord; evaluate: boolean }) {
  const steps = evaluate ? STEPS : STEPS.filter((s) => s.id !== 'evaluate');
  const current = steps.findIndex((s) => s.id === run.step);
  const finished = ['completed', 'not_applicable', 'needs_rework'].includes(run.status);
  return (
    <ol className="tracker" aria-label="Run progress">
      {steps.map((s, i) => {
        let state = i < current ? 'done' : i === current ? 'active' : 'todo';
        if (run.status === 'completed') state = 'done';
        if (finished && run.status !== 'completed' && i > current) state = 'skipped';
        if (run.status === 'failed' && i === current) state = 'failed';
        if (run.status === 'awaiting_review' && s.id === 'review') state = 'waiting';
        return (
          <li key={s.id} className={`tracker-step t-${state}`} aria-current={state === 'active' ? 'step' : undefined}>
            <span className="tracker-dot">{state === 'done' ? '✓' : state === 'failed' ? '!' : i + 1}</span>
            <span className="tracker-label">{s.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Semicircle-free compact gauge: score bar with a threshold marker. */
export function ScoreGauge({ score, threshold }: { score: number | null; threshold: number }) {
  const value = score ?? 0;
  return (
    <div className="gauge" data-testid="score-gauge">
      <div className="gauge-head">
        <span>Review score</span>
        <strong className={score === null ? 'muted' : value >= threshold ? 'ok' : 'warn'}>{score === null ? '—' : value}</strong>
      </div>
      <div className="gauge-track" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-label="Review score">
        <div className={`gauge-fill ${value >= threshold ? 'ok' : 'warn'}`} style={{ width: `${value}%` }} />
        <span className="gauge-mark" style={{ left: `${threshold}%` }} title={`Threshold ${threshold}`} />
      </div>
      <span className="muted small">Threshold {threshold}</span>
    </div>
  );
}

export interface TabDef {
  id: string;
  label: string;
  badge?: ReactNode;
  disabled?: boolean;
}

export function Tabs({ tabs, active, onChange }: { tabs: TabDef[]; active: string; onChange: (id: string) => void }) {
  return (
    <div className="tabs" role="tablist" aria-label="Sections">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          role="tab"
          id={`tab-${t.id}`}
          aria-selected={active === t.id}
          aria-controls={`panel-${t.id}`}
          disabled={t.disabled}
          className={active === t.id ? 'tab on' : 'tab'}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => {
            const enabled = tabs.filter((x) => !x.disabled);
            const i = enabled.findIndex((x) => x.id === t.id);
            if (e.key === 'ArrowRight') onChange(enabled[(i + 1) % enabled.length].id);
            if (e.key === 'ArrowLeft') onChange(enabled[(i - 1 + enabled.length) % enabled.length].id);
          }}
        >
          {t.label}
          {t.badge !== undefined && <span className="tab-badge">{t.badge}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <button type="button" className="ghost small" disabled={page <= 1} onClick={() => onPage(page - 1)}>
        ← Prev
      </button>
      <span className="muted small">
        Page {page} of {pages} · {total} items
      </span>
      <button type="button" className="ghost small" disabled={page >= pages} onClick={() => onPage(page + 1)}>
        Next →
      </button>
    </div>
  );
}

/** Right-side drawer with a backdrop; Escape closes it. */
export function Drawer({ title, open, onClose, children }: { title: string; open: boolean; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="side-drawer-wrap">
      <div className="side-drawer-backdrop" onClick={onClose} aria-hidden="true" />
      <aside className="side-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <header className="side-drawer-head">
          <h2>{title}</h2>
          <button type="button" className="ghost small" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </header>
        <div className="side-drawer-body">{children}</div>
      </aside>
    </div>
  );
}

export function Kpi({ label, value, tone }: { label: string; value: ReactNode; tone?: 'ok' | 'warn' | 'bad' | 'info' }) {
  return (
    <div className={`kpi-tile ${tone ? `tone-${tone}` : ''}`}>
      <span className="kpi-tile-value">{value}</span>
      <span className="kpi-tile-label">{label}</span>
    </div>
  );
}

export const fmtDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
};

export const regLabel = (reg: string) => (reg === 'gdpr' ? 'GDPR' : reg === 'eu-ai-act' ? 'EU AI Act' : reg);
