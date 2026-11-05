import OpenAI from 'openai';
import type { DecisionCreateParams } from 'openai/resources/decisions';
import { z } from 'zod';
import { env } from '../config/env.js';
import { addTokens, NO_TOKENS, type Tokens } from '../usage.js';

// OpenAI Decisions API via the SDK (`client.decisions.create`, openai 7.47). Used for route / select / evaluate
// (Architecture.md §7.1, §7.2, §9). One call takes at most 400 questions; larger sets are chunked.

export const MAX_QUESTIONS_PER_CALL = 400;

export interface PredicateQuestion {
  type: 'predicate';
  name: string;
  instructions: string;
}

export interface ChoiceQuestion {
  type: 'choice';
  name: string;
  instructions: string;
  choices: { value: string; description?: string }[];
}

export interface ScoreQuestion {
  type: 'score';
  name: string;
  instructions: string;
  /** Ordered levels, lowest first. */
  levels: { label: string; description?: string }[];
}

export type Question = PredicateQuestion | ChoiceQuestion | ScoreQuestion;

/** A plain string, or messages with text / `input_json` parts. */
export type DecisionInput = DecisionCreateParams['input'];

const Name = z.string().min(1);
const Probability = z.number().min(0).max(1);

export const DecisionsResponseSchema = z.object({
  answers: z.array(
    z.discriminatedUnion('type', [
      z.object({ type: z.literal('predicate'), name: Name, probability: Probability }),
      z.object({
        type: z.literal('choice'),
        name: Name,
        choice: z.union([z.string(), z.boolean()]),
        confidence: Probability,
      }),
      z.object({
        type: z.literal('score'),
        name: Name,
        probabilities: z.array(z.object({ label: z.string(), probability: Probability })),
      }),
      z.object({ type: z.literal('refusal'), name: Name }),
    ]),
  ),
  usage: z
    .object({
      input_tokens: z.number().int().min(0),
      output_tokens: z.number().int().min(0),
      total_tokens: z.number().int().min(0),
    })
    .optional(),
});

export interface ChoiceAnswer {
  /** `null` when the model refused. */
  value: string | boolean | null;
  confidence: number;
}

export interface LevelProbability {
  label: string;
  probability: number;
}

export interface DecideResult {
  /** Question name → probability; refusal → 0. */
  predicates: Record<string, number>;
  /** Question name → choice; refusal → `{ value: null, confidence: 0 }`. */
  choices: Record<string, ChoiceAnswer>;
  /** Question name → probability per level label; refusal → `null`. */
  scores: Record<string, LevelProbability[] | null>;
  /** Names of refused questions, question order. */
  refusals: string[];
  /** Summed over chunks; a response without `usage` counts 0. */
  tokens: Tokens;
  /** Upstream calls (chunks). */
  calls: number;
}

/** Upstream Decisions failure (HTTP error, missing key, response that fails Zod) → 502. */
export class UpstreamError extends Error {
  constructor(
    message: string,
    readonly raw?: unknown,
    /** Upstream HTTP status when known (400/401/403/422 are not retried, Architecture.md §9.3). */
    readonly status?: number,
  ) {
    super(message);
    this.name = 'UpstreamError';
  }
}

/** Sends one batch (≤ 400 questions); returns the unvalidated response body. */
export type Transport = (input: DecisionInput, questions: Question[]) => Promise<unknown>;

const clients = new Map<string, OpenAI>();

/** Decisions API transport for `model`. SDK retries are off: LangChain owns retries (Architecture.md §9.3). */
export function createDecisionsTransport(model: string = env.DECISIONS_MODEL): Transport {
  return async (input, questions) => {
    if (!env.OPENAI_API_KEY) throw new UpstreamError('OPENAI_API_KEY is missing in backend/.env', undefined, 401);
    let client = clients.get(env.OPENAI_API_KEY);
    if (!client) {
      client = new OpenAI({ apiKey: env.OPENAI_API_KEY, maxRetries: 0, timeout: env.DECISION_TIMEOUT_MS });
      clients.set(env.OPENAI_API_KEY, client);
    }
    return client.decisions.create({ model, input, questions });
  };
}

export const openaiTransport: Transport = (input, questions) => createDecisionsTransport()(input, questions);

/** Asks every question about `input`, chunked at `maxPerCall` (Decisions: 400) per call, answers merged by name. */
export async function decide(
  input: DecisionInput,
  questions: Question[],
  transport: Transport = openaiTransport,
  maxPerCall: number = MAX_QUESTIONS_PER_CALL,
): Promise<DecideResult> {
  const names = new Set<string>();
  for (const q of questions) {
    if (names.has(q.name)) throw new Error(`Duplicate question name: ${q.name}`);
    names.add(q.name);
  }

  const chunks: Question[][] = [];
  for (let i = 0; i < questions.length; i += maxPerCall) {
    chunks.push(questions.slice(i, i + maxPerCall));
  }
  const responses = await Promise.all(
    chunks.map(async (chunk) => {
      let raw: unknown;
      try {
        raw = await transport(input, chunk);
      } catch (err) {
        if (err instanceof UpstreamError) throw err;
        const status = (err as { status?: unknown }).status;
        throw new UpstreamError(`Decisions request failed: ${(err as Error).message}`, undefined, typeof status === 'number' ? status : undefined);
      }
      const parsed = DecisionsResponseSchema.safeParse(raw);
      if (!parsed.success) throw new UpstreamError(`Invalid Decisions response: ${parsed.error.message}`, raw);
      return { chunk, answers: parsed.data.answers, usage: parsed.data.usage, raw };
    }),
  );

  const result: DecideResult = {
    predicates: {},
    choices: {},
    scores: {},
    refusals: [],
    tokens: NO_TOKENS,
    calls: chunks.length,
  };
  for (const { chunk, answers, usage, raw } of responses) {
    if (usage) {
      result.tokens = addTokens(result.tokens, {
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        totalTokens: usage.total_tokens,
      });
    }
    const byName = new Map(answers.map((a) => [a.name, a]));
    for (const q of chunk) {
      const answer = byName.get(q.name);
      if (!answer) throw new UpstreamError(`Decisions response has no answer for "${q.name}"`, raw);
      if (answer.type === 'refusal') {
        result.refusals.push(q.name);
        if (q.type === 'predicate') result.predicates[q.name] = 0;
        else if (q.type === 'choice') result.choices[q.name] = { value: null, confidence: 0 };
        else result.scores[q.name] = null;
      } else if (answer.type !== q.type) {
        throw new UpstreamError(`Decisions answer "${q.name}" is a ${answer.type}, expected ${q.type}`, raw);
      } else if (answer.type === 'predicate') {
        result.predicates[q.name] = answer.probability;
      } else if (answer.type === 'choice') {
        result.choices[q.name] = { value: answer.choice, confidence: answer.confidence };
      } else {
        result.scores[q.name] = answer.probabilities.map(({ label, probability }) => ({ label, probability }));
      }
    }
  }
  return result;
}
