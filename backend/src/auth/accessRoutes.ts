import { Router } from 'express';
import { z } from 'zod';
import { HttpError } from '../errors.js';
import { MENU_CATALOGUE } from '../menus/catalogue.js';
import { effectiveMenus } from '../qdrant/menuRepo.js';
import { requireAdmin, requireAuth, requireMenu, type AuthDeps } from './middleware.js';
import { MenusSchema } from './usersRoutes.js';

// Menu catalogue and per-user access (Architecture.md §8.3, §13.2). Admin only.

export function createAccessRoutes(deps: AuthDeps) {
  const menus = Router();
  menus.use(requireAuth(deps), requireAdmin, requireMenu('access'));
  menus.get('/', async (_req, res) => {
    const stored = await deps.menus.listMenus();
    res.json({ menus: stored.length > 0 ? stored : MENU_CATALOGUE });
  });

  const access = Router();
  access.use(requireAuth(deps), requireAdmin, requireMenu('access'));
  access.get('/', async (_req, res) => {
    const users = await deps.users.list();
    const records = new Map((await deps.menus.listAccess()).map((a) => [a.userId, a]));
    res.json({
      access: users.map((u) => ({
        userId: u.id,
        username: u.username,
        role: u.role,
        active: u.active,
        menus: effectiveMenus(u.role, records.get(u.id) ?? null, deps.testerDefault),
        custom: records.has(u.id),
        updatedBy: records.get(u.id)?.updatedBy ?? null,
        updatedAt: records.get(u.id)?.updatedAt ?? null,
      })),
    });
  });
  access.put('/:userId', async (req, res) => {
    const body = z.object({ menus: MenusSchema }).safeParse(req.body);
    if (!body.success) throw new HttpError(400, 'Invalid input: menus must be an array of menu keys');
    const id = z.uuid().safeParse(req.params.userId);
    const user = id.success ? await deps.users.findById(id.data) : null;
    if (!user) throw new HttpError(404, 'User not found');
    if (user.role === 'Admin') throw new HttpError(400, 'Admins always have every menu');
    const record = await deps.menus.setAccess(user.id, user.username, body.data.menus, req.user!.username);
    res.json({ access: { ...record, menus: effectiveMenus(user.role, record, deps.testerDefault) } });
  });

  return { menus, access };
}
