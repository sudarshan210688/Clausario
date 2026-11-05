import { LEGAL } from '../components/Brand';
import type { EvaluateResponse, Scenario, Usage } from '../types/api';

// Client-side export of scenarios + evaluation (no backend storage).

export type UsageStep = 'route' | 'select' | 'review' | 'generate' | 'evaluate';

export interface ExportInput {
  story: string;
  articleIds: string[];
  scenarios: Scenario[];
  evaluation?: EvaluateResponse;
  /** Per-step tokens + cost of this run (JSON only). */
  usage?: Partial<Record<UsageStep, Usage>>;
}

function save(filename: string, content: string, type: string): void {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');

export function toJson(input: ExportInput): string {
  return JSON.stringify(
    {
      notice: LEGAL.exportNotice,
      story: input.story,
      articleIds: input.articleIds,
      scenarios: input.scenarios,
      evaluation: input.evaluation ?? null,
      usage: input.usage ?? null,
    },
    null,
    2,
  );
}

/** Text starting with =, +, -, @, tab or CR is prefixed with ' so spreadsheets show it as text, not a formula. */
const FORMULA_START = /^[=+\-@\t\r]/;
const safeText = (value: string) => (FORMULA_START.test(value) ? `'${value}` : value);

/** RFC 4180 cell: always quoted, inner quotes doubled; strings are formula-escaped, numbers kept as numbers. */
const cell = (value: string | number | null | undefined) => {
  const text = typeof value === 'string' ? safeText(value) : String(value ?? '');
  return `"${text.replace(/"/g, '""')}"`;
};
const joinList = (items: string[]) => items.join(' | ');

/** One row per scenario; arrays joined with ` | `; evaluation columns empty when not evaluated. */
export function toCsv(input: ExportInput): string {
  const evalById = new Map(input.evaluation?.scenarios.map((e) => [e.id, e]));
  const header = [
    'id',
    'title',
    'regulation',
    'mappedClauses',
    'priority',
    'prerequisites',
    'steps',
    'expectedResult',
    'verdict',
    'traceability',
    'testability',
    'clarity',
    'priorityFit',
    'duplicateP',
  ];
  const rows = input.scenarios.map((s) => {
    const e = evalById.get(s.id);
    return [
      s.id,
      s.title,
      s.regulation,
      joinList(s.mappedClauses),
      s.priority,
      joinList(s.prerequisites),
      joinList(s.steps),
      s.expectedResult,
      e?.verdict,
      e?.scores.traceability,
      e?.scores.testability,
      e?.scores.clarity,
      e?.priorityFit,
      e?.duplicateP,
    ];
  });
  return [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n') + '\r\n';
}

export function downloadJson(input: ExportInput): void {
  save(`clausario-scenarios-${stamp()}.json`, toJson(input), 'application/json');
}

/** UTF-8 BOM so Excel detects the encoding. */
export function downloadCsv(input: ExportInput): void {
  save(`clausario-scenarios-${stamp()}.csv`, '﻿' + toCsv(input), 'text/csv;charset=utf-8');
}
