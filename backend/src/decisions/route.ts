import type { RegId } from '../config/chapterMap.js';
import { env, type EngineId } from '../config/env.js';
import { toUsage, type Usage } from '../usage.js';
import { type DecideResult, type Question, type Transport } from './client.js';
import { decideStage, usageOfDecided } from './engines/runnable.js';

// ROUTE (Architecture.md §7.1): one Decisions call; the two predicates decide, the choice only flags review.

/** Choice values in the API; Decisions' `eu_ai_act` maps to the API regulation id `eu-ai-act`. */
export type RouteChoice = RegId | 'both' | 'none';

export interface RouteThresholds {
  route: number;
  minConfidence: number;
}

export interface RouteResult {
  regulations: RegId[];
  probabilities: { personalData: number; aiSystem: number };
  /** `value: null` when the model refused the choice question. */
  choice: { value: RouteChoice | null; confidence: number };
  needsReview: boolean;
}

export function buildRouteQuestions(): Question[] {
  return [
    {
      type: 'choice',
      name: 'regulation',
      instructions: 'Which EU regulation(s) does this requirement fall under?',
      choices: [
        { value: 'gdpr', description: 'Processing of personal data of identifiable natural persons (GDPR).' },
        {
          value: 'eu_ai_act',
          description: 'Developing, placing on the market or using an AI system or GPAI model (EU AI Act).',
        },
        { value: 'both', description: 'Both apply.' },
        { value: 'none', description: 'Neither applies.' },
      ],
    },
    {
      type: 'predicate',
      name: 'involves_personal_data',
      instructions:
        'Does the requirement involve processing information relating to an identified or identifiable natural person?',
    },
    {
      type: 'predicate',
      name: 'involves_ai_system',
      instructions:
        'Does the requirement involve an AI system or general-purpose AI model as defined in Article 3 of the EU AI Act?',
    },
  ];
}

const CHOICE_VALUES: Record<string, RouteChoice> = { gdpr: 'gdpr', eu_ai_act: 'eu-ai-act', both: 'both', none: 'none' };

export function applyRouteRule(answers: DecideResult, thresholds: RouteThresholds): RouteResult {
  const personalData = answers.predicates.involves_personal_data ?? 0;
  const aiSystem = answers.predicates.involves_ai_system ?? 0;
  const regulations: RegId[] = [];
  if (personalData >= thresholds.route) regulations.push('gdpr');
  if (aiSystem >= thresholds.route) regulations.push('eu-ai-act');
  const expected: RouteChoice = regulations.length === 2 ? 'both' : (regulations[0] ?? 'none');

  const raw = answers.choices.regulation ?? { value: null, confidence: 0 };
  const value = typeof raw.value === 'string' ? (CHOICE_VALUES[raw.value] ?? null) : null;
  return {
    regulations,
    probabilities: { personalData, aiSystem },
    choice: { value, confidence: raw.confidence },
    needsReview: value !== expected || raw.confidence < thresholds.minConfidence,
  };
}

/** `transport` (tests) bypasses the engine chain; `engine` overrides ROUTE_ENGINE for this call. */
export async function routeStory(story: string, transport?: Transport, engine?: EngineId): Promise<RouteResult & { usage: Usage }> {
  const answers = await decideStage('route', story, buildRouteQuestions(), { transport, engine });
  return {
    ...applyRouteRule(answers, { route: env.ROUTE_THRESHOLD, minConfidence: env.ROUTE_MIN_CONFIDENCE }),
    usage: usageOfDecided(answers, toUsage),
  };
}
