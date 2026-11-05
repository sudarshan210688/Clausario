import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type ErrorRequestHandler, type Request, type RequestHandler, type Response } from 'express';
import { createAccessRoutes } from './auth/accessRoutes.js';
import { requireAuth, requireMenu, type AuthDeps } from './auth/middleware.js';
import { createAuthRoutes } from './auth/routes.js';
import { createUsersRoutes } from './auth/usersRoutes.js';
import { ZodError } from 'zod';
import { UpstreamError } from './decisions/client.js';
import { BadRequestError, HttpError } from './errors.js';
import { JobConflictError } from './jobs/jobStore.js';
import { analyzeRouter } from './routes/analyze.routes.js';
import { configRouter } from './routes/config.routes.js';
import { llmRouter } from './routes/llm.routes.js';
import { okfRouter } from './routes/okf.routes.js';
import { scenariosRouter } from './routes/scenarios.routes.js';
import type { ErrorResponse, HealthResponse } from './schemas/api.schema.js';

export interface AppDeps {
  auth: AuthDeps;
  /** CORS origin allowed with credentials (CLIENT_ORIGIN). */
  clientOrigin: string;
  /** Extra authenticated routers mounted under /api (runs, review, config, …), added by later phases. */
  mount?: (app: express.Express, auth: RequestHandler) => void;
}

/** OKF reads serve the article picker and review panel; scrape, jobs and logs belong to the Knowledge base. */
const okfGuard: RequestHandler = (req, res, next) => {
  const read = req.method === 'GET' && !/^\/(jobs|log)(\/|$)/.test(req.path);
  return (read ? requireMenu('analyze', 'knowledge', 'review') : requireMenu('knowledge'))(req, res, next);
};

export function createApp(deps: AppDeps) {
  const app = express();
  app.disable('x-powered-by');
  // The Vite dev proxy makes the UI same-origin; CORS is for direct calls from CLIENT_ORIGIN with cookies.
  app.use(cors({ origin: deps.clientOrigin, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req: Request, res: Response<HealthResponse>) => {
    res.json({ status: 'ok' });
  });

  // Auth and RBAC (Architecture.md §8): every route below needs a session and its menu.
  const auth = requireAuth(deps.auth);
  app.use('/api/auth', createAuthRoutes(deps.auth));
  app.use('/api/users', createUsersRoutes(deps.auth));
  const { menus, access } = createAccessRoutes(deps.auth);
  app.use('/api/menus', menus);
  app.use('/api/access', access);

  app.use('/api/okf', auth, okfGuard, okfRouter);
  app.use('/api/analyze', auth, requireMenu('analyze'), analyzeRouter);
  app.use('/api/llm', auth, llmRouter);
  app.use('/api/config', auth, configRouter);
  app.use('/api/scenarios', auth, requireMenu('analyze'), scenariosRouter);
  deps.mount?.(app, auth);

  app.use((req: Request, res: Response<ErrorResponse>) => {
    res.status(404).json({ error: `Not found: ${req.method} ${req.path}` });
  });

  const errorHandler: ErrorRequestHandler = (err, _req, res: Response<ErrorResponse>, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Validation failed', issues: err.issues });
      return;
    }
    if (err instanceof BadRequestError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof JobConflictError) {
      res.status(409).json({ error: err.message });
      return;
    }
    if (err instanceof UpstreamError) {
      console.error(err.message);
      res.status(502).json({ error: err.message, ...(err.raw === undefined ? {} : { raw: err.raw }) });
      return;
    }
    // Client errors raised by express.json() (malformed body, payload too large).
    const status = typeof err?.status === 'number' ? err.status : 500;
    if (status >= 400 && status < 500) {
      res.status(status).json({ error: err.message });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  };
  app.use(errorHandler);

  return app;
}
