import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { ADMIN_USERNAME, ADMIN_HASH } from '../config/users';
import type { JwtPayload } from '../types/auth';

const JWT_SECRET = process.env.JWT_SECRET || '';

if (!JWT_SECRET) {
  console.error('[auth] JWT_SECRET env var is required.');
  process.exit(1);
}

export async function validateCredentials(username: string, password: string): Promise<boolean> {
  if (username !== ADMIN_USERNAME) return false;
  return bcrypt.compare(password, ADMIN_HASH);
}

export function issueJwt(username: string): string {
  return jwt.sign({ username }, JWT_SECRET, { expiresIn: '24h' });
}

export function verifyJwt(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
