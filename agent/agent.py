#!/usr/bin/env python3
"""DRMShield localhost proctoring agent (Phase 3 — OBS / screen-recorder detection).

Purpose
-------
This is a small standalone agent that a student runs on their own machine while
watching protected content in the DRMShield web player. It listens on
localhost:7891 and exposes a tiny read-only HTTP API. Before the browser-based
player starts (or resumes) playback it calls this agent. If the agent reports
that a screen recorder (OBS, Bandicam, Camtasia, NVIDIA ShadowPlay, Fraps,
Dxtory, and friends) is currently running, the player blocks playback. If the
agent is not installed or not running, the browser's fetch fails outright
(connection refused) and the player shows an "install the agent" prompt.

The localhost:7891 contract with the browser
---------------------------------------------
  GET  /status   -> 200 JSON describing the agent, the platform, and any
                    detected recorders (see the response shape below).
  GET  /health   -> 200 {"ok": true} liveness probe.
  OPTIONS *       -> 204 with CORS headers (browser preflight).
  *               -> 404 JSON {"error": "not found"}.

Every response carries CORS headers so the player's origin (default
http://localhost:5173) may read the result from JavaScript.

Implementation notes
--------------------
This module is intentionally **Python 3 standard library only**. There are no
pip dependencies and no install step: it must run with a bare `python3 agent.py`
on Windows, macOS, and Linux. Detection shells out to the operating system's
native process lister (`tasklist` on Windows, `ps` on macOS/Linux) and matches
running process names against a signature list loaded from `recorders.json`.

Caveat
------
A determined user can kill or spoof a localhost agent. This raises the bar for
casual capture; it is not an absolute guarantee.
"""

import json
import os
import platform
import re
import socket
import subprocess
import sys
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "1.0.0"

# --- Configuration (env-overridable) ----------------------------------------

AGENT_HOST = os.environ.get("AGENT_HOST", "127.0.0.1")
AGENT_PORT = int(os.environ.get("AGENT_PORT", "7891"))
AGENT_ALLOWED_ORIGIN = os.environ.get("AGENT_ALLOWED_ORIGIN", "http://localhost:5173")

# Directory this script lives in, so recorders.json resolves regardless of cwd.
AGENT_DIR = os.path.dirname(os.path.abspath(__file__))
RECORDERS_PATH = os.path.join(AGENT_DIR, "recorders.json")

# Built-in fallback used only if recorders.json is missing or unreadable.
DEFAULT_SIGNATURES = [
    {"name": "OBS Studio", "match": ["obs", "obs64", "obs-studio"]},
    {"name": "Bandicam", "match": ["bandicam", "bdcam"]},
    {"name": "Camtasia", "match": ["camtasia"]},
    {"name": "NVIDIA ShadowPlay", "match": ["nvidia share", "nvsphelper", "nvcontainer"]},
    {"name": "Fraps", "match": ["fraps"]},
    {"name": "Dxtory", "match": ["dxtory"]},
]


def normalize_platform() -> str:
    """Map platform.system() onto the browser-facing strings linux|darwin|win32."""
    system = platform.system()
    if system == "Windows":
        return "win32"
    if system == "Darwin":
        return "darwin"
    if system == "Linux":
        return "linux"
    return system.lower()


