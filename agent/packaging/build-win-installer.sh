#!/usr/bin/env bash
#
# build-win-installer.sh — build a Windows setup.exe for the agent using NSIS
# (makensis), cross-built from Linux. Wraps the embeddable-Python bundle produced
# by build_bundles.sh, so the target needs no Python and no admin rights.
#
# Usage:
#   bash packaging/build-win-installer.sh
# Env overrides:
#   ARCH=amd64    PY_VER=3.12.7
# Prereq: makensis (NSIS).  Install: sudo apt-get install -y nsis
#
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
AGENT_DIR="$(dirname "$HERE")"
ARCH="${ARCH:-amd64}"
VERSION="$(grep -E '^VERSION[[:space:]]*=' "$AGENT_DIR/agent.py" | head -1 | cut -d'"' -f2)"
BUNDLE="$AGENT_DIR/build/arqx-atlas-agent-${VERSION}-win-${ARCH}"
DIST="$AGENT_DIR/dist"

command -v makensis >/dev/null 2>&1 || {
  echo "makensis (NSIS) not found. Install with: sudo apt-get install -y nsis" >&2
  exit 1
}

# Build the embeddable-Python bundle first if it isn't there yet.
if [ ! -d "$BUNDLE/python" ] || [ ! -d "$BUNDLE/app" ]; then
  echo "[installer] bundle not found — building it"
  ARCH="$ARCH" bash "$HERE/build_bundles.sh"
fi

mkdir -p "$DIST"
OUT="$DIST/arqx-atlas-agent-${VERSION}-setup.exe"
echo "[installer] makensis -> $OUT"
makensis -V2 \
  "-DBUNDLE=$BUNDLE" \
  "-DVERSION=$VERSION" \
  "-DOUTFILE=$OUT" \
  "$HERE/win/installer.nsi"

[ -f "$OUT" ] || { echo "[installer] makensis did not produce $OUT" >&2; exit 1; }
echo "[installer] done -> $OUT ($(du -h "$OUT" | cut -f1))"
