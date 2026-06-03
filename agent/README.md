# DRMShield Localhost Agent

The localhost agent is the Phase 3 proctoring component of DRMShield. It is a
small, standalone program that a student runs on their own machine while
watching protected content in the DRMShield web player. Its job is to detect
whether a screen recorder is running and to report that fact to the browser so
that the player can refuse to play protected video while a capture tool is
active.

## What it does and why

Client-side DRM in the browser cannot see other applications on the user's
computer. A student can simply open OBS Studio or Bandicam alongside the player
and record the screen. The localhost agent closes part of that gap. It runs
outside the browser sandbox, enumerates the running processes on the machine,
and matches them against a list of known screen-recorder signatures. The web
player queries the agent before playback; if a recorder is detected, the player
blocks playback and warns the user.

This raises the bar for casual screen capture. It is deliberately **not** an
absolute guarantee — see the limitations section below.

## The localhost:7891 contract with the player

The agent listens on `127.0.0.1:7891` and exposes a tiny, read-only HTTP API.
The browser-based player calls it as follows:

- **The agent is running and clean.** The player receives a `200` response with
  `clean: true` and proceeds with playback.
- **The agent is running and a recorder is detected.** The player receives
  `clean: false` and a non-empty `recorders` array, and blocks playback.
- **The agent is not installed or not running.** The browser's `fetch` fails
  with a connection-refused error. The player interprets this as "agent
  missing" and shows an install prompt.

Because the player runs from a different origin (the Vite dev server on
`http://localhost:5173` by default), every response from the agent includes the
CORS headers required for the browser to read it.

## How to run it

The agent uses only the Python 3 standard library. There are no `pip`
dependencies and no install step.

```bash
python3 agent.py
```

You should see a startup banner reporting the listening address, the detected
platform, and the number of recorder signatures that were loaded. Press
`Ctrl+C` to stop the agent cleanly.

## Environment variables

| Variable               | Default                  | Description                                                        |
|------------------------|--------------------------|--------------------------------------------------------------------|
| `AGENT_HOST`           | `127.0.0.1`              | Interface to bind. Keep this on loopback for safety.               |
| `AGENT_PORT`           | `7891`                   | TCP port to listen on. Must match what the player expects.         |
| `AGENT_ALLOWED_ORIGIN` | `http://localhost:5173`  | The browser origin permitted to read responses via CORS.           |

Example:

```bash
AGENT_PORT=7891 AGENT_ALLOWED_ORIGIN=http://localhost:5173 python3 agent.py
```

## Endpoints

### `GET /status`

Returns the agent's view of the machine, including any detected recorders.

```json
{
  "installed": true,
  "version": "1.0.0",
  "platform": "linux",
  "recorders": ["OBS Studio", "Bandicam"],
  "clean": false,
  "checkedAt": "2026-06-04T09:30:00Z"
}
```

When no recorder is found, `recorders` is an empty array and `clean` is `true`.
The `platform` field is normalized to one of `linux`, `darwin`, or `win32`.

### `GET /health`

A simple liveness probe.

```json
{ "ok": true }
```

### Other paths

Any other path returns `404` with `{ "error": "not found" }`. `OPTIONS`
requests (browser CORS preflight) return `204` with the CORS headers and no
body.

## How `recorders.json` works and how to extend it

The agent loads its detection signatures from `recorders.json`, located in the
same directory as `agent.py`. The file contains a single `signatures` array.
Each entry has a human-readable `name` and a `match` array of lowercase
substrings:

```json
{
  "signatures": [
    { "name": "OBS Studio", "match": ["obs", "obs64", "obs-studio"] },
    { "name": "Bandicam",   "match": ["bandicam", "bdcam"] }
  ]
}
```

For every running process, the agent normalizes the process name (it strips the
directory path and any `.exe` suffix and lowercases the result) and checks
whether any `match` substring appears within it. If a match is found, the
signature's `name` is added to the reported `recorders` list. The result is
sorted and de-duplicated, so each recorder appears at most once.

To add a new recorder, append another entry to the `signatures` array with the
process-name fragments you expect to see. Matching is case-insensitive and
substring-based, so short, distinctive fragments work best. If `recorders.json`
is missing or unreadable, the agent falls back to a small built-in default list
so that it still runs.

## Platform support

The agent enumerates processes using the operating system's native tooling:

- **Windows** (`platform.system() == "Windows"`): it runs `tasklist` and parses
  the image names from the CSV output.
- **macOS and Linux**: it runs `ps -axco comm`, falling back to `ps -eo comm` if
  the first form is unavailable.

If process enumeration fails for any reason, the agent logs a warning to
standard error and reports an empty `recorders` list rather than crashing.

## Known limitations

The agent runs with the user's own privileges on the user's own machine, so a
determined user can stop it, block its port, or rename a recorder's executable
to evade the signature list. Detection of NVIDIA ShadowPlay in particular is
best-effort, because its capture is driven by background driver components
rather than an obviously named recording process. Treat the agent as a measure
that deters casual capture and raises the overall cost of recording — not as an
unbreakable control.
