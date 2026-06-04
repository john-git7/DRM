# Architecture — DRMShield Video Player

## Overview

DRMShield is a full-stack TypeScript application. The server follows a strict MVC
separation with an additional auth layer. The client is a React SPA with a context-based
auth system, an intercepting API client, and route-level access control.

---

## Server Architecture

```
server/src/
├── config/
│   ├── paths.ts            # UPLOADS_DIR, DB_PATH — centralized absolute paths
│   ├── multer.ts           # Multer instance (MP4-only, 100 MB, disk storage)
│   └── users.ts            # Admin credentials from env; bcrypt hash at startup
├── types/
│   ├── video.ts            # Video Zod schema + inferred TypeScript types
│   └── auth.ts             # JwtPayload interface, AuthenticatedRequest extends Request
├── services/
│   ├── videoService.ts     # Video business logic — CRUD, sync, file paths (no HTTP)
│   └── authService.ts      # validateCredentials(), issueJwt(), verifyJwt()
├── middleware/
│   ├── errorHandler.ts     # AppError class + typed global error handler
│   ├── auth.ts             # requireAuth — validates Bearer JWT, attaches req.user
│   └── rateLimiter.ts      # globalLimiter, loginLimiter, tokenLimiter
├── controllers/
│   ├── videoController.ts  # HTTP handlers for all video endpoints
│   └── authController.ts   # login() handler — thin, delegates to authService
├── routes/
│   ├── videoRoutes.ts      # Video routes with requireAuth + tokenLimiter guards
│   └── authRoutes.ts       # POST /api/auth/login with loginLimiter
├── app.ts                  # Express setup — helmet, CORS, parsers, routes, error handler
└── server.ts               # Entry — ensureDirectories → dotenv → listen
```

### Layer Responsibilities

| Layer | Responsibility |
|-------|---------------|
| `config/` | All environment-derived constants and middleware instances. Fail-fast on missing env vars. |
| `types/` | Shared interfaces. No logic. Zod schemas colocated with their domain types. |
| `services/` | Pure business logic. No `req`/`res`. Fully testable in isolation. |
| `middleware/` | Cross-cutting concerns: auth guard, rate limiting, error formatting. |
| `controllers/` | HTTP handlers only. Read from `req`, call service, write to `res`. No business logic. |
| `routes/` | Route bindings only. Wire middleware + controllers to paths. |

---

### Request Flow — Authenticated Endpoints

```
Client
  │
  ├─ POST /api/auth/login
  │     loginLimiter → authController.login()
  │           └─ authService.validateCredentials() → authService.issueJwt() → { token }
  │
  ├─ GET  /api/videos
  │     requireAuth → videoController.listVideos()
  │           └─ videoService.getVideos() → videos[] (filename stripped)
  │
  ├─ GET  /api/videos/:filename
  │     requireAuth → videoController.getVideoMeta()
  │           └─ videoService.getVideoByFilename() → video (full object)
  │
  ├─ POST /api/upload
  │     requireAuth → multer → videoController.uploadVideo()
  │           └─ isMp4() magic-byte check → videoService.createVideo()
  │
  ├─ POST /api/stream-token
  │     requireAuth → tokenLimiter → videoController.issueStreamToken()
  │           └─ HMAC sign({ filename, exp }) → { token }
  │
  └─ GET  /api/video/:filename          ← no JWT; stream token only
        videoController.streamVideo()
              └─ HMAC verify + exp check + filename check → fs.createReadStream()
```

---

### Stream Token Spec

```
payload = base64url(JSON.stringify({ filename: string, exp: number }))
token   = payload + "." + HMAC-SHA256(payload, STREAM_SECRET)
```

Validation in `streamVideo()`:
1. Split on last `.` → payload + sig
2. Recompute HMAC, compare (Node `crypto`, timing-safe)
3. Decode payload, assert `exp > Math.floor(Date.now() / 1000)`
4. Assert `payload.filename === path.basename(req.params.filename)` (prevents token substitution)

TTL: 3600 seconds (1 hour). Secret: `process.env.STREAM_SECRET`.

---

### Auth Middleware

```typescript
// middleware/auth.ts
export function requireAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) { next(new AppError('Unauthorized', 401)); return; }
  try {
    req.user = verifyJwt(authHeader.slice(7));
    next();
  } catch {
    next(new AppError('Unauthorized', 401));
  }
}
```

JWT: HS256, 24-hour expiry, secret from `process.env.JWT_SECRET`. Password: bcrypt round 10,
hashed at startup from `process.env.ADMIN_PASSWORD` — plaintext never stored.

---

### Rate Limiters

| Limiter | Window | Max | Applied to |
|---------|--------|-----|-----------|
| `globalLimiter` | 15 min | 100 per IP | All routes (mounted in `app.ts`) |
| `loginLimiter` | 15 min | 10 per IP | `POST /api/auth/login` |
| `tokenLimiter` | 1 min | 30 per IP | `POST /api/stream-token` |

---

## Client Architecture

