# Packaging the ARQX Atlas agent

The agent is a single Python script with no third-party dependencies, so it can be shipped either as a Python-dependent package (small, requires `python3` on the target) or as a self-contained binary built with [PyInstaller](https://pyinstaller.org) (larger, no Python needed). PyInstaller builds for the **host OS only** — build each platform's artifact on that platform.

All build scripts write to `agent/dist/` (gitignored).

## Linux — `.deb` and `install.sh`

**Debian/Ubuntu package** (depends on system `python3`, no PyInstaller needed):

```bash
cd agent
bash packaging/build-deb.sh        # → dist/arqx-atlas-agent_2.0.0_all.deb
sudo apt install ./dist/arqx-atlas-agent_2.0.0_all.deb
sudo systemctl enable --now arqx-atlas-agent
```

**Self-contained user install** (any Linux/macOS, no root):

```bash
cd agent
sh install.sh        # installs to ~/.local/share and enables autostart (systemd user unit)
sh uninstall.sh      # removes it
```

**Standalone ELF binary** (no Python on target):

```bash
pip install pyinstaller
cd agent && pyinstaller packaging/agent.spec --distpath dist --workpath build
# → dist/arqx-atlas-agent
```

## Windows — `.exe` and installer

```powershell
pip install pyinstaller
cd agent
./packaging/build-windows.ps1
# → dist/arqx-atlas-agent.exe  (+ dist/arqx-atlas-agent-setup.exe if Inno Setup is installed)
```

For an `.msi`, use the [WiX Toolset](https://wixtoolset.org) against `dist/arqx-atlas-agent.exe`, or Inno Setup for a setup `.exe` (the script emits an `installer.iss` automatically when `iscc` is on `PATH`).

### Portable embeddable-Python bundle (no Python on target, cross-built from Linux)

Unlike PyInstaller, this path needs **no Windows machine** — it assembles a portable [embeddable Python](https://docs.python.org/3/using/windows.html#the-embeddable-package) with the tray's dependencies baked in. The embeddable Python is just a zip of a portable interpreter; the dependencies are installed by downloading their **Windows wheels** and unzipping them into `Lib\site-packages` (a wheel is a zip), so `python.exe` is never executed on the build host.

```bash
cd agent
bash packaging/build_bundles.sh
# → dist/arqx-atlas-agent-2.0.0-win-amd64.zip   (~18 MB, self-contained)
```

Environment overrides: `ARCHES="amd64 win32"` builds several architectures, `PY_VER=3.12.7` pins the interpreter, and `REBUILD=1` rebuilds the cached runtime. `make-winpy.sh` builds just the runtime (`build/winpy-<arch>/`) if you want it on its own.

The zip unpacks to:

```
arqx-atlas-agent-<ver>-win-<arch>/
  python/            portable Python + pystray + Pillow
  app/               agent.py, tray.py, signatures.json, arqx-logo.png, requirements.txt
  install.bat        per-user install to %LOCALAPPDATA% + Startup autostart (no admin)
  uninstall.bat      stop the agent, remove autostart, delete the install
  run-agent.bat      run the headless detector with a console (debugging)
  launch-tray.vbs    silent tray launcher (pythonw, no console window)
  installer.iss      optional Inno Setup script for a real setup.exe (compile with iscc)
```

On the target, the recipient either runs **`install.bat`** (no admin rights — copies to `%LOCALAPPDATA%\ARQX Atlas Agent`, adds a Startup shortcut to the silent launcher, and starts it) or compiles **`installer.iss`** with Inno Setup for a polished `setup.exe`. Both autostart the tray at login and leave the agent serving on `http://127.0.0.1:7891`. Updating `signatures.json` in `app/` does not require a rebuild.

Prerequisites on the build host: `curl`, `unzip`, `zip`, and `python3` with `pip` (used only to fetch the Windows wheels).

## macOS — `.app` / `.dmg`

```bash
pip3 install pyinstaller
cd agent
./packaging/build-macos.sh
# → dist/arqx-atlas-agent-<ver>.dmg
```

To run at login, copy the binary into `~/Applications` and add a launchd `LaunchAgent` (the cross-platform `install.sh` does this automatically when run on macOS).

## What gets bundled

Every package includes `agent.py`, `signatures.json`, and `arqx-logo.png`. Update `signatures.json` to add detections; no rebuild of the binary is required for the `.deb` / `install.sh` (script-based) packages, but a PyInstaller binary must be rebuilt because the data files are embedded.

## Signing and notarization

For real distribution, sign the Windows `.exe`/`.msi` (Authenticode) and notarize the macOS `.dmg` (Apple Developer ID). Unsigned builds will trigger SmartScreen / Gatekeeper warnings. Signing is out of scope for this prototype.
