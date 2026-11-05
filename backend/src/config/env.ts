import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';
import { MENU_KEYS } from '../menus/catalogue.js';

// backend/ — src/config/env.ts and dist/config/env.js are both two levels down.
export const backendRoot = fileURLToPath(new URL('../../', import.meta.url));

// `KEY=` in .env yields '' — treat as unset.
const optionalString = z.preprocess((v) => (v === '' ? undefined : v), z.string().optional());
const probability = (fallback: number) => z.coerce.number().min(0).max(1).default(fallback);
/** `a, b,,c` → `['a', 'b', 'c']`; unset → `[]`. */
const commaList = z.preprocess(
  (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : []),
  z.array(z.string()),
);
/** `model=input/output, …` USD per 1M tokens → `{ model: { input, output } }`. */
const pricing = z
  .preprocess(
    (v) =>
      (typeof v === 'string' ? v.split(',') : [])
        .map((s) => s.trim())
        .filter(Boolean)
        .map((entry) => {
          const [model = '', prices = ''] = entry.split('=');
          const [input, output] = prices.split('/');
          return { model: model.trim(), input: Number(input), output: Number(output) };
        }),
    z.array(z.object({ model: z.string().min(1), input: z.number().min(0), output: z.number().min(0) })),
  )
  .transform((list) => Object.fromEntries(list.map(({ model, input, output }) => [model, { input, output }])));

/** Published list prices (2026-11); override in .env. Decisions and Jev bill input only. */
const DEFAULT_PRICING =
  'gpt-6-luna=0.10/0, gpt-4o-mini-2024-07-18=0.15/0.60, gpt-4o-mini=0.15/0.60, jev-1.14.0=0.042/0, jev-1.13.0=0.042/0, jev-latest=0.042/0';

// --- Engines, providers and stages (Architecture.md §6) ---

export const ENGINE_IDS = ['decisions', 'jev'] as const;
export type EngineId = (typeof ENGINE_IDS)[number];
export const GENERATION_PROVIDER_IDS = ['openai', 'anthropic', 'groq', 'inception'] as const;
export type GenerationProviderId = (typeof GENERATION_PROVIDER_IDS)[number];
export const STAGES = ['route', 'select', 'review', 'eval'] as const;
export type Stage = (typeof STAGES)[number];

const engine = z.enum(ENGINE_IDS);
const optionalEngine = z.preprocess((v) => (v === '' ? undefined : v), engine.optional());
/** `true/false/1/0/yes/no` (case-insensitive); unset or '' → fallback. */
const flag = (fallback: boolean) =>
  z.preprocess((v) => {
    if (v === undefined || v === '') return fallback;
    if (typeof v !== 'string') return v;
    const s = v.trim().toLowerCase();
    return ['true', '1', 'yes'].includes(s) ? true : ['false', '0', 'no'].includes(s) ? false : v;
  }, z.boolean());
/** `a:x, b:y` → `[{ id: 'a', model: 'x' }, …]`; split at the first `:` so model ids may contain more. */
const pairList = <T extends readonly [string, ...string[]]>(ids: T) =>
  z.preprocess(
    (v) =>
      (typeof v === 'string' ? v.split(',') : [])
        .map((s) => s.trim())
        .filter(Boolean)
        .map((entry) => {
          const i = entry.indexOf(':');
          return i < 0 ? { id: entry, model: '' } : { id: entry.slice(0, i).trim(), model: entry.slice(i + 1).trim() };
        }),
    z.array(z.object({ id: z.enum(ids), model: z.string().min(1) })),
  );
const collection = (fallback: string) => z.string().min(1).default(fallback);
const menuList = z.preprocess(
  (v) => (typeof v === 'string' ? v.split(',').map((s) => s.trim()).filter(Boolean) : v),
  z.array(z.enum(MENU_KEYS)),
);

export type ModelPricing =Record<string, { input: number; output: number }>;

