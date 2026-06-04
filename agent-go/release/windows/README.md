# ARQX Atlas agent — Windows

A ready-to-run Windows build of the agent (single `.exe`, no Python/runtime needed).

## Run it
Double-click `arqx-agent-windows-amd64.exe`, or from a terminal:
```
arqx-agent-windows-amd64.exe
```
It serves on `http://127.0.0.1:7891` (same `/status` + `/health` contract as Linux/macOS).

## Auto-start at logon (recommended)
Right-click PowerShell → **Run as Administrator**, then from this folder:
```powershell
./install-windows.ps1
```
This registers a logon scheduled task (runs in your user session, so per-user detection works) and starts it now. Uninstall: `Unregister-ScheduledTask -TaskName ArqxAtlasAgent -Confirm:$false`.

## What it detects on Windows
- Running **screen recorders / snipping tools / downloaders** (via `tasklist`) — 118 signatures in `signatures.json` (edit it to add more; it overrides the embedded copy).
- **Capture devices** (via PowerShell `Get-PnpDevice`).
- Capture/downloader **browser extensions** (Chrome/Edge/Brave/Chromium).

## Honest limits on Windows
- **Active screen recording** (open-fd) and **screen sharing** (PipeWire) detection are **Linux-only** — those use `/proc` and PipeWire, which don't exist on Windows. Catching live Windows capture would need different OS APIs (a future addition).
- Still **user-space** — killable, detect-and-blackout, not kernel/Vanguard.

## Configure
Set the player origin if it isn't `http://localhost:5173`:
```
set AGENT_ALLOWED_ORIGIN=http://localhost:5180
arqx-agent-windows-amd64.exe
```
(The agent also auto-allows any `localhost` origin, so this is usually unnecessary.)
