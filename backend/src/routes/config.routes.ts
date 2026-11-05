import { Router } from 'express';
import { env } from '../config/env.js';
import { availableEngines, fallbackRefs, primaryRef } from '../decisions/engines/registry.js';
import { listProviders } from '../llm/providerFactory.js';

// GET /api/config (Architecture.md §13.2): what the UI needs to render engine/model choices. Never secrets.

export const configRouter = Router();

configRouter.get('/', (_req, res) => {
  const stages = env.ENGINES;
  res.json({
    engines: {
      available: availableEngines(),
      stages,
      uiSwitch: env.ENGINE_UI_SWITCH,
      fallbacks: fallbackRefs(primaryRef('route')).map((r) => `${r.id}:${r.model}`),
      maxRetries: env.DECISION_MAX_RETRIES,
    },
    evaluation: { enabled: env.EVAL_ENABLED, engine: stages.eval },
    review: { threshold: env.REVIEW_THRESHOLD, maxRounds: env.HITL_MAX_ROUNDS, engine: stages.review },
    generation: {
      providers: listProviders(),
      fallbacks: env.GENERATION_FALLBACKS.map((f) => `${f.id}:${f.model}`),
      maxRetries: env.LLM_MAX_RETRIES,
      scenarioMaxCount: env.SCENARIO_MAX_COUNT,
      packTokenBudget: env.PACK_TOKEN_BUDGET,
    },
    thresholds: {
      route: env.ROUTE_THRESHOLD,
      routeMinConfidence: env.ROUTE_MIN_CONFIDENCE,
      chapter: env.CHAPTER_THRESHOLD,
      article: env.ARTICLE_THRESHOLD,
      selectTopN: env.SELECT_TOP_N,
      evalPass: env.EVAL_SCORE_PASS,
      evalFail: env.EVAL_SCORE_FAIL,
      evalDuplicate: env.EVAL_DUP_THRESHOLD,
    },
    description: { model: env.DESCRIPTION_MODEL ?? null },
  });
});
