import { hashPassword, PasswordSchema } from '../src/auth/passwords.js';
import { MENU_KEYS } from '../src/menus/catalogue.js';
import { ensureCollection, MENU_INDEXES, USER_INDEXES } from '../src/qdrant/client.js';
import { MenuRepo } from '../src/qdrant/menuRepo.js';
import { UsersRepo } from '../src/qdrant/usersRepo.js';
import { scriptContext } from './env.js';

// npm run seed:admin — creates ADMIN_USERNAME as Admin only if that username does not exist in the shared users
// collection (another app sharing the collection may already have created it). Changes nothing otherwise.

const { env, client } = scriptContext();
if (!env.ADMIN_USERNAME || !env.ADMIN_PASSWORD) {
  console.error('ADMIN_USERNAME and ADMIN_PASSWORD are required in backend/.env');
  process.exit(1);
}
await ensureCollection(client, env.QDRANT_USERS_COLLECTION, USER_INDEXES);
const users = new UsersRepo(client, env.QDRANT_USERS_COLLECTION);
const existing = await users.findByUsername(env.ADMIN_USERNAME);
if (existing) {
  console.log(`${env.ADMIN_USERNAME} already exists (role ${existing.role}); nothing changed.`);
} else {
  if (!PasswordSchema.safeParse(env.ADMIN_PASSWORD).success) {
    console.error('ADMIN_PASSWORD must be 8 or more characters and at most 72 bytes.');
    process.exit(1);
  }
  const user = await users.create({ username: env.ADMIN_USERNAME, role: 'Admin', passwordHash: await hashPassword(env.ADMIN_PASSWORD) });
  await ensureCollection(client, env.QDRANT_MENU_COLLECTION, MENU_INDEXES);
  await new MenuRepo(client, env.QDRANT_MENU_COLLECTION).setAccess(user.id, user.username, MENU_KEYS, 'seed:admin');
  console.log(`Created Admin ${user.username}.`);
}
