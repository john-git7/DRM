#!/usr/bin/env bash
# Build a Debian/Ubuntu .deb of the ARQX Atlas Go agent that installs as a
# boot-start systemd service. Static binary — NO python3 dependency.
# Output: agent-go/dist/arqx-atlas-agent_<ver>_<arch>.deb
set -euo pipefail

VERSION="${VERSION:-2.0.0}"
ARCH="${ARCH:-amd64}"          # amd64 | arm64
GOARCH="$ARCH"
PKG=arqx-atlas-agent
HERE=$(cd "$(dirname "$0")" && pwd)
GODIR=$(cd "$HERE/.." && pwd)
OUT="$GODIR/dist"
STAGE=$(mktemp -d)
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$OUT"

export PATH="$HOME/.local/go-sdk/go/bin:$PATH"
echo "→ building static linux/$GOARCH binary"
( cd "$GODIR" && CGO_ENABLED=0 GOOS=linux GOARCH="$GOARCH" go build -ldflags="-s -w" -o "$STAGE/arqx-agent" . )

install -d "$STAGE/opt/$PKG"
mv "$STAGE/arqx-agent" "$STAGE/opt/$PKG/arqx-agent"
chmod 755 "$STAGE/opt/$PKG/arqx-agent"
install -m644 "$GODIR/signatures.json" "$STAGE/opt/$PKG/signatures.json"
[ -f "$GODIR/arqx-logo.png" ] && install -m644 "$GODIR/arqx-logo.png" "$STAGE/opt/$PKG/arqx-logo.png" || true

install -d "$STAGE/usr/bin"
ln -s "/opt/$PKG/arqx-agent" "$STAGE/usr/bin/$PKG"

# Optional env override (e.g. the player's origin).
install -d "$STAGE/etc"
cat > "$STAGE/etc/$PKG.conf" <<EOF
# ARQX Atlas agent config. Set the player's origin for CORS, then: systemctl restart $PKG
AGENT_ALLOWED_ORIGIN=http://localhost:5173
EOF

# Boot-start systemd SYSTEM service (multi-user.target = before login).
install -d "$STAGE/lib/systemd/system"
cat > "$STAGE/lib/systemd/system/$PKG.service" <<EOF
[Unit]
Description=ARQX Atlas DRMShield endpoint protection agent
After=network.target

[Service]
Type=simple
EnvironmentFile=-/etc/$PKG.conf
ExecStart=/opt/$PKG/arqx-agent
Restart=always
RestartSec=2

[Install]
WantedBy=multi-user.target
EOF

# Enable + start on install (so it "loads at boot"); stop on removal.
install -d "$STAGE/DEBIAN"
cat > "$STAGE/DEBIAN/postinst" <<EOF
#!/bin/sh
set -e
if command -v systemctl >/dev/null 2>&1; then
  systemctl daemon-reload || true
  systemctl enable --now $PKG.service || true
fi
exit 0
EOF
cat > "$STAGE/DEBIAN/prerm" <<EOF
#!/bin/sh
set -e
if command -v systemctl >/dev/null 2>&1; then
  systemctl disable --now $PKG.service || true
fi
exit 0
EOF
chmod 755 "$STAGE/DEBIAN/postinst" "$STAGE/DEBIAN/prerm"

cat > "$STAGE/DEBIAN/control" <<EOF
Package: $PKG
Version: $VERSION
Section: utils
Priority: optional
Architecture: $ARCH
Maintainer: ARQX Atlas <support@arqx.example>
Description: ARQX Atlas DRMShield endpoint protection agent (Go)
 Static single-binary agent (no runtime dependency) that detects screen recorders,
 screenshot tools, video downloaders, capture-related browser extensions, hardware
 capture devices, and active screen recording, reporting to the DRMShield player on
 localhost:7891. Installs as a boot-start systemd service. Built by ARQX Atlas.
EOF

DEB="$OUT/${PKG}_${VERSION}_${ARCH}.deb"
dpkg-deb --build --root-owner-group "$STAGE" "$DEB"
echo "Built $DEB"
dpkg-deb --info "$DEB" | sed -n '1,12p'
