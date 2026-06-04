#!/usr/bin/env bash
# Build the ARQX Atlas agent for macOS: a standalone binary (PyInstaller) packaged
# into a .dmg. Run on macOS from the agent/ directory:  ./packaging/build-macos.sh
#
# Prerequisites:  pip3 install pyinstaller   (hdiutil ships with macOS)
set -euo pipefail

HERE=$(cd "$(dirname "$0")" && pwd)
AGENT_DIR=$(cd "$HERE/.." && pwd)
VERSION="${VERSION:-2.0.0}"
APP="arqx-atlas-agent"
OUT="$AGENT_DIR/dist"

if ! command -v pyinstaller >/dev/null 2>&1; then
  echo "error: pyinstaller not found. Run: pip3 install pyinstaller" >&2
  exit 1
fi

echo "Building $APP with PyInstaller..."
pyinstaller "$HERE/agent.spec" --distpath "$OUT" --workpath "$AGENT_DIR/build" --noconfirm

BIN="$OUT/$APP"
[ -f "$BIN" ] || { echo "error: PyInstaller did not produce $BIN" >&2; exit 1; }

# Stage and build a .dmg.
STAGE=$(mktemp -d)
cp "$BIN" "$STAGE/"
[ -f "$AGENT_DIR/README.md" ] && cp "$AGENT_DIR/README.md" "$STAGE/" || true
DMG="$OUT/${APP}-${VERSION}.dmg"
rm -f "$DMG"
hdiutil create -volname "ARQX Atlas Agent" -srcfolder "$STAGE" -ov -format UDZO "$DMG"
rm -rf "$STAGE"
echo "Built $DMG"
