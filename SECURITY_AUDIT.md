# Security Audit Report — DRMShield Video Player

**Date:** 2026-06-02
**Auditor:** Internal (self-audit)
**Scope:** Client-side DRM prototype — download and screen-capture attack vectors
**Branch:** `feat/server-mvc-architecture`

---

## Executive Summary

DRMShield implements browser-level content protection via React (client-side). All protections run in page JavaScript context. The server has no authentication, no token validation, and no rate limiting. A determined attacker with basic HTTP tooling can download any video without triggering a single client-side protection.

**Root cause:** The threat model assumes the attacker uses only the React app in a standard browser with no extensions. That assumption does not hold.

---

## Severity Legend

| Level | Definition |
|-------|-----------|
| 🔴 Critical | Full file download possible with one command |
| 🟠 High | Protection layer bypassed entirely |
| 🟡 Medium | Information disclosure or partial bypass |
| 🔵 Low | Raises attacker cost but does not prevent attack |

---

## Findings

### VULN-01 — Unauthenticated Video Stream Endpoint
**Severity:** 🔴 Critical
**File:** `server/src/controllers/videoController.ts:87`

**Description:**
`GET /api/video/:filename` accepts any request with a valid filename and streams the full MP4 file. No authentication, no session validation, no token check of any kind.

**Exploit:**
```bash
curl http://localhost:5000/api/video/video-1234567890-000.mp4 -o stolen.mp4
```

**Impact:** Any person with network access to the server downloads any video in full. All client-side protections (DevTools lockout, keyboard blocking, focus detection) are completely irrelevant.

**Fix:** Implement signed, time-limited stream tokens. Server generates a short-lived JWT or HMAC token tied to a session; stream endpoint validates token + expiry before serving bytes.

---

### VULN-02 — Filename Enumeration via Unauthenticated List Endpoint
**Severity:** 🔴 Critical
**File:** `server/src/controllers/videoController.ts:18`

**Description:**
`GET /api/videos` returns every stored video including its `filename` field. No authentication required. This gives an attacker all filenames needed to construct download URLs for VULN-01.

**Exploit:**
```bash
# Step 1: enumerate all filenames
curl http://localhost:5000/api/videos | jq -r '.[].filename'

# Step 2: download everything
curl http://localhost:5000/api/videos | jq -r '.[].filename' | \
  xargs -I{} curl http://localhost:5000/api/video/{} -o {}
```

**Impact:** Full library exfiltration in two commands.

**Fix:** Require authentication on `/api/videos`. Do not return `filename` (internal server path) to clients — return only a video ID and derive the stream URL server-side using a signed token.

---

### VULN-03 — CORS Is Browser-Only Enforcement
**Severity:** 🔴 Critical
**File:** `server/src/app.ts:13`

**Description:**
CORS `origin: 'http://localhost:5173'` is enforced by the browser, not the server. Any non-browser HTTP client (curl, wget, Python `requests`, Postman, Insomnia) ignores CORS headers entirely and receives full responses.

**Exploit:**
```python
import requests
r = requests.get('http://localhost:5000/api/videos')
print(r.json())  # Full video list, no CORS error
```

**Impact:** CORS provides zero protection against programmatic downloads.

**Fix:** CORS is not a security mechanism — do not rely on it. Implement server-side token validation (see VULN-01 fix).

---

### VULN-04 — `Accept-Ranges` Enables Parallel Chunk Download
**Severity:** 🟠 High
**File:** `server/src/controllers/videoController.ts:119`

**Description:**
Server advertises `Accept-Ranges: bytes` and handles HTTP range requests. This is necessary for video seeking but also enables download acceleration tools to fetch the file in parallel chunks.

**Exploit:**
```bash
# aria2c fetches 16 parallel chunks and reassembles
aria2c -x 16 http://localhost:5000/api/video/video-1234567890-000.mp4
```

**Impact:** Even if naive rate limiting is added per connection, parallel range requests defeat it.

**Fix:** Bind range request tokens to a session. Each token authorizes one contiguous byte range. Parallel token reuse = 403.

---

### VULN-05 — Undocked DevTools Defeats Dimension Detection
**Severity:** 🟠 High
**File:** `client/src/hooks/useDevTools.ts:41`

