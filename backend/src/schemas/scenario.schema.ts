import { z } from 'zod';
import { env } from '../config/env.js';
import { UsageSchema } from './api.schema.js';
import { RegulationName } from './okf.schema.js';

// Scenario generation (Architecture.md §8.2): LLM structured output, generate request / response.

export const Priority = z.enum(['High', 'Medium', 'Low']);
export type Priority = z.infer<typeof Priority>;

export const Scenario = z.object({
  id: z.string().regex(/^TS-\d{3}$/),
  title: z.string().min(5),
  regulation: RegulationName,
  /** Packed clause labels, e.g. `Art. 17(1)(a) GDPR`, `Annex III(4)(a) EU AI Act`. */
  mappedClauses: z.array(z.string()).min(1),
  priority: Priority,
  prerequisites: z.array(z.string()).min(1),
  steps: z.array(z.string()).min(2).max(10),
  expectedResult: z.string().min(5),
});
export type Scenario = z.infer<typeof Scenario>;

export const ScenarioListSchema = z.object({ scenarios: z.array(Scenario) });
export type ScenarioList = z.infer<typeof ScenarioListSchema>;

/**
 * The schema sent to the model API: same fields, no min / max / regex rules (Anthropic structured outputs reject
 * them, Architecture.md §10.2). The result is validated with ScenarioListSchema afterwards.
 */
export const ScenarioListApiSchema = z.object({
  scenarios: z.array(
    z.object({
      id: z.string().describe('TS-001, TS-002, …'),
      title: z.string(),
      regulation: RegulationName,
      mappedClauses: z.array(z.string()).describe('Packed clause labels, e.g. Art. 17(1)(a) GDPR'),
      priority: Priority,
      prerequisites: z.array(z.string()),
      steps: z.array(z.string()).describe('2 to 10 steps'),
      expectedResult: z.string(),
    }),
  ),
});

export const ProviderId = z.enum(['openai', 'anthropic', 'groq', 'inception']);
export type ProviderId = z.infer<typeof ProviderId>;

export const GenerateRequest = z.object({
  story: z.string().trim().min(10),
  /** Ranked (SELECT order); pack drop step 5 removes from the end. Duplicates removed. */
  articleIds: z
    .array(z.string().min(1))
    .min(1)
    .transform((ids) => [...new Set(ids)]),
  provider: ProviderId,
  model: z.string().min(1),
  count: z.union([
    z.literal(5),
    z.literal(10),
    z.literal(20),
    z.number().int().min(1).max(env.SCENARIO_MAX_COUNT),
  ]),
});
export type GenerateRequest = z.infer<typeof GenerateRequest>;

export const InvalidClause = z.object({ scenarioId: z.string(), clause: z.string() });
export type InvalidClause = z.infer<typeof InvalidClause>;

export const PackManifest = z.object({
  included: z.array(z.object({ id: z.string(), tokens: z.number().int() })),
  dropped: z.array(z.object({ id: z.string(), reason: z.string() })),
  totalTokens: z.number().int(),
  budget: z.number().int(),
});
export type PackManifest = z.infer<typeof PackManifest>;

export const GenerateResponse = z.object({
  scenarios: z.array(Scenario),
  packManifest: PackManifest,
  invalidClauses: z.array(InvalidClause),
  /** All generation calls incl. parse / count retries and failed attempts. */
  usage: UsageSchema,
  /** `provider:model` that produced the scenarios (Architecture.md §10.3). */
  servedModel: z.string(),
  /** Every model tried, in order. */
  attempts: z.array(z.object({ provider: ProviderId, model: z.string(), ok: z.boolean(), error: z.string().optional() })),
});
export type GenerateResponse = z.infer<typeof GenerateResponse>;

export const EvaluateRequest = z.object({
  story: GenerateRequest.shape.story,
  /** Same ids as the generate request; the pack is rebuilt from them. */
  articleIds: GenerateRequest.shape.articleIds,
  scenarios: z
    .array(Scenario)
    .min(1)
    .max(env.SCENARIO_MAX_COUNT)
    .refine((list) => new Set(list.map((s) => s.id)).size === list.length, 'scenario ids must be unique'),
});
export type EvaluateRequest = z.infer<typeof EvaluateRequest>;

export const Verdict = z.enum(['pass', 'warn', 'fail']);
export type Verdict = z.infer<typeof Verdict>;

export const PriorityFit = z.enum(['too_low', 'correct', 'too_high']);
export type PriorityFit = z.infer<typeof PriorityFit>;

/** 0–2 probability-weighted level index; `null` when the question was refused. */
const LevelScore = z.number().min(0).max(2).nullable();

export const ScenarioEvaluation = z.object({
  id: z.string(),
  scores: z.object({ traceability: LevelScore, testability: LevelScore, clarity: LevelScore }),
  /** `null` when refused. */
  priorityFit: PriorityFit.nullable(),
  duplicateP: z.number().min(0).max(1),
  verdict: Verdict,
});
export type ScenarioEvaluation = z.infer<typeof ScenarioEvaluation>;

export const EvaluateResponse = z.object({
  scenarios: z.array(ScenarioEvaluation),
  /** Every requested article id exactly once, request order. */
  coverage: z.object({ covered: z.array(z.string()), uncovered: z.array(z.string()), pct: z.number() }),
  summary: z.object({ pass: z.number().int(), warn: z.number().int(), fail: z.number().int() }),
  /** Names of refused Decisions questions. */
  refusals: z.array(z.string()),
  usage: UsageSchema,
});
export type EvaluateResponse = z.infer<typeof EvaluateResponse>;

export const ProvidersResponse = z.object({
  providers: z.array(z.object({ id: ProviderId, models: z.array(z.string()), default: z.string() })),
});
export type ProvidersResponse = z.infer<typeof ProvidersResponse>;
