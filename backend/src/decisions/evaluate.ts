import { env } from '../config/env.js';
import type { Graph } from '../okf/graph.js';
import { buildPack } from '../pack/packer.js';
import {
  PriorityFit,
  type EvaluateRequest,
  type EvaluateResponse,
  type Scenario,
  type ScenarioEvaluation,
  type Verdict,
} from '../schemas/scenario.schema.js';
import { toUsage } from '../usage.js';
import { decideStage, usageOfDecided } from './engines/runnable.js';
import { UpstreamError, type DecideResult, type DecisionInput, type LevelProbability, type Question, type Transport } from './client.js';

// EVALUATE (Architecture.md §9): per scenario 3 scores + priority_fit choice + duplicate predicate, per article a
// coverage predicate, all about one input (story + rebuilt pack text + scenarios as input_json).

export const SCORE_NAMES = ['traceability', 'testability', 'clarity'] as const;
export type ScoreName = (typeof SCORE_NAMES)[number];

/** Level labels, weight = index (Low 0 · Medium 1 · High 2). */
export const LEVELS = ['Low', 'Medium', 'High'] as const;

const RUBRIC: Record<ScoreName, { instructions: string; levels: [string, string, string] }> = {
  traceability: {
    instructions: 'How directly does it test the obligation in the clauses listed in its mappedClauses?',
    levels: ['Does not test the mapped obligation.', 'Partially tests it.', 'Directly tests it.'],
  },
  testability: {
    instructions: 'How executable is it as a test?',
    levels: [
      'Vague or not executable.',
      'Executable, but the expected result is a weak oracle.',
      'Concrete steps and an observable expected result.',
    ],
  },
  clarity: {
    instructions: 'How clear is its title, steps and expected result?',
    levels: [
      'Ambiguous, or compound: bundles several unrelated behaviours into one scenario.',
      'Minor ambiguity.',
      'Unambiguous; several steps or checks of one behaviour are fine.',
    ],
  },
};

export interface ArticleRef {
  id: string;
  title: string;
}

export interface EvalThresholds {
  /** Any score below → warn. */
  pass: number;
  /** Any score below → fail. */
  fail: number;
  /** duplicateP ≥ → warn. */
  dup: number;
  /** Coverage p ≥ → covered (ARTICLE_THRESHOLD). */
  covered: number;
}

/** `TS-001` → `s_ts_001`. */
const scenarioPrefix = (id: string) => `s_${id.toLowerCase().replace(/-/g, '_')}`;
export const scenarioQuestionName = (id: string, question: ScoreName | 'priority_fit' | 'duplicate_of_another') =>
  `${scenarioPrefix(id)}_${question}`;

/** `gdpr:art-017` → `cov_gdpr_017`; `eu-ai-act:art-004a` → `cov_eu_ai_act_004a`. */
export function coverageQuestionName(articleId: string): string {
  const [reg, fileId] = articleId.split(':');
  return `cov_${reg.replace(/-/g, '_')}_${fileId.replace(/^art-/, '')}`;
}

export function buildEvalQuestions(scenarios: readonly Scenario[], articles: readonly ArticleRef[]): Question[] {
  const perScenario = scenarios.flatMap((s): Question[] => {
    const about = `Scenario ${s.id} ("${s.title}") in the input scenarios JSON.`;
    return [
      ...SCORE_NAMES.map(
        (name): Question => ({
          type: 'score',
          name: scenarioQuestionName(s.id, name),
          instructions: `${about} ${RUBRIC[name].instructions}`,
          levels: LEVELS.map((label, i) => ({ label, description: RUBRIC[name].levels[i] })),
        }),
      ),
      {
        type: 'choice',
        name: scenarioQuestionName(s.id, 'priority_fit'),
        instructions:
          `${about} Its priority is ${s.priority}. Given the risk to individuals and the weight of the obligations ` +
          'in its mappedClauses, is that priority too low, correct, or too high?',
        choices: [
          { value: 'too_low', description: 'The priority should be higher.' },
          { value: 'correct', description: 'The priority fits.' },
          { value: 'too_high', description: 'The priority should be lower.' },
        ],
      },
      {
        type: 'predicate',
        name: scenarioQuestionName(s.id, 'duplicate_of_another'),
        instructions: `${about} Does it test essentially the same behaviour and obligation as another scenario in the input?`,
      },
    ];
  });
  const perArticle = articles.map(
    (a): Question => ({
      type: 'predicate',
      name: coverageQuestionName(a.id),
      instructions: `Is ${a.title} covered by any scenario in the input, i.e. does at least one scenario test an obligation or right of this article?`,
    }),
  );
  return [...perScenario, ...perArticle];
}