**Description:**
DevTools detection compares `outerWidth/outerHeight` vs `innerWidth/innerHeight`. Both Firefox and Chrome support "undocked" DevTools — opened in a separate OS window. When undocked, the browser window dimensions are unchanged. `cssDiffW` and `cssDiffH` remain 0. `dimensionsTriggered` stays `false`.

**Steps to reproduce:**
1. Open Chrome/Firefox → F12 → click "undock into separate window" icon
2. Navigate to the player page
3. DevTools is open in a separate window; the video plays normally; no lockout

**Impact:** Primary detection mechanism fully defeated with one click.

**Fix:** Dimension detection cannot be made robust. Supplement with server-side session binding — even if the attacker bypasses detection, they cannot replay the stream URL.

---

### VULN-06 — Debugger Timing Trap Is Disableable
**Severity:** 🟠 High
**File:** `client/src/hooks/useDevTools.ts:48`

**Description:**
`new Function('debugger')()` measures elapsed time. If DevTools is open, the debugger pauses execution and elapsed > 100ms. Defeated by:

1. **Disable "Pause on debugger statements"** in DevTools settings — statement becomes a no-op
2. Open DevTools **after** page load with JS paused, re-enable before detection interval fires
3. Use a browser with no DevTools (Playwright headless) to extract network requests
4. Instrument the script at source level before it runs (via Service Worker intercept)

**Impact:** Secondary detection mechanism bypassed without affecting video playback.

---

### VULN-07 — Video URL Persists in Browser Cache After DOM Unmount
**Severity:** 🟠 High
**File:** `client/src/components/VideoPlayer.tsx:157`

**Description:**
When DevTools detection fires, the React app unmounts. However:
- The HTTP request for the video URL is already recorded in the browser's Network tab history
- The video bytes are partially or fully cached in the browser's HTTP disk cache
- The URL `http://localhost:5000/api/video/<filename>` is visible in the network panel

An attacker can: open DevTools → trigger lockout (URL appears in Network tab) → copy URL → paste in new tab or curl.

**Impact:** Lockout reveals the exact download URL.

---

### VULN-08 — OS-Level Screen Recording Bypasses Focus Detection
**Severity:** 🟠 High
**File:** `client/src/components/VideoPlayer.tsx:62`

**Description:**
Focus-loss detection fires on `window.blur`. The following recording methods never steal window focus:

| Method | Focus stolen | Detection triggered |
|--------|-------------|-------------------|
| OBS Studio (window capture) | No | No |
| OBS Studio (display capture) | No | No |
| Phone camera pointed at screen | N/A | N/A |
| Second monitor with recording on monitor 2 | No | No |
| macOS `⌘+Shift+5` (some versions) | No | No |

**Impact:** Focus detection cannot prevent physical or OS-level recording. No software solution exists for phone camera recording.

**Note:** The floating watermark is the correct mitigation here — it survives into the recording and identifies the leaking user.

---

### VULN-09 — Browser Extensions Bypass All Page-Level Protections
**Severity:** 🟠 High

**Description:**
Chrome/Firefox extensions run in a separate process with elevated privileges above page scripts. The following extension-based attacks are undetectable:

- **Screen recording extensions** (Screencastify, Loom, Vidyard) — capture tab media stream from extension context; `window.blur` is never triggered
- **`getDisplayMedia()` from extension** — captures tab as `MediaStream` and pipes to recording API
- **Keyboard event interception** — extensions can intercept keyboard events before page scripts see them, bypassing `capture: true` listeners in `useKeyboardProtection.ts`

**Impact:** All client-side protections (keyboard, right-click, focus, DevTools) can be circumvented by installing a browser extension.

---

### VULN-10 — Plaintext HTTP — Network Traffic Capturable
**Severity:** 🟡 Medium

**Description:**
Server runs on plain HTTP. On a shared network (office WiFi, same LAN), Wireshark or tcpdump captures the raw MP4 bytes in transit — no browser required, no client-side protection triggered.

```bash
# Attacker on same network
tcpdump -i eth0 -w capture.pcap host 192.168.1.x port 5000
# Extract video stream from pcap
```

