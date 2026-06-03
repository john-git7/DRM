import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

const MP4_MAGIC = Buffer.from('ftyp');

function isMp4(filePath: string): boolean {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(12);
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  return buf.slice(4, 8).equals(MP4_MAGIC);
}
import { UploadBodySchema } from '../types/video';
import { AppError } from '../middleware/errorHandler';
import {
  getVideos,
  getVideoByFilename,
  createVideo,
  syncUploadsToJson,
  getVideoFilePath
} from '../services/videoService';

const STREAM_SECRET = process.env.STREAM_SECRET || 'dev-secret-change-in-prod';

/**
 * GET /api/videos
 * Return all videos — filename field omitted (VULN-02: prevents direct enumeration of disk paths)
 */
export function listVideos(
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const videos = getVideos().map(({ filename: _f, ...safe }) => safe);
  res.status(200).json(videos);
}

/**
 * GET /api/videos/:filename
 * Return metadata for a single video
 */
export function getVideoMeta(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const safeFilename = path.basename(req.params.filename);
  const video = getVideoByFilename(safeFilename);

  if (!video) {
    next(new AppError('Video metadata not found', 404));
    return;
  }

  res.status(200).json(video);
}

/**
 * POST /api/upload
 * Handle video file upload via Multer middleware
 */
export function uploadVideo(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.file) {
    next(new AppError('No video file provided.', 400));
    return;
  }

  const bodyResult = UploadBodySchema.safeParse(req.body);
  const title = bodyResult.success && bodyResult.data.title
    ? bodyResult.data.title
    : req.file.originalname.replace(/\.[^/.]+$/, '');

  const savedPath = getVideoFilePath(req.file.filename);
  if (!isMp4(savedPath)) {
    fs.unlinkSync(savedPath);
    next(new AppError('Uploaded file is not a valid MP4 (magic bytes mismatch)', 415));
    return;
  }

  const newVideo = createVideo(req.file, title);

  res.status(201).json({
    message: 'Video uploaded successfully!',
    video: newVideo
  });
}

/**
 * POST /api/stream-token
 * Issue a short-lived HMAC-signed stream token for a video.
 * Token payload: base64url(JSON({filename, exp})).HMAC-SHA256
 * TTL: 3600s (1 hour) — long enough for normal viewing sessions.
 */
export function issueStreamToken(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { videoId } = req.body as { videoId?: string };
  if (!videoId || typeof videoId !== 'string') {
    next(new AppError('videoId is required', 400));
    return;
  }

  const safeFilename = path.basename(videoId);
  const video = getVideoByFilename(safeFilename);
  if (!video) {
    next(new AppError('Video not found', 404));
    return;
  }

  const exp = Math.floor(Date.now() / 1000) + 3600;
  const payload = Buffer.from(JSON.stringify({ filename: safeFilename, exp })).toString('base64url');
  const sig = crypto.createHmac('sha256', STREAM_SECRET).update(payload).digest('base64url');

  res.status(200).json({ token: `${payload}.${sig}` });
}

/**
 * GET /api/video/:filename
 * Stream video with HTTP range support.
 * Requires a valid, unexpired HMAC stream token via ?token= query param (VULN-01, VULN-04, VULN-07).
 */
export function streamVideo(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const rawToken = typeof req.query.token === 'string' ? req.query.token : '';
  const dotIndex = rawToken.lastIndexOf('.');

  if (dotIndex === -1) {
    next(new AppError('Stream token required', 401));
    return;
  }

  const payload = rawToken.slice(0, dotIndex);
  const sig = rawToken.slice(dotIndex + 1);
  const expectedSig = crypto.createHmac('sha256', STREAM_SECRET).update(payload).digest('base64url');

  if (sig !== expectedSig) {
    next(new AppError('Invalid stream token', 401));
    return;
  }

  let parsed: { filename: string; exp: number };
  try {
    parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    next(new AppError('Malformed stream token', 401));
    return;
  }

  if (Math.floor(Date.now() / 1000) > parsed.exp) {
    next(new AppError('Stream token expired', 401));
    return;
  }

  const safeFilename = path.basename(parsed.filename);
  const urlFilename = path.basename(req.params.filename);
  if (safeFilename !== urlFilename) {
    next(new AppError('Token filename mismatch', 401));
    return;
  }

  const videoPath = getVideoFilePath(safeFilename);

  if (!fs.existsSync(videoPath)) {
    next(new AppError('Video file not found', 404));
    return;
  }

  const stat = fs.statSync(videoPath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (start >= fileSize || end >= fileSize) {
      res.status(416).set('Content-Range', `bytes */${fileSize}`).send('Requested Range Not Satisfiable');
      return;
    }

    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': 'video/mp4',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    fs.createReadStream(videoPath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    });
    fs.createReadStream(videoPath).pipe(res);
  }
}

/**
 * POST /api/sync
 * Scan uploads directory and sync missing MP4 files into videos.json.
 * Route intentionally removed (VULN-13) — kept for internal/CLI use only.
 */
export function syncVideos(
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const result = syncUploadsToJson();
  res.status(200).json({
    message: 'Sync completed',
    added: result.added
  });
}
