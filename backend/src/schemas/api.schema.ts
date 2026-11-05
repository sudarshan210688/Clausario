import { z } from 'zod';
import { parseArticleRef } from '../config/chapterMap.js';
import { ArticleFrontmatter } from './okf.schema.js';

export const HealthResponse = z.object({
  status: z.literal('ok'),
});
export type HealthResponse = z.infer<typeof HealthResponse>;

export const ErrorResponse = z.object({
  error: z.string(),
  issues: z.array(z.unknown()).optional(),
  /** Upstream response body that failed validation (502 only). */
  raw: z.unknown().optional(),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;

export const RegParam = z.object({
  reg: z.enum(['gdpr', 'eu-ai-act']),
});
export type RegParam = z.infer<typeof RegParam>;

export const ScrapeRequest = z.object({
  dryRun: z.boolean().optional(),
  /** Rewrite descriptions of unchanged docs too (e.g. template → LLM). */
  redescribe: z.boolean().optional(),
});
export type ScrapeRequest = z.infer<typeof ScrapeRequest>;

export const ScrapeAccepted = z.object({
  jobId: z.string(),
});
export type ScrapeAccepted = z.infer<typeof ScrapeAccepted>;

export const JobParam = z.object({
  id: z.string().min(1),
});
export type JobParam = z.infer<typeof JobParam>;

export const JobResponse = z.object({
  id: z.string(),
  reg: RegParam.shape.reg,
  dryRun: z.boolean(),
  status: z.enum(['queued', 'running', 'done', 'failed']),
  progress: z.object({ done: z.number().int(), total: z.number().int() }),
  result: z
    .object({
      added: z.array(z.string()),
      updated: z.array(z.string()),
      skipped: z.array(z.string()),
      redescribed: z.array(z.string()),
    })
    .optional(),
  error: z.string().optional(),
  /** Description model tokens + cost (lazy: UsageSchema is declared below). */
  usage: z.lazy(() => UsageSchema).nullable().optional(),
});
export type JobResponse = z.infer<typeof JobResponse>;

export const ArticleParam = RegParam.extend({
  /** `17`, or `4a` for an inserted article. */
  num: z
    .string()
    .regex(/^\d+[a-z]?$/, 'expected an article number, e.g. 17 or 4a')
    .transform(parseArticleRef),
});
export type ArticleParam = z.infer<typeof ArticleParam>;

export const RegQuery = z.object({
  reg: RegParam.shape.reg.optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
});
export type RegQuery = z.infer<typeof RegQuery>;

const DocSummary = z.object({
  /** Global id, e.g. `gdpr:art-017`. */
  id: z.string(),
  title: z.string(),
  description: z.string(),
});

export const IndexResponse = z.object({
  chapters: z.array(DocSummary.extend({ articles: z.array(DocSummary) })),
  recitals: z.array(DocSummary),
  annexes: z.array(DocSummary),
});
export type IndexResponse = z.infer<typeof IndexResponse>;

export const ArticleResponse = z.object({
  frontmatter: ArticleFrontmatter,
  body: z.string(),
  /** Global ids, frontmatter order. */
  edges: z.object({
    chapter: z.string(),
    recitals: z.array(z.string()),
    omnibusRecitals: z.array(z.string()),
    annexes: z.array(z.string()),
    crossRefs: z.array(z.string()),
  }),
});
export type ArticleResponse = z.infer<typeof ArticleResponse>;

export const LogResponse = z.object({
  entries: z.array(z.object({ date: z.string(), line: z.string() })),
});
export type LogResponse = z.infer<typeof LogResponse>;

const Story = z.string().trim().min(1, 'story must not be empty');
const Probability = z.number().min(0).max(1);
const TokenCount = z.number().int().min(0);

/** Tokens + estimated cost of one pipeline step (src/usage.ts). */
export const UsageSchema = z.object({
  model: z.string(),
  calls: z.number().int().min(0),
  inputTokens: TokenCount,
  outputTokens: TokenCount,
  totalTokens: TokenCount,
  /** USD; `null` when MODEL_PRICING has no price for `model`. */
  costUsd: z.number().min(0).nullable(),
  engine: z.string().optional(),
  fallbackUsed: z.boolean().optional(),
});

/** Per-call engine override (Architecture.md §9.4); allowed when ENGINE_UI_SWITCH=true and the engine is keyed. */
export const EngineParam = z.enum(['decisions', 'jev']).optional();

export const RouteRequest = z.object({ story: Story, engine: EngineParam });
export type RouteRequest = z.infer<typeof RouteRequest>;

export const RouteResponse = z.object({
  regulations: z.array(RegParam.shape.reg),
  probabilities: z.object({ personalData: Probability, aiSystem: Probability }),
  /** `value: null` when the choice question was refused. */
  choice: z.object({ value: z.enum(['gdpr', 'eu-ai-act', 'both', 'none']).nullable(), confidence: Probability }),
  needsReview: z.boolean(),
  usage: UsageSchema,
});
export type RouteResponse = z.infer<typeof RouteResponse>;

export const SelectRequest = z.object({
  story: Story,
  /** From ROUTE, possibly overridden in the UI. */
  regulations: z
    .array(RegParam.shape.reg)
    .min(1)
    .transform((regs) => [...new Set(regs)]),
  engine: EngineParam,
});
export type SelectRequest = z.infer<typeof SelectRequest>;

const ExpandedRef = z.object({ id: z.string(), title: z.string() });

export const SelectResponse = z.object({
  chapters: z.array(z.object({ id: z.string(), p: Probability, kept: z.boolean() })),
  /** Ranked p desc; at most SELECT_TOP_N per regulation. */
  selected: z.array(
    z.object({
      id: z.string(),
      regulation: RegParam.shape.reg,
      chapter: z.number().int(),
      title: z.string(),
      p: Probability,
    }),
  ),
  expansion: z.object({
    recitals: z.array(ExpandedRef.extend({ draft: z.boolean() })),
    annexes: z.array(ExpandedRef),
    crossRefs: z.array(ExpandedRef),
  }),
  refusals: z.array(z.string()),
  usage: UsageSchema,
});
export type SelectResponse = z.infer<typeof SelectResponse>;
