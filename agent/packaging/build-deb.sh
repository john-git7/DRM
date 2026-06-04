#!/usr/bin/env bash
# Build a Debian/Ubuntu .deb for the ARQX Atlas agent (depends on system python3).
# No PyInstaller required. Output: agent/dist/arqx-atlas-agent_<ver>_all.deb
set -euo pipefail

VERSION="${VERSION:-2.0.0}"
ARCH=all
PKG=arqx-atlas-agent
HERE=$(cd "$(dirname "$0")" && pwd)
AGENT_DIR=$(cd "$HERE/.." && pwd)
OUT="$AGENT_DIR/dist"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$OUT"

install -d "$STAGE/opt/$PKG"
install -m644 "$AGENT_DIR/agent.py"        "$STAGE/opt/$PKG/agent.py"
install -m644 "$AGENT_DIR/signatures.json" "$STAGE/opt/$PKG/signatures.json"
[ -f "$AGENT_DIR/arqx-logo.png" ] && install -m644 "$AGENT_DIR/arqx-logo.png" "$STAGE/opt/$PKG/arqx-logo.png" || true

install -d "$STAGE/usr/bin"
cat > "$STAGE/usr/bin/$PKG" <<EOF
#!/usr/bin/env sh
exec python3 /opt/$PKG/agent.py "\$@"
EOF
chmod 755 "$STAGE/usr/bin/$PKG"

install -d "$STAGE/lib/systemd/system"
cat > "$STAGE/lib/systemd/system/$PKG.service" <<EOF
[Unit]
Description=ARQX Atlas DRMShield endpoint protection agent
After=network.target

[Service]
ExecStart=/usr/bin/python3 /opt/$PKG/agent.py
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

install -d "$STAGE/DEBIAN"
cat > "$STAGE/DEBIAN/control" <<EOF
Package: $PKG
Version: $VERSION
Section: utils
Priority: optional
Architecture: $ARCH
Depends: python3 (>= 3.8)
Maintainer: ARQX Atlas <support@arqx.example>
Description: ARQX Atlas DRMShield endpoint protection agent
 Detects screen recorders, screenshot tools, video downloaders, capture-related
 browser extensions, and hardware capture devices, and reports them to the
 DRMShield player on localhost:7891. Built by ARQX Atlas.
EOF

DEB="$OUT/${PKG}_${VERSION}_${ARCH}.deb"
dpkg-deb --build --root-owner-group "$STAGE" "$DEB"
echo "Built $DEB"
dpkg-deb --info "$DEB" | sed -n '1,14p'
