import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { AIMessage, BaseMessage } from '@langchain/core/messages';
import { RunnableLambda, type Runnable } from '@langchain/core/runnables';
import { env } from '../config/env.js';
import { UpstreamError } from '../decisions/client.js';
import type { Graph } from '../okf/graph.js';
import { buildPack } from '../pack/packer.js';
import {
  ScenarioListApiSchema,
  ScenarioListSchema,
  type GenerateRequest,
  type GenerateResponse,
  type InvalidClause,
  type ProviderId,
  type Scenario,
} from '../schemas/scenario.schema.js';
import { addTokens, NO_TOKENS, toUsage, type Tokens } from '../usage.js';
import { buildGenerationMessages } from './prompts.js';
import { assertListedModel, createChatModel, isListedModel, methodFor } from './providerFactory.js';

// Scenario generation (Architecture.md §8): pack → ICEPOT prompt → structured output → count / coverage retry →
// exact count, renumbered, mappedClauses checked against packed anchors.

const normalizeClause = (clause: string) => clause.replace(/\s+/g, ' ').trim();

/** Every mappedClauses entry that is not a packed clause label, in scenario order. */
export function validateMappedClauses(scenarios: readonly Scenario[], anchors: ReadonlyMap<string, string>): InvalidClause[] {
  return scenarios.flatMap((s) =>
    s.mappedClauses.filter((c) => !anchors.has(normalizeClause(c))).map((clause) => ({ scenarioId: s.id, clause })),
  );
}

/** Article ids cited (via a valid packed clause) by `scenario`. */
function citedArticles(scenario: Scenario, anchors: ReadonlyMap<string, string>, articleIds: readonly string[]): Set<string> {
  const ids = scenario.mappedClauses.flatMap((c) => anchors.get(normalizeClause(c)) ?? []);
  return new Set(ids.filter((id) => articleIds.includes(id)));
}

/** Articles that need coverage (all, when `count` ≥ articles) but no scenario cites. */
export function missingCoverage(
  scenarios: readonly Scenario[],
  count: number,
  articleIds: readonly string[],
  anchors: ReadonlyMap<string, string>,
): string[] {
  if (count < articleIds.length) return [];
  const covered = new Set(scenarios.flatMap((s) => [...citedArticles(s, anchors, articleIds)]));
  return articleIds.filter((id) => !covered.has(id));
}

export interface RetryPlan {
  /** Scenarios to ask for in the retry. */
  remainder: number;
  /** Article ids the retry must cover. */
  missing: string[];
}

/** One retry when short of `count` or an article is uncovered; `null` = no retry needed. */
export function planRetry(
  scenarios: readonly Scenario[],
  count: number,
  articleIds: readonly string[],
  anchors: ReadonlyMap<string, string>,
): RetryPlan | null {
  const missing = missingCoverage(scenarios, count, articleIds, anchors);
  const short = Math.max(0, count - scenarios.length);
  if (short === 0 && missing.length === 0) return null;
  return { remainder: Math.max(short, missing.length), missing };
}

/** `TS-001`, `TS-002`, … in list order. */
export function renumber(scenarios: readonly Scenario[]): Scenario[] {
  return scenarios.map((s, i) => ({ ...s, id: `TS-${String(i + 1).padStart(3, '0')}` }));
}

/**
 * At most `count` scenarios: first the earliest scenario covering each uncovered article (rank order), then the
 * rest in list order; kept in list order and renumbered.
 */
export function selectExact(
  scenarios: readonly Scenario[],
  count: number,
  articleIds: readonly string[],
  anchors: ReadonlyMap<string, string>,
): Scenario[] {
  const chosen = new Set<number>();
  const covered = new Set<string>();
  for (const id of articleIds) {
    if (chosen.size >= count || covered.has(id)) continue;
    const i = scenarios.findIndex((s, j) => !chosen.has(j) && citedArticles(s, anchors, articleIds).has(id));
    if (i < 0) continue;
    chosen.add(i);
    for (const cited of citedArticles(scenarios[i], anchors, articleIds)) covered.add(cited);
  }
  for (let i = 0; i < scenarios.length && chosen.size < count; i++) chosen.add(i);
  return renumber(scenarios.filter((_, i) => chosen.has(i)));
}

