import { env, type ModelPricing } from './config/env.js';

// Token usage + estimated cost per pipeline step (route / select / generate / evaluate). Prices are USD per 1M
// tokens from MODEL_PRICING; a model without a price → costUsd null.

export interface Tokens {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

export interface Usage extends Tokens {
  model: string;
  /** Upstream calls made (chunks, retries). */
  calls: number;
  /** `null` when MODEL_PRICING has no entry for `model`. */
  costUsd: number | null;
  /** Engine or provider that served the step (`decisions`, `jev`, `openai`, …), when known. */
  engine?: string;
  /** True when a fallback from .env answered instead of the primary (Architecture.md §9.5, §10.3). */
  fallbackUsed?: boolean;
}

export const NO_TOKENS: Tokens = { inputTokens: 0, outputTokens: 0, totalTokens: 0 };

export function addTokens(a: Tokens, b: Tokens): Tokens {
  return {
    inputTokens: a.inputTokens + b.inputTokens,
    outputTokens: a.outputTokens + b.outputTokens,
    totalTokens: a.totalTokens + b.totalTokens,
  };
}

/** USD, rounded to 6 decimals; `null` without a price. */
export function costUsd(tokens: Tokens, price: { input: number; output: number } | undefined): number | null {
  if (!price) return null;
  const usd = (tokens.inputTokens * price.input + tokens.outputTokens * price.output) / 1_000_000;
  return Math.round(usd * 1e6) / 1e6;
}

export function toUsage(model: string, calls: number, tokens: Tokens, pricing: ModelPricing = env.MODEL_PRICING): Usage {
  return { model, calls, ...tokens, costUsd: costUsd(tokens, pricing[model]) };
}

/** Tokens from a LangChain `AIMessage.usage_metadata`; missing → 0. */
export function tokensFromMessage(message: { usage_metadata?: { input_tokens: number; output_tokens: number; total_tokens: number } } | undefined): Tokens {
  const u = message?.usage_metadata;
  return u ? { inputTokens: u.input_tokens, outputTokens: u.output_tokens, totalTokens: u.total_tokens } : NO_TOKENS;
}

/** Sums model calls over a job (e.g. OKF descriptions, Architecture.md §10.4). `null` tokens = no model call. */
export class UsageMeter {
  private calls = 0;
  private tokens: Tokens = NO_TOKENS;

  add(tokens: Tokens | null): void {
    if (!tokens) return;
    this.calls++;
    this.tokens = addTokens(this.tokens, tokens);
  }

  /** `null` when no model call was recorded. */
  usage(model: string, pricing?: ModelPricing): Usage | null {
    return this.calls === 0 ? null : toUsage(model, this.calls, this.tokens, pricing);
  }
}
