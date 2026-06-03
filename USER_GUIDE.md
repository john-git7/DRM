# DRMShield User Guide

This guide explains how to set up, run, and use DRMShield — a secure video player that encrypts content, gates playback behind authentication and a recorder-detection agent, and watermarks every session.

## Contents

1. [Prerequisites](#1-prerequisites)
2. [First-time setup](#2-first-time-setup)
3. [Running the application](#3-running-the-application)
4. [Using the app](#4-using-the-app)
5. [The security agent](#5-the-security-agent)
6. [What each protection does](#6-what-each-protection-does)
7. [Managing who can watch what](#7-managing-who-can-watch-what)
8. [Reading the audit log](#8-reading-the-audit-log)
9. [Troubleshooting](#9-troubleshooting)

---

## 1. Prerequisites

- **Node.js 20+** and **pnpm** (the project standardizes on pnpm).
- **FFmpeg** on your `PATH` — the server shells out to `ffmpeg` to encrypt uploads. Verify with `ffmpeg -version`.
- **Python 3** — to run the localhost recorder-detection agent (standard library only, no packages to install).

---

## 2. First-time setup

Install dependencies for both projects:

```bash
cd server && pnpm install
cd ../client && pnpm install
```

Create the server's secrets file:

```bash
cd server
cp .env.example .env
```

Edit `server/.env` and fill in every value. Generate the two secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

```env
JWT_SECRET=<paste a generated value>
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<choose a strong password>
STREAM_SECRET=<paste a different generated value>
```

The server **will not start** if any of these four are missing. `ADMIN_PASSWORD` is bcrypt-hashed in memory at startup and never stored in plaintext.

---

## 3. Running the application

DRMShield has three processes. Run each in its own terminal.

```bash
# Terminal 1 — backend API (port 5000)
cd server && pnpm dev

# Terminal 2 — web client (port 5173)
cd client && pnpm dev

# Terminal 3 — recorder-detection agent (port 7891)
cd agent && python3 agent.py
```

Then open **http://localhost:5173** in your browser. You will be redirected to the login page.

> If your client runs on a port other than 5173, start the server with `CLIENT_ORIGIN=http://localhost:<port>` and the agent with `AGENT_ALLOWED_ORIGIN=http://localhost:<port>` so cross-origin requests are allowed.

---

## 4. Using the app

### Log in

Enter the `ADMIN_USERNAME` and `ADMIN_PASSWORD` you configured. A successful login stores a JWT (valid 24 hours) and takes you to the library.

### Upload a video

1. Go to **Upload**.
2. Drag in or select an **MP4** file (other formats are rejected; the limit is 100 MB).
3. After upload, the server encrypts the video in the background. Its status moves from **processing** to **ready**. Large files take longer because every segment is re-encoded and encrypted.

### Watch a video

1. Open a video from the **Library**.
2. The player first checks the security agent and authorizes playback:
   - If the agent reports a recorder is running, or the agent is not installed, playback is **blocked** with an explanation.
   - If everything is clear, the encrypted stream loads and plays.
3. Use the custom controls to play, pause, seek, adjust volume, and go fullscreen. The right-hand **Security Monitor** panel shows live protection status and lets you toggle individual layers for demonstration.

---

## 5. The security agent

The agent is a small program that runs on the viewer's own machine and tells the browser whether a screen recorder is active. The player calls it before playback and periodically during the session.

- **Start it:** `cd agent && python3 agent.py` (listens on `http://localhost:7891`).
- **Check it:** open `http://localhost:7891/status` — you should see `"clean": true` when no recorder is running.
- **What it detects:** OBS, Bandicam, Camtasia, NVIDIA ShadowPlay, Fraps, Dxtory, and several others (see `agent/recorders.json`). To detect additional tools, add a signature to that file and restart the agent.
- **If the agent is not running:** the player shows "Security Agent Required" and blocks playback until you start it and retry.

See [`agent/README.md`](./agent/README.md) for full details and configuration options.

---

## 6. What each protection does

| Protection | What you'll see | Purpose |
|-----------|------------------|---------|
| AES-128 encryption | Nothing — it's transparent | Content on disk/CDN is unplayable without the key |
| Key grant | A brief "Authorizing secure playback…" | The key is released only to an enrolled user, device, and IP, for 30 seconds |
| Recorder agent | "Screen Recorder Detected" / "Security Agent Required" block | Stops playback while a recorder runs |
| DevTools detection | Black/torn-down player when DevTools open | Prevents frame inspection |
| Focus / tab pause | Playback pauses when you switch windows or tabs | Deters off-screen capture |
| Moving watermark | Your identity + time, repositioning every 5s | Burns identity into any recording |
| Forensic watermark | A faint pattern across the frame | Traces a leak back to a user even if cropped |
| No download / no PiP | Download and Picture-in-Picture options are absent | Removes easy export paths |

You can toggle several of these from the **Security Monitor** panel during playback to see their effect.

---

## 7. Managing who can watch what

Enrollment controls which users may decrypt which videos. It lives in `server/data/enrollments.json`, created on first run with the admin user enrolled in everything:

```json
{ "admin": "*" }
```

- `"*"` means "enrolled in all videos."
- To restrict a user to specific videos, list their ids instead: `{ "alice": ["video-123.mp4", "video-456.mp4"] }`.
- A user with no entry is not enrolled and cannot obtain a key grant (the player shows "Not enrolled in this content").

Edit the file and the change takes effect on the next key-grant request (no restart needed).

---

## 8. Reading the audit log

Every session writes records to `server/data/audit-log.json`. Each entry includes the timestamp, username, IP, device fingerprint, event type, and (where relevant) the recorder-agent status and watch time. Event types include `key-grant-issued`, `agent-check`, `playback-start`, `playback-blocked`, `watch-heartbeat`, and `devtools-lockout`. Use this log to see who watched what, from where, and under what conditions — and as the starting point for tracing a leak alongside the forensic watermark.

---

## 9. Troubleshooting

| Symptom | Likely cause and fix |
|---------|----------------------|
| Server won't start, logs `… env var is required` | A required secret is missing in `server/.env`. Fill in `JWT_SECRET`, `STREAM_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`. |
| Upload fails with 415 | The file isn't a valid MP4 (checked by extension and magic bytes). Convert to MP4. |
| Video stuck on "Encrypting Video" | FFmpeg isn't installed or not on `PATH`, or the transcode failed. Check `ffmpeg -version` and the server logs. |
| "Security Agent Required" even though it's running | The agent's allowed origin doesn't match the client's URL. Start the agent with `AGENT_ALLOWED_ORIGIN=http://localhost:<client port>`. |
| Playback blocked as "Screen Recorder Detected" | A matching process is running. Close it, or check `agent/recorders.json` for a false positive. |
| "Not enrolled in this content" | Add the user (or `"*"`) to `server/data/enrollments.json`. |
| Player shows a stream error after ~30s of idle | The key grant expired before playback started. Reload the page to mint a fresh grant. |
| CORS errors in the browser console | The client isn't on the origin the server/agent allow. Align `CLIENT_ORIGIN` and `AGENT_ALLOWED_ORIGIN` with the client's URL. |

For the security design and the known limitations of browser-based DRM, see [`SECURITY.md`](./SECURITY.md).
