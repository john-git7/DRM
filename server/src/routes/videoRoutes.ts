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

// DELETE /api/videos/:filename — permanently delete a video (stream, key, source, metadata)
router.delete('/videos/:filename', requireAuth, deleteVideo);

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

// --- Encrypted forensic watermark tokens (Phase 6) ---
// POST /api/forensic/token — mint an encrypted token (identity+device+IP+time) for the QR.
router.post('/forensic/token', requireAuth, tokenLimiter, issueForensicToken);
// POST /api/forensic/decode — decrypt a scanned token; auth-gated so only our scanner can read it.
router.post('/forensic/decode', requireAuth, auditLimiter, decodeForensicToken);

export default router;
