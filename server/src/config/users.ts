import bcrypt from 'bcryptjs';

const username = process.env.ADMIN_USERNAME;
const password = process.env.ADMIN_PASSWORD;

if (!username || !password) {
  console.error('[auth] ADMIN_USERNAME and ADMIN_PASSWORD env vars are required.');
  process.exit(1);
}

export const ADMIN_USERNAME: string = username;
export const ADMIN_HASH: string = bcrypt.hashSync(password, 10);
