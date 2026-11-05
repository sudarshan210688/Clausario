import { ChatAnthropic } from '@langchain/anthropic';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatGroq } from '@langchain/groq';
import { ChatOpenAI } from '@langchain/openai';
import { env } from '../config/env.js';
import { BadRequestError } from '../errors.js';
import type { ProviderId } from '../schemas/scenario.schema.js';

// LangChain chat models per provider (Architecture.md §10.1). Model ids come from `*_MODELS`, never hardcoded.
// SDK retries are 0: LangChain withRetry/withFallbacks own retries (§10.3).

export interface ProviderInfo {
  id: ProviderId;
  models: string[];
  /** First of `models`. */
  default: string;
}

/** CLAUSARIO_FAKE_ENGINES demos: openai is "keyed" with a fake model when nothing else is configured. */
const fakeKey = (key: string | undefined) => key ?? (env.CLAUSARIO_FAKE_ENGINES ? 'fake' : undefined);
const PROVIDERS: Record<ProviderId, { key: () => string | undefined; models: () => string[]; keyVar: string }> = {
  openai: {
    key: () => fakeKey(env.OPENAI_API_KEY),
    models: () => (env.OPENAI_MODELS.length === 0 && env.CLAUSARIO_FAKE_ENGINES ? ['fake-model'] : env.OPENAI_MODELS),
    keyVar: 'OPENAI_API_KEY',
  },
  anthropic: { key: () => env.ANTHROPIC_API_KEY, models: () => env.ANTHROPIC_MODELS, keyVar: 'ANTHROPIC_API_KEY' },
  groq: { key: () => env.GROQ_API_KEY, models: () => env.GROQ_MODELS, keyVar: 'GROQ_API_KEY' },
  inception: { key: () => env.INCEPTION_API_KEY, models: () => env.INCEPTION_MODELS, keyVar: 'INCEPTION_API_KEY' },
};

/** Structured-output method per provider (§10.1). `undefined` = LangChain default. */
export function methodFor(provider: ProviderId): 'jsonSchema' | 'functionCalling' | undefined {
  if (provider === 'anthropic') return 'jsonSchema';
  if (provider === 'groq') return 'functionCalling';
  return undefined;
}

/** Providers with a key and at least one model; order openai, anthropic, groq, inception. */
export function listProviders(): ProviderInfo[] {
  return (Object.keys(PROVIDERS) as ProviderId[]).flatMap((id) => {
    const models = PROVIDERS[id].models();
    return PROVIDERS[id].key() && models.length > 0 ? [{ id, models, default: models[0] }] : [];
  });
}

/** True when `provider` is keyed and lists `model`. */
export function isListedModel(provider: ProviderId, model: string): boolean {
  return listProviders().some((p) => p.id === provider && p.models.includes(model));
}

/** Throws 400 unless `model` is listed for a keyed `provider` (generate request). */
export function assertListedModel(provider: ProviderId, model: string): void {
  const info = listProviders().find((p) => p.id === provider);
  if (!info) throw new BadRequestError(`Provider "${provider}" is not configured (${PROVIDERS[provider].keyVar} / models missing)`);
  if (!info.models.includes(model)) {
    throw new BadRequestError(`Unknown model "${model}" for ${provider}; configured: ${info.models.join(', ')}`);
  }
}

export type ChatModelFactory = (provider: ProviderId, model: string) => BaseChatModel;
let override: ChatModelFactory | null = null;

/** Tests and fake mode: replace every chat model. `null` restores the real ones. */
export function setChatModelFactory(next: ChatModelFactory | null): void {
  override = next;
}

/** Test hook: a custom `fetch` for the Anthropic SDK, to inspect request bodies without the network. */
export interface ModelTransportOptions {
  anthropicFetch?: typeof fetch;
}

/** Chat model for `provider`; 400 if its key is missing. Model membership is checked by `assertListedModel`. */
export function createChatModel(provider: ProviderId, model: string, transport: ModelTransportOptions = {}): BaseChatModel {
  if (override) return override(provider, model);
  const apiKey = PROVIDERS[provider].key();
  if (!apiKey) throw new BadRequestError(`${PROVIDERS[provider].keyVar} is missing in backend/.env`);
  const temperature = env.LLM_TEMPERATURE;
  const timeout = env.LLM_TIMEOUT_MS;
  switch (provider) {
    case 'openai':
      return new ChatOpenAI({ model, apiKey, temperature, timeout, maxRetries: 0 });
    case 'anthropic':
      // Current Claude models reject sampling settings: no temperature / topP / topK (§10.2).
      return new ChatAnthropic({
        model,
        apiKey,
        maxTokens: 16_000,
        maxRetries: 0,
        clientOptions: { timeout, ...(transport.anthropicFetch ? { fetch: transport.anthropicFetch } : {}) },
      });
    case 'groq':
      return new ChatGroq({ model, apiKey, temperature, timeout, maxRetries: 0 });
    case 'inception':
      return new ChatOpenAI({ model, apiKey, temperature, timeout, maxRetries: 0, configuration: { baseURL: env.INCEPTION_BASE_URL } });
  }
}
