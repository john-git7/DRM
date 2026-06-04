#!/usr/bin/env bash
# Build a Python .deb of the ARQX Atlas agent WITH desktop + tray (taskbar) icon.
# Installs the agent + tray, an app-menu launcher (.desktop), a login-autostart
# entry (the top-bar/taskbar icon), and the ARQX icon. Depends on python3 + the
# GObject/AppIndicator bindings (resolved by apt at install time).
# Output: agent/dist/arqx-atlas-agent-desktop_<ver>_all.deb
set -euo pipefail

VERSION="${VERSION:-2.0.0}"
PKG=arqx-atlas-agent
HERE=$(cd "$(dirname "$0")" && pwd)
AGENT_DIR=$(cd "$HERE/.." && pwd)
OUT="$AGENT_DIR/dist"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$OUT"

# --- payload: agent code ---
install -d "$STAGE/opt/$PKG"
install -m644 "$AGENT_DIR/agent.py"        "$STAGE/opt/$PKG/agent.py"
install -m644 "$AGENT_DIR/tray.py"         "$STAGE/opt/$PKG/tray.py"
install -m644 "$AGENT_DIR/signatures.json" "$STAGE/opt/$PKG/signatures.json"
install -m644 "$AGENT_DIR/arqx-logo.png"   "$STAGE/opt/$PKG/arqx-logo.png"

# --- launchers ---
install -d "$STAGE/usr/bin"
cat > "$STAGE/usr/bin/$PKG-tray" <<EOF
#!/bin/sh
exec python3 /opt/$PKG/tray.py "\$@"
EOF
cat > "$STAGE/usr/bin/$PKG" <<EOF
#!/bin/sh
exec python3 /opt/$PKG/agent.py "\$@"
EOF
chmod 755 "$STAGE/usr/bin/$PKG-tray" "$STAGE/usr/bin/$PKG"

# --- icon ---
install -d "$STAGE/usr/share/icons/hicolor/256x256/apps"
install -m644 "$AGENT_DIR/arqx-logo.png" "$STAGE/usr/share/icons/hicolor/256x256/apps/$PKG.png"
install -d "$STAGE/usr/share/pixmaps"
install -m644 "$AGENT_DIR/arqx-logo.png" "$STAGE/usr/share/pixmaps/$PKG.png"

# --- app-menu launcher (Desktop option) ---
install -d "$STAGE/usr/share/applications"
cat > "$STAGE/usr/share/applications/$PKG.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=ARQX Atlas Agent
GenericName=Endpoint protection
Comment=DRMShield recorder/downloader/capture detection — shows a tray icon
Exec=/usr/bin/$PKG-tray
Icon=$PKG
Terminal=false
Categories=Utility;Security;
Keywords=DRM;recorder;capture;ARQX;
EOF

# --- login autostart (Taskbar/tray icon option, all users) ---
install -d "$STAGE/etc/xdg/autostart"
cat > "$STAGE/etc/xdg/autostart/$PKG.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=ARQX Atlas Agent
Comment=Starts the ARQX Atlas tray icon at login
Exec=/usr/bin/$PKG-tray
Icon=$PKG
Terminal=false
X-GNOME-Autostart-enabled=true
EOF

# --- control + maintainer scripts ---
install -d "$STAGE/DEBIAN"
cat > "$STAGE/DEBIAN/control" <<EOF
Package: $PKG-desktop
Version: $VERSION
Section: utils
Priority: optional
Architecture: all
Depends: python3 (>= 3.8), python3-gi, gir1.2-gtk-3.0, gir1.2-ayatana-appindicator3-0.1 | gir1.2-appindicator3-0.1
Recommends: gnome-shell-extension-appindicator
Conflicts: arqx-atlas-agent
Replaces: arqx-atlas-agent
Provides: arqx-atlas-agent
Maintainer: ARQX Atlas <support@arqx.example>
Description: ARQX Atlas DRMShield endpoint protection agent (desktop + tray)
 Detects screen recorders, screenshot tools, video downloaders, capture-related
 browser extensions, hardware capture devices, and active screen recording, and
 reports to the DRMShield player on localhost:7891. Adds an app-menu launcher and a
 login-autostart tray (taskbar) icon. Built by ARQX Atlas.
EOF
cat > "$STAGE/DEBIAN/postinst" <<EOF
#!/bin/sh
set -e
[ -x "\$(command -v update-desktop-database)" ] && update-desktop-database -q /usr/share/applications || true
[ -x "\$(command -v gtk-update-icon-cache)" ] && gtk-update-icon-cache -q /usr/share/icons/hicolor || true
echo "ARQX Atlas agent installed. The tray icon appears at next login,"
echo "or start it now with:  arqx-atlas-agent-tray"
exit 0
EOF
chmod 755 "$STAGE/DEBIAN/postinst"

DEB="$OUT/${PKG}-desktop_${VERSION}_all.deb"
dpkg-deb --build --root-owner-group "$STAGE" "$DEB"
echo "Built $DEB"
dpkg-deb --info "$DEB" | sed -n '1,14p'
