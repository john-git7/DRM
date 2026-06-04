#!/usr/bin/env sh
# Agent launcher for `npm run dev`: prefer the Go binary (build it if the Go
# toolchain is available), and fall back to the Python agent if Go isn't installed
# so the stack still comes up. The Go module is pure stdlib, so the build is offline
# and fast.
set -u

ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
GODIR="$ROOT/agent-go"
BIN="$GODIR/dist/arqx-agent"
PORT="${AGENT_PORT:-7891}"
ORIGIN="${AGENT_ALLOWED_ORIGIN:-http://localhost:${CLIENT_PORT:-5180}}"

# If an ARQX agent is already serving (e.g. installed as a boot/login service),
# reuse it instead of starting a second one that would fail to bind :7891.
if command -v curl >/dev/null 2>&1 && curl -fsS "http://127.0.0.1:$PORT/health" 2>/dev/null | grep -q "ARQX"; then
  echo "[agent] an ARQX agent is already running on :$PORT (installed service) — reusing it"
  exec tail -f /dev/null
fi

if command -v go >/dev/null 2>&1; then
  echo "[agent] building Go binary…"
  mkdir -p "$GODIR/dist"
  if ( cd "$GODIR" && go build -o "$BIN" . ); then
    echo "[agent] built — running Go agent"
  else
    echo "[agent] go build failed; using existing binary or Python"
  fi
else
  echo "[agent] Go toolchain not found"
fi

if [ -x "$BIN" ]; then
  exec env AGENT_ALLOWED_ORIGIN="$ORIGIN" "$BIN"
fi

echo "[agent] falling back to Python agent"
exec env AGENT_ALLOWED_ORIGIN="$ORIGIN" python3 "$ROOT/agent/agent.py"
