import { AuthEngine } from '@drmshield/server';
import type { JwtPayload } from '@drmshield/server';
import bcrypt from 'bcryptjs';
import { ADMIN_USERNAME, ADMIN_HASH } from '../config/users';

export type { JwtPayload };

const JWT_SECRET = process.env.JWT_SECRET ?? '';
if (!JWT_SECRET) {
  console.error('[auth] JWT_SECRET env var is required.');
  process.exit(1);
}

const engine = new AuthEngine(JWT_SECRET);

export async function validateCredentials(
  username: string,
  password: string,
): Promise<boolean> {
  if (username !== ADMIN_USERNAME) return false;
  return bcrypt.compare(password, ADMIN_HASH);
}

export function issueJwt(username: string): string {
  return engine.issueJwt(username);
}

export function verifyJwt(token: string): JwtPayload {
  return engine.verifyJwt(token);
}
