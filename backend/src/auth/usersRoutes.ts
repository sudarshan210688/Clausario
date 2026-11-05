// User management (no delete: users are deactivated, Architecture.md §7.2).
import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../errors.js';
import { MENU_KEYS, type MenuKey } from '../menus/catalogue.js';
import { effectiveMenus } from '../qdrant/menuRepo.js';
import { toPublicUser, type User, type UserChanges } from '../qdrant/usersRepo.js';
import { requireAdmin, requireAuth, requireMenu, type AuthDeps } from './middleware.js';
import { hashPassword, PasswordSchema } from './passwords.js';

const RoleSchema = z.enum(['Admin', 'Tester']);
export const MenusSchema = z.array(z.enum(MENU_KEYS)).transform((keys) => [...new Set(keys)]);

const CreateUserSchema = z.object({
  username: z.string().regex(/^[A-Za-z0-9._-]{3,50}$/),
  password: PasswordSchema,
  role: RoleSchema,
  menus: MenusSchema.optional(),
});

const UpdateUserSchema = z
  .strictObject({
    password: PasswordSchema.optional(),
    role: RoleSchema.optional(),
    active: z.boolean().optional(),
    menus: MenusSchema.optional(),
  })
  .refine((changes) => Object.keys(changes).length > 0, 'nothing to change');

function parse<T extends z.ZodType>(schema: T, body: unknown): z.infer<T> {
  const result = schema.safeParse(body);
  if (!result.success) throw new HttpError(400, `Invalid input: ${result.error.issues.map((i) => `${i.path.join('.') || 'body'} ${i.message}`).join('; ')}`);
  return result.data;
}

export function createUsersRoutes(deps: AuthDeps) {
  const router = Router();
  router.use(requireAuth(deps), requireAdmin, requireMenu('users'));

  const withMenus = async (user: User) => ({
    ...toPublicUser(user),
    menus: effectiveMenus(user.role, await deps.menus.getAccess(user.id), deps.testerDefault),
  });

  router.get('/', async (_req, res) => {
    res.json({ users: await Promise.all((await deps.users.list()).map(withMenus)) });
  });

  router.post('/', async (req, res) => {
    const { username, password, role, menus } = parse(CreateUserSchema, req.body);
    if (await deps.users.findByUsername(username)) throw new HttpError(409, 'Username already exists');
    const user = await deps.users.create({ username, role, passwordHash: await hashPassword(password) });
    const grant: readonly MenuKey[] = role === 'Admin' ? MENU_KEYS : (menus ?? deps.testerDefault);
    await deps.menus.setAccess(user.id, user.username, grant, req.user!.username);
    res.status(201).json({ user: await withMenus(user) });
  });

  router.patch('/:id', async (req, res) => {
    const input = parse(UpdateUserSchema, req.body);
    // An Admin can't lock themselves out, which also keeps at least one active Admin.
    if (req.params.id === req.user!.id && (input.role === 'Tester' || input.active === false)) {
      throw new HttpError(403, "You can't demote or deactivate your own account");
    }
    const changes: UserChanges = {};
    if (input.role !== undefined) changes.role = input.role;
    if (input.active !== undefined) changes.active = input.active;
    if (input.password !== undefined) changes.passwordHash = await hashPassword(input.password);

    const id = z.uuid().safeParse(req.params.id);
    const user = id.success ? await deps.users.update(id.data, changes) : null;
    if (!user) throw new HttpError(404, 'User not found');
    if (input.menus !== undefined) await deps.menus.setAccess(user.id, user.username, input.menus, req.user!.username);
    res.json({ user: await withMenus(user) });
  });

  return router;
}
