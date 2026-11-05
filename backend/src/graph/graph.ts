import { END, interrupt, START, StateGraph, type BaseCheckpointSaver } from '@langchain/langgraph';
import { decideStage, usageOfDecided } from '../decisions/engines/runnable.js';
import { evaluateScenarios } from '../decisions/evaluate.js';
import { routeStory } from '../decisions/route.js';
import { selectArticles } from '../decisions/select.js';
import { generateScenarios } from '../llm/generateScenarios.js';
import type { Graph } from '../okf/graph.js';
import { toUsage } from '../usage.js';
import { buildReviewQuestions, computeReviewScore } from './reviewScore.js';
import { ClausarioState, storyWithContext, type ClausarioValues, type HumanDecision } from './state.js';

// LangGraph pipeline (Architecture.md §11): Review agent (classify → selectArticles → reviewScore), human review,
// (node `reviewScore`: LangGraph forbids a node named like the `review` state channel)
// generate, evaluate. Routers are plain code.

export interface PipelineDeps {
  checkpointer: BaseCheckpointSaver;
  /** Knowledge bundle (getKnowledge in the server, a fixture in tests). */
  knowledge: () => Graph;
  reviewThreshold: () => number;
  evalEnabled: () => boolean;
}

export const threadIdFor = (runId: string) => `clausario-${runId}`;

/** After review: the score gate. */
export function routeAfterReview(s: Pick<ClausarioValues, 'review' | 'regulations'>, threshold: number): 'generate' | 'humanReview' | 'notApplicable' {
  if ((s.review?.score ?? 0) < threshold) return 'humanReview';
  return s.regulations.length === 0 ? 'notApplicable' : 'generate';
}

/** After a human decision (§11.5). */
export function routeAfterHuman(s: Pick<ClausarioValues, 'decision' | 'articleIds'>): 'generate' | 'classify' | 'needsRework' | 'notApplicable' {
  switch (s.decision?.action) {
    case 'context':
      return 'classify';
    case 'reject':
      return 'needsRework';
    case 'override':
      return 'generate';
    default:
      return s.articleIds.length === 0 ? 'notApplicable' : 'generate';
  }
}

export function buildPipeline(deps: PipelineDeps) {
  const classify = async (s: ClausarioValues) => {
    const route = await routeStory(storyWithContext(s), undefined, s.options.engine);
    return { route, regulations: route.regulations, usage: { route: route.usage } };
  };

  const selectNode = async (s: ClausarioValues) => {
    if (s.regulations.length === 0) return { selection: null, articleIds: [] };
    const selection = await selectArticles(storyWithContext(s), s.regulations, undefined, s.options.engine, deps.knowledge());
    return { selection, articleIds: selection.selected.map((a) => a.id), usage: { select: selection.usage } };
  };

  const review = async (s: ClausarioValues) => {
    const selected = s.selection?.selected ?? [];
    const graph = deps.knowledge();
    const input = [
      `Requirement:\n${storyWithContext(s)}`,
      `Routed regulations: ${s.regulations.length > 0 ? s.regulations.join(', ') : 'none'}`,
      `Selected articles:\n${selected.length > 0 ? selected.map((a) => `- ${a.title}: ${graph.docs.get(a.id)?.frontmatter.description ?? ''}`).join('\n') : '- none'}`,
    ].join('\n\n');
    const answers = await decideStage('review', input, buildReviewQuestions());
    const { score, components } = computeReviewScore(answers, s.regulations);
    return {
      review: { score, threshold: deps.reviewThreshold(), components, engine: answers.engine, model: answers.model, round: s.contextRounds.length + 1 },
      decision: null,
      usage: { review: usageOfDecided(answers, toUsage) },
    };
  };

  // Re-runs from the top on resume: nothing may happen before interrupt().
  const humanReview = (s: ClausarioValues) => {
    const decision = interrupt({ score: s.review?.score ?? null, threshold: s.review?.threshold, round: s.contextRounds.length + 1 }) as HumanDecision;
    const log = { by: decision.by, action: decision.action, round: s.contextRounds.length + 1, at: new Date().toISOString(), score: s.review?.score ?? null, ...(decision.note ? { note: decision.note } : {}) };
    return {
      decision,
      reviews: [log],
      ...(decision.action === 'context' && decision.context ? { contextRounds: [decision.context] } : {}),
      ...(decision.action === 'override' ? { regulations: decision.regulations ?? s.regulations, articleIds: decision.articleIds ?? s.articleIds } : {}),
    };
  };

  const generate = async (s: ClausarioValues) => {
    const { provider, model, count } = s.options;
    const generation = await generateScenarios({ story: storyWithContext(s), articleIds: s.articleIds, provider, model, count }, deps.knowledge());
    return { generation, outcome: 'completed' as const, usage: { generate: generation.usage } };
  };

  const evaluate = async (s: ClausarioValues) => {
    const evaluation = await evaluateScenarios({ story: storyWithContext(s), articleIds: s.articleIds, scenarios: s.generation!.scenarios }, deps.knowledge());
    return { evaluation, usage: { evaluate: evaluation.usage } };
  };

  return new StateGraph(ClausarioState)
    .addNode('classify', classify)
    .addNode('selectArticles', selectNode)
    .addNode('reviewScore', review)
    .addNode('humanReview', humanReview)
    .addNode('generate', generate)
    .addNode('evaluate', evaluate)
    .addNode('needsRework', () => ({ outcome: 'needs_rework' as const }))
    .addNode('notApplicable', () => ({ outcome: 'not_applicable' as const }))
    .addEdge(START, 'classify')
    .addEdge('classify', 'selectArticles')
    .addEdge('selectArticles', 'reviewScore')
    .addConditionalEdges('reviewScore', (s: ClausarioValues) => routeAfterReview(s, deps.reviewThreshold()), ['generate', 'humanReview', 'notApplicable'])
    .addConditionalEdges('humanReview', routeAfterHuman, ['generate', 'classify', 'needsRework', 'notApplicable'])
    .addConditionalEdges('generate', (s: ClausarioValues) => (s.options.evaluate && deps.evalEnabled() ? 'evaluate' : END), ['evaluate', END])
    .addEdge('evaluate', END)
    .addEdge('needsRework', END)
    .addEdge('notApplicable', END)
    .compile({ checkpointer: deps.checkpointer });
}

export type Pipeline = ReturnType<typeof buildPipeline>;

/** API-side check of a HITL decision against the paused state (§11.5); returns an error message or null. */
export function hitlProblem(s: Pick<ClausarioValues, 'contextRounds'>, decision: Pick<HumanDecision, 'action'>, maxRounds: number): string | null {
  if (decision.action === 'context' && s.contextRounds.length >= maxRounds) {
    return `Add-context limit reached (${maxRounds} rounds); approve, override or reject instead`;
  }
  return null;
}
