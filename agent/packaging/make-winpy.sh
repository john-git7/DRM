#!/usr/bin/env bash
#
# make-winpy.sh — build a portable Windows "embeddable Python" runtime with the
# agent's tray dependencies (pystray + Pillow) baked in, assembled entirely FROM
# Linux/macOS (no Windows machine required).
#
# How it works: the official Windows embeddable Python is just a zip of a portable
# interpreter. We download it, flip on site-packages (disabled by default in the
# embeddable build), then `pip download` the *Windows* wheels for the deps and
# unzip them straight into Lib\site-packages — a wheel is a zip, so this installs
# them without ever executing python.exe.
#
# Usage:
#   bash packaging/make-winpy.sh [OUTPUT_DIR]
# Env overrides:
#   PY_VER=3.12.7   ARCH=amd64    # ARCH: amd64 | win32 | arm64
#
set -euo pipefail

PY_VER="${PY_VER:-3.12.7}"
ARCH="${ARCH:-amd64}"

HERE="$(cd "$(dirname "$0")" && pwd)"
AGENT_DIR="$(dirname "$HERE")"
OUT="${1:-$AGENT_DIR/build/winpy-$ARCH}"

# cpXY tag from the version (3.12.7 -> 312 -> cp312)
MAJMIN="$(echo "$PY_VER" | cut -d. -f1,2)"   # 3.12
NODOT="${MAJMIN//./}"                          # 312
PY_TAG="cp${NODOT}"

# pip platform tag for the wheels
case "$ARCH" in
  amd64) PLAT="win_amd64" ;;
  win32) PLAT="win32" ;;
  arm64) PLAT="win_arm64" ;;
  *) echo "[winpy] unknown ARCH '$ARCH' (use amd64|win32|arm64)" >&2; exit 2 ;;
esac

EMBED_ZIP="python-${PY_VER}-embed-${ARCH}.zip"
URL="https://www.python.org/ftp/python/${PY_VER}/${EMBED_ZIP}"

need() { command -v "$1" >/dev/null 2>&1 || { echo "[winpy] missing required tool: $1" >&2; exit 1; }; }
need curl; need unzip; need python3

work="$(mktemp -d)"; trap 'rm -rf "$work"' EXIT

echo "[winpy] python ${PY_VER} (${ARCH}, ${PY_TAG}/${PLAT})"
echo "[winpy] downloading ${URL}"
curl -fSL "$URL" -o "$work/embed.zip"

rm -rf "$OUT"; mkdir -p "$OUT"
unzip -q "$work/embed.zip" -d "$OUT"

# Enable site-packages: uncomment `import site` and add Lib\site-packages to the ._pth.
PTH="$(ls "$OUT"/python*._pth 2>/dev/null | head -1)"
[ -n "$PTH" ] || { echo "[winpy] no ._pth file found in embeddable zip" >&2; exit 1; }
sed -i 's/^#\s*import site/import site/' "$PTH"
grep -qi 'Lib\\site-packages' "$PTH" || printf 'Lib\\site-packages\r\n' >> "$PTH"
mkdir -p "$OUT/Lib/site-packages"

echo "[winpy] fetching Windows wheels for: $(grep -vE '^\s*#|^\s*$' "$AGENT_DIR/requirements.txt" | tr '\n' ' ')"
python3 -m pip download \
  --only-binary=:all: \
  --platform "$PLAT" --python-version "$MAJMIN" --implementation cp --abi "$PY_TAG" \
  -r "$AGENT_DIR/requirements.txt" -d "$work/wheels"

shopt -s nullglob
wheels=("$work"/wheels/*.whl)
[ "${#wheels[@]}" -gt 0 ] || { echo "[winpy] pip downloaded no wheels" >&2; exit 1; }
for whl in "${wheels[@]}"; do
  echo "[winpy]   + $(basename "$whl")"
  unzip -q -o "$whl" -d "$OUT/Lib/site-packages"
done

echo "[winpy] done -> $OUT"
echo "[winpy] (runtime: $(du -sh "$OUT" | cut -f1))"
