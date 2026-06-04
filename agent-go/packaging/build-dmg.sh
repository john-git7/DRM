#!/usr/bin/env bash
# Build a macOS .dmg of the ARQX Atlas agent. RUN ON macOS (needs hdiutil).
# Bundles the universal-ish binary + install-macos.sh so the user double-clicks
# and runs the installer. Output: dist/ARQX-Atlas-Agent-<ver>.dmg
set -euo pipefail
VERSION="${VERSION:-2.0.0}"
HERE=$(cd "$(dirname "$0")" && pwd)
GODIR=$(cd "$HERE/.." && pwd)
OUT="$GODIR/dist"; mkdir -p "$OUT"

[ -f "$OUT/arqx-agent-darwin-arm64" ] || { echo "run ./build-all.sh first (need darwin binaries in dist/)"; exit 1; }

STAGE=$(mktemp -d)
cp "$OUT/arqx-agent-darwin-arm64" "$STAGE/arqx-agent-darwin-arm64"
cp "$OUT/arqx-agent-darwin-amd64" "$STAGE/arqx-agent-darwin-amd64" 2>/dev/null || true
cp "$HERE/install-macos.sh" "$STAGE/"
cp "$GODIR/signatures.json" "$HERE/../arqx-logo.png" "$STAGE/" 2>/dev/null || true

DMG="$OUT/ARQX-Atlas-Agent-${VERSION}.dmg"
rm -f "$DMG"
hdiutil create -volname "ARQX Atlas Agent" -srcfolder "$STAGE" -ov -format UDZO "$DMG"
rm -rf "$STAGE"
echo "Built $DMG"
