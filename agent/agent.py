#!/usr/bin/env python3
"""ARQX Atlas — DRMShield endpoint protection agent (Phase 3).

Purpose
-------
A standalone agent that a viewer runs on their own machine while watching
protected content in the DRMShield web player. It listens on localhost:7891 and
exposes a small read-only HTTP API. Before the browser-based player starts (or
resumes) playback it calls this agent. If the agent reports a capture threat the
player blocks playback. If the agent is not installed/running the browser's fetch
fails (connection refused) and the player shows an "install the agent" prompt.

What it detects
---------------
1. Running processes — screen recorders (OBS, Bandicam, Camtasia, ShadowPlay,
   Fraps, Dxtory, ...), the Windows Snipping Tool / Snip & Sketch and other
   screenshot tools, and video downloaders (IDM, yt-dlp, JDownloader, ffmpeg, ...).
2. Browser extensions — known video-downloader / screen-recorder / stream-capture
   add-ons installed in Chrome/Edge/Brave/Chromium/Opera/Vivaldi and Firefox,
   matched by extension id and by manifest-name keywords.
3. Hardware capture devices — HDMI/USB capture cards (Elgato, AVerMedia, Magewell,
   Blackmagic, Epiphan, ...) enumerated from the OS device tree.

The localhost:7891 contract with the browser
---------------------------------------------
  GET  /status   -> 200 JSON: agent info + categorized threats + a single
                    boolean `clean` (true only when nothing was detected).
  GET  /health   -> 200 {"ok": true} liveness probe.
  OPTIONS *       -> 204 with CORS headers (browser preflight).
  *               -> 404 JSON {"error": "not found"}.

Honest scope
------------
This is a user-space agent. It raises the cost of casual capture and leaves
forensic traces, but a determined user with administrative/root control can kill
or spoof it. True kernel-level capture prevention (blocking the OS frame buffer,
secure video path) requires a signed kernel driver / hardware DRM (e.g. Widevine
L1, PlayReady SL3000, Android FLAG_SECURE) and is out of scope for this prototype.
See SECURITY.md.

Implementation notes
--------------------
Python 3 standard library only. No pip dependencies, no install step: it runs
with a bare `python3 agent.py` on Windows, macOS, and Linux. Browser-extension
and capture-device scans are cached briefly so frequent polling stays cheap.
"""

import json
import os
import platform
import re
import subprocess
import sys
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

VERSION = "2.0.0"
BRAND = "ARQX Atlas"

# --- Configuration (env-overridable) ----------------------------------------

AGENT_HOST = os.environ.get("AGENT_HOST", "127.0.0.1")
AGENT_PORT = int(os.environ.get("AGENT_PORT", "7891"))
AGENT_ALLOWED_ORIGIN = os.environ.get("AGENT_ALLOWED_ORIGIN", "http://localhost:5173")

AGENT_DIR = os.path.dirname(os.path.abspath(__file__))
SIGNATURES_PATH = os.path.join(AGENT_DIR, "signatures.json")

# Scans that touch the filesystem / shell out are cached for this many seconds.
SCAN_CACHE_TTL = 20.0

DEFAULT_SIGNATURES = {
    "processes": {
        "Screen recorder": [
            {"name": "OBS Studio", "match": ["obs", "obs64", "obs-studio"]},
            {"name": "Bandicam", "match": ["bandicam", "bdcam"]},
            {"name": "Camtasia", "match": ["camtasia"]},
            {"name": "NVIDIA ShadowPlay", "match": ["nvidia share", "nvsphelper"]},
            {"name": "Fraps", "match": ["fraps"]},
            {"name": "Dxtory", "match": ["dxtory"]},
        ],
        "Snipping / screenshot tool": [
            {"name": "Windows Snipping Tool", "match": ["snippingtool", "screensketch", "screenclip"]},
        ],
        "Video downloader": [
            {"name": "yt-dlp / youtube-dl", "match": ["yt-dlp", "youtube-dl"]},
            {"name": "ffmpeg", "match": ["ffmpeg"]},
        ],
    },
    "captureDeviceKeywords": ["elgato", "avermedia", "magewell", "blackmagic", "capture card", "usb capture"],
    "extensions": {"ids": {}, "keywords": ["video download", "screen record", "stream record", "capture"]},
}


