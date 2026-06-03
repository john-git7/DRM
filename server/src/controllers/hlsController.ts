import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { STREAMS_DIR } from '../config/paths';
import { getKey } from '../services/keyService';
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
 * GET /api/hls/:videoId/key
 * Return the 16-byte AES-128 key for a stream.
 *
 * Phase 1 baseline: gated by requireAuth (valid JWT) at the route layer. Phase 2
 * replaces this with enrollment + IP/device checks and a 30-second signed key URL.
 */
export function serveHlsKey(req: Request, res: Response, next: NextFunction): void {
  const record = getKey(path.basename(req.params.videoId));
  if (!record) {
    next(new AppError('Decryption key not found', 404));
    return;
  }
  const keyBytes = Buffer.from(record.keyHex, 'hex');
  res.setHeader('Content-Type', 'application/octet-stream');
  res.setHeader('Content-Length', String(keyBytes.length));
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).end(keyBytes);
}