type Attempt = { ok: true; scenarios: Scenario[] } | { ok: false; raw: string; error: string };

/** Calls + tokens of one generate request (from LangChain `usage_metadata`; missing → 0). */
interface Meter {
  calls: number;
  tokens: Tokens;
}

function record(meter: Meter, message: AIMessage | undefined): void {
  meter.calls++;
  const u = message?.usage_metadata;
  if (u) {
    meter.tokens = addTokens(meter.tokens, {
      inputTokens: u.input_tokens,
      outputTokens: u.output_tokens,
      totalTokens: u.total_tokens,
    });
  }
}

/** Providers/models whose JSON-schema structured output failed; they go straight to the JSON fallback. */
const jsonFallback = new Set<string>();

function rawText(message: AIMessage | undefined): string {
  const args = message?.tool_calls?.[0]?.args;
  return args ? JSON.stringify(args) : (message?.text ?? '');
}

function parseScenarioJson(text: string): Attempt {
  const json = text.replace(/^\s*```(?:json)?\s*|\s*```\s*$/g, '');
  try {
    const result = ScenarioListSchema.safeParse(JSON.parse(json.slice(json.indexOf('{'), json.lastIndexOf('}') + 1)));
    if (result.success) return { ok: true, scenarios: result.data.scenarios };
    return { ok: false, raw: text, error: result.error.message };
  } catch (err) {
    return { ok: false, raw: text, error: (err as Error).message };
  }
}

async function attempt(
  model: BaseChatModel,
  key: string,
  provider: ProviderId,
  messages: BaseMessage[],
  meter: Meter,
): Promise<Attempt> {
  if (!jsonFallback.has(key)) {
    try {
      // Constraint-free schema to the API, full Zod validation after (Architecture.md §10.2).
      const out = await model
        .withStructuredOutput(ScenarioListApiSchema, { name: 'scenario_list', includeRaw: true, method: methodFor(provider) })
        .invoke(messages);
      record(meter, out.raw as AIMessage);
      const result = ScenarioListSchema.safeParse(out.parsed);
      if (result.success) return { ok: true, scenarios: result.data.scenarios };
      return { ok: false, raw: rawText(out.raw as AIMessage), error: result.error.message };
    } catch (err) {
      // Inception: JSON-schema output may be unsupported → JSON text + Zod parse (Architecture.md §8.1).
      if (provider !== 'inception') throw upstream(provider, err);
      console.warn(`${key}: structured output failed (${(err as Error).message}); using JSON fallback`);
      jsonFallback.add(key);
    }
  }
  let message: AIMessage;
  try {
    message = await model.invoke(messages);
  } catch (err) {
    throw upstream(provider, err);
  }
  record(meter, message);
  return parseScenarioJson(message.text);
}

function upstream(provider: ProviderId, err: unknown): UpstreamError {
  const status = (err as { status?: unknown }).status;
  return new UpstreamError(`${provider} request failed: ${(err as Error).message}`, undefined, typeof status === 'number' ? status : undefined);
}

/** Structured call; a parse failure gets 1 retry, then 502 with the first 500 raw chars. */
async function generateOnce(
  model: BaseChatModel,
  key: string,
  provider: ProviderId,
  messages: BaseMessage[],
  meter: Meter,
): Promise<Scenario[]> {
  let result = await attempt(model, key, provider, messages, meter);
  if (!result.ok) {
    console.warn(`${key}: invalid scenario output (${result.error.slice(0, 200)}); retrying`);
    result = await attempt(model, key, provider, messages, meter);
  }
  if (!result.ok) throw new UpstreamError(`${key} returned invalid scenarios: ${result.error}`, result.raw.slice(0, 500));
  return result.scenarios;
}

export interface Candidate {
  provider: ProviderId;
  model: string;
}

export interface AttemptLog {
  provider: ProviderId;
  model: string;
  ok: boolean;
  error?: string;
}

/** Requested model first, then GENERATION_FALLBACKS in order, skipping unkeyed/unlisted entries and duplicates. */
export function generationCandidates(provider: ProviderId, model: string): Candidate[] {
  const out: Candidate[] = [{ provider, model }];
  for (const f of env.GENERATION_FALLBACKS) {
    const c = { provider: f.id as ProviderId, model: f.model };
    if (out.some((o) => o.provider === c.provider && o.model === c.model)) continue;
    if (!isListedModel(c.provider, c.model)) continue;
    out.push(c);
  }
  return out;
}

