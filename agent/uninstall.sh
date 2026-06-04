#!/usr/bin/env sh
# Uninstall the ARQX Atlas agent installed by install.sh (Linux / macOS).
set -eu
APP="arqx-atlas-agent"
LABEL="com.arqx.atlas.agent"
OS=$(uname -s)

if [ "$OS" = "Linux" ] && command -v systemctl >/dev/null 2>&1; then
  systemctl --user disable --now "$APP.service" 2>/dev/null || true
  rm -f "$HOME/.config/systemd/user/$APP.service"
  systemctl --user daemon-reload 2>/dev/null || true
  DEST="$HOME/.local/share/$APP"
elif [ "$OS" = "Darwin" ]; then
  PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
  launchctl unload "$PLIST" 2>/dev/null || true
  rm -f "$PLIST"
  DEST="$HOME/Library/Application Support/$APP"
else
  DEST="$HOME/.local/share/$APP"
fi

rm -rf "$DEST"
rm -f "$HOME/.local/bin/$APP"
echo "Uninstalled $APP."
