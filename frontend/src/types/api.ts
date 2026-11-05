// Mirrors backend response shapes (backend/src/schemas/{api,scenario,okf}.schema.ts, Architecture.md §10).

export type RegId = 'gdpr' | 'eu-ai-act';
export type RegulationName = 'GDPR' | 'EU AI Act';
/** Article number, or `<int><letter>` for an inserted article (e.g. `"4a"`). */
export type ArticleRef = number | string;

export interface ErrorResponse {
  error: string;
  /** Zod issues (400). */
  issues?: unknown[];
  /** Upstream body that failed validation (502). */
  raw?: unknown;
}

export interface HealthResponse {
  status: 'ok';
}

// --- OKF ---

export interface ScrapeRequest {
  dryRun?: boolean;
  redescribe?: boolean;
}

export interface ScrapeAccepted {
  jobId: string;
}

export type JobStatus = 'queued' | 'running' | 'done' | 'failed';

/** Global ids, e.g. `gdpr:art-017`. */
export interface ScrapeResult {
  added: string[];
  updated: string[];
  skipped: string[];
  redescribed: string[];
}

export interface JobResponse {
  id: string;
  reg: RegId;
  dryRun: boolean;
  status: JobStatus;
  progress: { done: number; total: number };
  result?: ScrapeResult;
  error?: string;
  /** Description model tokens + cost; null when only templates were used (Architecture.md §10.4). */
  usage?: Usage | null;
}

export interface DocSummary {
  id: string;
  title: string;
  description: string;
}

export interface IndexResponse {
  chapters: (DocSummary & { articles: DocSummary[] })[];
  recitals: DocSummary[];
  annexes: DocSummary[];
}

export interface ArticleFrontmatter {
  type: 'Article';
  title: string;
  description: string;
  description_by: string;
  resource: string;
  tags: string[];
  regulation: RegulationName;
  chapter: number;
  article: ArticleRef;
  recitals: number[];
  omnibus_recitals: number[];
  annexes: string[];
  external_annexes: string[];
  cross_refs: ArticleRef[];
  anchors: string[];
  content_hash: string;
  sources: { id: string; resource: string }[];
  generated: { by: string; at: string };
  status: 'stable' | 'draft';
}

export interface ArticleResponse {
  frontmatter: ArticleFrontmatter;
  body: string;
  edges: {
    chapter: string;
    recitals: string[];
    omnibusRecitals: string[];
    annexes: string[];
    crossRefs: string[];
  };
}

export interface LogResponse {
  entries: { date: string; line: string }[];
}

// --- Analyze ---

/** Tokens + estimated cost of one pipeline step. */
export interface Usage {
  model: string;
  calls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  /** USD; `null` when MODEL_PRICING has no price for `model`. */
  costUsd: number | null;
  /** Engine or provider that served the step. */
  engine?: string;
  /** A fallback from .env answered instead of the primary. */
  fallbackUsed?: boolean;
}

export type RouteChoice = RegId | 'both' | 'none';

export interface RouteResponse {
  regulations: RegId[];
  probabilities: { personalData: number; aiSystem: number };
  /** `value: null` when the choice question was refused. */
  choice: { value: RouteChoice | null; confidence: number };
  needsReview: boolean;
  usage: Usage;
}

export interface ExpandedRef {
  id: string;
  title: string;
}

export interface SelectedArticle {
  id: string;
  regulation: RegId;
  chapter: number;
  title: string;
  p: number;
}

export interface SelectResponse {
  chapters: { id: string; p: number; kept: boolean }[];
  /** Ranked p desc; at most SELECT_TOP_N per regulation. */
  selected: SelectedArticle[];
  expansion: {
    recitals: (ExpandedRef & { draft: boolean })[];
    annexes: ExpandedRef[];
    crossRefs: ExpandedRef[];
  };
  refusals: string[];
  usage: Usage;
}

// --- LLM / scenarios ---

export type ProviderId = 'openai' | 'anthropic' | 'groq' | 'inception';

export interface ProvidersResponse {
  providers: { id: ProviderId; models: string[]; default: string }[];
}

export type Priority = 'High' | 'Medium' | 'Low';

export interface Scenario {
  id: string;
  title: string;
  regulation: RegulationName;
  mappedClauses: string[];
  priority: Priority;
  prerequisites: string[];
  steps: string[];
  expectedResult: string;
}

export interface GenerateRequest {
  story: string;
  articleIds: string[];
  provider: ProviderId;
  model: string;
  count: number;
}

export interface InvalidClause {
  scenarioId: string;
  clause: string;
}

export interface PackManifest {
  included: { id: string; tokens: number }[];
  dropped: { id: string; reason: string }[];
  totalTokens: number;
  budget: number;
}

export interface GenerateResponse {
  scenarios: Scenario[];
  packManifest: PackManifest;
  invalidClauses: InvalidClause[];
  usage: Usage;
  servedModel?: string;
  attempts?: { provider: ProviderId; model: string; ok: boolean; error?: string }[];
}

