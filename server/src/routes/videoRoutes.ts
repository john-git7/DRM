import { Router } from 'express';
import { upload } from '../config/multer';
import {
  listVideos,
  getVideoMeta,
  uploadVideo,
  streamVideo,
  issueStreamToken,
} from '../controllers/videoController';
import { requireAuth } from '../middleware/auth';
import { tokenLimiter } from '../middleware/rateLimiter';

const router = Router();

// POST /api/upload — upload video file (auth required)
router.post('/upload', requireAuth, upload.single('video'), uploadVideo);

// GET /api/videos — list all videos (auth required, filename stripped)
router.get('/videos', requireAuth, listVideos);

// GET /api/videos/:filename — video metadata (auth required)
router.get('/videos/:filename', requireAuth, getVideoMeta);

// POST /api/stream-token — issue HMAC stream token (auth required)
router.post('/stream-token', requireAuth, tokenLimiter, issueStreamToken);

// GET /api/video/:filename — stream video (stream token only, no user auth — range requests must work)
router.get('/video/:filename', streamVideo);

export default router;
