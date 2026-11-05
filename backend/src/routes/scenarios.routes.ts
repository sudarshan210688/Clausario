import { Router, type Request, type Response } from 'express';
import { env } from '../config/env.js';
import { evaluateScenarios } from '../decisions/evaluate.js';
import { HttpError } from '../errors.js';
import { generateScenarios } from '../llm/generateScenarios.js';
import { getKnowledge } from '../okf/loader.js';
import {
  EvaluateRequest,
  GenerateRequest,
  type EvaluateResponse,
  type GenerateResponse,
} from '../schemas/scenario.schema.js';

export const scenariosRouter = Router();

scenariosRouter.post('/generate', async (req: Request, res: Response<GenerateResponse>) => {
  res.json(await generateScenarios(GenerateRequest.parse(req.body ?? {}), getKnowledge()));
});

scenariosRouter.post('/evaluate', async (req: Request, res: Response<EvaluateResponse>) => {
  // EVAL_ENABLED=false turns evaluation off everywhere (Architecture.md §12).
  if (!env.EVAL_ENABLED) throw new HttpError(409, 'Evaluation is disabled');
  res.json(await evaluateScenarios(EvaluateRequest.parse(req.body ?? {}), getKnowledge()));
});
