import { Router } from 'express';
import { upload } from '../config/multer';
import {
  listVideos,
  getVideoMeta,
  uploadVideo,
  reprocessVideo,
  deleteVideo,
} from '../controllers/videoController';
import {
  serveHlsPlaylist,
  serveHlsSegment,
  serveHlsKey,
  issueKeyGrant,
} from '../controllers/hlsController';
import { recordAudit } from '../controllers/auditController';
import { issueForensicToken, decodeForensicToken } from '../controllers/forensicController';
import { tokenLimiter, keyLimiter, auditLimiter } from '../middleware/rateLimiter';

const router = Router();

// POST /api/upload — upload video file
router.post('/upload', upload.single('video'), uploadVideo);

// GET /api/videos — list all videos
router.get('/videos', listVideos);

// GET /api/videos/:filename — video metadata
router.get('/videos/:filename', getVideoMeta);

// POST /api/videos/:filename/transcode — (re)start HLS encryption
router.post('/videos/:filename/transcode', reprocessVideo);

// DELETE /api/videos/:filename — permanently delete a video
router.delete('/videos/:filename', deleteVideo);

// --- Encrypted HLS delivery (Phase 1) + key server (Phase 2) ---
router.get('/hls/:videoId/index.m3u8', serveHlsPlaylist);

// POST /api/hls/:videoId/key-grant
router.post('/hls/:videoId/key-grant', tokenLimiter, issueKeyGrant);

// GET /api/hls/:videoId/key
router.get('/hls/:videoId/key', keyLimiter, serveHlsKey);

router.get('/hls/:videoId/:segment', serveHlsSegment);

// POST /api/audit — record a session audit event
router.post('/audit', auditLimiter, recordAudit);

// --- Encrypted forensic watermark tokens (Phase 6) ---
router.post('/forensic/token', tokenLimiter, issueForensicToken);
router.post('/forensic/decode', auditLimiter, decodeForensicToken);

export default router;
