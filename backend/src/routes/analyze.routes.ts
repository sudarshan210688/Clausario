import { Router, type Request, type Response } from 'express';
import { routeStory } from '../decisions/route.js';
import { selectArticles } from '../decisions/select.js';
import { RouteRequest, SelectRequest, type RouteResponse, type SelectResponse } from '../schemas/api.schema.js';

export const analyzeRouter = Router();

analyzeRouter.post('/route', async (req: Request, res: Response<RouteResponse>) => {
  const { story, engine } = RouteRequest.parse(req.body ?? {});
  res.json(await routeStory(story, undefined, engine));
});

analyzeRouter.post('/select', async (req: Request, res: Response<SelectResponse>) => {
  const { story, regulations, engine } = SelectRequest.parse(req.body ?? {});
  res.json(await selectArticles(story, regulations, undefined, engine));
});
