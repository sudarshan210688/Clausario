// LangGraph checkpointer on Qdrant (Architecture.md §7.3). Clausario threads are `clausario-<runId>`.
import {
  BaseCheckpointSaver,
  compareWritesSortKeys,
  copyCheckpoint,
  getCheckpointId,
  maxChannelVersion,
  TASKS,
  WRITES_IDX_MAP,
  writesSortKey,
  type ChannelVersions,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointPendingWrite,
  type CheckpointTuple,
  type PendingWrite,
  type SerializerProtocol,
} from "@langchain/langgraph-checkpoint";
import type { RunnableConfig } from "@langchain/core/runnables";
import type { QdrantClient } from "@qdrant/js-client-rest";
import { v5 as uuidv5 } from "uuid";

const ID_NAMESPACE = "b4a8e1c2-7d36-4f19-8c05-2e9a6d3f1b77";

type Payload = Record<string, unknown>;
type Filter = NonNullable<Parameters<QdrantClient["scroll"]>[1]>["filter"];
type WithPayload = NonNullable<Parameters<QdrantClient["scroll"]>[1]>["with_payload"];

function pointId(...parts: Array<string | number>): string {
  return uuidv5(JSON.stringify(parts), ID_NAMESPACE);
}

function checkpointPointId(threadId: string, ns: string, checkpointId: string) {
  return pointId("checkpoint", threadId, ns, checkpointId);
}

function writePointId(threadId: string, ns: string, checkpointId: string, taskId: string, idx: number) {
  return pointId("write", threadId, ns, checkpointId, taskId, idx);
}

function matchField(key: string, value: string) {
  return { key, match: { value } };
}

function encode([type, bytes]: [string, Uint8Array]) {
  return { type, data: Buffer.from(bytes).toString("base64") };
}

function requireThreadId(config: RunnableConfig): string {
  const threadId = config.configurable?.thread_id;
  if (typeof threadId !== "string" || !threadId) {
    throw new Error('QdrantSaver needs a "thread_id" string in config.configurable.');
  }
  return threadId;
}

/**
 * LangGraph checkpointer backed by payload-only Qdrant points. Checkpoints and pending writes
 * share one collection, told apart by the "kind" payload field. All writes use wait: true so a
 * resume can always read what was just saved, including after a restart.
 */
export class QdrantSaver extends BaseCheckpointSaver {
  constructor(
    private readonly client: QdrantClient,
    private readonly collection: string,
    serde?: SerializerProtocol,
  ) {
    super(serde);
  }

  private async decode<T>(stored: unknown): Promise<T> {
    const { type, data } = stored as { type: string; data: string };
    return (await this.serde.loadsTyped(type, new Uint8Array(Buffer.from(data, "base64")))) as T;
  }

  private async scrollAll(filter: Filter, withPayload: WithPayload): Promise<Payload[]> {
    const payloads: Payload[] = [];
    let offset: unknown;
    do {
      const page = await this.client.scroll(this.collection, {
        filter,
        limit: 256,
        with_payload: withPayload,
        with_vector: false,
        ...(offset ? { offset: offset as string } : {}),
      });
      payloads.push(...page.points.map((point) => point.payload ?? {}));
      offset = page.next_page_offset;
    } while (offset);
    return payloads;
  }

  private async loadPendingWrites(
    threadId: string,
    ns: string,
    checkpointId: string,
  ): Promise<CheckpointPendingWrite[]> {
    const rows = await this.scrollAll(
      {
        must: [
          matchField("kind", "write"),
          matchField("thread_id", threadId),
          matchField("checkpoint_ns", ns),
          matchField("checkpoint_id", checkpointId),
        ],
      },
      true,
    );

    const keyed = rows.map((row) => ({
      row,
      key: writesSortKey(row.task_path as string, row.task_id as string, row.idx as number),
    }));
    keyed.sort((a, b) => compareWritesSortKeys(a.key, b.key));

    return Promise.all(
      keyed.map(
        async ({ row }): Promise<CheckpointPendingWrite> => [
          row.task_id as string,
          row.channel as string,
          await this.decode(row.value),
        ],
      ),
    );
  }

