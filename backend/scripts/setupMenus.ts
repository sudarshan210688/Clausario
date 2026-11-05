import { setupMenus } from '../src/menus/setup.js';
import { scriptContext } from './env.js';

// npm run setup:menus [-- --dry-run]  (Architecture.md §7.4). One-time menucontroller setup from backend/.env.

const dryRun = process.argv.includes('--dry-run');
const { env, client } = scriptContext();

const report = await setupMenus(client, {
  usersCollection: env.QDRANT_USERS_COLLECTION,
  menuCollection: env.QDRANT_MENU_COLLECTION,
  testerDefault: env.MENU_DEFAULT_TESTER,
  dryRun,
});

const prefix = dryRun ? '[dry run] would ' : '';
console.log(`${env.QDRANT_MENU_COLLECTION}: ${report.collectionCreated ? `${prefix}create collection` : 'exists'}`);
console.log(`${prefix}upsert ${report.menusUpserted} menu items`);
console.log(`${prefix}create access for ${report.accessCreated.length} user(s)${report.accessCreated.length ? `: ${report.accessCreated.join(', ')}` : ''}`);
console.log(`kept existing access for ${report.accessKept.length} user(s)`);
console.log(`Tester default menus: ${env.MENU_DEFAULT_TESTER.join(', ')}`);
