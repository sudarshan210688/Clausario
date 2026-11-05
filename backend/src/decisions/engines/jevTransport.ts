import { TypeSafeClient, type Questions, type SystemOneResult } from '@typesafe-ai/sdk';
import { env } from '../../config/env.js';
import { UpstreamError, type DecisionInput, type Question, type Transport } from '../client.js';

// Jev (TypeSafe AI) behind the Decisions-shaped Transport contract (Architecture.md §9.1, §9.2).
// predicate → noul · choice → criteria{label: description} · score → criteria[desc0, desc1, …] (index = level).

/** The part of TypeSafeClient the transport uses; tests pass a fake. */
export interface JevClient {
  systemOne(request: { state: unknown; questions: Questions; model?: string }): Promise<Pick<SystemOneResult<Questions>, 'answers' | 'usage' | 'model'>>;
}

type JevQuestions = Questions;

/** Decisions input → Jev state: a string stays a string; messages become `{ text, json }`. */
export function toJevState(input: DecisionInput): string | Record<string, unknown> {
  if (typeof input === 'string') return input;
  const text: string[] = [];
  let json: Record<string, unknown> = {};
  for (const message of input as unknown as { content: string | { type: string; text?: string; data?: unknown }[] }[]) {
    if (typeof message.content === 'string') {
      text.push(message.content);
      continue;
    }
    for (const part of message.content) {
      if (part.type === 'input_text' && part.text) text.push(part.text);
      else if (part.type === 'input_json' && part.data && typeof part.data === 'object') json = { ...json, ...(part.data as Record<string, unknown>) };
    }
  }
  return Object.keys(json).length > 0 ? { text: text.join('\n\n'), json } : text.join('\n\n');
}

export function toJevQuestions(questions: readonly Question[]): JevQuestions {
  const out: JevQuestions = {};
  for (const q of questions) {
    if (q.type === 'predicate') out[q.name] = { type: 'noul', instructions: q.instructions };
    else if (q.type === 'choice') {
      out[q.name] = { type: 'choice', instructions: q.instructions, criteria: Object.fromEntries(q.choices.map((c) => [c.value, c.description ?? null])) };
    } else {
      out[q.name] = {
        type: 'score',
        instructions: q.instructions,
        criteria: q.levels.map((l) => (l.description ? `${l.label}: ${l.description}` : l.label)) as unknown as [string, string, ...string[]],
      };
    }
  }
  return out;
}

/** Jev response → the Decisions response body that `decide()` validates. Score probabilities re-keyed index → label. */
export function fromJevResult(questions: readonly Question[], result: Pick<SystemOneResult<Questions>, 'answers' | 'usage'>): unknown {
  const answers = result.answers as unknown as Record<string, Record<string, unknown> | undefined>;
  const input = result.usage?.input_tokens ?? 0;
  const output = result.usage?.output_tokens ?? 0;
  return {
    answers: questions.flatMap((q): Record<string, unknown>[] => {
      const a = answers[q.name];
      if (!a) return [];
      if (q.type === 'predicate') return [{ type: 'predicate', name: q.name, probability: a.noul }];
      if (q.type === 'choice') return [{ type: 'choice', name: q.name, choice: a.choice, confidence: a.confidence }];
      const probs = (a.probabilities ?? {}) as Record<string, number>;
      return [{ type: 'score', name: q.name, probabilities: q.levels.map((l, i) => ({ label: l.label, probability: probs[String(i)] ?? 0 })) }];
    }),
    usage: { input_tokens: input, output_tokens: output, total_tokens: input + output },
  };
}

const clients = new Map<string, JevClient>();

function defaultClient(model: string): JevClient {
  if (!env.TYPESAFE_API_KEY) throw new UpstreamError('TYPESAFE_API_KEY is missing in backend/.env', undefined, 401);
  const key = `${env.TYPESAFE_API_KEY}:${model}`;
  let client = clients.get(key);
  if (!client) {
    // SDK retries off: LangChain withRetry owns retries (Architecture.md §9.3).
    client = new TypeSafeClient({ apiKey: env.TYPESAFE_API_KEY, defaultModel: model, retry: { maxRetries: 0 }, timeout: env.DECISION_TIMEOUT_MS }) as unknown as JevClient;
    clients.set(key, client);
  }
  return client;
}

export function createJevTransport(model: string = env.JEV_MODEL, client?: JevClient): Transport {
  return async (input, questions) => {
    const jev = client ?? defaultClient(model);
    try {
      const result = await jev.systemOne({ state: toJevState(input), questions: toJevQuestions(questions), model });
      return fromJevResult(questions, result);
    } catch (err) {
      if (err instanceof UpstreamError) throw err;
      const status = (err as { status?: unknown }).status;
      throw new UpstreamError(`Jev request failed: ${(err as Error).message}`, undefined, typeof status === 'number' ? status : undefined);
    }
  };
}
