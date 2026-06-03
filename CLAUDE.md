# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DRMShield — Secure Video Player prototype. Client-side content protection for video streaming backed by a server-side JWT auth layer and HMAC-signed stream tokens. Client is React SPA; server is Express REST API.

## Dev Commands

Two separate pnpm workspaces. Run each in separate terminals.

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

Server requires a `.env` file — copy from `server/.env.example` and fill in secrets. Server exits at startup if `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, or `STREAM_SECRET` are missing.

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
  context/
    AuthContext.tsx                    # AuthProvider — token state, login(), logout(), isAuthenticated
  hooks/
    useAuth.ts                         # Thin wrapper over useAuthContext()
    useDevTools.ts                     # DevTools detection → full app unmount
    useKeyboardProtection.ts           # Blocks F12, PrintScreen, Ctrl+Shift+I, etc.
  components/
    VideoPlayer.tsx                    # Core DRM player — watermark, overlays, custom controls
    ToggleSwitch.tsx                   # Reusable toggle
    ProtectedRoute.tsx                 # Redirects unauthenticated users to /login
  pages/
    LoginPage.tsx                      # Username/password form
    LibraryPage.tsx                    # Video grid
    UploadPage.tsx                     # Drag-drop upload with progress bar
    PlayerPage.tsx                     # Player + Security Monitor panel

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
    videoService.ts                    # Video business logic — CRUD, sync, file paths (no HTTP)
    authService.ts                     # validateCredentials(), issueJwt(), verifyJwt()
  middleware/
    errorHandler.ts                    # AppError class + typed global error handler
    auth.ts                            # requireAuth — validates Bearer JWT, attaches req.user
    rateLimiter.ts                     # globalLimiter, loginLimiter, tokenLimiter
  controllers/
    videoController.ts                 # HTTP handlers for all video endpoints
    authController.ts                  # login() handler — delegates to authService
  routes/
    videoRoutes.ts                     # Video routes with requireAuth + tokenLimiter guards
    authRoutes.ts                      # POST /api/auth/login with loginLimiter
  data/videos.json                     # Flat-file metadata store (auto-created)
  dist/                                # Compiled output (gitignored)

uploads/                               # Raw MP4 files (auto-created, gitignored)
```

## Key Behaviors

- **Auth**: All `/api/*` routes except `/api/auth/login` and `/api/video/:filename` require `Authorization: Bearer <jwt>`. JWT issued on login, 24hr expiry.
- **Stream tokens**: `POST /api/stream-token` (requires JWT) issues a short-lived HMAC-SHA256 token. `GET /api/video/:filename?token=` validates it on every request including range requests. TTL: 1hr.
- **DevTools detection**: triggers full app unmount (black screen). Dimension diff > 200px OR debugger timing > 200ms. Disabled on mobile.
- **Upload**: MP4 only (extension + magic-byte check), 100MB limit. Non-MP4 files deleted + 415 returned.
- **Streaming**: chunked HTTP range requests (`Accept-Ranges`). Video served only through `/api/video/:filename?token=`.
- **Watermark**: title + date + live clock overlay, repositions every 4s.
- **Focus loss**: pauses video + overwrites clipboard + shows resume overlay.
- **Security Monitor toggles** (PlayerPage): control VideoPlayer props — keyboard, right-click, focus loss, watermark, capture warning. VideoPlayer is sole enforcer; AppShell does not duplicate these.

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | None | Issue JWT (`{ username, password }`) |
| GET | `/api/videos` | JWT | List all videos (`filename` field omitted) |
| GET | `/api/videos/:filename` | JWT | Single video metadata (full object) |
| POST | `/api/upload` | JWT | Upload MP4 (multipart/form-data, field: `video`) |
| POST | `/api/stream-token` | JWT | Issue HMAC stream token (`{ videoId }`) |
| GET | `/api/video/:filename` | Stream token | Stream video with range support |
| GET | `/health` | None | Server health check |

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
