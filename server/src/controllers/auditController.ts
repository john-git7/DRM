import { Response, NextFunction } from 'express';
import path from 'path';
import { appendAudit, type AuditEntry } from '../services/auditService';
import { normalizeIp } from '../services/keyGrantService';
import { AppError } from '../middleware/errorHandler';
import type { AuthenticatedRequest } from '../types/auth';

/**
 * POST /api/audit  (requireAuth)
 * Record a client-reported session event (Phase 6): playback start, watch-time
 * heartbeats, agent status, and protection trips (recorder/DevTools blocks). The
 * server stamps the authoritative username, IP, and timestamp; client-supplied
 * fields are sanitized and optional.
 */
export function recordAudit(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const username = req.user?.username;
  if (!username) {
    next(new AppError('Unauthorized', 401));
    return;
  }

  const body = (req.body ?? {}) as Partial<AuditEntry>;
  if (typeof body.event !== 'string' || !body.event) {
    next(new AppError('event is required', 400));
    return;
  }

  // Length-cap free-text fields so the flat-file log cannot be inflated per write.
  const cap = (s: string, n: number): string => s.slice(0, n);

  appendAudit({
    timestamp: new Date().toISOString(),
    username,
    ip: normalizeIp(req.ip),
    event: cap(body.event, 64),
    videoId: typeof body.videoId === 'string' ? path.basename(body.videoId).slice(0, 128) : undefined,
    deviceId: typeof body.deviceId === 'string' ? cap(body.deviceId, 64) : undefined,
    agentStatus: typeof body.agentStatus === 'string' ? cap(body.agentStatus, 32) : undefined,
    recorders: Array.isArray(body.recorders) ? body.recorders.map((r) => cap(String(r), 64)).slice(0, 50) : undefined,
    watchTimeSec: typeof body.watchTimeSec === 'number' ? Math.max(0, Math.floor(body.watchTimeSec)) : undefined,
    userAgent: typeof req.headers['user-agent'] === 'string' ? cap(req.headers['user-agent'], 256) : undefined
  });

  res.status(202).json({ recorded: true });
}