```
client/src/
├── config/
│   └── api.ts              # API_BASE — env-configurable via VITE_API_BASE
├── types/
│   └── index.ts            # Video, DevToolsStatus, VideoPlayerProps, UploadResponse
├── utils/
│   ├── format.ts           # formatBytes(), formatDate()
│   └── apiClient.ts        # Axios instance with Bearer interceptor + 401→logout redirect
├── context/
│   └── AuthContext.tsx     # AuthProvider — token state, login(), logout(), isAuthenticated
├── hooks/
│   ├── useAuth.ts          # Thin wrapper over useAuthContext()
│   ├── useDevTools.ts      # Dimension + debugger trap detection (500ms interval)
│   └── useKeyboardProtection.ts  # Capture-phase keyboard event blocker
├── components/
│   ├── VideoPlayer.tsx     # DRM player — watermark, overlays, custom controls
│   ├── ToggleSwitch.tsx    # Reusable toggle
│   └── ProtectedRoute.tsx  # Redirects unauthenticated users to /login
├── pages/
│   ├── LoginPage.tsx       # Username/password form
│   ├── LibraryPage.tsx     # Video grid
│   ├── UploadPage.tsx      # Drag-drop upload with progress bar
│   └── PlayerPage.tsx      # Player + Security Monitor panel
├── App.tsx                 # BrowserRouter → AuthProvider → AppShell (routes + guards)
└── main.tsx                # React entry point
```

---

### Client Request Flow

```
Page component
  │
  └─ apiClient.get/post(path)          ← axios instance from utils/apiClient.ts
        │
        ├─ request interceptor
        │     localStorage.getItem('drm_auth_token')
        │     → config.headers.Authorization = `Bearer ${token}`
        │
        ├─ → server (http://localhost:5000/api)
        │
        └─ response interceptor
              401 → localStorage.removeItem → window.location.href = '/login'
```

---

### Auth Context

```
BrowserRouter
  └─ AuthProvider (context/AuthContext.tsx)
        ├─ token: string | null          ← localStorage['drm_auth_token']
        ├─ isAuthenticated: boolean      ← token present + not expired
        ├─ login(username, password)     ← POST /api/auth/login → store token → navigate('/')
        └─ logout()                      ← clear token → navigate('/login')

        └─ AppShell
              ├─ Header (shows nav only when isAuthenticated)
              └─ Routes
                    ├─ /login            → LoginPage (unprotected)
                    ├─ /                 → ProtectedRoute → LibraryPage
                    ├─ /upload           → ProtectedRoute → UploadPage
                    └─ /player/:filename → ProtectedRoute → PlayerPage
```

`ProtectedRoute` reads `isAuthenticated` from `useAuth()`. Unauthenticated → `<Navigate to="/login" replace />`.

---

### VideoPlayer Props Contract

```typescript
interface VideoPlayerProps {
  src: string;                        // Full stream URL with ?token=
  title: string;
  watermarkLabel?: string;
  focusLossDetectEnabled?: boolean;   // Pause video + overlay on window.blur
  rightClickProtectEnabled?: boolean; // contextmenu preventDefault
  keyboardProtectEnabled?: boolean;   // useKeyboardProtection (F12, PrintScreen, etc.)
  watermarkEnabled?: boolean;         // Floating watermark overlay
  screenRecordWarningEnabled?: boolean; // "Capture Detected" stamp after 3 focus losses
}
```

All boolean props default to `true`. VideoPlayer is the sole enforcer — AppShell does not
duplicate these protections. Security Monitor toggles in PlayerPage map directly to these
props.

---

### DevTools Detection

`useDevTools()` runs every 500ms and on `window.resize`:

1. **Dimension check** — `Math.max(0, cssOuterW - innerW) > 200 || cssOuterH - innerH > 200`.
   Corrected for Windows where `outerWidth` is often in physical pixels (divided by `devicePixelRatio`).
   Disabled on mobile (virtual keyboard shrinks `innerHeight`).

2. **Debugger timing trap** — `new Function('debugger')()` measured with `performance.now()`.
   Elapsed > 200ms = DevTools paused execution.

`isOpen = dimensionsTriggered || debuggerTriggered`. When true, `AppShell` replaces the
entire app with `<div className="w-screen h-screen bg-black" />`.

---

## API Reference

### Auth

| Method | Path | Auth | Body | Response |
|--------|------|------|------|---------|
| `POST` | `/api/auth/login` | None | `{ username, password }` | `{ token, expiresAt }` |

### Videos

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/videos` | JWT | List all videos (`filename` field omitted) |
| `GET` | `/api/videos/:filename` | JWT | Single video metadata (full object) |
| `POST` | `/api/upload` | JWT | Upload MP4 (`multipart/form-data`, field: `video`) |
| `POST` | `/api/stream-token` | JWT | Issue HMAC stream token for a video |
| `GET` | `/api/video/:filename` | Stream token | Stream video with HTTP range support |
| `GET` | `/health` | None | Server health check |

### Error Shape

All errors:
```json
{ "error": "Human-readable message" }
```

---

## Environment Variables

```env
# server/.env  (required — server exits on startup if missing)
JWT_SECRET=<64-char random string>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<plaintext — bcrypt-hashed at startup, never stored>
STREAM_SECRET=<random string>
PORT=5000                             # optional, defaults to 5000
```

```env
# client/.env  (optional)
VITE_API_BASE=http://localhost:5000/api   # defaults to this if absent
```

---

## Build & Run

```bash
# Server
cd server
pnpm install
cp .env.example .env    # fill in secrets
pnpm dev                # ts-node-dev hot reload on :5000
pnpm build              # tsc → dist/
pnpm start              # node dist/server.js

# Client
cd client
pnpm install
pnpm dev                # Vite dev server on :5173
pnpm build              # tsc + Vite production build
pnpm lint               # ESLint
```
