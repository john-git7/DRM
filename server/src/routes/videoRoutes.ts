import { Router } from 'express';
import { upload } from '../config/multer';
import {
  listVideos,
  getVideoMeta,
  uploadVideo,
  streamVideo,
  syncVideos
} from '../controllers/videoController';

const router = Router();

/**
 * Video API routes
 * Thin routing layer delegating to controllers
 */

// POST /api/upload — upload video file
router.post('/upload', upload.single('video'), uploadVideo);

// GET /api/videos — list all videos
router.get('/videos', listVideos);

// GET /api/videos/:filename — get video metadata by filename
router.get('/videos/:filename', getVideoMeta);

// GET /api/video/:filename — stream video file with range support
router.get('/video/:filename', streamVideo);

// POST /api/sync — sync uploads directory with database
router.post('/sync', syncVideos);

export default router;
