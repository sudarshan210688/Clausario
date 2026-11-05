import type { RegId } from '../config/chapterMap.js';
import type { DecideResult, Question } from '../decisions/client.js';
import { LEVELS } from '../decisions/evaluate.js';
import type { RouteChoice } from '../decisions/route.js';

// Review agent score (Architecture.md §11.4). The engine rates; this code calculates. 0-100.

export const REVIEW_WEIGHTS = { agreement: 35, specificity: 15, relevance: 30, completeness: 20 } as const;

export interface ReviewComponents {
  /** reg_check agrees with the routed regulations: confidence, else 1 - confidence. */
  agreement: number;
  /** story_specific expected level / 2. */
  specificity: number;
  /** articles_relevant probability. */
  relevance: number;
  /** 1 - article_missing probability. */
  completeness: number;
}

export interface ReviewResult {
  score: number;
  threshold: number;
  components: ReviewComponents;
  engine: string;
  model: string;
  /** 1-based review round (1 + context rounds so far). */
  round: number;
}

const REG_CHOICES: Record<string, RouteChoice> = { gdpr: 'gdpr', eu_ai_act: 'eu-ai-act', both: 'both', none: 'none' };

export function routedChoice(regulations: readonly RegId[]): RouteChoice {
  if (regulations.length === 2) return 'both';
  return regulations[0] ?? 'none';
}

export function buildReviewQuestions(): Question[] {
  return [
    {
      type: 'choice',
      name: 'reg_check',
      instructions: 'Which EU regulation(s) apply to the requirement in the input?',
      choices: [
        { value: 'gdpr', description: 'Processing of personal data of identifiable natural persons (GDPR).' },
        { value: 'eu_ai_act', description: 'Developing, placing on the market or using an AI system or GPAI model (EU AI Act).' },
        { value: 'both', description: 'Both apply.' },
        { value: 'none', description: 'Neither applies.' },
      ],
    },
    {
      type: 'score',
      name: 'story_specific',
      instructions: 'How specific is the requirement about the personal data, the people affected and the system behaviour, so that legal obligations can be identified?',
      levels: [
        { label: 'Low', description: 'Vague: data, users or behaviour are unclear.' },
        { label: 'Medium', description: 'Some detail, with gaps.' },
        { label: 'High', description: 'Specific about data, users and behaviour.' },
      ],
    },
    {
      type: 'predicate',
      name: 'articles_relevant',
      instructions: 'Are the selected articles in the input obligations or rights that the requirement must satisfy or be tested against?',
    },
    {
      type: 'predicate',
      name: 'article_missing',
      instructions: 'Is an obviously applicable article of the routed regulation(s) missing from the selected articles in the input?',
    },
  ];
}

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

/** Rounded 0-100 score; a refused question contributes 0 to its component. */
export function computeReviewScore(answers: DecideResult, regulations: readonly RegId[]): { score: number; components: ReviewComponents } {
  const refused = new Set(answers.refusals);
  const reg = answers.choices.reg_check;
  const value = typeof reg?.value === 'string' ? REG_CHOICES[reg.value] : undefined;
  const agreement = refused.has('reg_check') || !reg || !value ? 0 : value === routedChoice(regulations) ? reg.confidence : 1 - reg.confidence;

  const probs = answers.scores.story_specific;
  let specificity = 0;
  if (probs && !refused.has('story_specific')) {
    const total = probs.reduce((sum, p) => sum + p.probability, 0);
    const weighted = probs.reduce((sum, p) => sum + Math.max(0, (LEVELS as readonly string[]).indexOf(p.label)) * p.probability, 0);
    specificity = total > 0 ? weighted / total / 2 : 0;
  }
  const relevance = refused.has('articles_relevant') ? 0 : (answers.predicates.articles_relevant ?? 0);
  const completeness = refused.has('article_missing') ? 0 : 1 - (answers.predicates.article_missing ?? 1);

  const components = {
    agreement: clamp01(agreement),
    specificity: clamp01(specificity),
    relevance: clamp01(relevance),
    completeness: clamp01(completeness),
  };
  const w = REVIEW_WEIGHTS;
  const score = Math.round(
    w.agreement * components.agreement + w.specificity * components.specificity + w.relevance * components.relevance + w.completeness * components.completeness,
  );
  return { score, components };
}
