# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

DRM Secure Video Player — client-side content protection for video streaming. Client is React SPA; server is Express REST API with file upload and chunked streaming.

## Dev Commands

Two separate pnpm workspaces. Run each in separate terminals.

**Client** (`client/`):
```bash
pnpm dev        # Vite dev server
pnpm build      # Production build
pnpm lint       # ESLint
pnpm preview    # Preview production build
```

**Server** (`server/`):
```bash
pnpm dev        # ts-node-dev (hot-reload, TypeScript)
pnpm build      # tsc → dist/
pnpm start      # node dist/server.js (production)
```

Server runs on port 5000 (hardcoded, or `PORT` env var). Client Vite dev server proxies to it.

## Architecture

```
client/src/
  App.tsx                         # Router + global protections mounted here
  main.tsx                        # React entry point
  types/index.ts                  # Shared TypeScript interfaces (Video, DevToolsStatus, etc.)
  config/api.ts                   # API_BASE constant
  utils/format.ts                 # formatBytes, formatDate helpers
  components/
    VideoPlayer.tsx               # Core DRM logic
    ToggleSwitch.tsx              # Reusable toggle component
  hooks/
    useDevTools.ts                # DevTools detection → unmounts app
    useKeyboardProtection.ts      # Blocks F12, PrintScreen, Ctrl+Shift+I, etc.
  pages/                          # LibraryPage, UploadPage, PlayerPage

server/
  src/
    app.ts                        # Express setup (CORS, parsers, routes, error handler) — no listen()
    server.ts                     # Entry: ensures dirs exist, calls app.listen()
    types/video.ts                # Video Zod schema + inferred types
    middleware/errorHandler.ts    # AppError class + typed global error handler
    routes/videoRoutes.ts         # Upload (Multer), listing, HTTP range streaming
  data/videos.json                # Auto-created metadata store (flat file, no DB)
  dist/                           # Compiled output (gitignored)
uploads/                          # Raw MP4 files (auto-created, gitignored)
```

## Key Behaviors

- **DevTools detection**: triggers full app unmount (black screen). Uses window resize + devtools size heuristics. Disabled on mobile (iOS/Android false-positive guard).
- **Upload**: MP4 only, 100MB limit, unique filename via Multer. Stored in `uploads/`.
- **Streaming**: chunked HTTP range requests (`Accept-Ranges`). No direct file access — served only through `/api/video/:filename`.
- **Watermark**: username + timestamp overlay, repositions every 4s.
- **Focus loss**: blurs video + overwrites clipboard + shows resume overlay.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload` | Upload MP4 (multipart/form-data, field: `video`) |
| GET | `/api/videos` | List all videos from `data/videos.json` |
| GET | `/api/video/:filename` | Stream video with range support |
| GET | `/health` | Server health check |

## Git Workflow

### Before starting any work
1. Check current branch: `git branch` — confirm you are NOT on `main`
2. If on `main` or wrong branch, create or switch to the correct feature branch first:
   ```bash
   git checkout -b feat/<name>   # new feature
   git checkout feat/<name>      # existing branch
   ```
3. Never begin changes until you have confirmed the active branch is correct

### Rules
- Always pull latest before starting work: `git pull origin main`
- Work on a dedicated feature branch: `git checkout -b feat/<name>`
- Commits must be small and atomic — one logical change per commit
- Use Conventional Commits format: `feat:`, `fix:`, `refactor:`, `chore:`, `docs:`, etc.
- Review diff before committing: `git diff --staged`
- Never commit directly to `main`
- Never rewrite shared history (`--force`, `--amend` on pushed commits, `rebase` on shared branches)
- Push to feature branch when complete, then open PR: `git push origin feat/<name>`

## No Tests, No Docker

No test suite configured. No containerization. Local dev only.
