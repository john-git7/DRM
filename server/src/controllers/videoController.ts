import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';

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
  updateVideo,
  syncUploadsToJson,
  getVideoFilePath
} from '../services/videoService';
import { transcodeToHls } from '../services/hlsService';

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
  startTranscode(newVideo.id, savedPath);

  res.status(201).json({
    message: 'Video uploaded successfully! AES-128 HLS encryption in progress.',
    video: { ...newVideo, hlsStatus: 'processing' as const }
  });
}

/**
 * Mark a video processing and run AES-128 HLS transcoding in the background.
 * Status is tracked on the video record; clients poll GET /api/videos/:filename.
 */
function startTranscode(id: string, inputPath: string): void {
  updateVideo(id, { hlsStatus: 'processing' });
  transcodeToHls(id, inputPath)
    .then(({ relativePlaylistUrl }) => {
      updateVideo(id, { hlsStatus: 'ready', hlsPlaylist: relativePlaylistUrl });
      console.log(`HLS encryption ready for ${id}`);
    })
    .catch((err: Error) => {
      updateVideo(id, { hlsStatus: 'failed' });
      console.error(`HLS transcode failed for ${id}: ${err.message}`);
    });
}

/**
 * POST /api/videos/:filename/transcode
 * (Re)start AES-128 HLS encryption for a video whose stream is missing or failed —
 * e.g. legacy uploads that predate the HLS pipeline. Requires the raw source file
 * to still exist in uploads/.
 */
export function reprocessVideo(
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
  if (video.hlsStatus === 'processing') {
    res.status(202).json({ message: 'Already processing', video });
    return;
  }

  const sourcePath = getVideoFilePath(safeFilename);
  if (!fs.existsSync(sourcePath)) {
    next(new AppError('Source video is unavailable; please re-upload it.', 409));
    return;
  }

  startTranscode(video.id, sourcePath);
  res.status(202).json({
    message: 'AES-128 HLS encryption started.',
    video: { ...video, hlsStatus: 'processing' as const }
  });
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
