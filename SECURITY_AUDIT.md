# Security Audit Report — DRMShield Video Player

**Date:** 2026-06-03 (revised)  
**Auditor:** Internal (self-audit)  
**Scope:** Client-side DRM prototype — download, screen-capture, and API attack vectors  
**Branch:** `feat/auth-system`

---

## Executive Summary

DRMShield now implements a full server-side security layer. The original 3-command attack
chain (enumerate filenames → download file) is broken. All sensitive API endpoints require
a valid JWT. Video streams require a short-lived HMAC-signed token. Rate limiting, security
headers, and upload validation are in place.

Residual risk is concentrated in fundamental browser-level limitations: DevTools can be
undocked, OS screen recording tools operate above browser privilege, and browser extensions
can override page-level protections. These are acknowledged limitations of any browser-based
DRM system — not fixable in application code.

---

## Severity Legend

| Level | Definition |
|-------|-----------|
| 🔴 Critical | Full file download possible with one command |
| 🟠 High | Protection layer bypassed entirely |
| 🟡 Medium | Information disclosure or partial bypass |
| 🔵 Low | Raises attacker cost; does not prevent attack |
| ✅ Fixed | Vulnerability mitigated in current codebase |

---

## Findings

### VULN-01 — Unauthenticated Video Stream Endpoint
**Severity:** ✅ Fixed (was 🔴 Critical)  
**File:** `server/src/controllers/videoController.ts`

**Original:** `GET /api/video/:filename` streamed any file with a valid filename. No auth.

**Fix applied:** Stream endpoint requires a valid HMAC-SHA256 signed token via `?token=`
query param. Token is `base64url(JSON({filename, exp})).HMAC-SHA256(payload, STREAM_SECRET)`.
Validated on every request — HMAC verified, expiry checked, filename locked to URL param.
Additionally, `/api/stream-token` (the issuance endpoint) now requires a valid JWT Bearer
token, so unauthenticated clients cannot obtain tokens at all.

**Residual:** Token is valid for 1 hour and can be replayed within that window. Full
mitigation requires server-side token revocation (see remaining findings).

---

### VULN-02 — Filename Enumeration via List Endpoint
**Severity:** ✅ Fixed (was 🔴 Critical)  
**File:** `server/src/controllers/videoController.ts`

**Original:** `GET /api/videos` returned `filename` (internal disk path), enabling bulk
download scripts.

**Fix applied:** `filename` field stripped from all list responses. Clients use `video.id`
as an opaque identifier. Additionally, `GET /api/videos` now requires JWT authentication —
unauthenticated callers receive 401 before any data is returned.

---

### VULN-03 — CORS Is Browser-Only Enforcement
**Severity:** ✅ Fixed (was 🔴 Critical)  
**File:** `server/src/app.ts`

**Original:** CORS `origin` restriction only affected browsers. curl/Python/wget ignored
it entirely.

**Fix applied:** Full JWT authentication on all `/api/*` endpoints. Non-browser clients
without a valid Bearer token receive 401 regardless of CORS headers. CORS is still
configured but is no longer the only access control mechanism.

---

### VULN-04 — `Accept-Ranges` Enables Parallel Chunk Download
**Severity:** 🟠 High (partially mitigated)  
**File:** `server/src/controllers/videoController.ts`

**Original:** `aria2c -x 16` could download the full file across 16 parallel connections
with no auth.

**Partial mitigation:** Stream token is validated on every request including range
requests. Without a valid token, all parallel connections receive 401. Rate limiting
(30 tokens/min per IP) throttles token issuance.

**Residual:** A single token can still be reused to make multiple parallel range requests
within its 1-hour TTL. Per-range-request token binding would fully close this — not yet
implemented.

---

### VULN-05 — Undocked DevTools Defeats Dimension Detection
**Severity:** 🟠 High (inherent limitation)  
**File:** `client/src/hooks/useDevTools.ts`

**Status:** Not fixable in JavaScript. When DevTools is undocked to a separate OS window,
`outerWidth/outerHeight` vs `innerWidth/innerHeight` difference is 0. `dimensionsTriggered`
stays false.

**Mitigation context:** Server-side auth means even if UI detection is bypassed, the
attacker still needs a valid JWT + stream token to download anything. Client-side detection
is a deterrence layer, not the security perimeter.

Detection thresholds raised from 100px to 200px to reduce false-positives on Windows.
Debugger timing threshold raised from 100ms to 200ms.

---

### VULN-06 — Debugger Timing Trap Is Disableable
**Severity:** 🟠 High (inherent limitation)  
**File:** `client/src/hooks/useDevTools.ts`

**Status:** Not fixable. "Pause on debugger statements" can be disabled in DevTools
settings, making `new Function('debugger')()` a no-op. Same server-side auth context
as VULN-05 applies.

---

### VULN-07 — Video URL Persists in Browser Cache After DOM Unmount
**Severity:** ✅ Fixed (was 🟠 High)  
**File:** `client/src/pages/PlayerPage.tsx`, `client/src/components/VideoPlayer.tsx`

**Original:** Raw stream URL visible in Network tab and browser cache after lockout.
Attacker triggered lockout → copied URL → downloaded.

**Fix applied:**
1. Stream URL contains an expiring token (`exp` in payload). URL copied from Network tab
   becomes invalid after 1 hour.
2. `src` attribute removed from `<video>` JSX — set imperatively via `useEffect` so the
   URL does not appear as a static DOM attribute in the Elements panel.

---

### VULN-08 — OS-Level Screen Recording Bypasses Focus Detection
**Severity:** 🟠 High (inherent limitation — no fix exists)

**Status:** Focus detection fires on `window.blur`. OBS Studio (window or display capture),
phone camera, and second-monitor recording never steal window focus. No browser API can
detect these methods.