/** Probability-weighted level index on 0–2, rounded to 2 decimals; unknown label → UpstreamError. */
export function levelScore(probs: readonly LevelProbability[]): number {
  let total = 0;
  let weighted = 0;
  for (const { label, probability } of probs) {
    const weight = (LEVELS as readonly string[]).indexOf(label);
    if (weight < 0) throw new UpstreamError(`Unknown score level "${label}"`, probs);
    total += probability;
    weighted += weight * probability;
  }
  return total > 0 ? Math.round((weighted / total) * 100) / 100 : 0;
}

export interface VerdictInput {
  scores: Record<ScoreName, number | null>;
  priorityFit: PriorityFit | null;
  duplicateP: number;
  /** Any of the scenario's questions refused. */
  refused: boolean;
}

/** fail: a score < fail · warn: a score < pass / refused / priority_fit ≠ correct / duplicate ≥ dup · else pass. */
export function verdict(input: VerdictInput, thresholds: Pick<EvalThresholds, 'pass' | 'fail' | 'dup'>): Verdict {
  const scores = Object.values(input.scores);
  if (scores.some((s) => s !== null && s < thresholds.fail)) return 'fail';
  if (
    input.refused ||
    scores.some((s) => s === null || s < thresholds.pass) ||
    input.priorityFit !== 'correct' ||
    input.duplicateP >= thresholds.dup
  ) {
    return 'warn';
  }
  return 'pass';
}

/** Covered if p ≥ threshold; request order kept; pct rounded to an integer. */
export function coverage(articles: readonly { id: string; p: number }[], threshold: number): EvaluateResponse['coverage'] {
  const covered = articles.filter((a) => a.p >= threshold).map((a) => a.id);
  const uncovered = articles.filter((a) => a.p < threshold).map((a) => a.id);
  const pct = articles.length > 0 ? Math.round((covered.length / articles.length) * 100) : 0;
  return { covered, uncovered, pct };
}

/** Maps Decisions answers to the §9 response (usage added by the caller). */
export function mapEvaluation(
  scenarios: readonly Scenario[],
  articleIds: readonly string[],
  answers: DecideResult,
  thresholds: EvalThresholds,
): Omit<EvaluateResponse, 'usage'> {
  const refused = new Set(answers.refusals);
  const evaluations = scenarios.map((s): ScenarioEvaluation => {
    const scores = Object.fromEntries(
      SCORE_NAMES.map((name) => {
        const probs = answers.scores[scenarioQuestionName(s.id, name)];
        return [name, probs ? levelScore(probs) : null];
      }),
    ) as Record<ScoreName, number | null>;
    const fit = PriorityFit.safeParse(answers.choices[scenarioQuestionName(s.id, 'priority_fit')]?.value);
    const priorityFit = fit.success ? fit.data : null;
    const duplicateP = answers.predicates[scenarioQuestionName(s.id, 'duplicate_of_another')] ?? 0;
    const names = [...SCORE_NAMES, 'priority_fit', 'duplicate_of_another'] as const;
    const anyRefused = names.some((name) => refused.has(scenarioQuestionName(s.id, name)));
    return {
      id: s.id,
      scores,
      priorityFit,
      duplicateP,
      verdict: verdict({ scores, priorityFit, duplicateP, refused: anyRefused }, thresholds),
    };
  });

  const summary = { pass: 0, warn: 0, fail: 0 };
  for (const e of evaluations) summary[e.verdict]++;
  return {
    scenarios: evaluations,
    coverage: coverage(
      articleIds.map((id) => ({ id, p: answers.predicates[coverageQuestionName(id)] ?? 0 })),
      thresholds.covered,
    ),
    summary,
    refusals: answers.refusals,
  };
}

export function buildEvalInput(story: string, packText: string, scenarios: readonly Scenario[]): DecisionInput {
  return [
    {
      role: 'user',
      content: [
        { type: 'input_text', text: `Requirement (user story):\n${story}` },
        { type: 'input_text', text: `Regulation text the scenarios were generated from:\n${packText}` },
        { type: 'input_json', data: { scenarios } },
      ],
    },
  ];
}

export async function evaluateScenarios(req: EvaluateRequest, graph: Graph, transport?: Transport): Promise<EvaluateResponse> {
  const pack = buildPack(req.articleIds, graph, env.PACK_TOKEN_BUDGET);
  const articles = req.articleIds.map((id) => ({ id, title: graph.docs.get(id)!.frontmatter.title }));
  const answers = await decideStage('eval', buildEvalInput(req.story, pack.text, req.scenarios), buildEvalQuestions(req.scenarios, articles), { transport });
  return {
    ...mapEvaluation(req.scenarios, req.articleIds, answers, {
      pass: env.EVAL_SCORE_PASS,
      fail: env.EVAL_SCORE_FAIL,
      dup: env.EVAL_DUP_THRESHOLD,
      covered: env.ARTICLE_THRESHOLD,
    }),
    usage: usageOfDecided(answers, toUsage),
  };
}