export const EnvSchema = z.object({
  PORT: z.coerce.number().int().min(1).max(65535).default(5000),
  KNOWLEDGE_DIR: z
    .string()
    .min(1)
    .default('./knowledge')
    .transform((dir) => path.resolve(backendRoot, dir)),
  GDPR_BASE_URL: z
    .url()
    .default('https://gdpr-info.eu')
    .transform((url) => url.replace(/\/+$/, '')),
  EU_AI_ACT_BASE_URL: z
    .url()
    .default('https://artificialintelligenceact.eu')
    .transform((url) => url.replace(/\/+$/, '')),
  SCRAPE_DELAY_MS: z.coerce.number().int().min(0).default(1000),
  // Required for Decisions calls and when descriptions are generated (non-dryRun scrape).
  OPENAI_API_KEY: optionalString,
  DESCRIPTION_MODEL: optionalString,
  DECISIONS_MODEL: z.string().min(1).default('gpt-6-luna'),
  // Uncalibrated defaults (Architecture.md §11).
  ROUTE_THRESHOLD: probability(0.5),
  ROUTE_MIN_CONFIDENCE: probability(0.6),
  CHAPTER_THRESHOLD: probability(0.3),
  ARTICLE_THRESHOLD: probability(0.5),
  SELECT_TOP_N: z.coerce.number().int().min(1).default(8),
  // Generation providers (Architecture.md §8.1): `*_MODELS` comma-separated, first = default.
  OPENAI_MODELS: commaList,
  ANTHROPIC_API_KEY: optionalString,
  ANTHROPIC_MODELS: commaList,
  INCEPTION_API_KEY: optionalString,
  INCEPTION_BASE_URL: z.url().default('https://api.inceptionlabs.ai/v1'),
  INCEPTION_MODELS: commaList,
  PACK_TOKEN_BUDGET: z.coerce.number().int().min(1).default(24000),
  LLM_TEMPERATURE: z.coerce.number().min(0).max(2).default(0.2),
  SCENARIO_MAX_COUNT: z.coerce.number().int().min(1).default(50),
  // Evaluation verdict (Architecture.md §9): score thresholds on the 0–2 scale, duplicate probability 0–1.
  EVAL_SCORE_PASS: z.coerce.number().min(0).max(2).default(1.3),
  EVAL_SCORE_FAIL: z.coerce.number().min(0).max(2).default(0.7),
  EVAL_DUP_THRESHOLD: probability(0.7),
  // Cost estimate per step: USD per 1M input / output tokens, keyed by model id (DECISIONS_MODEL, *_MODELS).
  MODEL_PRICING: z.preprocess((v) => (v === '' || v === undefined ? DEFAULT_PRICING : v), pricing),

  // --- Auth (required at server start, see platformProblems) ---
  JWT_SECRET: optionalString,
  SESSION_HOURS: z.coerce.number().int().min(1).max(24 * 30).default(8),
  ADMIN_USERNAME: optionalString,
  ADMIN_PASSWORD: optionalString,
  CLIENT_ORIGIN: z.url().default('http://localhost:5173'),
  // --- Qdrant (§7) ---
  QDRANT_URL: z.preprocess((v) => (v === '' ? undefined : v), z.url().optional()),
  QDRANT_API_KEY: optionalString,
  QDRANT_USERS_COLLECTION: collection('users'),
  QDRANT_CHECKPOINTS_COLLECTION: collection('checkpoints'),
  QDRANT_MENU_COLLECTION: collection('menucontroller'),
  // --- Menus (§8.3) ---
  MENU_DEFAULT_TESTER: z.preprocess((v) => (v === '' || v === undefined ? 'overview,analyze,runs' : v), menuList),
  // --- Decision engines (§9) ---
  DECISION_ENGINE: engine.default('decisions'),
  ROUTE_ENGINE: optionalEngine,
  SELECT_ENGINE: optionalEngine,
  REVIEW_ENGINE: optionalEngine,
  EVAL_ENGINE: optionalEngine,
  ENGINE_UI_SWITCH: flag(true),
  DECISION_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(2),
  DECISION_TIMEOUT_MS: z.coerce.number().int().min(1000).default(60_000),
  DECISION_FALLBACKS: pairList(ENGINE_IDS),
  TYPESAFE_API_KEY: optionalString,
  JEV_MODEL: z.string().min(1).default('jev-1.14.0'),
  JEV_MAX_QUESTIONS_PER_CALL: z.coerce.number().int().min(1).max(400).default(100),
  // --- Evaluation, review, HITL (§11, §12) ---
  EVAL_ENABLED: flag(true),
  REVIEW_THRESHOLD: z.coerce.number().int().min(0).max(100).default(70),
  HITL_MAX_ROUNDS: z.coerce.number().int().min(0).max(10).default(3),
  // --- Generation (§10) ---
  GROQ_API_KEY: optionalString,
  GROQ_MODELS: commaList,
  LLM_MAX_RETRIES: z.coerce.number().int().min(0).max(10).default(2),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).default(120_000),
  GENERATION_FALLBACKS: pairList(GENERATION_PROVIDER_IDS),
  // Tests and local demos only: fake engines and LLMs. Refused when NODE_ENV=production.
  CLAUSARIO_FAKE_ENGINES: flag(false),
});

