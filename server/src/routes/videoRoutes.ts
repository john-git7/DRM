import { Router } from 'express';
import { upload } from '../config/multer';
import {
  listVideos,
  getVideoMeta,
  uploadVideo,
  streamVideo,
  issueStreamToken,
} from '../controllers/videoController';

const router = Router();

// POST /api/upload — upload video file
router.post('/upload', upload.single('video'), uploadVideo);

// GET /api/videos — list all videos (filename field stripped)
router.get('/videos', listVideos);

// GET /api/videos/:filename — get video metadata by filename
router.get('/videos/:filename', getVideoMeta);

// POST /api/stream-token — issue short-lived HMAC stream token
router.post('/stream-token', issueStreamToken);

// GET /api/video/:filename — stream video (requires valid ?token=)
router.get('/video/:filename', streamVideo);

export default router;
