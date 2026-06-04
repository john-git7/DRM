#!/usr/bin/env sh
# Free the DRMShield dev ports before starting a fresh session.
# Terminates whatever is listening on each given TCP port (i.e. a leftover
# server / client / agent from a previous `npm run dev`). Always exits 0 so it
# never blocks startup.
#
# Usage: sh scripts/free-ports.sh 5000 5180 7891

for port in "$@"; do
  pids=""
  if command -v fuser >/dev/null 2>&1; then
    fuser -k "${port}/tcp" >/dev/null 2>&1 || true
    continue
  elif command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti "tcp:${port}" 2>/dev/null || true)
  elif command -v ss >/dev/null 2>&1; then
    pids=$(ss -ltnpH "sport = :${port}" 2>/dev/null | grep -oE 'pid=[0-9]+' | cut -d= -f2 | sort -u)
  fi
  if [ -n "$pids" ]; then
    echo "[free-ports] freeing :${port} (pids: $(echo "$pids" | tr '\n' ' '))"
    # shellcheck disable=SC2086
    kill $pids 2>/dev/null || true
    sleep 1
    # shellcheck disable=SC2086
    kill -9 $pids 2>/dev/null || true
  fi
done

exit 0
