import { Router, type Request, type RequestHandler } from 'express';
import { z } from 'zod';
import type { RegId } from '../config/chapterMap.js';
import { env } from '../config/env.js';
import { primaryRef } from '../decisions/engines/registry.js';
import { BadRequestError, HttpError } from '../errors.js';
import { hasMenu, requireMenu } from '../auth/middleware.js';
import { assertListedModel } from '../llm/providerFactory.js';
import type { Graph } from '../okf/graph.js';
import type { RunRecord, RunsRepo, RunStatus } from '../qdrant/runsRepo.js';
import { RegParam } from '../schemas/api.schema.js';
import { GenerateRequest, ProviderId } from '../schemas/scenario.schema.js';
import type { RunService } from './service.js';

// Runs, review queue and dashboard (Architecture.md §13.2). Every route is behind requireAuth and a menu guard.

export interface RunRouteDeps {
  /** requireAuth, applied per route so unknown /api paths still fall through to the 404 handler. */
  auth: RequestHandler;
  service: RunService;
  runs: RunsRepo;
  knowledge: () => Graph;
}

const StartSchema = z.object({
  story: z.string().trim().min(20).max(10_000),
  engine: z.enum(['decisions', 'jev']).optional(),
  provider: ProviderId,
  model: z.string().min(1),
  count: GenerateRequest.shape.count,
  evaluate: z.boolean().optional(),
});

const ReviewSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), note: z.string().max(2000).optional() }),
  z.object({
    action: z.literal('override'),
    regulations: z.array(RegParam.shape.reg).min(1).transform((r) => [...new Set(r)]),
    articleIds: z.array(z.string().min(1)).min(1).transform((a) => [...new Set(a)]),
    note: z.string().max(2000).optional(),
  }),
  z.object({ action: z.literal('context'), context: z.string().trim().min(1).max(5000) }),
  z.object({ action: z.literal('reject'), note: z.string().max(2000).optional() }),
]);

const STATUSES: RunStatus[] = ['running', 'awaiting_review', 'completed', 'needs_rework', 'not_applicable', 'failed'];
const ListQuery = z.object({
  status: z.enum(STATUSES as [RunStatus, ...RunStatus[]]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const isAdmin = (req: Request) => req.user?.role === 'Admin';

/** Owner (with runs), Admin, or a reviewer for runs that are or were in review. Otherwise 404 (not 403). */
function canView(req: Request, run: RunRecord): boolean {
  if (isAdmin(req)) return true;
  if (run.ownerId === req.user!.id && hasMenu(req, 'runs')) return true;
  return hasMenu(req, 'review') && (run.status === 'awaiting_review' || run.reviews.length > 0);
}

export function createRunRoutes({ auth, service, runs, knowledge }: RunRouteDeps) {
  const router = Router();

  const load = async (req: Request): Promise<RunRecord> => {
    const id = z.uuid().safeParse(req.params.id);
    const run = id.success ? await runs.find(id.data) : null;
    if (!run || !canView(req, run)) throw new HttpError(404, 'Run not found');
    return run;
  };

  router.post('/runs', auth, requireMenu('analyze'), async (req, res) => {
    const input = StartSchema.safeParse(req.body ?? {});
    if (!input.success) throw new HttpError(400, `Invalid input: ${input.error.issues.map((i) => `${i.path.join('.') || 'body'} ${i.message}`).join('; ')}`);
    const { story, engine, provider, model, count, evaluate } = input.data;
    assertListedModel(provider, model);
    if (engine) primaryRef('route', engine); // 400 unless the switch is on and the engine is keyed
    const run = await service.start({
      ownerId: req.user!.id,
      ownerUsername: req.user!.username,
      story,
      options: { engine, provider, model, count, evaluate: env.EVAL_ENABLED && evaluate !== false },
    });
    res.status(202).json({ runId: run.id, run });
  });

  router.get('/runs', auth, requireMenu('runs'), async (req, res) => {
    const q = ListQuery.parse(req.query);
    const all = await runs.list({ ownerId: isAdmin(req) ? undefined : req.user!.id, statuses: q.status ? [q.status] : undefined });
    const start = (q.page - 1) * q.pageSize;
    res.json({ runs: all.slice(start, start + q.pageSize), total: all.length, page: q.page, pageSize: q.pageSize });
  });

  router.get('/runs/:id', auth, requireMenu('runs', 'review'), async (req, res) => {
    const run = await load(req);
    const { values, next } = await service.state(run.id);
    res.json({ run, state: values, next, canReview: run.status === 'awaiting_review' && hasMenu(req, 'review') });
  });

  router.post('/runs/:id/retry', auth, requireMenu('runs'), async (req, res) => {
    const run = await load(req);
    if (!isAdmin(req) && run.ownerId !== req.user!.id) throw new HttpError(404, 'Run not found');
    await service.retry(run);
    res.status(202).json({ runId: run.id });
  });

  router.get('/review/queue', auth, requireMenu('review'), async (_req, res) => {
    const queue = (await runs.list({ statuses: ['awaiting_review'] })).reverse(); // oldest first
    res.json({ runs: queue });
  });

  router.post('/runs/:id/review', auth, requireMenu('review'), async (req, res) => {
    const run = await load(req);
    const body = ReviewSchema.safeParse(req.body ?? {});
    if (!body.success) throw new HttpError(400, `Invalid input: ${body.error.issues.map((i) => `${i.path.join('.') || 'body'} ${i.message}`).join('; ')}`);
    const d = body.data;
    if (d.action === 'override') {
      const graph = knowledge();
      const unknown = d.articleIds.filter((id) => graph.docs.get(id)?.frontmatter.type !== 'Article');
      if (unknown.length > 0) throw new BadRequestError(`Unknown article ids: ${unknown.join(', ')}`);
      const outside = d.articleIds.filter((id) => !d.regulations.includes(id.split(':')[0] as RegId));
      if (outside.length > 0) throw new BadRequestError(`Articles outside the chosen regulations: ${outside.join(', ')}`);
    }
    await service.review(run, { ...d, by: req.user!.username } as never);
    res.status(202).json({ runId: run.id });
  });

  router.get('/dashboard', auth, requireMenu('overview'), async (req, res) => {
    const all = await runs.list({ ownerId: isAdmin(req) ? undefined : req.user!.id });
    const byStatus = Object.fromEntries(STATUSES.map((s) => [s, all.filter((r) => r.status === s).length]));
    const awaiting = hasMenu(req, 'review') ? (await runs.list({ statuses: ['awaiting_review'] })).length : byStatus.awaiting_review;
    const costs = all.map((r) => r.costUsd).filter((c): c is number => typeof c === 'number');
    res.json({
      total: all.length,
      byStatus,
      awaitingReview: awaiting,
      costUsd: Math.round(costs.reduce((a, c) => a + c, 0) * 1e6) / 1e6,
      recent: all.slice(0, 10),
      scope: isAdmin(req) ? 'all' : 'own',
    });
  });

  return router;
}
