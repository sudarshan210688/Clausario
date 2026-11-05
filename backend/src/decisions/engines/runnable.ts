import { RunnableLambda, type Runnable } from '@langchain/core/runnables';
import { env, type EngineId, type Stage } from '../../config/env.js';
import { decide, UpstreamError, type DecideResult, type DecisionInput, type Question, type Transport } from '../client.js';
import { fallbackRefs, maxPerCall, primaryRef, transportFor, type EngineRef } from './registry.js';

// Each engine is a LangChain Runnable with withRetry; the stage chain adds withFallbacks (Architecture.md §9.3).

export interface Decided extends DecideResult {
  engine: EngineId;
  model: string;
  fallbackUsed: boolean;
  /** Every engine:model tried, in order. */
  attempts: string[];
}

export interface StageOptions {
  /** Per-run engine override (route/select). */
  engine?: EngineId;
  /** Legacy/test path: call this transport directly as the Decisions engine, no retries or fallbacks. */
  transport?: Transport;
}

/** 400, 401, 403 and 422 will not succeed on retry; the fallback still runs. */
const CLIENT_ERRORS = new Set([400, 401, 403, 422]);
const stopOnClientError = (err: unknown) => {
  if (err instanceof UpstreamError && err.status !== undefined && CLIENT_ERRORS.has(err.status)) throw err;
};

type Args = { input: DecisionInput; questions: Question[] };

function engineRunnable(ref: EngineRef, attempts: string[]): Runnable<Args, Decided> {
  return RunnableLambda.from(async ({ input, questions }: Args): Promise<Decided> => {
    attempts.push(`${ref.id}:${ref.model}`);
    const result = await decide(input, questions, transportFor(ref), maxPerCall(ref));
    return { ...result, engine: ref.id, model: ref.model, fallbackUsed: false, attempts };
  }).withRetry({ stopAfterAttempt: env.DECISION_MAX_RETRIES + 1, onFailedAttempt: stopOnClientError });
}

/** Runs `questions` for `stage` on its engine with retries, then DECISION_FALLBACKS in order. */
export async function decideStage(stage: Stage, input: DecisionInput, questions: Question[], options: StageOptions = {}): Promise<Decided> {
  if (options.transport) {
    const result = await decide(input, questions, options.transport);
    return { ...result, engine: 'decisions', model: env.DECISIONS_MODEL, fallbackUsed: false, attempts: [`decisions:${env.DECISIONS_MODEL}`] };
  }
  const primary = primaryRef(stage, options.engine);
  const attempts: string[] = [];
  const chain = [primary, ...fallbackRefs(primary)].map((ref) => engineRunnable(ref, attempts));
  const runnable = chain.length > 1 ? chain[0].withFallbacks(chain.slice(1)) : chain[0];
  try {
    const result = await runnable.invoke({ input, questions });
    return { ...result, fallbackUsed: result.engine !== primary.id || result.model !== primary.model, attempts: [...new Set(attempts)] };
  } catch (err) {
    const tried = [...new Set(attempts)].join(', ');
    const message = err instanceof Error ? err.message : String(err);
    throw new UpstreamError(`All decision engines failed for ${stage} (tried ${tried}): ${message}`, undefined, err instanceof UpstreamError ? err.status : undefined);
  }
}

/** Usage of one decided step: served model priced, engine and fallback flag. */
export function usageOfDecided(d: Pick<Decided, 'model' | 'engine' | 'fallbackUsed' | 'calls' | 'tokens'>, toUsageFn: typeof import('../../usage.js').toUsage) {
  return { ...toUsageFn(d.model, d.calls, d.tokens), engine: d.engine, fallbackUsed: d.fallbackUsed };
}
