# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DRMShield — Secure Video Player prototype. Content protection for video streaming built on AES-128 encrypted HLS, a JWT-backed key server, a localhost recorder-detection agent, a hardened HLS.js player, and forensic watermarking plus session audit logging. Client is a React SPA; server is an Express REST API; the agent is a standalone stdlib-only Python service.

The protection pipeline is organized into phases (see `assets/` for the diagram): (1) FFmpeg transcodes uploads into AES-128 encrypted HLS, (2) a JWT key server issues 30-second signed key grants after enrollment/device/IP checks, (3) a localhost agent on :7891 blocks playback when a screen recorder is running, (4) the HLS.js player hardens playback, and (6) watermarking + audit logs trace sessions. (Phase 5, a native mobile app, is intentionally out of scope.)

## Dev Commands

The client and server are two independent pnpm projects (no root `package.json` or `pnpm-workspace.yaml` — each has its own `package.json` and `pnpm-lock.yaml`). Run `pnpm install` in each, and run their dev servers in separate terminals. Developed on Node 24 with pnpm; no Node version is pinned via `engines`/`.nvmrc`. A stray `client/package-lock.json` exists — prefer pnpm to keep lockfiles consistent.

**Client** (`client/`):
```bash
pnpm dev        # Vite dev server on :5173
pnpm build      # Production build
pnpm lint       # ESLint
pnpm preview    # Preview production build
```

**Server** (`server/`):
```bash
pnpm dev        # ts-node-dev (hot-reload, TypeScript) on :5000
pnpm build      # tsc → dist/
pnpm start      # node dist/server.js (production)
```

Server requires a `.env` file — copy from `server/.env.example` and fill in secrets. Server exits at startup if `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, or `STREAM_SECRET` are missing. FFmpeg must be installed and on `PATH` (the upload pipeline shells out to `ffmpeg`).

**Localhost agent** (`agent/`):
```bash
python3 agent.py   # recorder-detection agent on :7891 (stdlib only, no install step)
```
The browser player polls `http://localhost:7891/status` before playback. Without the agent running, playback is blocked with an install prompt. See `agent/README.md`.

## Architecture

