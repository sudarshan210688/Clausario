// Users in the shared Qdrant users collection (Architecture.md §7.2).
import type { QdrantClient } from '@qdrant/js-client-rest';
import { v5 as uuidv5 } from 'uuid';
import { scrollAll } from './client.js';

export type Role = 'Admin' | 'Tester';

export interface User {
  id: string;
  username: string;
  passwordHash: string;
  role: Role;
  active: boolean;
  createdAt: string;
}

export type PublicUser = Omit<User, 'passwordHash'>;
export type UserChanges = Partial<Pick<User, 'passwordHash' | 'role' | 'active'>>;

/** Fixed namespace: the same username always maps to the same point, in every app sharing the collection. */
export const USER_ID_NAMESPACE = '6f1d7a52-3c44-4e0b-9a55-0b2f7c1e8d10';

export function userIdFor(username: string): string {
  return uuidv5(username.toLowerCase(), USER_ID_NAMESPACE);
}

export function toPublicUser({ passwordHash: _passwordHash, ...user }: User): PublicUser {
  return user;
}

const toUser = (id: string | number, payload: Record<string, unknown>): User => ({
  id: String(id),
  ...(payload as Omit<User, 'id'>),
});

/** Users in the shared collection. Never deletes: users are deactivated (Architecture.md §7.2). */
export class UsersRepo {
  constructor(
    protected readonly client: QdrantClient,
    protected readonly collection: string,
  ) {}

  async findById(id: string): Promise<User | null> {
    const [point] = await this.client.retrieve(this.collection, { ids: [id], with_payload: true });
    return point ? toUser(point.id, point.payload ?? {}) : null;
  }

  findByUsername(username: string): Promise<User | null> {
    return this.findById(userIdFor(username));
  }

  /** Writes the shared payload format (username, passwordHash, role, active, createdAt). */
  async create(input: Pick<User, 'username' | 'passwordHash' | 'role'>): Promise<User> {
    const id = userIdFor(input.username);
    const payload = { ...input, active: true, createdAt: new Date().toISOString() };
    await this.client.upsert(this.collection, { wait: true, points: [{ id, vector: {}, payload }] });
    return { id, ...payload };
  }

  async update(id: string, changes: UserChanges): Promise<User | null> {
    const existing = await this.findById(id);
    if (!existing) return null;
    if (Object.keys(changes).length > 0) {
      await this.client.setPayload(this.collection, { wait: true, points: [id], payload: changes });
    }
    return { ...existing, ...changes };
  }

  /** Sorted by username. A missing collection → []. */
  async list(): Promise<User[]> {
    const { exists } = await this.client.collectionExists(this.collection);
    if (!exists) return [];
    const points = await scrollAll(this.client, this.collection);
    return points.map((p) => toUser(p.id, p.payload)).sort((a, b) => a.username.localeCompare(b.username));
  }
}
