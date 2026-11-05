import type { QdrantClient } from '@qdrant/js-client-rest';
import { createApp, type AppDeps } from './app.js';
import type { AuthDeps } from './auth/middleware.js';
import type { Env } from './config/env.js';
import { setTransportFactory } from './decisions/engines/registry.js';
import { createFakeDecisionTransport } from './graph/fakes.js';
import { buildPipeline } from './graph/graph.js';
import { fakeScenarioModel } from './llm/fakes.js';
import { setChatModelFactory } from './llm/providerFactory.js';
import type { Graph } from './okf/graph.js';
import { getKnowledge } from './okf/loader.js';
import { ensureCollections } from './qdrant/client.js';
import { MenuRepo } from './qdrant/menuRepo.js';
import { QdrantSaver } from './qdrant/QdrantSaver.js';
import { RunsRepo } from './qdrant/runsRepo.js';
import { UsersRepo } from './qdrant/usersRepo.js';
import { createRunRoutes } from './runs/routes.js';
import { RunService } from './runs/service.js';

export interface Collections {
  users: string;
  checkpoints: string;
  menu: string;
}

export const liveCollections = (e: Env): Collections => ({
  users: e.QDRANT_USERS_COLLECTION,
  checkpoints: e.QDRANT_CHECKPOINTS_COLLECTION,
  menu: e.QDRANT_MENU_COLLECTION,
});

export function authDeps(e: Env, qdrant: QdrantClient, names: Collections): AuthDeps {
  return {
    users: new UsersRepo(qdrant, names.users),
    menus: new MenuRepo(qdrant, names.menu),
    jwtSecret: e.JWT_SECRET!,
    sessionHours: e.SESSION_HOURS,
    testerDefault: e.MENU_DEFAULT_TESTER,
    secureCookies: process.env.NODE_ENV === 'production',
  };
}

export interface ClausarioOptions extends Pick<AppDeps, 'mount'> {
  /** Knowledge bundle; defaults to the loaded OKF snapshot (tests pass a fixture). */
  knowledge?: () => Graph;
}

/**
 * Wires the application: creates missing collections (never drops), syncs the menu catalogue, builds the LangGraph
 * pipeline on QdrantSaver, marks runs interrupted by a restart as failed, and mounts every route.
 */
export async function createClausarioApp(e: Env, qdrant: QdrantClient, names: Collections = liveCollections(e), options: ClausarioOptions = {}) {
  if (e.CLAUSARIO_FAKE_ENGINES) {
    // Local demos and browser tests only (refused in production by parseEnv).
    setTransportFactory(() => createFakeDecisionTransport());
    setChatModelFactory(() => fakeScenarioModel());
  }
  await ensureCollections(qdrant, names);
  const auth = authDeps(e, qdrant, names);
  await auth.menus.upsertCatalogue();

  const knowledge = options.knowledge ?? getKnowledge;
  const runs = new RunsRepo(qdrant, names.checkpoints);
  const pipeline = buildPipeline({
    checkpointer: new QdrantSaver(qdrant, names.checkpoints),
    knowledge,
    reviewThreshold: () => e.REVIEW_THRESHOLD,
    evalEnabled: () => e.EVAL_ENABLED,
  });
  const service = new RunService({ pipeline, runs, maxRounds: () => e.HITL_MAX_ROUNDS });
  const recovered = await service.recoverInterrupted();
  if (recovered > 0) console.warn(`Marked ${recovered} interrupted run(s) as failed`);

  const app = createApp({
    auth,
    clientOrigin: e.CLIENT_ORIGIN,
    mount: (a, requireAuth) => {
      a.use('/api', createRunRoutes({ auth: requireAuth, service, runs, knowledge }));
      options.mount?.(a, requireAuth);
    },
  });
  return Object.assign(app, { runService: service });
}