  /** Checkpoints older than format v4 kept pending sends as writes on their parent. */
  private async migratePendingSends(checkpoint: Checkpoint, threadId: string, ns: string, parentId: string) {
    const parentWrites = await this.loadPendingWrites(threadId, ns, parentId);
    const channelValues = checkpoint.channel_values as Record<string, unknown>;
    const channelVersions = checkpoint.channel_versions as Record<string, string | number>;
    const versions = Object.values(channelVersions);

    channelValues[TASKS] = parentWrites.filter(([, channel]) => channel === TASKS).map(([, , value]) => value);
    channelVersions[TASKS] = versions.length > 0 ? maxChannelVersion(...versions) : this.getNextVersion(undefined);
  }

  private async toTuple(payload: Payload): Promise<CheckpointTuple> {
    const threadId = payload.thread_id as string;
    const ns = payload.checkpoint_ns as string;
    const checkpointId = payload.checkpoint_id as string;
    const parentId = payload.parent_checkpoint_id as string | null;
    const checkpoint = await this.decode<Checkpoint>(payload.checkpoint);
    if (checkpoint.v < 4 && parentId) await this.migratePendingSends(checkpoint, threadId, ns, parentId);

    return {
      config: { configurable: { thread_id: threadId, checkpoint_ns: ns, checkpoint_id: checkpointId } },
      checkpoint,
      metadata: await this.decode<CheckpointMetadata>(payload.metadata),
      pendingWrites: await this.loadPendingWrites(threadId, ns, checkpointId),
      ...(parentId
        ? { parentConfig: { configurable: { thread_id: threadId, checkpoint_ns: ns, checkpoint_id: parentId } } }
        : {}),
    };
  }

  private async loadCheckpointPayload(threadId: string, ns: string, checkpointId: string) {
    const [point] = await this.client.retrieve(this.collection, {
      ids: [checkpointPointId(threadId, ns, checkpointId)],
      with_payload: true,
    });
    return point?.payload ?? undefined;
  }

  /** Checkpoint IDs sort by time, so the highest is the latest. */
  private async findLatestCheckpointId(threadId: string, ns: string): Promise<string | undefined> {
    const rows = await this.scrollAll(
      {
        must: [
          matchField("kind", "checkpoint"),
          matchField("thread_id", threadId),
          matchField("checkpoint_ns", ns),
        ],
      },
      { include: ["checkpoint_id"] },
    );
    return rows
      .map((row) => row.checkpoint_id as string)
      .sort()
      .at(-1);
  }

  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    if (config.configurable?.thread_id === undefined) return undefined;
    const threadId = requireThreadId(config);
    const ns: string = config.configurable?.checkpoint_ns ?? "";
    const checkpointId = getCheckpointId(config) || (await this.findLatestCheckpointId(threadId, ns));
    if (!checkpointId) return undefined;

