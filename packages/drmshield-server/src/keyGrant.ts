import crypto from 'node:crypto';
import { Buffer } from 'node:buffer';

const GRANT_TTL_SECONDS = 30;
const DOMAIN = 'keygrant:v1:';

export interface GrantClaims {
  videoId: string;
  ip: string;
  deviceId: string;
  username: string;
  exp: number;
}

export type GrantVerifyResult =
  | { valid: true; claims: GrantClaims }
  | { valid: false; reason: string };

/** Normalize IPv6-mapped IPv4 (::ffff:127.0.0.1) and loopback for stable comparison. */
export function normalizeIp(ip: string | undefined): string {
  if (!ip) return '';
  let out = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  if (out === '::1') out = '127.0.0.1';
  return out;
}

/**
 * Stateless HMAC-SHA256 grant engine. Instantiate once with the shared secret;
 * the instance is safe to reuse across requests.
 *
 * Domain prefix `keygrant:v1:` is mixed into every signature so tokens from this
 * engine cannot be replayed against other HMAC endpoints that share the same key.
 */
export class KeyGrantEngine {
  private readonly secret: string;

  constructor(secret: string) {
    if (!secret) throw new Error('KeyGrantEngine: secret must not be empty');
    this.secret = secret;
  }

  private sign(payload: string): string {
    return crypto
      .createHmac('sha256', this.secret)
      .update(DOMAIN + payload)
      .digest('base64url');
  }

  /**
   * Issue a 30-second grant bound to the given video, caller IP, device fingerprint,
   * and username. The grant is a base64url-encoded JSON payload followed by a dot and
   * a base64url HMAC-SHA256 signature.
   */
  issueStreamToken(
    videoId: string,
    ip: string,
    deviceId: string,
    username: string,
  ): { grant: string; ttl: number } {
    const claims: GrantClaims = {
      videoId,
      ip,
      deviceId,
      username,
      exp: Math.floor(Date.now() / 1000) + GRANT_TTL_SECONDS,
    };
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    return { grant: `${payload}.${this.sign(payload)}`, ttl: GRANT_TTL_SECONDS };
  }

  /**
   * Verify a grant against the live request context. Performs timing-safe signature
   * comparison, claim-shape validation, expiry check, and video/IP/device binding.
   */
  verifyStreamToken(
    token: string,
    expected: { videoId: string; ip: string; deviceId: string },
  ): GrantVerifyResult {
    const dot = token.lastIndexOf('.');
    if (dot === -1) return { valid: false, reason: 'malformed grant' };

    const payload = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    const expectedSig = this.sign(payload);

    const sigBuf = Buffer.from(sig);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, reason: 'bad signature' };
    }

    let claims: GrantClaims;
    try {
      claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as GrantClaims;
    } catch {
      return { valid: false, reason: 'undecodable grant' };
    }

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
}
