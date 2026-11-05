import type { QdrantClient } from '@qdrant/js-client-rest';
import { v5 as uuidv5 } from 'uuid';
import type { ReviewLog } from '../graph/state.js';
import { scrollAll } from './client.js';

// Clausario run summaries in the shared checkpoints collection (Architecture.md §7.3). kind is "clausario_run" (never
// the generic "run" another app may use), the point ID is UUIDv5("clausario_run:<runId>") and there is no thread_id,
// so other apps never list or recover them and deleteThread never removes them.

export const RUN_KIND = 'clausario_run';
const RUN_NAMESPACE = '9e2b7c1a-4f3d-4a8e-b6c5-1d0f2e3a4b5c';
export const runPointId = (runId: string) => uuidv5(`${RUN_KIND}:${runId}`, RUN_NAMESPACE);

export type RunStatus = 'running' | 'awaiting_review' | 'completed' | 'needs_rework' | 'not_applicable' | 'failed';
export type RunStep = 'classify' | 'select' | 'review' | 'generate' | 'evaluate';

export interface RunRecord {
  id: string;
  ownerId: string;
  ownerUsername: string;
  title: string;
  status: RunStatus;
  step: RunStep;
  score: number | null;
  rounds: number;
  regulations: string[];
  engines: { route: string; select: string; review: string; eval: string };
  provider: string;
  model: string;
  servedModel: string | null;
  scenarioCount: number | null;
  verdicts: { pass: number; warn: number; fail: number } | null;
  costUsd: number | null;
  reviews: ReviewLog[];
  error: string | null;
  createdAt: string;
  updatedAt: string;
}

export type RunChanges = Partial<Pick<RunRecord, 'status' | 'step' | 'score' | 'rounds' | 'regulations' | 'servedModel' | 'scenarioCount' | 'verdicts' | 'costUsd' | 'reviews' | 'error'>>;

const FIELDS: Record<keyof RunChanges, string> = {
  status: 'status', step: 'step', score: 'score', rounds: 'rounds', regulations: 'regulations', servedModel: 'served_model',
  scenarioCount: 'scenario_count', verdicts: 'verdicts', costUsd: 'cost_usd', reviews: 'reviews', error: 'error',
};

// Qdrant may drop null values on update, so a missing field and null mean the same here.
function toRecord(p: Record<string, unknown>): RunRecord {
  const v = <T>(key: string, fallback: T) => (p[key] ?? fallback) as T;
  return {
    id: String(p.run_id),
    ownerId: String(p.owner_id),
    ownerUsername: String(p.owner_username),
    title: String(p.title),
    status: p.status as RunStatus,
    step: v('step', 'classify'),
    score: v('score', null),
    rounds: v('rounds', 0),
    regulations: v('regulations', []),
    engines: v('engines', { route: '', select: '', review: '', eval: '' }),
    provider: v('provider', ''),
    model: v('model', ''),
    servedModel: v('served_model', null),
    scenarioCount: v('scenario_count', null),
    verdicts: v('verdicts', null),
    costUsd: v('cost_usd', null),
    reviews: v('reviews', []),
    error: v('error', null),
    createdAt: String(p.created_at),
    updatedAt: String(p.updated_at),
  };
}

export class RunsRepo {
  constructor(
    private readonly client: QdrantClient,
    private readonly collection: string,
  ) {}

  async create(input: Pick<RunRecord, 'id' | 'ownerId' | 'ownerUsername' | 'title' | 'engines' | 'provider' | 'model'>): Promise<RunRecord> {
    const now = new Date().toISOString();
    const payload = {
      kind: RUN_KIND,
      app: 'clausario',
      run_id: input.id,
      owner_id: input.ownerId,
      owner_username: input.ownerUsername,
      title: input.title,
      status: 'running',
      step: 'classify',
      score: null,
      rounds: 0,
      regulations: [],
      engines: input.engines,
      provider: input.provider,
      model: input.model,
      served_model: null,
      scenario_count: null,
      verdicts: null,
      cost_usd: null,
      reviews: [],
      error: null,
      created_at: now,
      updated_at: now,
    };
    await this.client.upsert(this.collection, { wait: true, points: [{ id: runPointId(input.id), vector: {}, payload }] });
    return toRecord(payload);
  }

  async find(id: string): Promise<RunRecord | null> {
    const [point] = await this.client.retrieve(this.collection, { ids: [runPointId(id)], with_payload: true });
    return point?.payload?.kind === RUN_KIND ? toRecord(point.payload) : null;
  }

  async update(id: string, changes: RunChanges): Promise<void> {
    const payload: Record<string, unknown> = { updated_at: new Date().toISOString() };
    for (const [key, value] of Object.entries(changes)) payload[FIELDS[key as keyof RunChanges]] = value;
    await this.client.setPayload(this.collection, { wait: true, points: [runPointId(id)], payload });
  }

  /** Newest first. `ownerId` limits to one user; `statuses` filters by status. */
  async list(filter: { ownerId?: string; statuses?: RunStatus[] } = {}): Promise<RunRecord[]> {
    const must: Record<string, unknown>[] = [{ key: 'kind', match: { value: RUN_KIND } }];
    if (filter.ownerId) must.push({ key: 'owner_id', match: { value: filter.ownerId } });
    if (filter.statuses?.length) must.push({ key: 'status', match: { any: filter.statuses } });
    const points = await scrollAll(this.client, this.collection, { must } as never);
    return points.map((p) => toRecord(p.payload)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
}
