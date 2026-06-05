# Installing the ARQX Atlas Agent

The ARQX Atlas agent is a small background service that the DRMShield player requires before it will play protected content. It listens only on `http://127.0.0.1:7891` (localhost) and reports whether a screen recorder, downloader, or capture device is active. When the agent is missing or a recorder is running, the player blocks playback.

This guide is for **end users installing the agent**. For building the installers from source, see [`PACKAGING.md`](./PACKAGING.md).

The agent runs on **Windows, macOS, and Linux**. Pick your platform below.

---

## What you are installing

- A localhost HTTP service on port **7891** with two endpoints: `GET /health` and `GET /status`.
- A small **system-tray / menu-bar icon** (the "ARQX Atlas" logo) that shows the agent is running and lets you quit it.
- An **autostart** entry so the agent starts when you log in.

The headless detector needs no third-party libraries. The tray icon uses `pystray` + `Pillow`; the prebuilt packages below bundle everything, so you do **not** need Python installed.

---

## Windows

### Option A — Installer (recommended)

1. Download **`arqx-atlas-agent-<version>-setup.exe`**.
2. Double-click it. It installs per-user to `%LOCALAPPDATA%\ARQX Atlas Agent` (no administrator rights required), adds itself to startup, and launches immediately.
3. If SmartScreen warns about an unrecognized publisher (the build is unsigned), choose **More info → Run anyway**.

**Uninstall:** Settings → Apps → *ARQX Atlas Agent* → Uninstall, or run `%LOCALAPPDATA%\ARQX Atlas Agent\uninstall.exe`.

### Option B — Portable ZIP (no installer)

1. Download and unzip **`arqx-atlas-agent-<version>-win-amd64.zip`** anywhere.
2. Double-click **`install.bat`** (per-user install + autostart), or just run **`launch-tray.vbs`** to start it once without installing.

**Uninstall:** run `uninstall.bat` from the install folder.

### Verify

Open <http://127.0.0.1:7891/health> in a browser — you should see a small JSON response. The tray icon also appears near the clock.

---

## macOS

macOS ships with `python3` (via the Xcode Command Line Tools — run `xcode-select --install` once if needed).

### Option A — Script install (recommended)

```bash
cd agent
sh install.sh
```

This copies the agent into `~/.local/share`, registers a **LaunchAgent** so it starts at login, and launches it now.

**Uninstall:**

```bash
cd agent
sh uninstall.sh
```

### Option B — App bundle

If a signed `.app`/`.dmg` is provided, drag it to **Applications** and allow it to run at login. Because prototype builds are unsigned, Gatekeeper may require **System Settings → Privacy & Security → Open Anyway** the first time.

### Verify

```bash
curl http://127.0.0.1:7891/health
```

The ARQX Atlas icon also appears in the menu bar.

---

## Linux

### Option A — Debian/Ubuntu package (system service)

```bash
sudo apt install ./arqx-atlas-agent_<version>_all.deb
sudo systemctl enable --now arqx-atlas-agent
```

The package depends only on the system `python3`. The desktop variant (`arqx-atlas-agent-desktop_*.deb`) additionally installs the tray icon and a login-autostart entry.

**Uninstall:** `sudo apt remove arqx-atlas-agent`.

### Option B — Script install (no root, any distro)

```bash
cd agent
sh install.sh        # installs to ~/.local/share + a systemd *user* unit (autostart)
sh uninstall.sh      # removes it
```

### Option C — Run it directly (no install)

```bash
cd agent
python3 agent.py     # headless detector on :7891 (Ctrl+C to stop)
# or, with the tray icon:
pip install -r requirements.txt && python3 tray.py
```

### Verify

```bash
curl http://127.0.0.1:7891/health
systemctl --user status arqx-atlas-agent   # for the user-unit install
```

---

## After installing

- The player's **Security Monitor** should show the recorder agent as **CLEAN** once the agent is running.
- Updating detections is just editing `signatures.json` next to the agent — no reinstall needed for the script/zip installs (a frozen `.exe`/binary must be rebuilt).

## Troubleshooting

| Symptom | Fix |
|---|---|
| Player says "Security Agent Required" | The agent isn't running. Start it (tray app / `systemctl --user start arqx-atlas-agent`) and retry. |
| `http://127.0.0.1:7891/health` doesn't respond | Another process may hold port 7891, or the agent crashed. Check the tray icon; on Linux run `python3 agent.py` to see logs. |
| Port 7891 already in use | Stop the other process, or set `AGENT_PORT` in the environment before launch (the player expects 7891 by default). |
| Windows SmartScreen / macOS Gatekeeper warning | Builds are unsigned in this prototype — choose *Run anyway* / *Open Anyway*. For production, sign the installer (Authenticate / Apple Developer ID). |
| Playback still blocked with agent running | A real recorder/capture tool is active — that's the agent working. Close it and click Retry. |

## Removing the agent completely

Use the platform's uninstall step above. That stops the service, removes the autostart entry, and deletes the installed files. On Windows the per-user install lives in `%LOCALAPPDATA%\ARQX Atlas Agent`; on macOS/Linux the script installs to `~/.local/share` plus a LaunchAgent / systemd user unit.
