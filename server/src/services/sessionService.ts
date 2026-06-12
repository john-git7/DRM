/**
 * Single-concurrent-session registry (in-memory).
 *
 * Each (username, videoId) pair may have exactly one active playback session,
 * identified by the device fingerprint that most recently obtained a key grant.
 * When a second device requests a grant for the same user and video, it becomes
 * the active session and the previous device is "superseded": its subsequent key
 * fetches are rejected by the HLS key endpoint, so the older session stalls.
 *
 * This is deliberately best-effort and fail-open. The registry lives in process
 * memory (it resets on restart) and is only consulted when both a verified grant
 * and a device id are present. Native HLS on Apple devices, which cannot attach
 * the device header, is therefore never blocked by this check — preserving the
 * existing demo bypass in serveHlsKey.
 */

interface SessionRecord {
  deviceId: string;
  issuedAt: number; // epoch ms
}

const sessions = new Map<string, SessionRecord>();

/** TTL after which an idle session is forgotten, so a user is never permanently
 *  locked to a device they have stopped using. Comfortably longer than the 30s
 *  key-grant TTL and any reasonable segment-fetch gap. */
const SESSION_TTL_MS = 5 * 60 * 1000;

function key(username: string, videoId: string): string {
  return `${username}|${videoId}`;
}

/**
 * Record (or refresh) the active session for a user+video and return the device
 * it replaced, if any. A return value other than the incoming deviceId means a
 * different device was just superseded — useful for audit logging.
 */
export function registerSession(
  username: string,
  videoId: string,
  deviceId: string,
): { supersededDeviceId: string | null } {
  const k = key(username, videoId);
  const prev = sessions.get(k);
  sessions.set(k, { deviceId, issuedAt: Date.now() });
  const superseded =
    prev && prev.deviceId !== deviceId ? prev.deviceId : null;
  return { supersededDeviceId: superseded };
}

/**
 * Decide whether a device may still fetch keys for a user+video. Returns true
 * (allowed) when there is no registered session, the registered session matches
 * the device, or the registered session has gone stale. Returns false only when
 * a *different*, still-fresh device owns the session.
 */
export function isSessionCurrent(
  username: string,
  videoId: string,
  deviceId: string,
): boolean {
  const rec = sessions.get(key(username, videoId));
  if (!rec) return true;
  if (Date.now() - rec.issuedAt > SESSION_TTL_MS) return true;
  return rec.deviceId === deviceId;
}