**Accepted mitigation:** Dynamic floating watermark repositions every 4 seconds, survives
into any recording, and identifies the leaking user by title + timestamp.

---

### VULN-09 — Browser Extensions Bypass All Page-Level Protections
**Severity:** 🟠 High (inherent limitation — no fix exists)

**Status:** Extensions run in a privileged process above page scripts. Screen recording
extensions, `getDisplayMedia()` from extension context, and keyboard event interceptors
all operate outside reach of page JavaScript. Not fixable in application code.

---

### VULN-10 — Plaintext HTTP — Network Traffic Capturable
**Severity:** 🟡 Medium (deployment config — not application code)

**Status:** Server runs on plain HTTP. Wireshark on the same LAN captures raw MP4 bytes
in transit.

**Fix:** Deploy behind HTTPS. Use nginx or Caddy as a reverse proxy with a real
certificate. `app.set('trust proxy', 1)` is already in place for proxy-aware IP handling.
No application code changes needed.

---

### VULN-11 — `video.src` Attribute Exposed in DOM
**Severity:** ✅ Fixed (was 🟡 Medium)  
**File:** `client/src/components/VideoPlayer.tsx`

**Original:** `<video src="...">` set as a JSX attribute — readable via
`document.querySelector('video').src` in console.

**Fix applied:** `src` attribute removed from JSX. Set imperatively via
`videoRef.current.src = src` + `videoRef.current.load()` in a `useEffect`. URL absent
from Elements panel. Still visible in Network tab (fundamental browser behavior).

---

### VULN-12 — Chrome Remote Debugging (USB) Bypasses Mobile Detection
**Severity:** 🟡 Medium (inherent limitation)

**Status:** Android USB debugging via `chrome://inspect` exposes full DevTools on the
desktop while `dimensionsTriggered` = false on the phone. Partial mitigation: debugger
timing trap may still fire depending on USB debugging latency. Full mitigation would
require a network heartbeat with timing detection — not implemented.

---

### VULN-13 — Unauthenticated Sync Endpoint
**Severity:** ✅ Fixed (was 🔵 Low)  
**File:** `server/src/routes/videoRoutes.ts`

**Original:** `POST /api/sync` was publicly accessible.

**Fix applied:** Route removed from `videoRoutes.ts`. Handler function retained in
controller for internal/CLI use only — no HTTP exposure.

---

## New Finding — JWT Stored in localStorage

**Severity:** 🟡 Medium  
**File:** `client/src/context/AuthContext.tsx`, `client/src/utils/apiClient.ts`

**Description:** JWT is stored under `localStorage['drm_auth_token']`. Any XSS
vulnerability (injected script, malicious dependency) can read and exfiltrate this token.

**Fix:** Migrate to `httpOnly` cookies. Server sets cookie on login response; browser
sends automatically; JavaScript cannot read it. Requires `credentials: 'include'` on
CORS and removing the Bearer interceptor from `apiClient`.

**Current risk level:** Low in this prototype (no user-generated content, no untrusted
scripts). Elevated in a multi-user production deployment.

---

## Attack Chain Status

### Original 3-command attack (from initial audit)

```bash
# Step 1 — enumerate filenames
FILENAME=$(curl -s http://localhost:5000/api/videos | jq -r '.[0].filename')
# → 401 Unauthorized (no JWT)

# Step 2 — download
curl http://localhost:5000/api/video/$FILENAME -o video.mp4
# → 401 Stream token required
```

**Chain broken at step 1.** Authenticated attack path:

```bash
# Must obtain JWT first
TOKEN=$(curl -s -X POST http://localhost:5000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"?"}' | jq -r '.token')
# → Requires valid credentials (bcrypt-hashed, env-only)

# Must obtain stream token (requires JWT)
STREAM=$(curl -s -X POST http://localhost:5000/api/stream-token \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"videoId":"video-xxx.mp4"}' | jq -r '.token')

# Download (token expires in 1 hour)
curl "http://localhost:5000/api/video/video-xxx.mp4?token=$STREAM" -o video.mp4
```

An attacker now needs valid credentials. Brute-force is rate-limited at 10 attempts per
15 minutes per IP.

---

## Residual Risk Summary

| Vulnerability | Status | Reason |
|--------------|--------|--------|
| VULN-04 (parallel chunks) | Partial | Token reusable within 1hr TTL |
| VULN-05 (undocked DevTools) | Inherent | No JS fix; server auth is real barrier |
| VULN-06 (debugger disable) | Inherent | Same as VULN-05 |
| VULN-08 (OS screen recording) | Inherent | Physical layer — watermark is mitigation |
| VULN-09 (browser extensions) | Inherent | Extension sandbox above page JS |
| VULN-10 (plaintext HTTP) | Deployment | nginx/Caddy + TLS; not app code |
| VULN-12 (USB debugging) | Inherent | Mobile detection limitation |
| localStorage JWT | Medium | Migrate to httpOnly cookie in production |

---

## Inherent Limitations of Browser-Level DRM

This prototype demonstrates browser-level protection techniques. True DRM (Widevine,
FairPlay, PlayReady) operates at hardware/OS level — decrypted video frames never exist
in accessible memory. Browser-level protection cannot match this because:

1. JavaScript runs in a sandbox the user controls
2. The browser itself is user software — its behavior can be modified
3. Rendered pixels are always accessible to OS-level tools
4. HTTP traffic without TLS is plaintext on the wire

**Production recommendation:** Use a CDN with token-authenticated HLS/DASH streams
(Cloudflare Stream, Mux, AWS MediaPackage) combined with Widevine/FairPlay. Use this
app's client-side protections as a deterrence layer on top, not as the primary mechanism.

---

*End of report. All findings are based on self-audit for defensive improvement purposes.*
