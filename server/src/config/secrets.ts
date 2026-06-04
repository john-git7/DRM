/**
 * Centralized, fail-closed access to required signing secrets.
 *
 * Mirrors the startup validation in authService (JWT_SECRET) and config/users
 * (ADMIN_*): if a required secret is missing the process exits rather than
 * silently falling back to a predictable constant. dotenv is loaded in server.ts
 * before this module is first imported.
 */
function requireSecret(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`[config] ${name} env var is required. Refusing to start.`);
    process.exit(1);
  }
  return value;
}

// HMAC secret for short-lived HLS key grants (and the legacy stream token, if used).
export const STREAM_SECRET = requireSecret('STREAM_SECRET');
