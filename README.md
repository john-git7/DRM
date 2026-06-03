# DRMShield

> Browser-level DRM prototype with server-side JWT auth, HMAC stream tokens, and aggressive client-side content protection.

---

## What it does

Upload an MP4. The server gates every byte behind authentication. The client wraps playback in multiple deterrence layers — DevTools lockout, keyboard blocking, focus detection, and a floating watermark that burns your identity into any screen recording.

No Widevine. No FairPlay. Pure TypeScript, front to back.

---

## Stack

| | |
|--|--|
| **Frontend** | React 19, TypeScript, Vite, Tailwind CSS v4 |
| **Backend** | Node.js, Express, TypeScript |
| **Auth** | JWT (jsonwebtoken) + bcryptjs |
| **Validation** | Zod |
| **Upload** | Multer — MP4-only, 100 MB cap, magic-byte verified |
| **Security** | Helmet, express-rate-limit, HMAC-SHA256 stream tokens |
| **Style** | Dark neobrutalism — hard borders, flat surfaces, violet offset shadows |

---

## Security Model

### Server (the real barrier)

```
POST /api/auth/login          →  bcrypt verify → JWT (24hr)
POST /api/stream-token        →  JWT required  → HMAC token (1hr, filename-locked)
GET  /api/video/:f?token=     →  HMAC verify + expiry check → stream bytes
GET  /api/videos              →  JWT required  → list (filename field stripped)
POST /api/upload              →  JWT required  → magic-byte check → save
```

Everything behind `/api/*` except login and the stream endpoint requires a Bearer token.
The stream endpoint uses its own short-lived HMAC token so the browser can fetch video
bytes without exposing a JWT in the URL.

**Rate limits:** 100 req/15min (global) · 10 req/15min (login) · 30 req/min (stream token)

### Client (deterrence layer)

| Protection | Mechanism | Bypass resistance |
|-----------|-----------|-----------------|
| DevTools lockout | Dimension diff >200px OR debugger timing >200ms | Low (undockable) |
| Keyboard blocking | Capture-phase listeners — F12, PrintScreen, Ctrl+Shift+I | Medium |
| Right-click block | `contextmenu` preventDefault in VideoPlayer | Low |
| Focus loss pause | `window.blur` → pause + blur + clipboard overwrite | Low (OBS, phone cam) |
| Floating watermark | Repositions every 4s, title + date + clock | **Survives recording** |
| Stream token | Server-issued, expires 1hr, locked to filename | High |

> Client-side protections raise cost and leave forensic traces. They are not the security perimeter — the JWT + stream token layer is.

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/john-git7/DRM.git
cd DRM

# Install both workspaces
cd server && pnpm install
cd ../client && pnpm install
```

### 2. Configure server secrets

```bash
cd server
cp .env.example .env
```

Edit `server/.env`:

```env
JWT_SECRET=        # openssl rand -hex 32
ADMIN_USERNAME=    # e.g. admin
ADMIN_PASSWORD=    # plaintext — bcrypt-hashed at startup, never stored
STREAM_SECRET=     # openssl rand -hex 32
```

Server exits at startup if any of these are missing.

### 3. Run

```bash
# Terminal 1 — server
cd server && pnpm dev     # :5000

# Terminal 2 — client
cd client && pnpm dev     # :5173
```

Open `http://localhost:5173` → redirected to login.

---

## API Reference

### Auth

| Method | Path | Auth | Body |
|--------|------|------|------|
| `POST` | `/api/auth/login` | — | `{ username, password }` |
| `GET` | `/health` | — | — |

```json
// POST /api/auth/login → 200
{ "token": "<jwt>", "expiresAt": "2026-06-04T06:00:00.000Z" }
```

