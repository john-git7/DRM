# Security Improvements Report — DRMShield Video Player

**Date:** 2026-06-03  
**Branch:** `feat/auth-system`  
**Scope:** All security improvements across the project lifecycle

---

## Overview

Security work was completed across two phases:

- **Phase 1** (`feat/server-mvc-architecture`) — Server-side stream protection: HMAC tokens,
  filename stripping, upload validation, sync endpoint removal.
- **Phase 2** (`feat/auth-system`) — Full JWT authentication layer, rate limiting, security
  headers, client auth flow, and player bug fixes.

---

## Phase 1 — Stream Protection

### VULN-01: Unauthenticated Stream Endpoint → HMAC Stream Tokens

**Before:** `GET /api/video/:filename` served any request with a valid filename.

```bash
curl http://localhost:5000/api/video/video-xxx.mp4  # → 200 OK, full download
```

**After:** `POST /api/stream-token` issues a short-lived token. `GET /api/video/:filename`
validates it on every request.

```bash
curl http://localhost:5000/api/video/video-xxx.mp4          # → 401 Stream token required
curl http://localhost:5000/api/video/video-xxx.mp4?token=x  # → 401 Invalid stream token
```

**Token structure:**
```
payload = base64url(JSON.stringify({ filename, exp }))
token   = payload + "." + HMAC-SHA256(payload, STREAM_SECRET)
```

Validation steps in `streamVideo()`:
1. Split on last `.` → payload + sig
2. Recompute HMAC, compare (timing-safe via Node `crypto`)
3. Decode payload, check `exp > Date.now()/1000`
4. Check `payload.filename === URL :filename param`

**Files:** `server/src/controllers/videoController.ts`, `server/src/routes/videoRoutes.ts`

---

### VULN-02: Filename Enumeration → Strip Filename from List Response

**Before:** `GET /api/videos` returned full `Video` objects including `filename`.

**After:** `listVideos()` maps through `({ filename: _f, ...safe }) => safe`.
Clients navigate using `video.id` (same value, treated as opaque identifier).

**Files:** `server/src/controllers/videoController.ts`, `client/src/pages/LibraryPage.tsx`

---

### VULN-11: `video.src` in DOM → Imperative Src Assignment

**Before:** `<video src={src}>` exposed the full stream URL as a DOM attribute, readable
via `document.querySelector('video').src`.

**After:** `src` removed from JSX markup. Set imperatively:

```ts
useEffect(() => {
  if (videoRef.current && src) {
    videoRef.current.src = src;
    videoRef.current.load();
  }
}, [src]);
```

URL absent from Elements panel. Combined with expiring tokens (VULN-07 fix), copied URLs
become stale after 1 hour.

**Files:** `client/src/components/VideoPlayer.tsx`

---

### VULN-13: Unauthenticated Sync Endpoint → Route Removed

**Before:** `POST /api/sync` was publicly accessible.

**After:** Route removed from `videoRoutes.ts`. Handler retained for internal use only.

**Files:** `server/src/routes/videoRoutes.ts`

---

## Phase 2 — Full Auth System + Hardening

### JWT Authentication Layer

**Added:** Complete JWT-based auth system protecting all sensitive API endpoints.

**Server new files:**

| File | Purpose |
|------|---------|
| `server/src/types/auth.ts` | `JwtPayload` interface, `AuthenticatedRequest` extends `Request` |
| `server/src/config/users.ts` | Single-admin config; bcrypt hash computed at startup from env vars; `process.exit(1)` if missing |
| `server/src/services/authService.ts` | `validateCredentials()`, `issueJwt()`, `verifyJwt()` |
| `server/src/middleware/auth.ts` | `requireAuth` middleware; validates Bearer token; attaches `req.user` |
| `server/src/controllers/authController.ts` | Thin login handler; delegates to `authService` |
| `server/src/routes/authRoutes.ts` | `POST /api/auth/login` with login rate limiter |

**Protected endpoints (require `Authorization: Bearer <jwt>`):**

```
POST /api/upload
GET  /api/videos
GET  /api/videos/:filename
POST /api/stream-token
```

**Unprotected by design (uses stream tokens instead):**

```
GET /api/video/:filename    ← stream token required via ?token=
GET /health
POST /api/auth/login
```

**Token spec:** HS256, `{ username, iat, exp }`, 24-hour expiry, secret from `JWT_SECRET`
env var. Server exits on startup if `JWT_SECRET`, `ADMIN_USERNAME`, or `ADMIN_PASSWORD`
env vars are missing.

