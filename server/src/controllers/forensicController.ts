import { Response, NextFunction } from 'express';
import { encryptForensic, decryptForensic } from '../services/forensicService';
import { normalizeIp } from '../services/keyGrantService';
import { appendAudit } from '../services/auditService';
import type { AuthenticatedRequest } from '../types/auth';
import { AppError } from '../middleware/errorHandler';

/** Truncate the device fingerprint embedded in the token to keep the QR small. */
const DEVICE_LEN = 16;

/**
 * POST /api/forensic/token   (requireAuth)
 * Mint an encrypted forensic token for the current viewer. The player embeds the
 * returned opaque string in its on-frame QR. The server stamps the IP it sees and
 * the mint time, so those fields cannot be forged client-side.
 */
export function issueForensicToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const identity = req.user?.username;
  if (!identity) {
    next(new AppError('Unauthorized', 401));
    return;
  }
  const { deviceId } = req.body as { deviceId?: string };
  const token = encryptForensic({
    identity,
    deviceId: typeof deviceId === 'string' ? deviceId.slice(0, DEVICE_LEN) : '',
    ip: normalizeIp(req.ip),
    issuedAt: new Date().toISOString(),
  });
  res.status(200).json({ token });
}

/**
 * POST /api/forensic/decode   (requireAuth)
 * Decrypt a token scanned from a leaked frame and return the forensic fields.
 * Only authenticated DRMShield operators can resolve a token — a generic scanner
 * cannot. Each successful resolve is itself recorded in the audit log.
 */
export function decodeForensicToken(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const operator = req.user?.username;
  if (!operator) {
    next(new AppError('Unauthorized', 401));
    return;
  }
  const { token } = req.body as { token?: string };
  if (!token || typeof token !== 'string') {
    next(new AppError('A token is required', 400));
    return;
  }
  const data = decryptForensic(token);
  if (!data) {
    next(new AppError('Not a valid DRMShield forensic mark', 422));
    return;
  }

  appendAudit({
    timestamp: new Date().toISOString(),
    username: operator,
    ip: normalizeIp(req.ip),
    event: 'forensic-scan',
    deviceId: data.deviceId,
    userAgent: req.headers['user-agent'],
  });

  res.status(200).json({ data });
}
