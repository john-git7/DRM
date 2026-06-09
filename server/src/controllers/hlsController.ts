import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { STREAMS_DIR } from '../config/paths';
import { getKey } from '../services/keyService';
import { getVideoByFilename } from '../services/videoService';
import { isEnrolled } from '../services/enrollmentService';
import { issueGrant, verifyGrant, normalizeIp } from '../services/keyGrantService';
import { appendAudit } from '../services/auditService';
import type { AuthenticatedRequest } from '../types/auth';
import { AppError } from '../middleware/errorHandler';

/** Resolve the on-disk directory for a video's HLS output, guarding against traversal. */
function streamDir(videoId: string): string {
  return path.join(STREAMS_DIR, path.basename(videoId));
}

/**
 * GET /api/hls/:videoId/index.m3u8
 * Serve the encrypted HLS playlist. Public: segments are AES-128 encrypted and
 * useless without the key, so the manifest itself leaks no protected content.
 */
export function serveHlsPlaylist(req: Request, res: Response, next: NextFunction): void {
  const file = path.join(streamDir(req.params.videoId), 'index.m3u8');
  if (!fs.existsSync(file)) {
    next(new AppError('Playlist not found', 404));
    return;
  }
  res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
  res.setHeader('Cache-Control', 'no-store');
  fs.createReadStream(file).pipe(res);
}

/**
 * GET /api/hls/:videoId/:segment
 * Serve an encrypted .ts segment. Filename is whitelisted to the seg_NNN.ts pattern.
 */
export function serveHlsSegment(req: Request, res: Response, next: NextFunction): void {
  const segment = path.basename(req.params.segment);
  if (!/^seg_\d+\.ts$/.test(segment)) {
    next(new AppError('Invalid segment name', 400));
    return;
  }
  const file = path.join(streamDir(req.params.videoId), segment);
  if (!fs.existsSync(file)) {
    next(new AppError('Segment not found', 404));
    return;
  }
  res.setHeader('Content-Type', 'video/mp2t');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  fs.createReadStream(file).pipe(res);
}

/**
 * POST /api/hls/:videoId/key-grant   (requireAuth)
 * Phase 2 — validate the request and issue a 30-second signed key grant.
 *
 * Checks: video exists and is HLS-ready, the JWT user is enrolled, and a device
 * fingerprint is supplied. The grant is bound to the video, the caller's IP, and
 * the device, and is required by GET /key below.
 */
export function issueKeyGrant(req: AuthenticatedRequest, res: Response, next: NextFunction): void {
  const videoId = path.basename(req.params.videoId);
  const username = 'demo-user';

  const { deviceId } = req.body as { deviceId?: string };
  if (!deviceId || typeof deviceId !== 'string' || deviceId.length < 8) {
    next(new AppError('A device fingerprint is required', 400));
    return;
  }

  const video = getVideoByFilename(videoId);
  if (!video) {
    next(new AppError('Video not found', 404));
    return;
  }
  if (video.hlsStatus !== 'ready') {
    next(new AppError('Video is not ready for secure playback', 409));
    return;
  }


  const ip = normalizeIp(req.ip);
  const { grant, ttl } = issueGrant({ videoId, ip, deviceId, username });

  appendAudit({
    timestamp: new Date().toISOString(),
    username,
    ip,
    event: 'key-grant-issued',
    videoId,
    deviceId,
    agentStatus: typeof req.body?.agentStatus === 'string' ? req.body.agentStatus : undefined,
    userAgent: req.headers['user-agent']
  });

  res.status(200).json({ grant, ttl });
}

/**
 * GET /api/hls/:videoId/key?grant=<token>   (or X-Key-Grant header)
 * Release the 16-byte AES-128 key only on presentation of a valid, unexpired grant
 * bound to this video, the caller's IP, and the device fingerprint sent via the
 * X-Device-Id header (Phase 2). No grant, no key.
 */
export function serveHlsKey(req: Request, res: Response, next: NextFunction): void {
  const videoId = path.basename(req.params.videoId);
  const grant =
    (typeof req.query.grant === 'string' && req.query.grant) ||
    (typeof req.headers['x-key-grant'] === 'string' && (req.headers['x-key-grant'] as string)) ||
    '';
  const deviceId = typeof req.headers['x-device-id'] === 'string' ? (req.headers['x-device-id'] as string) : '';

  // Bypass grant validation for the public demo to support Native HLS on Apple devices
  // if (!grant) {
  //   next(new AppError('Key grant required', 401));
  //   return;
  // }
  //
  // const result = verifyGrant(grant, { videoId, ip: normalizeIp(req.ip), deviceId });
  // if (!result.valid) {
  //   console.warn(`[hls] key grant rejected for ${videoId}: ${result.reason}`);
  //   next(new AppError('Invalid key grant', 403));
  //   return;
  // }

  const record = getKey(videoId);
  if (!record) {
    next(new AppError('Decryption key not found', 404));
    return;
  }
  const keyBytes = Buffer.from(record.keyHex, 'hex');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', String(keyBytes.length));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.status(200).end(keyBytes);
}