**Files:** Multiple new files; `server/src/app.ts` and `server/src/routes/videoRoutes.ts`
updated.

---

### Rate Limiting

Three named limiters via `express-rate-limit`:

| Limiter | Window | Max requests | Applied to |
|---------|--------|-------------|-----------|
| `globalLimiter` | 15 min | 100 per IP | All routes |
| `loginLimiter` | 15 min | 10 per IP | `POST /api/auth/login` |
| `tokenLimiter` | 1 min | 30 per IP | `POST /api/stream-token` |

**File:** `server/src/middleware/rateLimiter.ts`

---

### Security Headers (Helmet)

`app.use(helmet())` in `app.ts` enables:

- `X-Frame-Options: SAMEORIGIN` — clickjacking protection
- `X-Content-Type-Options: nosniff` — MIME sniffing protection
- `Strict-Transport-Security` — HSTS for HTTPS deployments
- `Cross-Origin-Embedder-Policy: require-corp` — isolates browsing context
- `Content-Security-Policy` — restricts script/resource origins
- `X-DNS-Prefetch-Control: off`

**Note:** COEP required adding `Cross-Origin-Resource-Policy: cross-origin` to stream
responses — video loads cross-origin from `localhost:5000` into page at `localhost:5173`.

**Files:** `server/src/app.ts`, `server/src/controllers/videoController.ts`

---

### Magic-Byte MP4 Validation

**Before:** Upload accepted any file with `.mp4` extension and `video/mp4` MIME type —
both trivially spoofable.

**After:** After Multer saves the file, `uploadVideo()` reads the first 12 bytes and
checks for the `ftyp` MP4 box at offset 4. Mismatch → file deleted + `415 Unsupported
Media Type`.

```ts
function isMp4(filePath: string): boolean {
  const fd = fs.openSync(filePath, 'r');
  const buf = Buffer.alloc(12);
  fs.readSync(fd, buf, 0, 12, 0);
  fs.closeSync(fd);
  return buf.slice(4, 8).equals(Buffer.from('ftyp'));
}
```

**File:** `server/src/controllers/videoController.ts`

---

### Client Auth Flow

**New client files:**

| File | Purpose |
|------|---------|
| `client/src/context/AuthContext.tsx` | `AuthProvider` with `token`, `isAuthenticated`, `login()`, `logout()`; token in `localStorage['drm_auth_token']`; auto-expires on mount |
| `client/src/hooks/useAuth.ts` | Thin wrapper over `useAuthContext()` |
| `client/src/utils/apiClient.ts` | Axios instance; request interceptor attaches `Authorization: Bearer <token>`; response interceptor clears token + redirects on 401 |
| `client/src/components/ProtectedRoute.tsx` | Redirects unauthenticated users to `/login` |
| `client/src/pages/LoginPage.tsx` | Username/password form; calls `useAuth().login()`; matches neobrutalism design system |

**Modified:**
- `App.tsx` — wrapped in `AuthProvider` inside `BrowserRouter`; `/login` route added;
  all protected routes wrapped in `<ProtectedRoute>`; header shows nav only when authenticated
- `LibraryPage.tsx`, `PlayerPage.tsx`, `UploadPage.tsx` — all axios calls replaced with
  `apiClient`; `API_BASE` import removed from pages that no longer need it

---

## Phase 2 — Player Bug Fixes

### Security Monitor Toggles Non-Functional

**Root cause:** `AppShell` ran `useKeyboardProtection()` unconditionally and had its own
`contextmenu` handler — both fired with `capture: true`, consuming events before
VideoPlayer's prop-gated handlers could act. VideoPlayer's toggles changed state but had
no effect.

**Fix:** Removed `useKeyboardProtection()` call and `contextmenu` handler from `AppShell`.
VideoPlayer is now the sole enforcer of keyboard and right-click protection.

**Files:** `client/src/App.tsx`

---

### Permanent App Blur After Right-Click

**Root cause:** `rightClickBlur` state was set to `true` in the contextmenu handler but
never reset to `false`. After one right-click, `isBlurred = !windowFocused || rightClickBlur`
was permanently true — entire app blurred until hard refresh.

**Fix:** `rightClickBlur` state and its handler removed entirely from `AppShell`.
`isBlurred` now only reflects `!windowFocused`.

**Files:** `client/src/App.tsx`