export interface EvaluateRequest {
  story: string;
  articleIds: string[];
  scenarios: Scenario[];
}

export type Verdict = 'pass' | 'warn' | 'fail';
export type PriorityFit = 'too_low' | 'correct' | 'too_high';

export interface ScenarioEvaluation {
  id: string;
  /** 0–2; `null` when refused. */
  scores: { traceability: number | null; testability: number | null; clarity: number | null };
  priorityFit: PriorityFit | null;
  duplicateP: number;
  verdict: Verdict;
}

export interface EvaluateResponse {
  scenarios: ScenarioEvaluation[];
  coverage: { covered: string[]; uncovered: string[]; pct: number };
  summary: { pass: number; warn: number; fail: number };
  refusals: string[];
  usage: Usage;
}

// --- Auth, menus, config, runs (Architecture.md §8, §13) ---

export type Role = 'Admin' | 'Tester';
export type MenuKey = 'overview' | 'analyze' | 'runs' | 'review' | 'knowledge' | 'settings' | 'users' | 'access';
export type EngineId = 'decisions' | 'jev';

export interface MenuItem {
  key: MenuKey;
  label: string;
  group: 'Workspace' | 'Governance' | 'Knowledge' | 'Administration';
  path: string;
  icon: string;
  order: number;
  adminOnly: boolean;
}

export interface PublicUser {
  id: string;
  username: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

export interface MeResponse {
  user: PublicUser;
  menus: MenuItem[];
}

export interface ConfigResponse {
  engines: {
    available: { id: EngineId; model: string; keyed: boolean }[];
    stages: Record<'route' | 'select' | 'review' | 'eval', EngineId>;
    uiSwitch: boolean;
    fallbacks: string[];
    maxRetries: number;
  };
  evaluation: { enabled: boolean; engine: EngineId };
  review: { threshold: number; maxRounds: number; engine: EngineId };
  generation: {
    providers: { id: ProviderId; models: string[]; default: string }[];
    fallbacks: string[];
    maxRetries: number;
    scenarioMaxCount: number;
    packTokenBudget: number;
  };
  thresholds: Record<string, number>;
  description: { model: string | null };
}

export type RunStatus = 'running' | 'awaiting_review' | 'completed' | 'needs_rework' | 'not_applicable' | 'failed';
export type RunStep = 'classify' | 'select' | 'review' | 'generate' | 'evaluate';
export type HitlAction = 'approve' | 'override' | 'context' | 'reject';

export interface ReviewLog {
  by: string;
  action: HitlAction;
  round: number;
  at: string;
  score: number | null;
  note?: string;
}

export interface RunRecord {
  id: string;
  ownerId: string;
  ownerUsername: string;
  title: string;
  status: RunStatus;
  step: RunStep;
  score: number | null;
  rounds: number;
  regulations: RegId[];
  engines: { route: string; select: string; review: string; eval: string };
  provider: string;
  model: string;
  servedModel: string | null;
  scenarioCount: number | null;
  verdicts: { pass: number; warn: number; fail: number } | null;
  costUsd: number | null;
  reviews: ReviewLog[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewResult {
  score: number;
  threshold: number;
  components: { agreement: number; specificity: number; relevance: number; completeness: number };
  engine: string;
  model: string;
  round: number;
}

export type RunUsageStep = 'route' | 'select' | 'review' | 'generate' | 'evaluate';

export interface RunState {
  story: string;
  contextRounds: string[];
  options: { engine?: EngineId; provider: ProviderId; model: string; count: number; evaluate: boolean };
  route: RouteResponse | null;
  selection: SelectResponse | null;
  review: ReviewResult | null;
  regulations: RegId[];
  articleIds: string[];
  reviews: ReviewLog[];
  generation: GenerateResponse | null;
  evaluation: EvaluateResponse | null;
  usage: Partial<Record<RunUsageStep, Usage>>;
  outcome: 'completed' | 'needs_rework' | 'not_applicable' | null;
}

export interface RunDetail {
  run: RunRecord;
  state: RunState | null;
  next: string[];
  canReview: boolean;
}

export interface RunsPage {
  runs: RunRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export interface StartRunRequest {
  story: string;
  engine?: EngineId;
  provider: ProviderId;
  model: string;
  count: number;
  evaluate?: boolean;
}

export type ReviewRequest =
  | { action: 'approve'; note?: string }
  | { action: 'override'; regulations: RegId[]; articleIds: string[]; note?: string }
  | { action: 'context'; context: string }
  | { action: 'reject'; note?: string };

export interface DashboardResponse {
  total: number;
  byStatus: Record<RunStatus, number>;
  awaitingReview: number;
  costUsd: number;
  recent: RunRecord[];
  scope: 'all' | 'own';
}

export type UserWithMenus = PublicUser & { menus: MenuKey[] };

export interface AccessRow {
  userId: string;
  username: string;
  role: Role;
  active: boolean;
  menus: MenuKey[];
  custom: boolean;
  updatedBy: string | null;
  updatedAt: string | null;
}
