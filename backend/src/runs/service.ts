import { randomUUID } from 'node:crypto';
import { Command } from '@langchain/langgraph';
import { env, type EngineId } from '../config/env.js';
import { HttpError } from '../errors.js';
import { hitlProblem, threadIdFor, type Pipeline } from '../graph/graph.js';
import type { ClausarioValues, HumanDecision, RunOptions } from '../graph/state.js';
import type { RunRecord, RunsRepo, RunStep } from '../qdrant/runsRepo.js';

// Background runs over the LangGraph pipeline (Architecture.md §13.1). The run summary is updated after each node;
// `awaiting_review` is saved only after the interrupt has been checkpointed.

const STEP_OF: Record<string, RunStep> = {
  classify: 'classify',
  selectArticles: 'select',
  reviewScore: 'review',
  humanReview: 'review',
  generate: 'generate',
  evaluate: 'evaluate',
};

export interface RunServiceDeps {
  pipeline: Pipeline;
  runs: RunsRepo;
  maxRounds: () => number;
}

export interface StartInput {
  ownerId: string;
  ownerUsername: string;
  story: string;
  options: RunOptions;
}

export class RunService {
  /** Runs this process is streaming; a second action on one of them is a conflict. */
  private readonly active = new Set<string>();
  /** Background work, so tests and shutdown can wait for it. */
  readonly pending = new Map<string, Promise<void>>();

  constructor(private readonly deps: RunServiceDeps) {}

  private config(runId: string) {
    return { configurable: { thread_id: threadIdFor(runId) } };
  }

  async state(runId: string): Promise<{ values: ClausarioValues | null; next: string[] }> {
    const snap = await this.deps.pipeline.getState(this.config(runId));
    const values = snap.values && Object.keys(snap.values).length > 0 ? (snap.values as ClausarioValues) : null;
    return { values, next: [...(snap.next ?? [])] };
  }

  async start(input: StartInput): Promise<RunRecord> {
    const id = randomUUID();
    const stageEngine = (stage: keyof typeof env.ENGINES, override?: EngineId) => override ?? env.ENGINES[stage];
    const record = await this.deps.runs.create({
      id,
      ownerId: input.ownerId,
      ownerUsername: input.ownerUsername,
      title: input.story.replace(/\s+/g, ' ').trim().slice(0, 80),
      engines: {
        route: stageEngine('route', input.options.engine),
        select: stageEngine('select', input.options.engine),
        review: stageEngine('review'),
        eval: stageEngine('eval'),
      },
      provider: input.options.provider,
      model: input.options.model,
    });
    this.launch(id, { runId: id, ownerId: input.ownerId, story: input.story, options: input.options });
    return record;
  }

  /** HITL action (§11.5). 409 unless the run is paused for review and the action is allowed. */
  async review(run: RunRecord, decision: HumanDecision): Promise<void> {
    if (this.active.has(run.id) || run.status !== 'awaiting_review') throw new HttpError(409, `Run is ${run.status}, not awaiting review`);
    const { values, next } = await this.state(run.id);
    if (!values || !next.includes('humanReview')) throw new HttpError(409, 'Run is not paused for review');
    const problem = hitlProblem(values, decision, this.deps.maxRounds());
    if (problem) throw new HttpError(409, problem);
    this.active.add(run.id);
    await this.deps.runs.update(run.id, { status: 'running', step: decision.action === 'context' ? 'classify' : 'generate', error: null });
    this.launch(run.id, new Command({ resume: decision }));
  }

  /** Continues a failed run from its last checkpoint without repeating finished nodes. */
  async retry(run: RunRecord): Promise<void> {
    if (this.active.has(run.id) || run.status !== 'failed') throw new HttpError(409, `Only failed runs can be retried (run is ${run.status})`);
    this.active.add(run.id);
    await this.deps.runs.update(run.id, { status: 'running', error: null });
    this.launch(run.id, null);
  }

  /** Runs left `running` by a previous process become `failed` (single server instance assumed). */
  async recoverInterrupted(): Promise<number> {
    const stuck = await this.deps.runs.list({ statuses: ['running'] });
    for (const run of stuck) {
      await this.deps.runs.update(run.id, { status: 'failed', error: 'The server restarted during this run. Retry it to continue from the last step.' });
    }
    return stuck.length;
  }

  private launch(runId: string, input: unknown): void {
    this.active.add(runId);
    const work = this.execute(runId, input).finally(() => {
      this.active.delete(runId);
      this.pending.delete(runId);
    });
    this.pending.set(runId, work);
  }

  private async execute(runId: string, input: unknown): Promise<void> {
    const config = this.config(runId);
    try {
      const stream = await this.deps.pipeline.stream(input as never, { ...config, streamMode: 'updates' });
      for await (const _chunk of stream) {
        const { values, next } = await this.state(runId);
        const step = next.find((n) => STEP_OF[n]);
        await this.deps.runs.update(runId, {
          ...(step && next[0] !== 'humanReview' ? { step: STEP_OF[step] } : {}),
          ...(values ? summaryOf(values) : {}),
        });
      }
      const { values, next } = await this.state(runId);
      if (next.includes('humanReview')) {
        await this.deps.runs.update(runId, { status: 'awaiting_review', step: 'review', ...(values ? summaryOf(values) : {}) });
      } else {
        await this.deps.runs.update(runId, { status: values?.outcome ?? 'completed', ...(values ? summaryOf(values) : {}) });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.deps.runs.update(runId, { status: 'failed', error: message.slice(0, 500) }).catch(() => undefined);
    }
  }
}

/** Run summary fields derived from the graph state. */
export function summaryOf(v: ClausarioValues) {
  const costs = Object.values(v.usage ?? {}).map((u) => u?.costUsd);
  const costUsd = costs.length === 0 ? null : costs.some((c) => c === null || c === undefined) ? null : Math.round(costs.reduce((a, c) => a! + c!, 0)! * 1e6) / 1e6;
  return {
    score: v.review?.score ?? null,
    rounds: v.contextRounds?.length ?? 0,
    regulations: v.regulations ?? [],
    servedModel: v.generation?.servedModel ?? null,
    scenarioCount: v.generation?.scenarios.length ?? null,
    verdicts: v.evaluation?.summary ?? null,
    costUsd,
    reviews: v.reviews ?? [],
  };
}