const CLIENT_ERRORS = new Set([400, 401, 403, 404, 422]);

/**
 * One LangChain Runnable per candidate (withRetry), chained withFallbacks (Architecture.md §10.3). Each attempt is
 * logged; the result names the model that served it.
 */
async function generateWithChain(
  candidates: readonly Candidate[],
  messages: BaseMessage[],
  meter: Meter,
  attempts: AttemptLog[],
): Promise<{ scenarios: Scenario[]; served: Candidate }> {
  const runnables: Runnable<BaseMessage[], { scenarios: Scenario[]; served: Candidate }>[] = candidates.map((c) =>
    RunnableLambda.from(async (msgs: BaseMessage[]) => {
      try {
        const scenarios = await generateOnce(createChatModel(c.provider, c.model), `${c.provider}/${c.model}`, c.provider, msgs, meter);
        attempts.push({ ...c, ok: true });
        return { scenarios, served: c };
      } catch (err) {
        attempts.push({ ...c, ok: false, error: (err as Error).message.slice(0, 300) });
        throw err;
      }
    }).withRetry({
      stopAfterAttempt: env.LLM_MAX_RETRIES + 1,
      onFailedAttempt: (err) => {
        if (err instanceof UpstreamError && err.status !== undefined && CLIENT_ERRORS.has(err.status)) throw err;
      },
    }),
  );
  const chain = runnables.length > 1 ? runnables[0].withFallbacks(runnables.slice(1)) : runnables[0];
  try {
    return await chain.invoke(messages);
  } catch (err) {
    const tried = [...new Set(attempts.map((a) => `${a.provider}:${a.model}`))].join(', ');
    throw new UpstreamError(`All generation models failed (tried ${tried}): ${(err as Error).message}`, attempts);
  }
}

export async function generateScenarios(req: GenerateRequest, graph: Graph): Promise<GenerateResponse> {
  assertListedModel(req.provider, req.model);
  const pack = buildPack(req.articleIds, graph, env.PACK_TOKEN_BUDGET);
  const label = (id: string) => graph.docs.get(id)!.frontmatter.title;
  const allLabels = req.count >= pack.articleIds.length ? pack.articleIds.map(label) : [];
  const meter: Meter = { calls: 0, tokens: NO_TOKENS };
  const attempts: AttemptLog[] = [];

  const first = await generateWithChain(
    generationCandidates(req.provider, req.model),
    buildGenerationMessages({ story: req.story, packText: pack.text, count: req.count, mustCover: allLabels }),
    meter,
    attempts,
  );
  const { served } = first;
  const key = `${served.provider}/${served.model}`;
  let scenarios = first.scenarios;
  const retry = planRetry(scenarios, req.count, pack.articleIds, pack.anchors);
  if (retry) {
    // The count/coverage retry runs on the served model (§10.3).
    console.warn(`${key}: ${scenarios.length}/${req.count} scenarios, uncovered [${retry.missing.join(', ')}]; asking for ${retry.remainder} more`);
    const more = await generateOnce(
      createChatModel(served.provider, served.model),
      key,
      served.provider,
      buildGenerationMessages({
        story: req.story,
        packText: pack.text,
        count: retry.remainder,
        mustCover: retry.missing.map(label),
        existing: renumber(scenarios),
      }),
      meter,
    );
    scenarios = [...scenarios, ...more];
  }

  const final = selectExact(scenarios, req.count, pack.articleIds, pack.anchors);
  if (final.length < req.count) {
    throw new UpstreamError(`${key} returned ${final.length} of ${req.count} scenarios after 1 retry`);
  }
  return {
    scenarios: final,
    packManifest: pack.manifest,
    invalidClauses: validateMappedClauses(final, pack.anchors),
    usage: {
      ...toUsage(served.model, meter.calls, meter.tokens),
      engine: served.provider,
      fallbackUsed: served.provider !== req.provider || served.model !== req.model,
    },
    servedModel: `${served.provider}:${served.model}`,
    attempts,
  };
}
