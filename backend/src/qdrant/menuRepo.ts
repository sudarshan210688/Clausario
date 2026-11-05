import type { QdrantClient } from '@qdrant/js-client-rest';
import { v5 as uuidv5 } from 'uuid';
import { isMenuKey, MENU_CATALOGUE, MENU_KEYS, type MenuItem, type MenuKey } from '../menus/catalogue.js';
import { scrollAll } from './client.js';
import type { Role } from './usersRepo.js';

// menucontroller collection (Architecture.md §7.4): `menu` points (catalogue) and `access` points (per user).

const MENU_NAMESPACE = 'c3f0b9e4-5a1d-4f62-8e27-91d4a6b0c7e5';
export const menuPointId = (key: string) => uuidv5(`menu:${key}`, MENU_NAMESPACE);
export const accessPointId = (userId: string) => uuidv5(`access:${userId}`, MENU_NAMESPACE);

export interface AccessRecord {
  userId: string;
  username: string;
  menus: MenuKey[];
  updatedBy: string;
  updatedAt: string;
}

/** Menus a user can use: Admins all; Testers their record, else the .env default; admin-only menus never. */
export function effectiveMenus(role: Role, record: AccessRecord | null, testerDefault: readonly MenuKey[]): MenuKey[] {
  if (role === 'Admin') return [...MENU_KEYS];
  const granted = new Set(record ? record.menus : testerDefault);
  return MENU_CATALOGUE.filter((m) => granted.has(m.key) && !m.adminOnly).map((m) => m.key);
}

const toAccess = (p: Record<string, unknown>): AccessRecord => ({
  userId: String(p.user_id),
  username: String(p.username),
  menus: (Array.isArray(p.menus) ? p.menus : []).filter((k): k is MenuKey => typeof k === 'string' && isMenuKey(k)),
  updatedBy: String(p.updated_by ?? ''),
  updatedAt: String(p.updated_at ?? ''),
});

export class MenuRepo {
  constructor(
    private readonly client: QdrantClient,
    private readonly collection: string,
  ) {}

  /** Upserts one `menu` point per catalogue item. Idempotent (fixed IDs). */
  async upsertCatalogue(items: readonly MenuItem[] = MENU_CATALOGUE): Promise<void> {
    const updatedAt = new Date().toISOString();
    await this.client.upsert(this.collection, {
      wait: true,
      points: items.map((item) => ({ id: menuPointId(item.key), vector: {}, payload: { kind: 'menu', ...item, updatedAt } })),
    });
  }

  async listMenus(): Promise<MenuItem[]> {
    const points = await scrollAll(this.client, this.collection, { must: [{ key: 'kind', match: { value: 'menu' } }] });
    return points.map((p) => p.payload as unknown as MenuItem).sort((a, b) => a.order - b.order);
  }

  async getAccess(userId: string): Promise<AccessRecord | null> {
    const [point] = await this.client.retrieve(this.collection, { ids: [accessPointId(userId)], with_payload: true });
    return point?.payload?.kind === 'access' ? toAccess(point.payload) : null;
  }

  async listAccess(): Promise<AccessRecord[]> {
    const points = await scrollAll(this.client, this.collection, { must: [{ key: 'kind', match: { value: 'access' } }] });
    return points.map((p) => toAccess(p.payload));
  }

  async setAccess(userId: string, username: string, menus: readonly MenuKey[], updatedBy: string): Promise<AccessRecord> {
    const payload = {
      kind: 'access',
      user_id: userId,
      username,
      menus: [...new Set(menus)],
      updated_by: updatedBy,
      updated_at: new Date().toISOString(),
    };
    await this.client.upsert(this.collection, { wait: true, points: [{ id: accessPointId(userId), vector: {}, payload }] });
    return toAccess(payload);
  }
}
