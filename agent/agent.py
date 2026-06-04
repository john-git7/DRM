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

_LOCALHOST_ORIGIN = re.compile(r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$")


def _is_localhost_origin(origin):
    return bool(_LOCALHOST_ORIGIN.match(origin))

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


# --- Active screen-recording / capture detection (Linux) ---------------------
#
# A recorder writes its output to a video file while it captures (a media player
# only *reads*). We detect any process holding a video file open for WRITING,
# regardless of the file's name or folder — so OBS, the GNOME built-in
# (gnome-shell), Kooha, ffmpeg, and a recorder that names files "Video_<time>.mp4"
# are all caught while active. Our own HLS pipeline (/streams/, /uploads/) is
# excluded so transcoding never self-triggers.

_RECORD_VIDEO_EXTS = (".mp4", ".webm", ".mkv", ".mov", ".flv", ".ogv", ".avi", ".m4v")
_PIPELINE_MARKERS = (os.sep + "streams" + os.sep, os.sep + "uploads" + os.sep)


def _fd_is_writable(pid, fd):
    """True if the given fd is open for writing (O_WRONLY/O_RDWR), per /proc fdinfo."""
    try:
        with open("/proc/%s/fdinfo/%s" % (pid, fd), encoding="utf-8") as f:
            for line in f:
                if line.startswith("flags:"):
                    return (int(line.split()[1], 8) & 3) in (1, 2)
    except OSError:
        pass
    return False


def detect_active_recording():
    """Name a process actively writing a video file (recording), else []. Linux /proc."""
    if platform.system() != "Linux" or not os.path.isdir("/proc"):
        return []
    try:
        pids = [p for p in os.listdir("/proc") if p.isdigit()]
    except OSError:
        return []
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
            if not target.lower().endswith(_RECORD_VIDEO_EXTS):
                continue
            if any(m in target for m in _PIPELINE_MARKERS):
                continue  # our own HLS output / uploads — not a capture
            if not _fd_is_writable(pid, fd):
                continue  # a player/reader, not a recorder
            try:
                with open("/proc/%s/comm" % pid, encoding="utf-8") as f:
                    comm = f.read().strip()
            except OSError:
                comm = "pid " + pid
            return ["Active screen recording — %s (%s)" % (comm, os.path.basename(target))]
    return []


# --- Active screen sharing / streaming detection (Wayland / PipeWire) ---------
#
# Discord/Zoom/OBS/browser "share screen" write no file — they capture the screen
# via xdg-desktop-portal -> PipeWire and stream it over the network. While a cast is
# active the compositor produces a "Stream/Output/Video" node; it does not exist
# otherwise. So that node's presence = the screen is being captured/streamed right now.

_SHARE_APPS = ("Discord", "WEBRTC", "OBS", "Streamlabs", "XSplit", "Wirecast", "vMix",
               "Zoom", "Teams", "Webex", "Skype", "Slack", "Telegram", "GoToMeeting",
               "Jitsi", "Meet", "Twitch", "StreamYard", "Steam", "Parsec", "Sunshine",
               "Moonlight", "AnyDesk", "TeamViewer", "RustDesk", "Chrome", "Chromium",
               "Firefox", "Brave", "Edge", "Opera", "Vivaldi", "vlc")


def detect_screen_sharing():
    """Detect an active PipeWire screencast (screen share/stream), else []. Linux."""
    if platform.system() != "Linux":
        return []
    env = dict(os.environ)
    env.setdefault("XDG_RUNTIME_DIR", "/run/user/%d" % os.getuid())
    out = ""
    for cmd in (["pw-cli", "ls", "Node"], ["pw-dump"]):
        try:
            out = subprocess.check_output(cmd, stderr=subprocess.DEVNULL, text=True, timeout=5, env=env)
            if out.strip():
                break
        except Exception:
            out = ""
    if "Stream/Output/Video" not in out:
        return []
    low = out.lower()
    apps = [a for a in _SHARE_APPS if a.lower() in low]
    label = ", ".join(dict.fromkeys(apps)) or "an app"
    return ["Active screen sharing/streaming — %s" % label]


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
    active_recording = detect_active_recording()  # fresh each call — must be timely
    screen_sharing = detect_screen_sharing()      # fresh each call — must be timely

    recorders = [p["name"] for p in proc_threats if p["category"] != "Video downloader"]
    recorders += active_recording + screen_sharing
    downloaders = [p["name"] for p in proc_threats if p["category"] == "Video downloader"]

    threats = list(proc_threats)
    threats += [{"category": "Screen recording", "name": n} for n in active_recording]
    threats += [{"category": "Screen sharing", "name": n} for n in screen_sharing]
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
        # Echo the configured origin, or ANY localhost/127.0.0.1 origin (any port) —
        # the player's dev port varies (5173/5174/5180…), and this agent is
        # localhost-only and serves only status, so reflecting localhost is safe.
        request_origin = self.headers.get("Origin")
        if request_origin and (request_origin == AGENT_ALLOWED_ORIGIN or _is_localhost_origin(request_origin)):
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