def normalize_platform():
    system = platform.system()
    return {"Windows": "win32", "Darwin": "darwin", "Linux": "linux"}.get(system, system.lower())


def load_signatures():
    """Load signatures.json, falling back to a built-in minimal set."""
    try:
        with open(SIGNATURES_PATH, "r", encoding="utf-8") as handle:
            data = json.load(handle)
        if not isinstance(data, dict) or "processes" not in data:
            raise ValueError("signatures.json missing 'processes'")
        data.setdefault("captureDeviceKeywords", [])
        data.setdefault("extensions", {"ids": {}, "keywords": []})
        return data
    except FileNotFoundError:
        print("[warn] signatures.json not found at {}; using defaults".format(SIGNATURES_PATH), file=sys.stderr)
        return DEFAULT_SIGNATURES
    except Exception as exc:  # noqa: BLE001 - never crash on a bad signature file
        print("[warn] failed to load signatures.json ({}); using defaults".format(exc), file=sys.stderr)
        return DEFAULT_SIGNATURES


SIGNATURES = load_signatures()
_scan_cache = {"at": 0.0, "extensions": [], "captureDevices": []}


# --- Process detection -------------------------------------------------------

def _normalize_proc_name(raw):
    name = raw.strip().lower().replace("\\", "/").rsplit("/", 1)[-1]
    return name[:-4] if name.endswith(".exe") else name


def _signature_matches(proc, needle):
    """True if `needle` appears in `proc` as a whole token (alphanumeric boundaries).

    Avoids false positives from unrelated apps whose name merely contains a
    signature as a substring (e.g. "obsidian" must not match "obs").
    """
    return re.search(r"(?<![a-z0-9])" + re.escape(needle) + r"(?![a-z0-9])", proc) is not None


def _list_process_names():
    if platform.system() == "Windows":
        output = subprocess.check_output(["tasklist", "/FO", "CSV", "/NH"], stderr=subprocess.DEVNULL, text=True, timeout=10)
        names = []
        for line in output.splitlines():
            line = line.strip()
            if line:
                names.append(line.split(",", 1)[0].strip().strip('"'))
        return names
    try:
        output = subprocess.check_output(["ps", "-axco", "comm"], stderr=subprocess.DEVNULL, text=True, timeout=10)
    except Exception:
        output = subprocess.check_output(["ps", "-eo", "comm"], stderr=subprocess.DEVNULL, text=True, timeout=10)
    lines = output.splitlines()
    if lines and lines[0].strip().upper() in ("COMMAND", "COMM"):
        lines = lines[1:]
    return [line for line in lines if line.strip()]


def detect_processes():
    """Return a list of {category, name} for every matched running process."""
    try:
        normalized = [_normalize_proc_name(n) for n in _list_process_names()]
    except Exception as exc:  # noqa: BLE001
        print("[warn] process enumeration failed ({})".format(exc), file=sys.stderr)
        return []
    found = []
    seen = set()
    for category, sigs in SIGNATURES.get("processes", {}).items():
        for sig in sigs:
            display = sig.get("name", "")
            needles = [m.strip().lower() for m in sig.get("match", []) if m.strip()]
            for proc in normalized:
                if any(_signature_matches(proc, n) for n in needles):
                    key = (category, display)
                    if key not in seen:
                        seen.add(key)
                        found.append({"category": category, "name": display})
                    break
    return found


# --- Hardware capture device detection ---------------------------------------

def detect_capture_devices():
    keywords = [k.lower() for k in SIGNATURES.get("captureDeviceKeywords", [])]
    if not keywords:
        return []
    names = []
    system = platform.system()
    try:
        if system == "Linux":
            base = "/sys/class/video4linux"
            if os.path.isdir(base):
                for entry in sorted(os.listdir(base)):
                    try:
                        with open(os.path.join(base, entry, "name"), encoding="utf-8") as f:
                            names.append(f.read().strip())
                    except OSError:
                        pass
        elif system == "Darwin":
            out = subprocess.check_output(["system_profiler", "SPCameraDataType", "SPUSBDataType"],
                                          stderr=subprocess.DEVNULL, text=True, timeout=12)
            names = [ln.strip().rstrip(":") for ln in out.splitlines() if ln.strip()]
        elif system == "Windows":
            ps = "Get-PnpDevice -Class Image,Camera,Media -Status OK | Select-Object -ExpandProperty FriendlyName"
            out = subprocess.check_output(["powershell", "-NoProfile", "-Command", ps],
                                          stderr=subprocess.DEVNULL, text=True, timeout=12)
            names = [ln.strip() for ln in out.splitlines() if ln.strip()]
    except Exception as exc:  # noqa: BLE001
        print("[warn] capture-device enumeration failed ({})".format(exc), file=sys.stderr)
        return []
    matched = [n for n in names if any(k in n.lower() for k in keywords)]
    return sorted(set(matched))