---

### IP-Bound Tokens Caused 401 on All Video Streams

**Root cause:** Stream tokens embedded `req.ip`. Token-issue requests came through the
Vite dev proxy (`::1`); browser range requests for the video hit port 5000 directly
(`::ffff:127.0.0.1`). IP mismatch → every stream returned 401.

**Fix:** IP binding removed from stream token payload and validation. HMAC signature +
filename lock is sufficient — a stolen token can only stream that one file within its TTL.

**Files:** `server/src/controllers/videoController.ts`

---

### Video Element Showed Black (Missing `.load()`)

**Root cause:** `videoRef.current.src = src` without calling `.load()`. HTML5 video
elements require an explicit `load()` call when `src` is assigned imperatively to an
already-mounted element.

**Fix:** Added `videoRef.current.load()` immediately after src assignment in `useEffect`.

**Files:** `client/src/components/VideoPlayer.tsx`

---

### DevTools Detection False-Positives on Windows

**Root cause:** Dimension threshold of 100px and debugger timing threshold of 100ms both
triggered too readily on Windows. Normal browser chrome (address bar, window frame,
scrollbar) can reach ~80-100px; any CPU spike over 100ms fired the debugger trap.

**Fix:** Both thresholds raised to 200px / 200ms.

**Files:** `client/src/hooks/useDevTools.ts`

---

### `ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` on Video Stream

**Root cause:** Helmet sets `Cross-Origin-Embedder-Policy: require-corp`. Video loads
cross-origin (`localhost:5000` into page at `localhost:5173`). Browser blocked it without
an explicit opt-in from the resource server.

**Fix:** Added `Cross-Origin-Resource-Policy: cross-origin` to both 206 (range) and 200
(full) stream response headers.

**Files:** `server/src/controllers/videoController.ts`

---

### Silent Blank Area When Stream Token Unavailable

**Root cause:** If `streamToken` was null after loading completed, the player rendered
`null` with no user feedback — just empty space.

**Fix:** Replaced `null` fallback with a "Stream Unavailable" error card and a
return-to-library link.

**Files:** `client/src/pages/PlayerPage.tsx`

---

## New API Endpoints

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| `POST` | `/api/auth/login` | None | Issue JWT on valid credentials |
| `POST` | `/api/stream-token` | JWT | Issue HMAC stream token for a video |

---

## Environment Variables Required

```env
# server/.env
JWT_SECRET=<64-char random string>
ADMIN_USERNAME=<username>
ADMIN_PASSWORD=<plaintext — bcrypt-hashed at startup, never stored>
STREAM_SECRET=<random string — signs stream tokens>
```

Server exits at startup if any of these are absent.

---

## Attack Chain Status

### Original attack (pre-Phase 1)

```bash
FILENAME=$(curl -s http://localhost:5000/api/videos | jq -r '.[0].filename')
curl http://localhost:5000/api/video/$FILENAME -o video.mp4
# → Full download in 2 commands. All client-side protections irrelevant.
```

### Post Phase 1 (stream tokens, no auth yet)

```bash
FILENAME=$(curl -s http://localhost:5000/api/videos | jq -r '.[0].filename')
# → filename field absent (null)
curl http://localhost:5000/api/video/$FILENAME
# → 401 Stream token required
```

### Post Phase 2 (full auth)

```bash
curl -s http://localhost:5000/api/videos
# → 401 Unauthorized (no JWT)

curl -s -X POST http://localhost:5000/api/stream-token \
  -H 'Content-Type: application/json' -d '{"videoId":"x.mp4"}'
# → 401 Unauthorized (no JWT)

# Attacker must brute-force credentials (rate-limited: 10 attempts / 15 min / IP)
```

---

## Remaining Gaps

| Gap | Difficulty | Notes |
|-----|-----------|-------|
| JWT in localStorage (XSS risk) | Medium | Migrate to `httpOnly` cookie; remove Bearer interceptor |
| Stream token reusable within 1hr TTL | Medium-Hard | Server-side revocation store (in-memory Set or Redis) |
| Plaintext HTTP | Low (deployment) | nginx/Caddy with TLS in front |
| Undocked DevTools | Inherent | No JS fix; server auth is real barrier |
| OS screen recording | Inherent | Watermark identifies leaker |
| Browser extensions | Inherent | Above page JS privilege |

---

*Report covers all commits on `feat/server-mvc-architecture` and `feat/auth-system`.*