export type RawEnv = z.infer<typeof EnvSchema>;
export type Env = RawEnv & {
  /** Engine per stage; an empty stage variable inherits DECISION_ENGINE. */
  ENGINES: Record<Stage, EngineId>;
};

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Invalid configuration:\n${problems.map((p) => `  - ${p}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/** Throws ZodError on invalid input; ConfigError for CLAUSARIO_FAKE_ENGINES in production. */
export function parseEnv(raw: Record<string, string | undefined>): Env {
  const e = EnvSchema.parse(raw);
  if (e.CLAUSARIO_FAKE_ENGINES && raw.NODE_ENV === 'production') {
    throw new ConfigError(['CLAUSARIO_FAKE_ENGINES cannot be used when NODE_ENV is production']);
  }
  const ENGINES = {
    route: e.ROUTE_ENGINE ?? e.DECISION_ENGINE,
    select: e.SELECT_ENGINE ?? e.DECISION_ENGINE,
    review: e.REVIEW_ENGINE ?? e.DECISION_ENGINE,
    eval: e.EVAL_ENGINE ?? e.DECISION_ENGINE,
  };
  return { ...e, ENGINES };
}

/** What a feature needs from .env: `qdrant` (scripts) or `server` (Qdrant + auth). */
export type Requirement = 'qdrant' | 'server';

/**
 * Names of required platform variables that are missing or too weak. Messages name the variable, never its value,
 * so they are safe to log. Kept out of the schema so unit tests and scrapes run without Qdrant or auth.
 */
export function platformProblems(e: Env, need: Requirement): string[] {
  const problems: string[] = [];
  if (!e.QDRANT_URL) problems.push('QDRANT_URL is required');
  if (!e.QDRANT_API_KEY) problems.push('QDRANT_API_KEY is required');
  if (need === 'server') {
    if (!e.JWT_SECRET) problems.push('JWT_SECRET is required');
    else if (e.JWT_SECRET.length < 32) problems.push('JWT_SECRET must be at least 32 characters');
  }
  return problems;
}

/** Throws ConfigError when `platformProblems` finds anything. */
export function assertPlatform(e: Env, need: Requirement): void {
  const problems = platformProblems(e, need);
  if (problems.length > 0) throw new ConfigError(problems);
}

function loadEnv(): Env {
  dotenv.config({ path: path.join(backendRoot, '.env'), quiet: true });
  try {
    return parseEnv(process.env);
  } catch (err) {
    if (err instanceof z.ZodError) {
      console.error('Invalid environment configuration:');
      for (const issue of err.issues) {
        console.error(`  ${issue.path.join('.') || '(root)'}: ${issue.message}`);
      }
      process.exit(1);
    }
    if (err instanceof ConfigError) {
      console.error(err.message);
      process.exit(1);
    }
    throw err;
  }
}

export const env = loadEnv();
