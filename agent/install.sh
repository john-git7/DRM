#!/usr/bin/env sh
# ARQX Atlas — DRMShield endpoint protection agent installer (Linux / macOS).
#
# Installs the agent for the current user and configures it to start on login
# (systemd user service on Linux, launchd LaunchAgent on macOS). Requires python3.
#
#   sh install.sh            # install + enable autostart
#   sh install.sh --no-auto  # install only, do not enable autostart
set -eu

APP="arqx-atlas-agent"
LABEL="com.arqx.atlas.agent"
SRC_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
AUTO=1
[ "${1:-}" = "--no-auto" ] && AUTO=0

if ! command -v python3 >/dev/null 2>&1; then
  echo "error: python3 is required but was not found on PATH." >&2
  exit 1
fi

OS=$(uname -s)
case "$OS" in
  Linux)  DEST="$HOME/.local/share/$APP" ;;
  Darwin) DEST="$HOME/Library/Application Support/$APP" ;;
  *) echo "error: unsupported OS '$OS' (use the Windows installer)." >&2; exit 1 ;;
esac

echo "Installing $APP to $DEST ..."
mkdir -p "$DEST"
cp "$SRC_DIR/agent.py" "$SRC_DIR/signatures.json" "$DEST/"
[ -f "$SRC_DIR/arqx-logo.png" ] && cp "$SRC_DIR/arqx-logo.png" "$DEST/" || true

# User-level launcher.
BIN_DIR="$HOME/.local/bin"
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/$APP" <<EOF
#!/usr/bin/env sh
exec python3 "$DEST/agent.py" "\$@"
EOF
chmod +x "$BIN_DIR/$APP"

if [ "$AUTO" -eq 1 ]; then
  if [ "$OS" = "Linux" ] && command -v systemctl >/dev/null 2>&1; then
    UNIT_DIR="$HOME/.config/systemd/user"
    mkdir -p "$UNIT_DIR"
    cat > "$UNIT_DIR/$APP.service" <<EOF
[Unit]
Description=ARQX Atlas DRMShield endpoint protection agent

[Service]
ExecStart=$(command -v python3) $DEST/agent.py
Restart=on-failure

[Install]
WantedBy=default.target
EOF
    systemctl --user daemon-reload
    systemctl --user enable --now "$APP.service"
    echo "Enabled systemd user service: $APP.service"
  elif [ "$OS" = "Darwin" ]; then
    PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
    mkdir -p "$HOME/Library/LaunchAgents"
    cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key><array>
    <string>$(command -v python3)</string><string>$DEST/agent.py</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
</dict></plist>
EOF
    launchctl unload "$PLIST" 2>/dev/null || true
    launchctl load "$PLIST"
    echo "Loaded launchd agent: $LABEL"
  else
    echo "note: autostart not configured (no systemd/launchd). Run '$APP' manually."
  fi
fi

echo "Done. The agent listens on http://127.0.0.1:7891"
echo "Start now with: $BIN_DIR/$APP   (ensure ~/.local/bin is on your PATH)"