```
client/src/
  App.tsx                              # BrowserRouter → AuthProvider → AppShell (routes + guards)
  main.tsx                             # React entry point
  config/api.ts                        # API_BASE constant (VITE_API_BASE env or localhost:5000/api)
  types/index.ts                       # Shared TypeScript interfaces
  utils/
    format.ts                          # formatBytes, formatDate helpers
    apiClient.ts                       # Axios instance — Bearer interceptor + 401→logout redirect
    deviceFingerprint.ts               # Stable SHA-256 device fingerprint (binds key grants)
    agentCheck.ts                      # Polls localhost agent :7891 → clean/threat/not-installed
    audit.ts                           # Fire-and-forget POST /api/audit session events
  context/
    AuthContext.tsx                    # AuthProvider — token + username state, login(), logout()
  hooks/
    useAuth.ts                         # Thin wrapper over useAuthContext()
    useDevTools.ts                     # DevTools detection → full app unmount
    useKeyboardProtection.ts           # Blocks F12, PrintScreen, Ctrl+Shift+I, etc.
  components/
    VideoPlayer.tsx                    # HLS.js player — grant-bound key loading, hardening, watermarks
    ToggleSwitch.tsx                   # Reusable toggle
    ProtectedRoute.tsx                 # Redirects unauthenticated users to /login
  pages/
    LoginPage.tsx                      # Username/password form
    LibraryPage.tsx                    # Video grid
    UploadPage.tsx                     # Drag-drop upload with progress bar
    PlayerPage.tsx                     # Grant + agent gate, audit, player + Security Monitor panel

server/src/
  app.ts                               # Express setup — helmet, CORS, parsers, routes, error handler
  server.ts                            # Entry: dotenv → ensureDirectories → listen
  config/
    paths.ts                           # UPLOADS_DIR, DB_PATH constants
    multer.ts                          # Multer instance (MP4-only, 100MB, disk storage)
    users.ts                           # Admin credentials from env; bcrypt hash at startup
  types/
    video.ts                           # Video Zod schema + inferred types
    auth.ts                            # JwtPayload, AuthenticatedRequest
  services/
    videoService.ts                    # Video business logic — CRUD, updateVideo, sync, paths
    authService.ts                     # validateCredentials(), issueJwt(), verifyJwt()
    hlsService.ts                      # FFmpeg AES-128 HLS transcode; generates+stores key, IV
    keyService.ts                      # AES-128 key DB (data/keys.json) — separate from segments
    keyGrantService.ts                 # 30s HMAC key grants (video+IP+device); issue/verify
    enrollmentService.ts               # isEnrolled() against data/enrollments.json
    auditService.ts                    # appendAudit() → data/audit-log.json (append-only)
  middleware/
    errorHandler.ts                    # AppError class + typed global error handler
    auth.ts                            # requireAuth — validates Bearer JWT, attaches req.user
    rateLimiter.ts                     # globalLimiter, loginLimiter, tokenLimiter
  controllers/
    videoController.ts                 # Video endpoints; upload triggers background HLS transcode
    authController.ts                  # login() handler — delegates to authService
    hlsController.ts                   # Serve playlist/segments; issueKeyGrant + grant-gated key
    auditController.ts                 # recordAudit() — POST /api/audit
  routes/
    videoRoutes.ts                     # Video + HLS + audit routes with auth/limiter guards
    authRoutes.ts                      # POST /api/auth/login with loginLimiter
  data/videos.json                     # Flat-file metadata store (tracked)
  data/keys.json                       # AES-128 key DB (auto-created, GITIGNORED — secret)
  data/enrollments.json                # username → allowed video ids (auto-created, gitignored)
  data/audit-log.json                  # Session audit log (auto-created, gitignored)
  dist/                                # Compiled output (gitignored)

agent/
  agent.py                             # Stdlib-only recorder-detection HTTP agent on :7891
  recorders.json                       # Recorder process signatures (word-boundary matched)
  README.md                            # Agent docs

uploads/                               # Raw MP4 source files (auto-created, gitignored)
streams/<videoId>/                     # Encrypted HLS: index.m3u8 + seg_NNN.ts (gitignored)
```

## Key Behaviors

