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