# --- Active screen-recording detection (compositor-integrated, e.g. GNOME) ---
#
# The GNOME/Ubuntu built-in recorder runs *inside* gnome-shell, so there is no
# distinct process to match. Instead we detect a recording that is actually in
# progress: a process holding an open file descriptor to a screencast output file
# (reliable), with a recent-mtime fallback. This catches the OS built-in recorder
# and anything else writing to the Screencasts folder, but only while it is active.

def _screencast_dirs():
    home = os.path.expanduser("~")
    dirs = [os.path.join(home, "Videos", "Screencasts"), os.path.join(home, "Videos")]
    try:
        out = subprocess.check_output(["xdg-user-dir", "VIDEOS"], stderr=subprocess.DEVNULL, text=True, timeout=3).strip()
        if out:
            dirs.append(out)
            dirs.append(os.path.join(out, "Screencasts"))
    except Exception:
        pass
    seen, result = set(), []
    for d in dirs:
        rd = os.path.realpath(d)
        if rd not in seen and os.path.isdir(rd):
            seen.add(rd)
            result.append(rd)
    return result


def _looks_like_screencast(name):
    low = name.lower()
    return low.startswith("screencast") and low.endswith((".webm", ".mp4", ".mkv", ".ogv"))


def _open_fd_holder(dirs):
    """Process name holding an open screencast file, or None. Linux /proc only."""
    if not os.path.isdir("/proc"):
        return None
    try:
        pids = [p for p in os.listdir("/proc") if p.isdigit()]
    except OSError:
        return None
    for pid in pids:
        fd_dir = "/proc/%s/fd" % pid
        try:
            fds = os.listdir(fd_dir)
        except OSError:
            continue
        for fd in fds:
            try:
                target = os.readlink(os.path.join(fd_dir, fd))
            except OSError:
                continue
            base = os.path.basename(target)
            if _looks_like_screencast(base) and any(target.startswith(d + os.sep) for d in dirs):
                try:
                    with open("/proc/%s/comm" % pid, encoding="utf-8") as f:
                        comm = f.read().strip()
                except OSError:
                    comm = "pid " + pid
                return "%s (%s)" % (comm, base)
    return None


def detect_active_screencast():
    """Return a one-item list naming an in-progress screen recording, else []."""
    if platform.system() != "Linux":
        return []  # macOS/Windows built-ins surface as distinct processes (handled above)
    dirs = _screencast_dirs()
    if not dirs:
        return []

    holder = _open_fd_holder(dirs)
    if holder:
        return ["Active screen recording — %s" % holder]

    # Fallback: a screencast file written within the last few seconds.
    now = time.time()
    for d in dirs:
        try:
            entries = os.listdir(d)
        except OSError:
            continue
        for name in entries:
            if _looks_like_screencast(name):
                try:
                    if now - os.path.getmtime(os.path.join(d, name)) < 8:
                        return ["Active screen recording — %s" % name]
                except OSError:
                    pass
    return []


# --- Browser extension detection ---------------------------------------------

def _chrome_user_data_dirs():
    home = os.path.expanduser("~")
    system = platform.system()
    if system == "Linux":
        cfg = os.path.join(home, ".config")
        rel = ["google-chrome", "google-chrome-beta", "chromium", "microsoft-edge",
               "BraveSoftware/Brave-Browser", "opera", "vivaldi"]
        dirs = [os.path.join(cfg, *r.split("/")) for r in rel]
    elif system == "Darwin":
        app = os.path.join(home, "Library", "Application Support")
        rel = ["Google/Chrome", "Chromium", "Microsoft Edge", "BraveSoftware/Brave-Browser", "Vivaldi"]
        dirs = [os.path.join(app, *r.split("/")) for r in rel]
    elif system == "Windows":
        local = os.environ.get("LOCALAPPDATA", "")
        dirs = [os.path.join(local, "Google", "Chrome", "User Data"),
                os.path.join(local, "Microsoft", "Edge", "User Data"),
                os.path.join(local, "BraveSoftware", "Brave-Browser", "User Data"),
                os.path.join(local, "Chromium", "User Data")]
    else:
        dirs = []
    return [d for d in dirs if os.path.isdir(d)]


