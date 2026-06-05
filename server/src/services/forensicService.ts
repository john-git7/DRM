import crypto from 'crypto';
import { STREAM_SECRET } from '../config/secrets';

/**
 * Phase 6 — encrypted forensic watermark tokens.
 *
 * The player shows a small QR on the frame, but instead of plaintext it carries an
 * AES-256-GCM ciphertext minted here. A generic phone QR scanner therefore only
 * sees opaque base64url gibberish; the identity, device, IP, and time are revealed
 * **only** by POSTing the token back to /api/forensic/decode while authenticated —
 * i.e. only DRMShield's own scanner can read it.
 *
 * The key is derived from STREAM_SECRET (domain-separated) so no new secret is
 * required and it never leaves the server.
 */

const ALG = 'aes-256-gcm';
const KEY = crypto.createHash('sha256').update(`${STREAM_SECRET}:forensic-watermark:v1`).digest(); // 32 bytes

export interface ForensicData {
  identity: string;
  deviceId: string;
  ip: string;
  /** ISO-8601 mint time. */
  issuedAt: string;
}

/** "|"-free field so the delimiter stays unambiguous. */
const clean = (s: string) => String(s ?? '').replace(/\|/g, '/');

/** Encrypt forensic fields into a compact base64url token (iv | tag | ciphertext). */
export function encryptForensic(data: ForensicData): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALG, KEY, iv);
  const plain = [clean(data.identity), clean(data.deviceId), clean(data.ip), clean(data.issuedAt)].join('|');
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64url');
}

/** Decrypt a token back into forensic fields, or null if it is not a valid DRMShield token. */
export function decryptForensic(token: string): ForensicData | null {
  try {
    const raw = Buffer.from(token, 'base64url');
    if (raw.length < 28) return null; // 12 iv + 16 tag minimum
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const ct = raw.subarray(28);
    const decipher = crypto.createDecipheriv(ALG, KEY, iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
    const [identity, deviceId, ip, issuedAt] = plain.split('|');
    if (!identity || !issuedAt) return null;
    return { identity, deviceId: deviceId ?? '', ip: ip ?? '', issuedAt };
  } catch {
    return null; // bad token / auth-tag mismatch / tampered
  }
}
