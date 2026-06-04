# ARQX Atlas agent — Go port

> Built by ARQX Atlas.

A single static binary (Go) of the DRMShield endpoint protection agent. Same HTTP contract (`:7891`, `/status` + `/health`, CORS) and the same `signatures.json` format as the [Python agent](../agent/README.md), verified at parity — including the localized (`__MSG_`) browser-extension name resolution.

## Why Go (vs the Python agent)

- **One static binary, no runtime** — nothing to install on the target (the Python agent needs `python3`).
- **Cross-compiles to every OS from one machine** — `build-all.sh` produces Windows `.exe`, macOS (Intel + Apple Silicon), and Linux binaries in one step (no per-OS PyInstaller).
- **Harder to casually tamper with** than an editable `.py`.

It is still **user-space** — same scope and limits as the Python agent (detects and blocks playback; cannot prevent the OS compositor's own capture). See [`../SECURITY.md`](../SECURITY.md).

## Build & run

```bash
# this host
go build -o arqx-agent .
./arqx-agent                      # serves http://127.0.0.1:7891

# all platforms at once → dist/
./build-all.sh
```

Standard library only — no `go mod download`, no network, no CGO.

### Configuration

Same env vars as the Python agent: `AGENT_HOST` (default `127.0.0.1`), `AGENT_PORT` (`7891`), `AGENT_ALLOWED_ORIGIN` (`http://localhost:5173`).

### Signatures

`signatures.json` is **embedded** in the binary (`go:embed`), so the binary is self-contained. To customize without rebuilding, drop a `signatures.json` next to the binary — it overrides the embedded copy. This file mirrors [`../agent/signatures.json`](../agent/signatures.json); keep them in sync.

## Detection

Identical to the Python agent: running recorder/snipping/downloader **processes**, downloader/recorder/capture **browser extensions** (by id and manifest-name keyword, including localized names), hardware **capture devices**, and **active OS screen recording** on Linux (open-fd on a screencast file, with mtime fallback).
