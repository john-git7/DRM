import rateLimit from 'express-rate-limit';

/**
 * Coarse safety net for the API surface. Deliberately does NOT count the
 * high-volume, public HLS delivery (playlist + .ts segments) or the health
 * probe: a single video playback fans out into dozens of segment requests, so
 * metering them through one 100-per-15-min bucket would 429 the whole server
 * mid-stream. The sensitive endpoints keep their own tighter limiters
 * (keyLimiter, tokenLimiter, auditLimiter, loginLimiter).
 */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
  skip: (req) => {
    if (req.path === '/health') return true;
    // Public encrypted HLS delivery: /api/hls/<id>/index.m3u8 and /api/hls/<id>/seg_NNN.ts
    return /^\/api\/hls\/[^/]+\/(index\.m3u8|seg_\d+\.ts)$/.test(req.path);
  },
});

export const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts, please try again in 15 minutes.' },
});

export const tokenLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many token requests, please slow down.' },
});

// AES-128 key delivery — throttles key extraction / grant brute-forcing.
export const keyLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many key requests, please slow down.' },
});

// Audit ingestion — bounds log-flooding (heartbeats are ~4/min in normal use).
export const auditLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many audit events, please slow down.' },
});
