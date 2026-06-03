# DRMShield — Secure Video Player Prototype

A production-quality prototype demonstrating aggressive client-side digital rights
protection for video streaming, backed by a server-side JWT authentication layer and
HMAC-signed stream tokens. Built with **React + TypeScript** on the frontend and
**Node.js + TypeScript (Express)** on the backend.

---

## Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19, TypeScript, Vite, Tailwind CSS v4 |
| Backend | Node.js, Express, TypeScript |
| Auth | JWT (jsonwebtoken), bcryptjs |
| Validation | Zod |
| Upload | Multer (disk storage, MP4-only, 100 MB cap) |
| Security | Helmet, express-rate-limit, HMAC-SHA256 stream tokens |
| Styling | Dark neobrutalism — hard borders, offset shadows, flat surfaces |
| Package manager | pnpm (workspaces) |

---

## Security Architecture

### Server-Side (primary protection layer)

**Authentication:** All sensitive API endpoints require a JWT Bearer token. Tokens are
issued at `POST /api/auth/login` after bcrypt credential validation. Admin credentials
are loaded from environment variables at startup — plaintext is never stored.

**Stream tokens:** Video streaming uses short-lived HMAC-SHA256 tokens issued by
`POST /api/stream-token`. Each token encodes `{ filename, exp }` signed with
`STREAM_SECRET`. The stream endpoint validates signature, expiry, and filename match
on every request — including HTTP range requests.

**Rate limiting:** Three tiers — 100 req/15min (global), 10 req/15min (login endpoint),
30 req/min (stream token endpoint) — all per IP.

**Security headers:** Helmet sets `X-Frame-Options`, `X-Content-Type-Options`,
`Strict-Transport-Security`, `Cross-Origin-Embedder-Policy`, and `Content-Security-Policy`.

**Upload validation:** After Multer saves a file, the first 12 bytes are read to verify
the MP4 `ftyp` magic box at offset 4. Extension and MIME type spoofing are rejected with
`415 Unsupported Media Type` and the file is deleted.

**Filename protection:** `GET /api/videos` omits the `filename` field — clients receive
an opaque `id`. The internal disk path is never exposed to unauthenticated callers.

---

### Client-Side (deterrence layer)

#### 1. DevTools Lockout

Two parallel detection methods run every 500ms:

- **Dimension trap** — `outerWidth/outerHeight` vs `innerWidth/innerHeight`. Difference
  > 200 CSS px (corrected for Windows DPI scaling) indicates a docked DevTools panel.
- **Debugger timing trap** — `new Function('debugger')()` measured with `performance.now()`.
  Elapsed > 200ms = DevTools paused execution.

On detection the entire React app is unmounted and replaced with a black `<div>`. Mobile
devices excluded (virtual keyboard causes false positives).

#### 2. Right-Click Shield

A transparent `z-0` overlay intercepts all pointer events on the video. `contextmenu`
handler blocks right-click globally within the player.

#### 3. Keyboard & Screenshot Blocking

Capture-phase event listeners (cannot be bypassed by `stopPropagation`) intercept:

| Shortcut | Action |
|----------|--------|
| `F12`, `Ctrl+Shift+I/J/C` | Blocked |
| `Ctrl+U`, `Ctrl+S` | Blocked |
| `PrintScreen` | Blocked + clipboard poisoned |
| `Win+Shift+S`, `Win+Alt+R` | Blocked + clipboard poisoned |
| `Cmd+Shift+3/4/5` | Blocked + clipboard poisoned |

Screenshot shortcuts overwrite the clipboard with `"PROTECTED SECURE CONTENT — SCREENSHOT
INTERCEPTED"` before the OS writes the image.

#### 4. Focus Loss & Screen Record Deterrence

On `window.blur`:
- Video pauses immediately
- Clipboard overwritten
- Player blurs (`blur-xl`)
- "Playback Paused" overlay shown
- After 3+ focus losses: "Capture Detected" stamp

#### 5. Dynamic Floating Watermark

- Renders video title + date + live clock over the player
- Repositioned to a random coordinate every **4 seconds**
- CSS animation adds subtle drift between repositions
- Survives into any screen recording and identifies the leaking user

#### 6. Proxied Video Streaming

The frontend never references `uploads/` directly. All bytes flow through:

```
POST /api/stream-token  →  token valid 1 hour
GET  /api/video/:filename?token=  →  HTTP range streaming  →  browser <video>
```

Stream URL includes an expiring token. URLs copied from the Network tab become invalid
after 1 hour. `src` attribute is absent from the `<video>` DOM element — set imperatively.

---

## Design System — Dark Neobrutalism

| Token | Value | Usage |
|-------|-------|-------|
| Canvas | `#0a0a0a` | Page background |
| Surface | `#111111` | Cards, panels |
| Border | `2px solid #ffffff` | All structural borders |
| Shadow | `4px 4px 0px #7c3aed` | Hard offset (violet) |
| Accent | `#7c3aed` | Primary actions, active nav |
| Amber | `#f59e0b` | Warnings, hazard badges |
| Green | `#22c55e` | Success states |
| Red | `#ef4444` | Lockout / danger states |

Rules: No `backdrop-filter`. No gradient backgrounds. No soft `box-shadow`. Flat surfaces
+ thick borders + hard offset shadows only.

---

## Directory Structure

