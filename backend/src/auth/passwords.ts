import bcrypt from 'bcryptjs';
import { z } from 'zod';

const BCRYPT_COST = 12;

// bcrypt ignores everything after 72 bytes, so longer passwords are refused.
export const PasswordSchema = z
  .string()
  .min(8)
  .refine((password) => Buffer.byteLength(password) <= 72, 'at most 72 bytes');

export const hashPassword = (password: string): Promise<string> => bcrypt.hash(password, BCRYPT_COST);
export const verifyPassword = (password: string, hash: string): Promise<boolean> => bcrypt.compare(password, hash);

/** Compared against when a username doesn't exist, so response time doesn't reveal which usernames do. */
export const DUMMY_HASH = bcrypt.hashSync('clausario-dummy-password', BCRYPT_COST);