def _read_extension_name(ext_id_dir):
    try:
        versions = [v for v in os.listdir(ext_id_dir) if os.path.isdir(os.path.join(ext_id_dir, v))]
    except OSError:
        return None
    for version in versions:
        manifest = os.path.join(ext_id_dir, version, "manifest.json")
        try:
            with open(manifest, encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue
        name = data.get("name", "")
        if isinstance(name, str) and name and not name.startswith("__MSG_"):
            return name
        # Localized name: resolve from the default-locale messages file (best effort).
        if isinstance(name, str) and name.startswith("__MSG_"):
            resolved = _resolve_localized(os.path.join(ext_id_dir, version), data, name)
            if resolved:
                return resolved
    return None


def _resolve_localized(version_dir, manifest, msg_token):
    key = msg_token.strip("_")[4:].strip("_") if msg_token.startswith("__MSG_") else msg_token
    locale = manifest.get("default_locale", "en")
    for loc in (locale, "en", "en_US"):
        path = os.path.join(version_dir, "_locales", loc, "messages.json")
        try:
            with open(path, encoding="utf-8") as f:
                messages = json.load(f)
        except Exception:
            continue
        entry = messages.get(key) or messages.get(key.lower())
        if isinstance(entry, dict) and isinstance(entry.get("message"), str):
            return entry["message"]
    return None


def _scan_chromium_extensions():
    known = SIGNATURES.get("extensions", {}).get("ids", {})
    keywords = [k.lower() for k in SIGNATURES.get("extensions", {}).get("keywords", [])]
    found = []
    for udd in _chrome_user_data_dirs():
        try:
            profiles = [p for p in os.listdir(udd) if p == "Default" or p.startswith("Profile")]
        except OSError:
            continue
        for profile in profiles:
            ext_dir = os.path.join(udd, profile, "Extensions")
            if not os.path.isdir(ext_dir):
                continue
            try:
                ext_ids = os.listdir(ext_dir)
            except OSError:
                continue
            for ext_id in ext_ids:
                if ext_id in known:
                    found.append(known[ext_id])
                    continue
                name = _read_extension_name(os.path.join(ext_dir, ext_id))
                if name and any(k in name.lower() for k in keywords):
                    found.append(name)
    return found


def _scan_firefox_extensions():
    home = os.path.expanduser("~")
    system = platform.system()
    if system == "Linux":
        base = os.path.join(home, ".mozilla", "firefox")
    elif system == "Darwin":
        base = os.path.join(home, "Library", "Application Support", "Firefox", "Profiles")
    elif system == "Windows":
        base = os.path.join(os.environ.get("APPDATA", ""), "Mozilla", "Firefox", "Profiles")
    else:
        return []
    if not os.path.isdir(base):
        return []
    keywords = [k.lower() for k in SIGNATURES.get("extensions", {}).get("keywords", [])]
    found = []
    try:
        profiles = os.listdir(base)
    except OSError:
        return []
    for profile in profiles:
        try:
            with open(os.path.join(base, profile, "extensions.json"), encoding="utf-8") as f:
                data = json.load(f)
        except Exception:
            continue
        for addon in data.get("addons", []) if isinstance(data, dict) else []:
            loc = addon.get("defaultLocale", {}) if isinstance(addon, dict) else {}
            name = (loc or {}).get("name") or (addon.get("id", "") if isinstance(addon, dict) else "")
            if isinstance(name, str) and any(k in name.lower() for k in keywords):
                found.append(name)
    return found


def detect_extensions():
    try:
        names = _scan_chromium_extensions() + _scan_firefox_extensions()
    except Exception as exc:  # noqa: BLE001
        print("[warn] extension scan failed ({})".format(exc), file=sys.stderr)
        return []
    return sorted(set(names))


# --- Status assembly ---------------------------------------------------------

def _cached_scans():
    """Capture-device + extension scans, refreshed at most every SCAN_CACHE_TTL."""
    now = time.monotonic()
    if now - _scan_cache["at"] > SCAN_CACHE_TTL:
        _scan_cache["captureDevices"] = detect_capture_devices()
        _scan_cache["extensions"] = detect_extensions()
        _scan_cache["at"] = now
    return _scan_cache["captureDevices"], _scan_cache["extensions"]


def build_status():
    proc_threats = detect_processes()
    capture_devices, extensions = _cached_scans()
    active_recording = detect_active_screencast()  # fresh each call — must be timely

    recorders = [p["name"] for p in proc_threats if p["category"] != "Video downloader"]
    recorders += active_recording
    downloaders = [p["name"] for p in proc_threats if p["category"] == "Video downloader"]

    threats = list(proc_threats)
    threats += [{"category": "Screen recording", "name": n} for n in active_recording]
    threats += [{"category": "Capture device", "name": n} for n in capture_devices]
    threats += [{"category": "Browser extension", "name": n} for n in extensions]

    return {
        "installed": True,
        "version": VERSION,
        "brand": BRAND,
        "platform": normalize_platform(),
        "recorders": recorders,
        "downloaders": downloaders,
        "captureDevices": capture_devices,
        "extensions": extensions,
        "threats": threats,
        "clean": len(threats) == 0,
        "checkedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
    }


# --- HTTP server -------------------------------------------------------------

class AgentHandler(BaseHTTPRequestHandler):
    server_version = "ArqxAtlasAgent/" + VERSION

    def _resolved_origin(self):
        request_origin = self.headers.get("Origin")
        if request_origin and request_origin == AGENT_ALLOWED_ORIGIN:
            return request_origin
        return AGENT_ALLOWED_ORIGIN

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", self._resolved_origin())
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Cache-Control", "no-store")

    def _send_json(self, status, payload):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self._cors_headers()
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):  # noqa: N802
        self.send_response(204)
        self._cors_headers()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def do_GET(self):  # noqa: N802
        path = self.path.split("?", 1)[0].rstrip("/") or "/"
        if path == "/health":
            self._send_json(200, {"ok": True, "brand": BRAND, "version": VERSION})
            return
        if path == "/status":
            try:
                self._send_json(200, build_status())
            except Exception as exc:  # noqa: BLE001 - status must never 500
                print("[error] status build failed ({})".format(exc), file=sys.stderr)
                self._send_json(200, {"installed": True, "version": VERSION, "brand": BRAND,
                                      "platform": normalize_platform(), "recorders": [], "downloaders": [],
                                      "captureDevices": [], "extensions": [], "threats": [], "clean": True,
                                      "checkedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")})
            return
        self._send_json(404, {"error": "not found"})

    def log_message(self, fmt, *args):  # noqa: A002
        sys.stderr.write("[req] %s - %s\n" % (self.address_string(), fmt % args))