- **Auth**: All `/api/*` routes except `/api/auth/login` and the public HLS playlist/segment/legacy-stream routes require `Authorization: Bearer <jwt>`. JWT issued on login, 24hr expiry.
- **HLS encryption (Phase 1)**: On upload, FFmpeg transcodes the MP4 into 6-second AES-128 encrypted `.ts` segments + `index.m3u8` under `streams/<videoId>/`. Transcoding runs in the background; the video record carries `hlsStatus` (`processing`/`ready`/`failed`) and `hlsPlaylist`. One key per video (standard HLS AES-128); the key DB schema allows future per-segment rotation. Encrypted segments are public — useless without the key.
- **Key server (Phase 2)**: `POST /api/hls/:videoId/key-grant` (JWT) checks the video is ready, the user is enrolled, and a device fingerprint is present, then mints a 30-second HMAC grant bound to video + IP + device. `GET /api/hls/:videoId/key` releases the AES-128 key only for a valid grant (via `?grant=` or `X-Key-Grant` header), with timing-safe signature and IP checks.
- **Recorder agent (Phase 3)**: The player polls `localhost:7891/status` before playback. A running recorder (threat) or unreachable agent (not-installed) blocks playback; the agent is re-checked mid-session. Detection uses word-boundary matching so unrelated apps don't false-positive.
- **Player hardening (Phase 4)**: HLS.js player with `controlsList=nodownload`, `disablePictureInPicture`/`disableRemotePlayback`, no native controls. DevTools detection tears down the video source; playback pauses on `blur` and `visibilitychange`.
- **DevTools detection**: dimension diff OR debugger timing trap. Disabled on mobile. The client ESLint config sets `'no-new-func': 'off'` intentionally — `useDevTools.ts` relies on the `Function`/`debugger` timing trap; do not "fix" this rule.
- **Upload**: MP4 only (extension + magic-byte check), 100MB limit. Non-MP4 files deleted + 415 returned.
- **Watermark + forensics (Phase 6)**: moving visible watermark shows the authenticated identity + date + live clock, repositioning every 5s; a faint per-user forensic overlay is tiled across the frame.
- **Audit log (Phase 6)**: `POST /api/audit` (JWT) records session events (agent-check, playback-start/blocked, watch-time heartbeats, devtools-lockout); server stamps username, IP, timestamp.
- **Focus loss**: pauses video + overwrites clipboard + shows resume overlay.
- **Legacy raw stream**: `POST /api/stream-token` + `GET /api/video/:filename?token=` (HMAC-token, range requests) predate HLS and remain for compatibility; scheduled for removal now that the HLS path is the default.
- **Security Monitor toggles** (PlayerPage): control VideoPlayer props — keyboard, right-click, focus loss, watermark, forensic watermark, capture warning. VideoPlayer is sole enforcer; AppShell does not duplicate these.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | None | Issue JWT (`{ username, password }`) |
| GET | `/api/videos` | JWT | List all videos (`filename` field omitted) |
| GET | `/api/videos/:filename` | JWT | Single video metadata (incl. `hlsStatus`, `hlsPlaylist`) |
| POST | `/api/upload` | JWT | Upload MP4; triggers background AES-128 HLS transcode |
| GET | `/api/hls/:videoId/index.m3u8` | None | Encrypted HLS playlist |
| GET | `/api/hls/:videoId/:segment` | None | Encrypted `.ts` segment |
| POST | `/api/hls/:videoId/key-grant` | JWT | Mint a 30s key grant (`{ deviceId }`) after enrollment/device checks |
| GET | `/api/hls/:videoId/key` | Key grant | Release AES-128 key (`?grant=` or `X-Key-Grant`) |
| POST | `/api/audit` | JWT | Record a session audit event (`{ event, ... }`) |
| POST | `/api/stream-token` | JWT | Legacy: issue HMAC stream token (`{ videoId }`) |
| GET | `/api/video/:filename` | Stream token | Legacy: raw MP4 stream with range support |
| GET | `/health` | None | Server health check |

The agent exposes a separate API on `:7891`: `GET /status` (recorder report) and `GET /health`.

## Git Workflow

### Before starting any work

1. Check current branch: `git branch` — confirm you are NOT on `main`
2. **Check branch alignment**: does the current branch name match the feature you are about to implement?
   - If yes — proceed
   - If no, or if on `main` — create or switch to the correct branch:
     ```bash
     git checkout -b feat/<name>   # new feature
     git checkout -b fix/<name>    # bug fix
     git checkout -b docs/<name>   # documentation only
     git checkout feat/<name>      # existing branch
     ```
3. Never begin changes until the active branch is confirmed correct for the task

### Rules

- Always pull latest before starting work: `git pull origin main`
- Work on a dedicated feature branch
- Commits must be small and atomic — one logical change per commit
- Use Conventional Commits format: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, etc.
- Review diff before committing: `git diff --staged`
- Never commit directly to `main`
- Never rewrite shared history (`--force`, `--amend` on pushed commits, `rebase` on shared branches)
- Push to feature branch when complete, then open PR: `git push origin <branch>`

## No Tests, No Docker

No test suite configured. No containerization. Local dev only.

## Documentation Style

When writing any documentation file in this repository (README.md, CLAUDE.md, SECURITY_AUDIT.md, or any other committed markdown), use full sentences and professional prose. Do not apply caveman-style shorthand, fragment sentences, or drop articles. Documentation is read by humans — write accordingly.
