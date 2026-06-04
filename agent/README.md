# ARQX Atlas — DRMShield endpoint protection agent

> Built by ARQX Atlas.

A small, standalone agent that a viewer runs on their own machine while watching protected content in the DRMShield web player. It listens on `localhost:7891` and exposes a read-only HTTP API. Before playback the browser-based player calls this agent; if a capture threat is detected, playback is blocked. If the agent is not running, the player shows an "install the agent" prompt.

It is **Python 3 standard library only** — no pip dependencies and no install step. It runs with a bare `python3 agent.py` on Windows, macOS, and Linux.

## What it detects

The `/status` response reports threats in four categories, and a single `clean` boolean that is `true` only when **nothing** was detected:

1. **Running processes** — screen recorders (OBS, Streamlabs, Bandicam, Camtasia, NVIDIA ShadowPlay, Fraps, Dxtory, ShareX, Snagit, and more), the **Windows Snipping Tool / Snip & Sketch** and other screenshot tools, and **video downloaders** (Internet Download Manager, yt-dlp/youtube-dl, JDownloader, 4K Video Downloader, ffmpeg, VLC stream dump, and others).
2. **Browser extensions** — known video-downloader / screen-recorder / stream-capture add-ons installed in Chrome, Edge, Brave, Chromium, Opera, Vivaldi, and Firefox, matched by extension id and by manifest-name keywords.
3. **Hardware capture devices** — HDMI/USB capture cards (Elgato, AVerMedia, Magewell, Blackmagic/DeckLink, Epiphan, Razer Ripsaw, and others) enumerated from the OS device tree.

All signatures live in [`signatures.json`](./signatures.json) and can be extended without touching the code.

## Running the agent

```bash
python3 agent.py
```

It prints a startup banner and serves on `http://127.0.0.1:7891`.

### Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `AGENT_HOST` | `127.0.0.1` | Bind address |
| `AGENT_PORT` | `7891` | Bind port |
| `AGENT_ALLOWED_ORIGIN` | `http://localhost:5173` | CORS origin allowed to read `/status` (set to the player's URL) |

## API

### `GET /status`

```json
{
  "installed": true,
  "version": "2.0.0",
  "brand": "ARQX Atlas",
  "platform": "linux",
  "recorders": ["OBS Studio"],
  "downloaders": ["yt-dlp / youtube-dl"],
  "captureDevices": ["Elgato Cam Link 4K"],
  "extensions": ["Video DownloadHelper"],
  "threats": [
    { "category": "Screen recorder", "name": "OBS Studio" },
    { "category": "Browser extension", "name": "Video DownloadHelper" }
  ],
  "clean": false,
  "checkedAt": "2026-06-04T00:00:00Z"
}
```

`clean` is `true` only when every category is empty. The player blocks playback whenever `clean` is `false`.

### `GET /health`

```json
{ "ok": true, "brand": "ARQX Atlas", "version": "2.0.0" }
```

Every response carries CORS headers and `Cache-Control: no-store`. The agent echoes the request `Origin` only when it matches `AGENT_ALLOWED_ORIGIN`; otherwise it returns the configured default. Unknown paths return `404`, and `OPTIONS` preflight returns `204`.

## Extending detection

Edit [`signatures.json`](./signatures.json):

- `processes` — categorized lists of `{ "name", "match": [...] }`. A process matches when one of its `match` tokens appears in the process name on a word boundary (so "obsidian" does not match the "obs" recorder signature).
- `captureDeviceKeywords` — substrings matched against enumerated video-device names.
- `extensions.ids` — a map of browser-extension id → display name (exact-id match).
- `extensions.keywords` — substrings matched against extension manifest names.

Restart the agent after editing.

## Packaging

The agent can be packaged into native installers for distribution. See [`PACKAGING.md`](./PACKAGING.md) for building:

- **Windows** — `.exe` (PyInstaller) and `.msi` (WiX/Inno Setup)
- **Linux** — `.deb` (dpkg) and a self-contained `install.sh`
- **macOS** — `.app` bundle and `.dmg`

## Scope and limitations

This is a **user-space** agent. It raises the cost of casual capture and leaves forensic traces, but a determined user with administrative/root control can kill or spoof it, and it can detect — but not prevent — a capture in progress. True kernel-level capture prevention (blocking the OS frame buffer / a protected video path) requires a signed kernel driver or hardware DRM (Widevine L1, PlayReady SL3000, Android `FLAG_SECURE`, iOS screen-capture APIs), which is out of scope for this prototype. The agent therefore **blocks playback** rather than terminating user processes; see [`../SECURITY.md`](../SECURITY.md).
