# DRMShield — Secure Video Player Prototype

A production-quality prototype demonstrating aggressive client-side digital rights protection for video streaming. Built with **React + TypeScript** on the frontend and **Node.js + TypeScript (Express)** on the backend. No Widevine or FairPlay required — pure browser-level lockdown.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Backend | Node.js, Express, TypeScript |
| Validation | Zod |
| Upload | Multer (disk storage, MP4-only, 100 MB cap) |
| Styling | Dark neobrutalism — hard borders, offset shadows, flat surfaces |
| Package manager | pnpm (workspaces) |

---

## Security Features

### 1. DevTools Lockout (DOM Eradication)

Two parallel detection methods run every 500 ms:

- **Dimension trap** — measures `outerWidth/outerHeight` vs `innerWidth/innerHeight`. A difference > 100 CSS px (corrected for Windows DPI scaling) indicates a docked DevTools panel.
- **Debugger timing trap** — executes `new Function('debugger')()` and measures elapsed time. If DevTools is open, the debugger statement pauses execution; elapsed > 100 ms = detected.

On detection the entire React app is **instantly unmounted** and replaced with a black `<div>`. The video URL, source code, and DOM tree vanish from the Elements inspector. Mobile devices are excluded (virtual keyboard shrinks `innerHeight`, triggering false positives).

### 2. Right-Click Shield

- A transparent `z-0` overlay covers the video element, intercepting all pointer events before the native context menu fires.
- `oncontextmenu="return false;"` on `<body>` blocks global right-clicks.
- Any right-click anywhere on the page permanently blurs the entire application until hard refresh.

### 3. Keyboard & Screenshot Blocking

Event listeners attached in the **capture phase** (cannot be bypassed by `stopPropagation`) intercept:

| Shortcut | Platform | Action |
|----------|----------|--------|
| `F12` | All | Blocked |
| `Ctrl+Shift+I/J/C` | Windows/Linux | Blocked |
| `Ctrl+U`, `Ctrl+S` | All | Blocked |
| `PrintScreen` | Windows | Blocked + clipboard poisoned |
| `Win+Shift+S`, `Win+Alt+R` | Windows | Blocked + clipboard poisoned |
| `Cmd+Shift+3/4/5` | macOS | Blocked + clipboard poisoned |
| `Ctrl+Shift+F5` | ChromeOS | Blocked + clipboard poisoned |

Screenshot shortcuts overwrite the clipboard with `"PROTECTED SECURE CONTENT — SCREENSHOT INTERCEPTED"` before the OS can write the image.

### 4. Focus Loss & Screen Record Deterrence

When the window loses focus (tab switch, minimize, screen-capture tool stealing focus):
- Video playback pauses immediately.
- Clipboard is overwritten.
- The player blurs (`blur-xl`).
- A "Playback Paused" overlay appears.
- After 3+ focus losses, a "Capture Detected" stamp is shown.

### 5. Dynamic Floating Watermark

- Renders the video title + date + live clock over the player.
- Repositioned to a random coordinate (within 10–75% of player bounds) every **4 seconds**.
- CSS animation adds subtle drift between repositions (`watermarkFloat` keyframes).
- Defeats static crop-based screen recording.

### 6. Proxied Video Streaming

The frontend never accesses `uploads/` directly. All video bytes flow through:

```
GET /api/video/:filename  →  HTTP range streaming  →  browser <video>
```

The actual file path is never exposed to the client. Range requests (`206 Partial Content`, `Accept-Ranges: bytes`) enable seeking without full download.

### 7. Mobile Compatibility

All dimension-based DevTools checks are disabled on touch devices (detected via `navigator.userAgent` + `pointer: coarse` media query). The debugger timing trap remains active to catch USB remote-debugging on Android.

---

## Design System — Dark Neobrutalism

| Token | Value | Usage |
|-------|-------|-------|
| Canvas | `#0a0a0a` | Page background |
| Surface | `#111111` | Cards, panels |
| Surface-2 | `#1a1a1a` | Inset / nested panels |
| Border | `2px solid #ffffff` | All structural borders |
| Shadow | `4px 4px 0px #7c3aed` | Hard offset (violet) |
| Accent | `#7c3aed` | Primary actions, active nav |
| Amber | `#f59e0b` | Warnings, hazard badges |
| Green | `#22c55e` | Pass / success states |
| Red | `#ef4444` | Lockout / danger states |

**Rules:** No `backdrop-filter`. No gradient backgrounds. No soft `box-shadow`. Flat surfaces + thick borders + hard offset shadows only. Status badges are styled as physical rubber stamps (uppercase monospace, square corners, offset shadow matching badge color).

---

## Architecture

### Directory Structure

