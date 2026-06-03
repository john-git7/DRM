import crypto from 'crypto';
import { STREAM_SECRET } from '../config/secrets';

/**
 * Phase 2 — short-lived signed key grants.
 *
 * Before the AES-128 key is ever released, the client must obtain a grant from a
 * JWT-protected endpoint. The grant is an HMAC-signed token binding the request to
 * a specific video, client IP, and device fingerprint, and it expires in 30 seconds.
 * The key endpoint then releases the key only on presentation of a valid grant AND
 * a matching device fingerprint — so a stolen key URL is useless after 30s, from
 * another IP, or another device.
 */

const GRANT_TTL_SECONDS = 30;

// Validated, fail-closed secret. Domain-separated from the stream-token HMAC so the
// two token types are not interchangeable.
const GRANT_SECRET = STREAM_SECRET;
const DOMAIN = 'keygrant:v1:';

export interface GrantClaims {
  videoId: string;
  ip: string;
  deviceId: string;
  username: string;
  exp: number;
}

/** Normalize IPv6-mapped IPv4 (::ffff:127.0.0.1) and loopback forms for stable comparison. */
export function normalizeIp(ip: string | undefined): string {
  if (!ip) return '';
  let out = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (out === '::1') out = '127.0.0.1';
  return out;
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', GRANT_SECRET).update(DOMAIN + payload).digest('base64url');
}

/**
 * Issue a 30-second grant bound to the given video, IP, device, and user.
 */
export function issueGrant(claims: Omit<GrantClaims, 'exp'>): { grant: string; ttl: number } {
  const full: GrantClaims = { ...claims, exp: Math.floor(Date.now() / 1000) + GRANT_TTL_SECONDS };
  const payload = Buffer.from(JSON.stringify(full)).toString('base64url');
  return { grant: `${payload}.${sign(payload)}`, ttl: GRANT_TTL_SECONDS };
}

export type GrantVerifyResult =
  | { valid: true; claims: GrantClaims }
  | { valid: false; reason: string };

/**
 * Verify a grant against the live request context (expected video, caller IP, and
 * presented device fingerprint). Uses a timing-safe signature comparison and checks
 * claim shape, expiry, video, IP, and device binding.
 */
export function verifyGrant(
  token: string,
  expected: { videoId: string; ip: string; deviceId: string }
): GrantVerifyResult {
  const dot = token.lastIndexOf('.');
  if (dot === -1) return { valid: false, reason: 'malformed grant' };

  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = sign(payload);

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return { valid: false, reason: 'bad signature' };
  }

  let claims: GrantClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return { valid: false, reason: 'undecodable grant' };
  }

  // Validate claim shape before trusting any field.
  if (
    typeof claims.exp !== 'number' ||
    typeof claims.videoId !== 'string' ||
    typeof claims.ip !== 'string' ||
    typeof claims.deviceId !== 'string'
  ) {
    return { valid: false, reason: 'malformed claims' };
  }

  if (Math.floor(Date.now() / 1000) > claims.exp) return { valid: false, reason: 'grant expired' };
  if (claims.videoId !== expected.videoId) return { valid: false, reason: 'video mismatch' };
  if (normalizeIp(claims.ip) !== normalizeIp(expected.ip)) return { valid: false, reason: 'ip mismatch' };
  if (!expected.deviceId || claims.deviceId !== expected.deviceId) return { valid: false, reason: 'device mismatch' };

  return { valid: true, claims };
}