```
d:/DRM/
├── client/
│   └── src/
│       ├── config/api.ts               # API_BASE (env-configurable)
│       ├── types/index.ts              # Shared TypeScript interfaces
│       ├── utils/
│       │   ├── format.ts               # formatBytes, formatDate
│       │   └── apiClient.ts            # Axios + Bearer interceptor + 401 redirect
│       ├── context/AuthContext.tsx     # AuthProvider — token, login(), logout()
│       ├── hooks/
│       │   ├── useAuth.ts              # Thin hook wrapper
│       │   ├── useDevTools.ts          # Dimension + debugger trap detection
│       │   └── useKeyboardProtection.ts
│       ├── components/
│       │   ├── VideoPlayer.tsx         # DRM player
│       │   ├── ToggleSwitch.tsx        # Reusable toggle
│       │   └── ProtectedRoute.tsx      # Auth guard component
│       ├── pages/
│       │   ├── LoginPage.tsx
│       │   ├── LibraryPage.tsx
│       │   ├── UploadPage.tsx
│       │   └── PlayerPage.tsx
│       └── App.tsx                     # Router + AuthProvider + AppShell
│
├── server/
│   └── src/
│       ├── config/
│       │   ├── paths.ts                # UPLOADS_DIR, DB_PATH
│       │   ├── multer.ts               # Upload config
│       │   └── users.ts                # Admin credentials + bcrypt hash
│       ├── types/
│       │   ├── video.ts                # Zod schema + Video type
│       │   └── auth.ts                 # JwtPayload, AuthenticatedRequest
│       ├── services/
│       │   ├── videoService.ts         # Video CRUD, sync, paths
│       │   └── authService.ts          # JWT issue/verify, bcrypt compare
│       ├── middleware/
│       │   ├── errorHandler.ts         # AppError + global handler
│       │   ├── auth.ts                 # requireAuth middleware
│       │   └── rateLimiter.ts          # globalLimiter, loginLimiter, tokenLimiter
│       ├── controllers/
│       │   ├── videoController.ts      # Video HTTP handlers
│       │   └── authController.ts       # Login handler
│       ├── routes/
│       │   ├── videoRoutes.ts          # Video routes with auth guards
│       │   └── authRoutes.ts           # POST /api/auth/login
│       ├── app.ts                      # Express setup
│       └── server.ts                   # Entry point
│
├── uploads/                            # MP4 files (auto-created, gitignored)
├── ARCHITECTURE_MVC.md
├── SECURITY_AUDIT.md
└── SECURITY_IMPROVEMENTS.md
```

---

## API Reference

### Auth

| Method | Path | Auth | Body |
|--------|------|------|------|
| `POST` | `/api/auth/login` | None | `{ username, password }` |
| `GET` | `/health` | None | — |

**Login response:**
```json
{ "token": "<jwt>", "expiresAt": "<iso-date>" }
```

### Videos (all require `Authorization: Bearer <token>`)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/videos` | List all videos |
| `GET` | `/api/videos/:filename` | Single video metadata |
| `POST` | `/api/upload` | Upload MP4 (`multipart/form-data`, field: `video`) |
| `POST` | `/api/stream-token` | Issue stream token — body: `{ videoId }` |
| `GET` | `/api/video/:filename?token=` | Stream video (no JWT — stream token only) |

All errors: `{ "error": "message" }`

---

## Local Setup

Requires Node.js v18+ and pnpm.

### 1. Server

```bash
cd server
pnpm install
cp .env.example .env
```

Edit `.env`:
```env
JWT_SECRET=<generate: openssl rand -hex 32>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<your password>
STREAM_SECRET=<generate: openssl rand -hex 32>
```

```bash
pnpm dev          # ts-node-dev hot reload on :5000
```

### 2. Client

```bash
cd client
pnpm install
pnpm dev          # Vite dev server on :5173
```

Open `http://localhost:5173` — you will be redirected to the login page.

### Environment (client — optional)

```bash
# client/.env
VITE_API_BASE=http://localhost:5000/api   # defaults to this if absent
```

---

## Manual Testing

1. Start both servers (`pnpm dev` in `server/` and `client/`).
2. Open `http://localhost:5173` → redirected to `/login`.
3. **Login** — enter credentials from `server/.env`. JWT stored in localStorage.
4. **Upload** — go to Upload page, drag an `.mp4`, set a title, click "Start Secure Upload".
5. **Library** — video card appears. Click to open the player.
6. **Player** — video loads via HMAC stream token. Controls, watermark, and Security Monitor panel visible.
7. **Security hooks** (togglable from Security Monitor panel):
   - Right-click on video → blocked
   - `F12` → instant black screen (DevTools lockout)
   - `PrintScreen` → paste → clipboard warning text, not screenshot
   - Alt-Tab away → playback pauses, overlay appears
   - Toggle individual protections on/off to demonstrate each mechanism
8. **Sign out** → token cleared, redirected to `/login`, all routes blocked.

---

## Inherent Limitations

Browser-level DRM cannot match Widevine/FairPlay/PlayReady because:

1. JavaScript runs in a sandbox the user controls
2. The browser is user software — its behavior can be modified
3. Rendered pixels are always accessible to OS-level tools
4. HTTP without TLS is plaintext on the wire

This prototype's client-side protections are a **deterrence layer** — they raise cost and
leave forensic traces (watermark). They are not the security perimeter. The server-side
JWT + stream token system is the real access control.

**Production recommendation:** Use a CDN with token-authenticated HLS/DASH (Cloudflare
Stream, Mux, AWS MediaPackage) + Widevine/FairPlay, with this app's client-side
protections on top.