### Videos

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/videos` | JWT | List all videos |
| `GET` | `/api/videos/:filename` | JWT | Single video metadata |
| `POST` | `/api/upload` | JWT | Upload MP4 — field: `video`, optional: `title` |
| `POST` | `/api/stream-token` | JWT | Issue stream token — body: `{ videoId }` |
| `GET` | `/api/video/:filename?token=` | Stream token | Stream with HTTP range support |

```json
// POST /api/upload → 201
{
  "message": "Video uploaded successfully!",
  "video": {
    "id": "video-1717000000-001.mp4",
    "title": "My Video",
    "filename": "video-1717000000-001.mp4",
    "size": 10485760,
    "uploadDate": "2026-06-03T12:00:00.000Z"
  }
}
```

All errors return `{ "error": "message" }`.

---

## Project Structure

```
DRM/
├── client/src/
│   ├── context/AuthContext.tsx       # token state, login(), logout()
│   ├── utils/apiClient.ts            # axios + Bearer interceptor + 401→logout
│   ├── components/
│   │   ├── VideoPlayer.tsx           # player — all DRM protections live here
│   │   └── ProtectedRoute.tsx        # redirects unauthenticated to /login
│   ├── hooks/
│   │   ├── useAuth.ts
│   │   ├── useDevTools.ts            # dimension + debugger trap (500ms interval)
│   │   └── useKeyboardProtection.ts
│   └── pages/
│       ├── LoginPage.tsx
│       ├── LibraryPage.tsx
│       ├── UploadPage.tsx
│       └── PlayerPage.tsx            # player + Security Monitor toggle panel
│
└── server/src/
    ├── config/
    │   ├── users.ts                  # bcrypt hash at startup from env
    │   └── multer.ts                 # MP4-only, 100MB
    ├── services/
    │   ├── authService.ts            # JWT issue/verify, bcrypt compare
    │   └── videoService.ts           # CRUD, sync, file paths
    ├── middleware/
    │   ├── auth.ts                   # requireAuth — Bearer JWT guard
    │   └── rateLimiter.ts            # global / login / token limiters
    ├── controllers/
    │   ├── authController.ts
    │   └── videoController.ts        # stream token issuance + HMAC streaming
    └── routes/
        ├── authRoutes.ts
        └── videoRoutes.ts
```

---

## How stream tokens work

```
POST /api/stream-token  (requires JWT)
  └→ payload = base64url({ filename, exp: now + 3600 })
     token   = payload + "." + HMAC-SHA256(payload, STREAM_SECRET)
     → { token }

GET /api/video/:filename?token=<token>  (no JWT)
  └→ split token → recompute HMAC → compare
     decode payload → check exp > now
     check payload.filename === :filename param
     → stream bytes (206 range or 200 full)
```

Token is embedded in the `<video>` src URL. It has no IP binding (removed — `req.ip`
differs between proxy and direct requests in development). HMAC + filename lock is
sufficient: a stolen token only streams that one file within its TTL.

---

## Design System

Dark neobrutalism. No gradients, no blur effects, no soft shadows.

```
Background   #0a0a0a    Canvas
Surface      #111111    Cards, panels
Border       2px solid #ffffff
Shadow       4px 4px 0px #7c3aed   (violet offset)
Accent       #7c3aed    Actions, active states
Warning      #f59e0b    Badges, overlays
Danger       #ef4444    Errors, lockouts
Success      #22c55e    Upload complete, pass states
```

---

## Known Limitations

| Attack | Status |
|--------|--------|
| Undocked DevTools | Defeats dimension detection — dimension diff stays 0 |
| Debugger trap disabled | One checkbox in DevTools settings |
| OBS / phone camera | Never triggers `window.blur` — watermark is the mitigation |
| Browser extensions | Run above page JS — can override all client protections |
| Plaintext HTTP | Wireshark on same LAN captures raw bytes — deploy with HTTPS |
| localStorage JWT | XSS-readable — production should use `httpOnly` cookies |

---

## Further Reading

- [`SECURITY_AUDIT.md`](./SECURITY_AUDIT.md) — full vulnerability list with severity and fix status
- [`SECURITY_IMPROVEMENTS.md`](./SECURITY_IMPROVEMENTS.md) — changelog of every security fix
- [`ARCHITECTURE_MVC.md`](./ARCHITECTURE_MVC.md) — request flow diagrams, layer responsibilities, token spec
