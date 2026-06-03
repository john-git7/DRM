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

  appendAudit({
    timestamp: new Date().toISOString(),
    username,
    ip: normalizeIp(req.ip),
    event: body.event,
    videoId: typeof body.videoId === 'string' ? path.basename(body.videoId) : undefined,
    deviceId: typeof body.deviceId === 'string' ? body.deviceId : undefined,
    agentStatus: typeof body.agentStatus === 'string' ? body.agentStatus : undefined,
    recorders: Array.isArray(body.recorders) ? body.recorders.map(String).slice(0, 50) : undefined,
    watchTimeSec: typeof body.watchTimeSec === 'number' ? Math.max(0, Math.floor(body.watchTimeSec)) : undefined,
    userAgent: req.headers['user-agent']
  });

  res.status(202).json({ recorded: true });
}
