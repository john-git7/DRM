# ARQX Atlas Go agent — packaging & always-on install

The Go agent is a single static binary (no runtime dependency). It cross-compiles to
every OS from one machine (`../build-all.sh` → `../dist/`), and installs as an
**always-on autostart service** so it can't be "not running" when content is viewed.

> Honest scope: this is a **user-space** service. "Loads at boot / login" is the
> closest equivalent to how Vanguard's kernel driver loads — but it is **not**
> kernel-level, and a user with admin/root can still stop it. It detects and lets the
> player black out; it cannot make the OS itself refuse to record. See `../../SECURITY.md`.

## What can be built where

| Target | Format | Built & verified in CI here? | How |
|--------|--------|------------------------------|-----|
| Linux  | **`.deb`** (boot-start systemd service) | **Yes** | `bash packaging/build-deb.sh` (`ARCH=arm64` for arm) |
| Linux/macOS | user install | yes (script) | `sh packaging/install-macos.sh` / the `.deb` |
| Windows | `.exe` + logon task | binary yes; installer = run on Windows | `packaging/install-windows.ps1` (as Admin) |
| Windows | **`.msi`** | scaffold | `packaging/arqx-agent.wxs` → WiX (`candle`/`light`) or `wixl` |
| macOS  | **`.dmg`** | scaffold (needs macOS `hdiutil`) | `packaging/build-dmg.sh` |

The `.exe`, macOS, and Linux **binaries** are all real and cross-compiled here; only
the Linux `.deb` is fully built+verified in this environment (no WiX/hdiutil/NSIS).

## Autostart per OS

- **Linux (`.deb`)** — installs a systemd **system** service (`multi-user.target`,
  boot-start), auto-enabled on install. Note: as a root service it sees all processes,
  active recordings, and capture devices, but **not** per-user browser-extension dirs;
  for full extension detection also run it per-user (`../../agent/install.sh`) or set
  it up as a `systemd --user` service.
- **Windows** — `install-windows.ps1` registers a **logon scheduled task** (runs in the
  user session, so per-user detection works). The `.msi` uses an `HKCU…\Run` entry.
- **macOS** — `install-macos.sh` installs a **LaunchAgent** that starts at login.

## Tray / taskbar icon

See `../tray/`. It shows the ARQX logo in the tray and runs the agent. It needs a GUI
toolkit (CGO + GTK on Linux, Cocoa on macOS), so it is **built on the target machine**,
not cross-compiled, and was **not** verified in this headless environment.

## Making the player require the agent

The player already refuses to play when the agent is unreachable (it shows
"Security Agent Required"). With the agent installed as an autostart service, that
gap closes for normal users.
