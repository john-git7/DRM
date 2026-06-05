#!/usr/bin/env bash
#
# build_bundles.sh — assemble the portable Windows agent bundle(s) from the
# embeddable-Python runtime (make-winpy.sh) + the agent scripts + launchers, and
# zip them into agent/dist/. Cross-builds from Linux/macOS; no Windows needed.
#
# Output per arch:  agent/dist/arqx-atlas-agent-<ver>-win-<arch>.zip
#   <bundle>/python/            portable Python + pystray + Pillow
#   <bundle>/app/               agent.py tray.py signatures.json arqx-logo.png ...
#   <bundle>/install.bat        per-user install + autostart (no admin)
#   <bundle>/uninstall.bat
#   <bundle>/run-agent.bat      headless, with console (debugging)
#   <bundle>/launch-tray.vbs    silent tray launcher
#   <bundle>/installer.iss      optional Inno Setup script (compile with iscc on Windows)
#
# Usage:
#   bash packaging/build_bundles.sh
# Env overrides:
#   ARCHES="amd64 win32"   PY_VER=3.12.7   REBUILD=1  (force rebuild of the runtime)
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
AGENT_DIR="$(dirname "$HERE")"
DIST="$AGENT_DIR/dist"
BUILD="$AGENT_DIR/build"
ARCHES="${ARCHES:-amd64}"

VERSION="$(grep -E '^VERSION[[:space:]]*=' "$AGENT_DIR/agent.py" | head -1 | cut -d'"' -f2)"
[ -n "$VERSION" ] || { echo "[bundle] could not read VERSION from agent.py" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || { echo "[bundle] missing required tool: $1" >&2; exit 1; }; }
need zip

APP_FILES=(agent.py tray.py signatures.json arqx-logo.png requirements.txt)
for f in "${APP_FILES[@]}"; do
  [ -f "$AGENT_DIR/$f" ] || { echo "[bundle] missing agent file: $f" >&2; exit 1; }
done

mkdir -p "$DIST" "$BUILD"

for ARCH in $ARCHES; do
  NAME="arqx-atlas-agent-${VERSION}-win-${ARCH}"
  BUNDLE="$BUILD/$NAME"
  WINPY="$BUILD/winpy-$ARCH"

  echo "==> [$ARCH] building $NAME"

  # 1. embeddable Python runtime (reused unless missing or REBUILD=1)
  if [ ! -d "$WINPY" ] || [ "${REBUILD:-0}" = "1" ]; then
    ARCH="$ARCH" bash "$HERE/make-winpy.sh" "$WINPY"
  else
    echo "[bundle] reusing runtime $WINPY (REBUILD=1 to rebuild)"
  fi

  # 2. assemble the bundle tree
  rm -rf "$BUNDLE"; mkdir -p "$BUNDLE/python" "$BUNDLE/app"
  cp -a "$WINPY/." "$BUNDLE/python/"
  for f in "${APP_FILES[@]}"; do cp "$AGENT_DIR/$f" "$BUNDLE/app/$f"; done
  cp "$HERE/win/launch-tray.vbs" "$HERE/win/run-agent.bat" \
     "$HERE/win/install.bat" "$HERE/win/uninstall.bat" "$BUNDLE/"
  sed "s/@VERSION@/$VERSION/g" "$HERE/win/installer.iss.template" > "$BUNDLE/installer.iss"

  # 3. zip it
  rm -f "$DIST/$NAME.zip"
  ( cd "$BUILD" && zip -qr "$DIST/$NAME.zip" "$NAME" )
  echo "[bundle] -> $DIST/$NAME.zip ($(du -sh "$DIST/$NAME.zip" | cut -f1))"
done

echo "[bundle] done. Unzip on Windows and run install.bat, or compile installer.iss with Inno Setup."
