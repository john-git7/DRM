# Security Model

DRMShield is a prototype that demonstrates layered content protection for video streaming. This document describes the threat model, the server-side perimeter, the client-side deterrents, and the findings (with fixes) from the security review of the HLS pipeline.

## Threat model

DRMShield assumes an authenticated but potentially adversarial viewer who wants to extract or redistribute protected content. The protections are organized so that the cryptographic perimeter lives on the server, and the client-side measures raise the cost of casual capture and leave forensic traces. No browser-based scheme can stop a determined attacker with full control of their own machine; the goal is to make extraction expensive and attributable, not impossible.

## Layers

### 1. Transport encryption (Phase 1)

Every uploaded video is transcoded by FFmpeg into AES-128 encrypted HLS: six-second `.ts` segments plus an `.m3u8` playlist. The encrypted segments and the playlist are served publicly, because a segment is useless without the per-video AES-128 key. The keys live in a separate key database (`server/data/keys.json`) that is never co-located with the segments and is excluded from version control.

### 2. Authenticated key server (Phase 2)

The AES-128 key is never served directly. A client must first obtain a **key grant** from `POST /api/hls/:videoId/key-grant`, which requires a valid JWT and checks that:

- the video exists and has finished encrypting,
- the user is enrolled in the content (`server/data/enrollments.json`), and
- a device fingerprint is supplied.

The grant is an HMAC-SHA256 token, domain-separated from other tokens, that binds the request to a specific **video, client IP, and device fingerprint**, and expires after **30 seconds**. `GET /api/hls/:videoId/key` then releases the key only when presented with a valid grant (via `?grant=` or the `X-Key-Grant` header) **and** a matching `X-Device-Id` header. Verification uses a constant-time signature comparison and validates claim shape, expiry, video, IP, and device. A stolen key URL is therefore useless after 30 seconds, from a different IP, or on a different device.

### 3. Endpoint recorder detection (Phase 3)

A localhost agent (`agent/`) reports whether a screen recorder (OBS, Bandicam, Camtasia, ShadowPlay, Fraps, Dxtory, and others) is running. The player polls it before playback and re-checks during the session; a running recorder or a missing agent blocks playback. This is a deterrent that a determined user can defeat by killing or spoofing the agent — it raises the bar, it is not an absolute control.

### 4. Player hardening (Phase 4)

The HLS.js player disables native controls, download (`controlsList="nodownload"`), Picture-in-Picture, and remote playback. DevTools detection tears down the video source, and playback pauses on window blur and tab visibility changes.

### 5. Watermarking and audit (Phase 6)

A moving visible watermark burns the viewer's identity and a timestamp into any screen recording, and a faint per-user forensic overlay is tiled across the frame. Every session writes an audit record (identity, IP, device, agent status, watch time, and protection trips) so that a leak can be traced.

## Required configuration

The server **refuses to start** unless `JWT_SECRET`, `STREAM_SECRET`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD` are set. Generate the secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Never commit `server/.env`, `server/data/keys.json`, `server/data/enrollments.json`, or `server/data/audit-log.json`; all are excluded by `.gitignore`.

## Security review — findings and fixes

The HLS pipeline was reviewed after implementation. The findings below were all remediated.

| ID | Severity | Finding | Fix |
|----|----------|---------|-----|
| C-1 | Critical | `STREAM_SECRET` fell back to a hardcoded constant, and the server did not fail when it was unset — grants could be forged with a public secret. | Added a fail-closed `config/secrets.ts` that exits if `STREAM_SECRET` is missing; removed the fallback. |
| C-2 | Critical | The legacy `/api/stream-token` + `/api/video/:filename` endpoints served the **raw, unencrypted MP4** to any authenticated user, bypassing the entire HLS encryption scheme. | Removed both endpoints and their handlers. Content is now only available as encrypted HLS. |
| H-1 | High | The device fingerprint was bound into the grant but never verified, so a grant worked on any device sharing the IP. | The player sends `X-Device-Id`; `verifyGrant` now checks it and validates claim shape. |
| H-2 | High | The `/key` endpoint had no dedicated rate limit. | Added `keyLimiter` (60/min); the audit endpoint gets `auditLimiter`. |
| M-1 | Medium | Grant rejection messages revealed which check failed (a forgery oracle). | The client now receives a generic `Invalid key grant`; the specific reason is logged server-side only. |
| L-1 | Low | Audit free-text fields were unbounded; compiled Python bytecode was committed. | Field lengths are capped; `agent/__pycache__` is untracked and gitignored. |

## Known limitations

These are inherent to browser-based DRM and are accepted for a prototype:

- **Screen and camera capture** of the rendered frame cannot be prevented in the browser; the moving and forensic watermarks are the mitigation.
- **DevTools and extensions** run above page JavaScript and can override client protections; the server perimeter (encryption + key grants) is the real control.
- **The localhost agent** can be killed or spoofed by a user with local control.
- **Device fingerprinting** is low-entropy and spoofable; it is defense-in-depth, not an identity guarantee.
- **IP binding** assumes the client's IP is stable between the grant and key requests; behind certain proxies this may need adjustment.
- Deploy behind **HTTPS** in any real environment; the prototype runs over plain HTTP locally.

## Reporting

This is a prototype and is not intended for production use as-is. If you adapt it, review the items in "Known limitations" before deploying.
