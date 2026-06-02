import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { UploadBodySchema } from '../types/video';
import { AppError } from '../middleware/errorHandler';
import {
  getVideos,
  getVideoByFilename,
  createVideo,
  syncUploadsToJson,
  getVideoFilePath
} from '../services/videoService';

/**
 * GET /api/videos
 * Return all videos from the database
 */
export function listVideos(
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  res.status(200).json(getVideos());
}

/**
 * GET /api/videos/:filename
 * Return metadata for a single video
 * Uses path.basename for safety, returns 404 if not found
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
 * Validates title from request body (optional)
 * Creates video entry and saves to database
 * Returns 201 with created video object
 *
 * Expected to be used as: router.post('/upload', upload.single('video'), uploadVideo)
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

  // Validate and extract optional title from request body
  const bodyResult = UploadBodySchema.safeParse(req.body);
  const title = bodyResult.success && bodyResult.data.title
    ? bodyResult.data.title
    : req.file.originalname.replace(/\.[^/.]+$/, '');

  // Create video entry and save
  const newVideo = createVideo(req.file, title);

  res.status(201).json({
    message: 'Video uploaded successfully!',
    video: newVideo
  });
}

/**
 * GET /api/video/:filename
 * Stream video file with HTTP range request support
 * Uses path.basename for safety
 * Sets Accept-Ranges header and handles 206 Partial Content responses
 */
export function streamVideo(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const safeFilename = path.basename(req.params.filename);
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
      'Content-Type': 'video/mp4'
    });
    fs.createReadStream(videoPath, { start, end }).pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes'
    });
    fs.createReadStream(videoPath).pipe(res);
  }
}

/**
 * POST /api/sync
 * Scan uploads directory and sync any missing MP4 files into videos.json
 * Returns count of newly added entries
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
