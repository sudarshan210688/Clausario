import type { QdrantClient } from '@qdrant/js-client-rest';
import { ensureCollection, MENU_INDEXES } from '../qdrant/client.js';
import { MenuRepo } from '../qdrant/menuRepo.js';
import { UsersRepo } from '../qdrant/usersRepo.js';
import { MENU_CATALOGUE, MENU_KEYS, type MenuKey } from './catalogue.js';

// One-time menucontroller setup (Architecture.md §7.4). Reads `users`, never writes to it. Safe to re-run.

export interface SetupOptions {
  usersCollection: string;
  menuCollection: string;
  testerDefault: readonly MenuKey[];
  dryRun?: boolean;
}

export interface SetupReport {
  collectionCreated: boolean;
  menusUpserted: number;
  /** Usernames that got a new access record. */
  accessCreated: string[];
  /** Usernames whose existing record was left unchanged. */
  accessKept: string[];
}

export async function setupMenus(client: QdrantClient, options: SetupOptions): Promise<SetupReport> {
  const { exists } = await client.collectionExists(options.menuCollection);
  const users = await new UsersRepo(client, options.usersCollection).list();
  const menus = new MenuRepo(client, options.menuCollection);

  if (!options.dryRun) {
    await ensureCollection(client, options.menuCollection, MENU_INDEXES);
    await menus.upsertCatalogue(MENU_CATALOGUE);
  }
  const existing = exists || !options.dryRun ? new Set((await menus.listAccess()).map((a) => a.userId)) : new Set<string>();

  const report: SetupReport = {
    collectionCreated: !exists,
    menusUpserted: MENU_CATALOGUE.length,
    accessCreated: [],
    accessKept: [],
  };
  for (const user of users) {
    if (existing.has(user.id)) {
      report.accessKept.push(user.username);
      continue;
    }
    const grant = user.role === 'Admin' ? MENU_KEYS : options.testerDefault;
    if (!options.dryRun) await menus.setAccess(user.id, user.username, grant, 'setup:menus');
    report.accessCreated.push(user.username);
  }
  return report;
}