def _signature_count():
    procs = sum(len(v) for v in SIGNATURES.get("processes", {}).values())
    exts = len(SIGNATURES.get("extensions", {}).get("ids", {}))
    caps = len(SIGNATURES.get("captureDeviceKeywords", []))
    return procs, exts, caps


def main():
    try:
        httpd = ThreadingHTTPServer((AGENT_HOST, AGENT_PORT), AgentHandler)
    except OSError as exc:
        print("[fatal] cannot bind {}:{} ({})".format(AGENT_HOST, AGENT_PORT, exc), file=sys.stderr)
        sys.exit(1)

    procs, exts, caps = _signature_count()
    print("=" * 64)
    print(" ARQX Atlas — DRMShield endpoint protection agent v{}".format(VERSION))
    print(" Built by ARQX Atlas")
    print(" listening on http://{}:{}".format(AGENT_HOST, AGENT_PORT))
    print(" platform: {}".format(normalize_platform()))
    print(" signatures: {} process, {} extension ids, {} capture keywords".format(procs, exts, caps))
    print(" allowed origin: {}".format(AGENT_ALLOWED_ORIGIN))
    print("=" * 64)
    print(" endpoints: GET /status  GET /health   (Ctrl+C to stop)")
    sys.stdout.flush()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n[info] shutting down (Ctrl+C)")
    finally:
        httpd.server_close()


if __name__ == "__main__":
    main()