```
d:/DRM/
├── client/                             # React + TypeScript frontend
│   ├── src/
│   │   ├── config/api.ts               # API_BASE (env-configurable via VITE_API_BASE)
│   │   ├── types/index.ts              # Video, DevToolsStatus, VideoPlayerProps, UploadResponse
│   │   ├── utils/format.ts             # formatBytes, formatDate
│   │   ├── components/
│   │   │   ├── VideoPlayer.tsx         # DRM player — watermark, overlays, controls
│   │   │   └── ToggleSwitch.tsx        # Reusable neobrutalism toggle
│   │   ├── hooks/
│   │   │   ├── useDevTools.ts          # Dimension + debugger trap detection
│   │   │   └── useKeyboardProtection.ts  # Capture-phase keyboard blocker
│   │   ├── pages/
│   │   │   ├── LibraryPage.tsx         # Video grid
│   │   │   ├── UploadPage.tsx          # Drag-drop upload with progress bar
│   │   │   └── PlayerPage.tsx          # Player + Security Monitor panel
│   │   ├── App.tsx                     # Router + global focus/right-click/devtools guards
│   │   ├── main.tsx                    # React entry point
│   │   └── index.css                   # Tailwind v4 + neobrutalism utility classes
│   ├── .env.example                    # VITE_API_BASE template
│   ├── tsconfig.json / tsconfig.app.json / tsconfig.node.json
│   └── package.json
│
├── server/                             # Express + TypeScript backend
│   ├── src/
│   │   ├── config/
│   │   │   ├── paths.ts                # UPLOADS_DIR, DB_PATH constants
│   │   │   └── multer.ts               # Multer instance (MP4-only, 100 MB, disk storage)
│   │   ├── services/
│   │   │   └── videoService.ts         # Business logic — CRUD, sync, streaming paths
│   │   ├── controllers/
│   │   │   └── videoController.ts      # HTTP handlers — calls service, sends response
│   │   ├── routes/
│   │   │   └── videoRoutes.ts          # Thin router — middleware + controller binding
│   │   ├── middleware/
│   │   │   └── errorHandler.ts         # AppError class + global error handler
│   │   ├── types/
│   │   │   └── video.ts                # Video Zod schema + inferred types
│   │   ├── app.ts                      # Express setup (CORS, parsers, routes, error handler)
│   │   └── server.ts                   # Entry — ensureDirectories → syncUploads → listen
│   ├── data/videos.json                # Flat-file metadata store (auto-created)
│   └── package.json
│
├── uploads/                            # Raw MP4 files (auto-created, gitignored)
└── README.md
```

### Request Flow

```
Browser
  │
  ├─ GET /api/videos          → listVideos controller → videoService.getVideos()
  ├─ GET /api/videos/:f       → getVideoMeta controller → videoService.getVideoByFilename()
  ├─ POST /api/upload         → multer middleware → uploadVideo controller → videoService.createVideo()
  ├─ GET /api/video/:f        → streamVideo controller → fs.createReadStream (range-aware)
  └─ POST /api/sync           → syncVideos controller → videoService.syncUploadsToJson()
```

### Server Layer Responsibilities

| Layer | File | Responsibility |
|-------|------|---------------|
| Config | `config/paths.ts` | Centralized absolute paths |
| Config | `config/multer.ts` | File storage + validation config |
| Service | `services/videoService.ts` | All business logic, no HTTP |
| Controller | `controllers/videoController.ts` | req/res handling, calls service |
| Router | `routes/videoRoutes.ts` | Route bindings only |
| Middleware | `middleware/errorHandler.ts` | `AppError` class + global handler |

---

## API Reference

### Videos

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/videos` | List all videos |
| `GET` | `/api/videos/:filename` | Get single video metadata |
| `POST` | `/api/upload` | Upload MP4 (multipart/form-data) |
| `GET` | `/api/video/:filename` | Stream video (range-aware) |
| `POST` | `/api/sync` | Sync `uploads/` directory to `videos.json` |
| `GET` | `/health` | Server health check |

### `POST /api/upload`

**Request:** `multipart/form-data`

| Field | Type | Required | Notes |
|-------|------|----------|-------|
| `video` | File | Yes | `.mp4` only, max 100 MB |
| `title` | string | No | Defaults to filename without extension |

**Response `201`:**
```json
{
  "message": "Video uploaded successfully!",
  "video": {
    "id": "video-1234567890-000.mp4",
    "title": "My Video",
    "originalName": "my-video.mp4",
    "filename": "video-1234567890-000.mp4",
    "size": 10485760,
    "uploadDate": "2026-06-01T17:45:02.768Z",
    "mimeType": "video/mp4"
  }
}
```

### `POST /api/sync`

Scans `uploads/` for `.mp4` files not present in `videos.json` and adds them. Also runs automatically on server startup.

**Response `200`:**
```json
{ "message": "Sync complete", "added": 2, "videos": [...] }
```

### `GET /api/video/:filename`

Streams the video file. Supports `Range` header for seeking (`206 Partial Content`).

### Error shape

All errors return:
```json
{ "error": "Human-readable message" }
```

---

## Local Setup

Requires [Node.js](https://nodejs.org) v18+ and [pnpm](https://pnpm.io).

### Backend

```bash
cd server
pnpm install
pnpm dev          # ts-node-dev hot reload on :5000
```

### Frontend

```bash
cd client
pnpm install
pnpm dev          # Vite dev server on :5173
```

### Environment (optional)

```bash
# client/.env  (copy from .env.example)
VITE_API_BASE=http://localhost:5000/api
```

Without this file, the client defaults to `http://localhost:5000/api`.

### Client scripts

```bash
pnpm build        # tsc + Vite production build
pnpm type-check   # TypeScript check only (no emit)
pnpm lint         # ESLint
pnpm preview      # Preview production build
```

---

## Manual Testing

1. Start both servers (`pnpm dev` in `server/` and `client/`).
2. Open `http://localhost:5173`.
3. **Upload** — go to Upload page, drag an `.mp4`, set a title, click "Start Secure Upload". Progress bar advances; on success a "Play Now" link appears.
4. **Library** — video card appears. Click to open the player.
5. **Security hooks:**
   - Right-click anywhere → permanent app blur.
   - `F12` or browser DevTools menu → instant black screen.
   - `PrintScreen` → paste in Paint → clipboard shows warning text, not a screenshot.
   - Alt-Tab away → playback pauses, player blurs, overlay appears.
6. **Security Monitor panel** (right column on player page):
   - Toggle individual protections on/off to demonstrate each mechanism.
   - Expand "DPI & Dimension Diagnostics" to see live window measurements and whether the debugger trap fired.
7. **Manual sync** — drop an `.mp4` file directly into `uploads/`, then call `POST http://localhost:5000/api/sync` (or restart server) → video appears in library without going through the upload UI.
