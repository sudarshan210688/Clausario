import { Router, type Request, type Response } from 'express';
import { listProviders } from '../llm/providerFactory.js';
import type { ProvidersResponse } from '../schemas/scenario.schema.js';

export const llmRouter = Router();

llmRouter.get('/providers', (_req: Request, res: Response<ProvidersResponse>) => {
  res.json({ providers: listProviders() });
});
