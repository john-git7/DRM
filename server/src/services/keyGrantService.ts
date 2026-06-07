import { KeyGrantEngine, normalizeIp as _normalizeIp } from '@drmshield/server';
import type { GrantClaims, GrantVerifyResult } from '@drmshield/server';
import { STREAM_SECRET } from '../config/secrets';

export type { GrantClaims, GrantVerifyResult };
export { _normalizeIp as normalizeIp };

const engine = new KeyGrantEngine(STREAM_SECRET);

export function issueGrant(
  claims: Omit<GrantClaims, 'exp'>,
): { grant: string; ttl: number } {
  return engine.issueStreamToken(claims.videoId, claims.ip, claims.deviceId, claims.username);
}

export function verifyGrant(
  token: string,
  expected: { videoId: string; ip: string; deviceId: string },
): GrantVerifyResult {
  return engine.verifyStreamToken(token, expected);
}
