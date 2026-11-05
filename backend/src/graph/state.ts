import { Annotation } from '@langchain/langgraph';
import type { RegId } from '../config/chapterMap.js';
import type { EngineId } from '../config/env.js';
import type { RouteResult } from '../decisions/route.js';
import type { SelectResult } from '../decisions/select.js';
import type { EvaluateResponse, GenerateResponse, ProviderId } from '../schemas/scenario.schema.js';
import { addTokens, type Usage } from '../usage.js';
import type { ReviewResult } from './reviewScore.js';

// Pipeline state (Architecture.md §11.2).

export type Step = 'route' | 'select' | 'review' | 'generate' | 'evaluate';
export type Outcome = 'completed' | 'needs_rework' | 'not_applicable';

export interface RunOptions {
  /** Classification engine override (route + select); undefined = .env. */
  engine?: EngineId;
  provider: ProviderId;
  model: string;
  count: number;
  evaluate: boolean;
}

export type HitlAction = 'approve' | 'override' | 'context' | 'reject';

/** Resume value for humanReview (validated by the API, §11.5). */
export interface HumanDecision {
  action: HitlAction;
  by: string;
  regulations?: RegId[];
  articleIds?: string[];
  context?: string;
  note?: string;
}

export interface ReviewLog {
  by: string;
  action: HitlAction;
  round: number;
  at: string;
  score: number | null;
  note?: string;
}

export type RouteOutput = RouteResult & { usage: Usage };

const replace = <T>(_current: T, next: T) => next;

/** Sums usage per step across rounds (re-reviews, retries). */
export function mergeUsage(a: Partial<Record<Step, Usage>>, b: Partial<Record<Step, Usage>>): Partial<Record<Step, Usage>> {
  const out = { ...a };
  for (const [step, next] of Object.entries(b) as [Step, Usage][]) {
    const prev = out[step];
    if (!prev) {
      out[step] = next;
      continue;
    }
    const tokens = addTokens(prev, next);
    const costUsd = prev.costUsd === null || next.costUsd === null ? null : Math.round((prev.costUsd + next.costUsd) * 1e6) / 1e6;
    out[step] = { ...next, ...tokens, calls: prev.calls + next.calls, costUsd, fallbackUsed: Boolean(prev.fallbackUsed || next.fallbackUsed) };
  }
  return out;
}

export const ClausarioState = Annotation.Root({
  runId: Annotation<string>,
  ownerId: Annotation<string>,
  story: Annotation<string>,
  contextRounds: Annotation<string[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  options: Annotation<RunOptions>,
  route: Annotation<RouteOutput | null>({ reducer: replace, default: () => null }),
  selection: Annotation<SelectResult | null>({ reducer: replace, default: () => null }),
  review: Annotation<ReviewResult | null>({ reducer: replace, default: () => null }),
  regulations: Annotation<RegId[]>({ reducer: replace, default: () => [] }),
  articleIds: Annotation<string[]>({ reducer: replace, default: () => [] }),
  decision: Annotation<HumanDecision | null>({ reducer: replace, default: () => null }),
  reviews: Annotation<ReviewLog[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  generation: Annotation<GenerateResponse | null>({ reducer: replace, default: () => null }),
  evaluation: Annotation<EvaluateResponse | null>({ reducer: replace, default: () => null }),
  usage: Annotation<Partial<Record<Step, Usage>>>({ reducer: mergeUsage, default: () => ({}) }),
  outcome: Annotation<Outcome | null>({ reducer: replace, default: () => null }),
});

export type ClausarioValues = typeof ClausarioState.State;

/** Story plus every added context round, as one text for the engines and the generator. */
export function storyWithContext(s: Pick<ClausarioValues, 'story' | 'contextRounds'>): string {
  if (s.contextRounds.length === 0) return s.story;
  return `${s.story}\n\nAdditional context from human review:\n${s.contextRounds.map((c, i) => `${i + 1}. ${c}`).join('\n')}`;
}
