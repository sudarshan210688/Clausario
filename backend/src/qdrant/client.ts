import { QdrantClient } from '@qdrant/js-client-rest';

// Qdrant access (Architecture.md §7). Collections may be shared with other apps: create if missing and add payload
// indexes only. Never drop, recreate or change vectors of a collection named in .env.

export interface QdrantConnection {
  url: string;
  apiKey: string;
}

export interface CollectionNames {
  users: string;
  checkpoints: string;
  menu: string;
}

export interface CollectionStatus {
  name: string;
  exists: boolean;
  pointCount?: number;
  vectorMode?: 'none' | 'named' | 'single';
}

/** Keyword indexes on the shared checkpoints and users collections. */
export const CHECKPOINT_INDEXES = ['kind', 'thread_id', 'checkpoint_ns', 'checkpoint_id', 'owner_id', 'status'] as const;
export const USER_INDEXES = ['username', 'role'] as const;
export const MENU_INDEXES = ['kind', 'key', 'user_id'] as const;

export function createQdrantClient({ url, apiKey }: QdrantConnection): QdrantClient {
  // The JS client assumes port 6333 when the URL has none, so set it explicitly.
  const parsed = new URL(url);
  const port = parsed.port ? Number(parsed.port) : parsed.protocol === 'https:' ? 443 : 80;
  return new QdrantClient({ url, apiKey, port, checkCompatibility: false });
}

/** Read-only. Never creates or changes anything. */
export async function inspectCollection(client: QdrantClient, name: string): Promise<CollectionStatus> {
  const { exists } = await client.collectionExists(name);
  if (!exists) return { name, exists: false };
  const info = await client.getCollection(name);
  const vectors = info.config?.params?.vectors ?? {};
  const vectorMode = 'size' in vectors ? 'single' : Object.keys(vectors).length === 0 ? 'none' : 'named';
  return { name, exists: true, pointCount: info.points_count ?? 0, vectorMode };
}

/** Creates the collection (payload-only) if missing, then its keyword indexes. Safe to re-run. */
export async function ensureCollection(client: QdrantClient, name: string, indexes: readonly string[]): Promise<void> {
  const { exists } = await client.collectionExists(name);
  if (!exists) await client.createCollection(name, { vectors: {} });
  for (const field of indexes) {
    await client.createPayloadIndex(name, { field_name: field, field_schema: 'keyword', wait: true });
  }
}

/** Creates missing collections and indexes. Never deletes anything. */
export async function ensureCollections(client: QdrantClient, names: CollectionNames): Promise<void> {
  await ensureCollection(client, names.users, USER_INDEXES);
  await ensureCollection(client, names.checkpoints, CHECKPOINT_INDEXES);
  await ensureCollection(client, names.menu, MENU_INDEXES);
}

type ScrollArgs = NonNullable<Parameters<QdrantClient['scroll']>[1]>;
type Payload = Record<string, unknown>;

/** Every point (id + payload) matching `filter`, following pagination. */
export async function scrollAll(
  client: QdrantClient,
  collection: string,
  filter?: ScrollArgs['filter'],
): Promise<{ id: string | number; payload: Payload }[]> {
  const points: { id: string | number; payload: Payload }[] = [];
  let offset: ScrollArgs['offset'];
  do {
    const page = await client.scroll(collection, {
      limit: 200,
      with_payload: true,
      with_vector: false,
      ...(filter ? { filter } : {}),
      ...(offset !== undefined && offset !== null ? { offset } : {}),
    });
    points.push(...page.points.map((p) => ({ id: p.id, payload: (p.payload ?? {}) as Payload })));
    offset = page.next_page_offset as ScrollArgs['offset'];
  } while (offset !== undefined && offset !== null);
  return points;
}