def load_signatures() -> list:
    """Load recorder signatures from recorders.json, falling back to defaults."""
    try:
        with open(RECORDERS_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        signatures = data.get("signatures")
        if not isinstance(signatures, list) or not signatures:
            raise ValueError("recorders.json has no usable 'signatures' array")
        cleaned = []
        for entry in signatures:
            name = entry.get("name")
            match = entry.get("match", [])
            if isinstance(name, str) and isinstance(match, list):
                cleaned.append({"name": name, "match": [str(m) for m in match]})
        if not cleaned:
            raise ValueError("recorders.json contained no valid signatures")
        return cleaned
    except FileNotFoundError:
        print(
            "[warn] recorders.json not found at {}; using built-in defaults".format(
                RECORDERS_PATH
            ),
            file=sys.stderr,
        )
        return DEFAULT_SIGNATURES
    except Exception as exc:  # noqa: BLE001 - never crash on a bad signature file
        print(
            "[warn] failed to load recorders.json ({}); using built-in defaults".format(exc),
            file=sys.stderr,
        )
        return DEFAULT_SIGNATURES


SIGNATURES = load_signatures()


def _normalize_proc_name(raw: str) -> str:
    """Strip path and .exe, lowercase, and trim — for boundary-aware matching."""
    name = raw.strip().lower()
    # Strip directory components for either path style.
    name = name.replace("\\", "/").rsplit("/", 1)[-1]
    if name.endswith(".exe"):
        name = name[:-4]
    return name


def _signature_matches(proc: str, needle: str) -> bool:
    """True if `needle` appears in `proc` as a whole token (alphanumeric boundaries).

    Boundary-aware matching avoids false positives from unrelated apps whose name
    merely contains a signature as a substring — e.g. the note-taking app
    "obsidian" must NOT match the OBS signature "obs", while "obs", "obs64", and
    "obs-studio" still do (the character after "obs" is a non-alphanumeric break).
    """
    pattern = r"(?<![a-z0-9])" + re.escape(needle) + r"(?![a-z0-9])"
    return re.search(pattern, proc) is not None


def _list_process_names() -> list:
    """Return a list of running process names using native OS tooling.

    Raises on failure so the caller can decide how to handle it.
    """
    if platform.system() == "Windows":
        # /FO CSV gives quoted columns; the first column is the image name.
        output = subprocess.check_output(
            ["tasklist", "/FO", "CSV", "/NH"],
            stderr=subprocess.DEVNULL,
            text=True,
        )
        names = []
        for line in output.splitlines():
            line = line.strip()
            if not line:
                continue
            # First CSV field, stripped of surrounding quotes.
            first = line.split(",", 1)[0].strip().strip('"')
            if first:
                names.append(first)
        return names

    # macOS / Linux. Prefer the compact `comm` output; fall back if it fails.
    try:
        output = subprocess.check_output(
            ["ps", "-axco", "comm"],
            stderr=subprocess.DEVNULL,
            text=True,
        )
    except Exception:
        output = subprocess.check_output(
            ["ps", "-eo", "comm"],
            stderr=subprocess.DEVNULL,
            text=True,
        )
    lines = output.splitlines()
    # Drop a header line like "COMMAND" if present.
    if lines and lines[0].strip().upper() in ("COMMAND", "COMM"):
        lines = lines[1:]
    return [line for line in lines if line.strip()]


def detect_recorders() -> list:
    """Return a sorted, de-duplicated list of display names of running recorders.

    Robust by design: any failure to enumerate processes is caught, logged to
    stderr, and reported as "no recorders detected" rather than crashing.
    """
    try:
        raw_names = _list_process_names()
    except Exception as exc:  # noqa: BLE001 - process listing must never crash us
        print(
            "[warn] could not enumerate processes ({}); reporting clean".format(exc),
            file=sys.stderr,
        )
        return []

    normalized = [_normalize_proc_name(n) for n in raw_names]
    detected = set()
    for signature in SIGNATURES:
        display_name = signature["name"]
        needles = [m.strip().lower() for m in signature["match"] if m.strip()]
        for proc in normalized:
            if any(_signature_matches(proc, needle) for needle in needles):
                detected.add(display_name)
                break
    return sorted(detected)


class AgentHandler(BaseHTTPRequestHandler):
    server_version = "DRMShieldAgent/" + VERSION

    # --- helpers -------------------------------------------------------------

    def _resolved_origin(self) -> str:
        """Echo the request Origin only when it matches the allowed origin."""
        request_origin = self.headers.get("Origin")
        if request_origin and request_origin == AGENT_ALLOWED_ORIGIN:
            return request_origin
        return AGENT_ALLOWED_ORIGIN

    def _cors_headers(self) -> None:
        self.send_header("Access-Control-Allow-Origin", self._resolved_origin())
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")

    def _send_json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    # --- request handlers ----------------------------------------------------

    def do_OPTIONS(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler naming
        self.send_response(204)
        self._cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler naming
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path == "/health":
            self._send_json(200, {"ok": True})
            return
        if path == "/status":
            recorders = detect_recorders()
            self._send_json(
                200,
                {
                    "installed": True,
                    "version": VERSION,
                    "platform": normalize_platform(),
                    "recorders": recorders,
                    "clean": len(recorders) == 0,
                    "checkedAt": datetime.now(timezone.utc)
                    .isoformat()
                    .replace("+00:00", "Z"),
                },
            )
            return
        self._send_json(404, {"error": "not found"})

    # Quieter, single-line request logging to stderr.
    def log_message(self, fmt: str, *args) -> None:  # noqa: A002 - signature fixed
        sys.stderr.write(
            "[req] %s - %s\n" % (self.address_string(), fmt % args)
        )


def main() -> None:
    try:
        httpd = ThreadingHTTPServer((AGENT_HOST, AGENT_PORT), AgentHandler)
    except OSError as exc:
        print(
            "[fatal] cannot bind {}:{} ({})".format(AGENT_HOST, AGENT_PORT, exc),
            file=sys.stderr,
        )
        sys.exit(1)

    print("=" * 60)
    print(" DRMShield localhost agent v{}".format(VERSION))
    print(" listening on http://{}:{}".format(AGENT_HOST, AGENT_PORT))
    print(" platform: {}".format(normalize_platform()))
    print(" loaded {} recorder signature(s)".format(len(SIGNATURES)))
    print(" allowed origin: {}".format(AGENT_ALLOWED_ORIGIN))
    print("=" * 60)
    print(" endpoints: GET /status  GET /health")
    print(" press Ctrl+C to stop")
    sys.stdout.flush()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[info] shutting down (Ctrl+C)")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