    const payload = await this.loadCheckpointPayload(threadId, ns, checkpointId);
    return payload ? this.toTuple(payload) : undefined;
  }

  async *list(config: RunnableConfig, options?: CheckpointListOptions): AsyncGenerator<CheckpointTuple> {
    const { before, filter } = options ?? {};
    let remaining = options?.limit;

    const must = [matchField("kind", "checkpoint")];
    const { thread_id: threadId, checkpoint_ns: ns, checkpoint_id: onlyId } = config.configurable ?? {};
    if (threadId !== undefined) must.push(matchField("thread_id", threadId));
    if (ns !== undefined) must.push(matchField("checkpoint_ns", ns));
    if (onlyId) must.push(matchField("checkpoint_id", onlyId));

    const beforeId = before?.configurable?.checkpoint_id as string | undefined;
    const rows = await this.scrollAll(
      { must },
      { include: ["thread_id", "checkpoint_ns", "checkpoint_id"] },
    );
    const newestFirst = rows
      .filter((row) => !beforeId || (row.checkpoint_id as string) < beforeId)
      .sort((a, b) => ((a.checkpoint_id as string) < (b.checkpoint_id as string) ? 1 : -1));

    for (const row of newestFirst) {
      if (remaining !== undefined && remaining <= 0) return;

      const payload = await this.loadCheckpointPayload(
        row.thread_id as string,
        row.checkpoint_ns as string,
        row.checkpoint_id as string,
      );
      if (!payload) continue;

      if (filter) {
        const metadata = await this.decode<Record<string, unknown>>(payload.metadata);
        if (!Object.entries(filter).every(([key, value]) => metadata[key] === value)) continue;
      }

      if (remaining !== undefined) remaining -= 1;
      yield this.toTuple(payload);
    }
  }

  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
    _newVersions: ChannelVersions,
  ): Promise<RunnableConfig> {
    const threadId = requireThreadId(config);
    const ns: string = config.configurable?.checkpoint_ns ?? "";

    const [storedCheckpoint, storedMetadata] = await Promise.all([
      this.serde.dumpsTyped(copyCheckpoint(checkpoint)),
      this.serde.dumpsTyped(metadata),
    ]);

    await this.client.upsert(this.collection, {
      wait: true,
      points: [
        {
          id: checkpointPointId(threadId, ns, checkpoint.id),
          vector: {},
          payload: {
            kind: "checkpoint",
            thread_id: threadId,
            checkpoint_ns: ns,
            checkpoint_id: checkpoint.id,
            parent_checkpoint_id: config.configurable?.checkpoint_id ?? null,
            checkpoint: encode(storedCheckpoint),
            metadata: encode(storedMetadata),
          },
        },
      ],
    });

    return { configurable: { thread_id: threadId, checkpoint_ns: ns, checkpoint_id: checkpoint.id } };
  }

  async putWrites(
    config: RunnableConfig,
    writes: PendingWrite[],
    taskId: string,
    taskPath?: string,
  ): Promise<void> {
    const threadId = requireThreadId(config);
    const ns: string = config.configurable?.checkpoint_ns ?? "";
    const checkpointId = config.configurable?.checkpoint_id as string | undefined;
    if (!checkpointId) throw new Error('QdrantSaver needs a "checkpoint_id" to store writes.');
    if (writes.length === 0) return;

    // Special channels (errors, interrupts) use fixed negative indexes and may be overwritten.
    // Regular writes keep their first value, so a retried task can't change what was saved.
    const entries = writes.map(([channel, value], position) => {
      const idx = WRITES_IDX_MAP[channel] ?? position;
      return { channel, value, idx, id: writePointId(threadId, ns, checkpointId, taskId, idx) };
    });
    const existing = await this.client.retrieve(this.collection, {
      ids: entries.map((entry) => entry.id),
      with_payload: false,
    });
    const existingIds = new Set(existing.map((point) => String(point.id)));
    const toStore = entries.filter((entry) => entry.idx < 0 || !existingIds.has(entry.id));
    if (toStore.length === 0) return;

    const points = await Promise.all(
      toStore.map(async ({ channel, value, idx, id }) => ({
        id,
        vector: {},
        payload: {
          kind: "write",
          thread_id: threadId,
          checkpoint_ns: ns,
          checkpoint_id: checkpointId,
          task_id: taskId,
          task_path: taskPath ?? "",
          idx,
          channel,
          value: encode(await this.serde.dumpsTyped(value)),
        },
      })),
    );
    await this.client.upsert(this.collection, { wait: true, points });
  }

  /** Run points don't carry thread_id, so they are kept. */
  async deleteThread(threadId: string): Promise<void> {
    await this.client.delete(this.collection, {
      wait: true,
      filter: { must: [matchField("thread_id", threadId)] },
    });
  }
}