**Fix:** Deploy behind HTTPS (TLS). Even a self-signed cert prevents passive capture. In production, use a reverse proxy (nginx, Caddy) with a real certificate.

---

### VULN-11 — `video.src` Attribute Exposed in DOM
**Severity:** 🟡 Medium
**File:** `client/src/components/VideoPlayer.tsx:157`

**Description:**
`<video src={src}>` sets the full URL as a DOM attribute. Readable via:
- Browser console: `document.querySelector('video').src`
- Any extension with DOM access
- DevTools Elements tab (before lockout fires)

The URL is the direct download link — no further enumeration needed.

---

### VULN-12 — Chrome Remote Debugging (USB) Bypasses Mobile Detection
**Severity:** 🟡 Medium
**File:** `client/src/hooks/useDevTools.ts:37`

**Description:**
Mobile detection disables dimension checks to avoid virtual-keyboard false positives. However, Android USB debugging via `chrome://inspect` exposes the full DevTools on the desktop machine — network tab, DOM, console — while the phone shows no visible DevTools panel. `dimensionsTriggered` = false, `debuggerTriggered` may be false depending on timing.

**Impact:** Mobile playback fully inspectable with no detection.

---

### VULN-13 — Unauthenticated Sync Endpoint
**Severity:** 🔵 Low
**File:** `server/src/controllers/videoController.ts:137`

**Description:**
`POST /api/sync` is publicly accessible. Not a direct download vector, but confirms server is running and leaks internal operational behavior.

**Fix:** Gate behind authentication or remove from production builds.

---

## Attack Chain Summary

Minimum effort to download a video (no browser, no extensions, 3 commands):

```bash
# 1. Enumerate filenames (VULN-02)
FILENAME=$(curl -s http://localhost:5000/api/videos | jq -r '.[0].filename')

# 2. Download full file (VULN-01 + VULN-03)
curl http://localhost:5000/api/video/$FILENAME -o video.mp4

echo "Downloaded: $FILENAME"
```

---

## Recommended Fixes by Priority

### Priority 1 — Server-Side (blocks all programmatic download attacks)

| Fix | Blocks |
|-----|--------|
| Add authentication (JWT/session) to all `/api/*` endpoints | VULN-01, VULN-02, VULN-03, VULN-13 |
| Signed, expiring stream tokens (HMAC + TTL + IP binding) | VULN-01, VULN-04, VULN-07 |
| Remove `filename` from `/api/videos` response; return opaque ID only | VULN-02 |
| Deploy with HTTPS / reverse proxy with TLS | VULN-10 |
| Rate limiting per IP / per token | VULN-04 |

### Priority 2 — Client-Side (raises bar, cannot fully prevent)

| Fix | Blocks |
|-----|--------|
| Use MSE (Media Source Extensions) with encrypted segments instead of raw `<video src>` | VULN-11 |
| Serve video in chunks via fetch + `URL.createObjectURL` (no persistent `src`) | VULN-11 |
| Watermark includes user ID / session ID (already implemented) | VULN-08 (identifies leaker) |

### Priority 3 — Accept as Residual Risk

| Attack | Reason no fix exists |
|--------|---------------------|
| Phone camera recording | Physical layer — no software solution |
| Browser extension recording | Extension sandboxes have OS-level access |
| OS screen recording without focus steal | OS privilege above browser |

---

## Inherent Limitations of Browser-Level DRM

This prototype demonstrates browser-level protection techniques. True DRM (Widevine, FairPlay, PlayReady) operates at the hardware/OS level — the decrypted video frames never exist in accessible memory. Browser-level protection cannot match this because:

1. JavaScript runs in a sandbox the user controls
2. The browser itself is user software — its behavior can be modified
3. The rendered pixels are always accessible to OS-level tools
4. HTTP traffic without TLS is plaintext on the wire

**Practical recommendation:** For production content protection, use a CDN with token-authenticated HLS/DASH streams (e.g., Cloudflare Stream, Mux, AWS MediaPackage) combined with Widevine/FairPlay. Use this app's client-side protections as a deterrence layer on top, not as the primary mechanism.

---

*End of report. All findings are based on self-audit of own codebase for defensive improvement purposes.*
