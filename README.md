# DRMShield

> A browser-based DRM prototype: AES-128 encrypted HLS, a JWT key server with short-lived signed key grants, a localhost screen-recorder agent, a hardened HLS.js player, and forensic watermarking with session audit logging.

---

## What it does

Upload an MP4. The server encrypts it into AES-128 HLS and stores the keys separately. The browser cannot get a decryption key until a JWT-authenticated, enrolled user passes a device and IP check and a localhost agent confirms no screen recorder is running — and even then the key grant expires in 30 seconds. The player adds DevTools lockout, focus pausing, a moving identity watermark, and a faint forensic overlay, while every session is written to an audit log.

No Widevine. No FairPlay. Pure TypeScript front-to-back, plus a small standard-library Python agent.

---

## Stack

| | |
|--|--|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4, hls.js |
| **Backend** | Node.js, Express, TypeScript |
| **Encryption** | FFmpeg → AES-128 HLS (6s segments) |
| **Auth** | JWT (jsonwebtoken) + bcryptjs; HMAC-SHA256 key grants |
| **Agent** | Python 3 standard library (no dependencies) |
| **Validation** | Zod |
| **Upload** | Multer — MP4-only, 100 MB cap, magic-byte verified |
| **Security** | Helmet, express-rate-limit, fail-closed secret validation |
| **Style** | Dark neobrutalism — hard borders, flat surfaces, violet offset shadows |

---

## The protection pipeline

DRMShield is built in phases (see `assets/` for the diagram):

1. **Encryption** — FFmpeg transcodes each upload into AES-128 encrypted HLS segments; per-video keys go to a separate, gitignored key database.
2. **Key server** — a JWT-gated endpoint issues a 30-second HMAC key grant bound to the video, the client IP, and a device fingerprint, after checking enrollment. The key is released only against a valid grant plus a matching device header.
3. **Recorder agent** — a localhost service reports running screen recorders; the player blocks playback if one is found or the agent is absent.
4. **Player hardening** — HLS.js with no native controls, no download, no Picture-in-Picture, DevTools source teardown, and pause-on-blur/visibility-change.
5. *(Native mobile app — intentionally out of scope.)*
6. **Watermark + audit** — a moving identity watermark, a faint per-user forensic overlay, and an append-only session audit log.

The server is the real security perimeter; the client measures raise the cost of capture and leave forensic traces. See [`SECURITY.md`](./SECURITY.md) for the full model and the security-review findings.

---

## Quick Start

### 1. Prerequisites

- Node.js 20+, pnpm
- FFmpeg on `PATH` (`ffmpeg -version`)
- Python 3 (for the agent)

### 2. Install

```bash
git clone <repo-url> && cd DRM
cd server && pnpm install
cd ../client && pnpm install
```

### 3. Configure server secrets

```bash
cd server && cp .env.example .env
```

Edit `server/.env` (the server refuses to start if any of these are missing):

```env
JWT_SECRET=        # node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
ADMIN_USERNAME=    # e.g. admin
ADMIN_PASSWORD=    # plaintext — bcrypt-hashed at startup, never stored
STREAM_SECRET=     # a second random 32-byte hex value
```

### 4. Run (three terminals)

```bash
cd server && pnpm dev     # API on :5000
cd client && pnpm dev     # web client on :5173
cd agent  && python3 agent.py   # recorder agent on :7891
```

Open **http://localhost:5173**. New to the app? See the [User Guide](./USER_GUIDE.md).

---

## API Reference

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/api/auth/login` | — | Issue JWT — `{ username, password }` |
| `GET` | `/api/videos` | JWT | List videos (filename omitted) |
| `GET` | `/api/videos/:filename` | JWT | Video metadata incl. `hlsStatus`, `hlsPlaylist` |
| `POST` | `/api/upload` | JWT | Upload MP4 — field `video`; triggers AES-128 HLS transcode |
| `GET` | `/api/hls/:videoId/index.m3u8` | — | Encrypted HLS playlist |
| `GET` | `/api/hls/:videoId/:segment` | — | Encrypted `.ts` segment |
| `POST` | `/api/hls/:videoId/key-grant` | JWT | Mint a 30s key grant — `{ deviceId }` |
| `GET` | `/api/hls/:videoId/key` | Key grant + `X-Device-Id` | Release AES-128 key |
| `POST` | `/api/audit` | JWT | Record a session audit event |
| `GET` | `/health` | — | Health check |

The agent exposes its own API on `:7891`: `GET /status` and `GET /health`.

All errors return `{ "error": "message" }`.

---

## How a key reaches the player

```
POST /api/hls/:id/key-grant   (JWT)
  └→ check video ready · check enrollment · require deviceId
     grant = base64url({ videoId, ip, deviceId, username, exp: now+30 })
             + "." + HMAC-SHA256("keygrant:v1:" + payload, STREAM_SECRET)
     → { grant, ttl: 30 }

GET /api/hls/:id/key   (X-Key-Grant: <grant>, X-Device-Id: <deviceId>)
  └→ constant-time HMAC verify · validate claim shape
     check exp · check videoId · check IP · check deviceId
     → 16-byte AES-128 key   (hls.js decrypts the segments)
```

A leaked key URL is useless after 30 seconds, from another IP, or on another device.

---

## Project Structure

```
DRM/
├── client/src/          # React SPA — HLS.js player, agent gate, watermarks, audit
├── server/src/          # Express API — HLS transcode, key server, enrollment, audit
│   ├── services/        # hlsService, keyService, keyGrantService, enrollmentService, auditService
│   ├── controllers/     # video, hls, audit, auth
│   ├── config/          # secrets (fail-closed), paths, multer, users
│   └── routes/
├── agent/               # Python recorder-detection agent (:7891)
├── uploads/             # raw MP4 sources (gitignored)
└── streams/<id>/        # encrypted HLS output (gitignored)
```

See [`CLAUDE.md`](./CLAUDE.md) for the full architecture map.

---

## Design System

Dark neobrutalism. No gradients, no blur, no soft shadows.

```
Background  #0a0a0a   Surface  #111111   Border  2px #ffffff
Shadow  4px 4px 0px #7c3aed   Accent #7c3aed   Warning #f59e0b
Danger  #ef4444   Success #22c55e
```

---

## Documentation

- [`USER_GUIDE.md`](./USER_GUIDE.md) — setup, usage, enrollment, audit, troubleshooting
- [`SECURITY.md`](./SECURITY.md) — threat model, protection layers, security-review findings
- [`CLAUDE.md`](./CLAUDE.md) — architecture map and key behaviors
- [`agent/README.md`](./agent/README.md) — the localhost recorder-detection agent
- [`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md) — earlier auth-layer vulnerability audit

---

## Notes

No test suite or containerization is configured; this is a local-development prototype. Deploy behind HTTPS and review [`SECURITY.md`](./SECURITY.md) before adapting it for any real use.
