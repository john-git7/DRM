#!/usr/bin/env bash
# Cross-compile the ARQX Atlas agent for Windows, macOS, and Linux from any host.
# Pure Go stdlib (no CGO), so every target builds from one machine. Output: dist/
set -euo pipefail
HERE=$(cd "$(dirname "$0")" && pwd)
cd "$HERE"
mkdir -p dist
LDFLAGS="-s -w"   # strip symbols/debug → smaller binaries

build() {
  echo "→ $1/$2  ($3)"
  GOOS="$1" GOARCH="$2" CGO_ENABLED=0 go build -ldflags="$LDFLAGS" -o "dist/$3" .
}

build linux   amd64 arqx-agent-linux-amd64
build linux   arm64 arqx-agent-linux-arm64
build windows amd64 arqx-agent-windows-amd64.exe
build windows arm64 arqx-agent-windows-arm64.exe
build darwin  amd64 arqx-agent-darwin-amd64
build darwin  arm64 arqx-agent-darwin-arm64

echo "done — artifacts in dist/:"
ls -la dist/
