import { Router, type CookieOptions } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { HttpError } from '../errors.js';
import { toPublicUser } from '../qdrant/usersRepo.js';
import { requireAuth, SESSION_COOKIE, signSession, visibleMenus, type AuthDeps } from './middleware.js';
import { DUMMY_HASH, verifyPassword } from './passwords.js';

const LoginSchema = z.object({ username: z.string().min(1), password: z.string().min(1) });
const LOGIN_FAILED = 'Invalid username or password';

export function createAuthRoutes(deps: AuthDeps) {
  const router = Router();
  const cookieOptions: CookieOptions = { httpOnly: true, sameSite: 'strict', secure: deps.secureCookies, path: '/' };

  // Only failed attempts count towards the limit: 10 per IP per 15 minutes.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'Too many failed login attempts. Try again later.' },
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const input = LoginSchema.safeParse(req.body);
    if (!input.success) throw new HttpError(401, LOGIN_FAILED);
    const user = await deps.users.findByUsername(input.data.username);
    const validPassword = await verifyPassword(input.data.password, user?.passwordHash ?? DUMMY_HASH);
    if (!user || !validPassword || !user.active) throw new HttpError(401, LOGIN_FAILED);

    res.cookie(SESSION_COOKIE, signSession(user.id, deps.jwtSecret, deps.sessionHours), {
      ...cookieOptions,
      maxAge: deps.sessionHours * 60 * 60 * 1000,
    });
    res.json({ user: toPublicUser(user) });
  });

  const authenticated = requireAuth(deps);

  router.post('/logout', authenticated, (_req, res) => {
    res.clearCookie(SESSION_COOKIE, cookieOptions);
    res.status(204).end();
  });

  router.get('/me', authenticated, (req, res) => {
    res.json({ user: toPublicUser(req.user!), menus: visibleMenus(req.menus!) });
  });

  return router;
}
