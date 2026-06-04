#!/usr/bin/env bash
# ARQX Atlas agent — macOS install. Installs the Go binary and a per-user LaunchAgent
# that starts it at login (a login agent runs in the user session, so per-user
# detection works). Run from the folder containing the darwin binary.
#   sh install-macos.sh           # Apple Silicon (arm64) by default
#   ARCH=amd64 sh install-macos.sh # Intel
set -eu
ARCH="${ARCH:-arm64}"
LABEL="com.arqx.atlas.agent"
HERE=$(cd "$(dirname "$0")" && pwd)
DEST="$HOME/Library/Application Support/arqx-atlas-agent"
BIN="$HERE/arqx-agent-darwin-$ARCH"
[ -f "$BIN" ] || { echo "missing $BIN (run build-all.sh first)"; exit 1; }

mkdir -p "$DEST"
cp "$BIN" "$DEST/arqx-agent"; chmod +x "$DEST/arqx-agent"
cp "$HERE/../signatures.json" "$DEST/" 2>/dev/null || true
cp "$HERE/../arqx-logo.png"  "$DEST/" 2>/dev/null || true

PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
mkdir -p "$HOME/Library/LaunchAgents"
cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array><string>$DEST/arqx-agent</string></array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
EOF
launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"
echo "Installed. ARQX Atlas agent starts at login and is running now (http://127.0.0.1:7891)."
echo "Uninstall: launchctl unload '$PLIST'; rm -f '$PLIST'; rm -rf '$DEST'"
