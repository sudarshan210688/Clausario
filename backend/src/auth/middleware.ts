import type { NextFunction, Request, RequestHandler, Response } from 'express';
import jwt from 'jsonwebtoken';
import { HttpError } from '../errors.js';
import { MENU_CATALOGUE, type MenuKey } from '../menus/catalogue.js';
import { effectiveMenus, type MenuRepo } from '../qdrant/menuRepo.js';
import type { User, UsersRepo } from '../qdrant/usersRepo.js';

// Sessions and RBAC (Architecture.md §8). The JWT holds only the user id; every request reloads the user and their
// access record, so role, menu and active changes apply on the next request.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: User;
      menus?: MenuKey[];
    }
  }
}

/** App-specific name: cookies are not port-scoped on localhost, so other local apps must not clash. */
export const SESSION_COOKIE = 'clausario_session';
const JWT_ALGORITHM = 'HS256';

export interface AuthDeps {
  users: UsersRepo;
  menus: MenuRepo;
  jwtSecret: string;
  sessionHours: number;
  testerDefault: readonly MenuKey[];
  secureCookies: boolean;
}

export function signSession(userId: string, jwtSecret: string, hours: number): string {
  return jwt.sign({}, jwtSecret, { subject: userId, algorithm: JWT_ALGORITHM, expiresIn: `${hours}h` });
}

function readUserId(token: unknown, jwtSecret: string): string | null {
  if (typeof token !== 'string') return null;
  try {
    return (jwt.verify(token, jwtSecret, { algorithms: [JWT_ALGORITHM] }).sub as string) ?? null;
  } catch {
    return null;
  }
}

export function requireAuth({ users, menus, jwtSecret, testerDefault }: AuthDeps): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const userId = readUserId(req.cookies?.[SESSION_COOKIE], jwtSecret);
    const user = userId ? await users.findById(userId) : null;
    if (!user?.active) throw new HttpError(401, 'Not authenticated');
    req.user = user;
    req.menus = effectiveMenus(user.role, await menus.getAccess(user.id), testerDefault);
    next();
  };
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.role !== 'Admin') throw new HttpError(403, 'Forbidden');
  next();
};

/** Passes when the user has any of `keys`. Admin-only menus also need role Admin (effectiveMenus drops them). */
export function requireMenu(...keys: MenuKey[]): RequestHandler {
  return (req, _res, next) => {
    if (!keys.some((key) => req.menus?.includes(key))) throw new HttpError(403, 'Forbidden');
    next();
  };
}

export const hasMenu = (req: Request, key: MenuKey) => req.menus?.includes(key) ?? false;

/** Catalogue items the user can see, in menu order. */
export const visibleMenus = (keys: readonly MenuKey[]) => MENU_CATALOGUE.filter((m) => keys.includes(m.key));
