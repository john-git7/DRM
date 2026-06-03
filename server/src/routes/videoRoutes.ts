import { Router } from 'express';
import { upload } from '../config/multer';
import {
  listVideos,
  getVideoMeta,
  uploadVideo,
  streamVideo,
  issueStreamToken,
} from '../controllers/videoController';
import {
  serveHlsPlaylist,
  serveHlsSegment,
  serveHlsKey,
  issueKeyGrant,
} from '../controllers/hlsController';
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

// GET /api/video/:filename — stream raw MP4 (legacy; superseded by HLS, removed in Phase 4)
router.get('/video/:filename', streamVideo);

// --- Encrypted HLS delivery (Phase 1) + key server (Phase 2) ---
// Literal paths declared before the :segment catch-all so they take precedence.
// Playlist + segments are public (AES-128 encrypted and useless without the key).
router.get('/hls/:videoId/index.m3u8', serveHlsPlaylist);

// POST /api/hls/:videoId/key-grant — JWT-gated: checks enrollment + device, mints a 30s grant.
router.post('/hls/:videoId/key-grant', requireAuth, tokenLimiter, issueKeyGrant);

// GET /api/hls/:videoId/key — releases the AES-128 key only for a valid grant (no JWT header needed).
router.get('/hls/:videoId/key', serveHlsKey);

router.get('/hls/:videoId/:segment', serveHlsSegment);

export default router;
