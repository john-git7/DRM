/**
 * Forensic fields returned by the server after decrypting a scanned QR token.
 *
 * The QR itself carries only an opaque AES-256-GCM token (minted by
 * POST /api/forensic/token); these fields are revealed only by POSTing that token
 * back to /api/forensic/decode while authenticated — i.e. only DRMShield's own
 * scanner can read them.
 */
export interface ForensicData {
  identity: string;
  deviceId: string;
  ip: string;
  /** ISO-8601 mint time, stamped server-side. */
  issuedAt: string;
}
