import { Router } from 'express';
import { upload } from '../config/multer';
import {
  listVideos,
  getVideoMeta,
  uploadVideo,
  reprocessVideo,
} from '../controllers/videoController';
import {
  serveHlsPlaylist,
  serveHlsSegment,
  serveHlsKey,
  issueKeyGrant,
} from '../controllers/hlsController';
import { recordAudit } from '../controllers/auditController';
import { requireAuth } from '../middleware/auth';
import { tokenLimiter, keyLimiter, auditLimiter } from '../middleware/rateLimiter';

const router = Router();

// POST /api/upload — upload video file (auth required)
router.post('/upload', requireAuth, upload.single('video'), uploadVideo);

// GET /api/videos — list all videos (auth required, filename stripped)
router.get('/videos', requireAuth, listVideos);

// GET /api/videos/:filename — video metadata (auth required)
router.get('/videos/:filename', requireAuth, getVideoMeta);

// POST /api/videos/:filename/transcode — (re)start HLS encryption for legacy/failed videos
router.post('/videos/:filename/transcode', requireAuth, reprocessVideo);

// --- Encrypted HLS delivery (Phase 1) + key server (Phase 2) ---
// Literal paths declared before the :segment catch-all so they take precedence.
// Playlist + segments are public (AES-128 encrypted and useless without the key).
router.get('/hls/:videoId/index.m3u8', serveHlsPlaylist);

// POST /api/hls/:videoId/key-grant — JWT-gated: checks enrollment + device, mints a 30s grant.
router.post('/hls/:videoId/key-grant', requireAuth, tokenLimiter, issueKeyGrant);

// GET /api/hls/:videoId/key — releases the AES-128 key only for a valid grant + device header.
router.get('/hls/:videoId/key', keyLimiter, serveHlsKey);

router.get('/hls/:videoId/:segment', serveHlsSegment);

// POST /api/audit — record a session audit event (Phase 6)
router.post('/audit', requireAuth, auditLimiter, recordAudit);

export default router;
