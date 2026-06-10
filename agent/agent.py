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
import signal
import subprocess
import sys
import time
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

# Hide subprocess console windows on Windows (prevents flickering cmd/powershell popups)
if platform.system() == "Windows":
    _original_check_output = subprocess.check_output
    def _hidden_check_output(*args, **kwargs):
        kwargs.setdefault("creationflags", 0x08000000)
        return _original_check_output(*args, **kwargs)
    subprocess.check_output = _hidden_check_output

VERSION = "2.0.0"
BRAND = "ARQX Atlas"

# Pure-ASCII wordmark (renders in Windows cmd, macOS, and Linux terminals alike).
ARQX_ASCII = "\n".join((
    "    A   RRRR   QQQ  X   X",
    "   A A  R   R Q   Q  X X ",
    "  AAAAA RRRR  Q Q Q   X  ",
    "  A   A R  R  Q  QQ  X X ",
    "  A   A R   R  QQQQ X   X",
))

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
            {"name": "Windows Snipping Tool", "match": ["snippingtool", "screensketch", "screenclip"], "active_only": ["screenclippinghost", "screenclip"]},
        ],
        "Video downloader": [
            {"name": "yt-dlp / youtube-dl", "match": ["yt-dlp", "youtube-dl"]},
            {"name": "ffmpeg", "match": ["ffmpeg"]},
        ],
    },
    "captureDeviceKeywords": ["elgato", "avermedia", "magewell", "blackmagic", "capture card", "usb capture"],
    "extensions": {"ids": {}, "keywords": ["screen record", "stream record", "capture"]},
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
    """Return a list of {category, name} for every matched running process.

    Two-branch dispatch per signature:
    - active_only present: flag only when at least one active_only token is found;
      match tokens (always-running siblings) are silently ignored.
    - active_only absent: original behaviour — flag on any match token.
    """
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
            key = (category, display)
            if key in seen:
                continue

            if "active_only" in sig:
                active_needles = [m.strip().lower() for m in sig["active_only"] if m.strip()]
                if any(
                    any(_signature_matches(proc, n) for n in active_needles)
                    for proc in normalized
                ):
                    seen.add(key)
                    found.append({"category": category, "name": display})
            else:
                needles = [m.strip().lower() for m in sig.get("match", []) if m.strip()]
                for proc in normalized:
                    if any(_signature_matches(proc, n) for n in needles):
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


# --- Active capture card detection (idle-plugged-in vs actually capturing) ---
#
# detect_capture_devices() above flags any matching hardware that is present.
# That causes false positives: an Elgato sitting plugged-in-but-idle, or NVIDIA
# ShadowPlay's always-running background service. The functions below only flag
# devices that are actively being read right now.
#
# Windows: enumerate video-capture device interface symlinks from the registry,
#          then probe each with CreateFileW. ERROR_SHARING_VIOLATION means
#          another process holds the device open — actively capturing.
# Linux:   scan /proc/<pid>/fd for symlinks that resolve to /dev/video* devices
#          whose kernel name matches our capture-card keywords.
# macOS:   no reliable non-privileged active-only method; falls back to static
#          detect_capture_devices() so behaviour is unchanged on macOS.

def _detect_active_capture_windows():
    try:
        import winreg
        import ctypes
    except ImportError:
        return []

    VIDEO_CAPTURE_GUID = "{65e8773d-8f56-11d0-a3b9-00a0c9223196}"
    reg_path = r"SYSTEM\CurrentControlSet\Control\DeviceClasses\\" + VIDEO_CAPTURE_GUID

    kernel32 = ctypes.windll.kernel32
    GENERIC_READ = 0x80000000
    FILE_SHARE_READ = 0x00000001
    FILE_SHARE_WRITE = 0x00000002
    OPEN_EXISTING = 3
    ERROR_SHARING_VIOLATION = 32
    INVALID_HANDLE_VALUE = ctypes.c_void_p(-1).value

    keywords = [k.lower() for k in SIGNATURES.get("captureDeviceKeywords", [])]
    active = []

    try:
        root = winreg.OpenKey(winreg.HKEY_LOCAL_MACHINE, reg_path)
    except OSError:
        return []

    try:
        idx = 0
        while True:
            try:
                dev_key_name = winreg.EnumKey(root, idx)
            except OSError:
                break
            idx += 1
            try:
                dev_key = winreg.OpenKey(root, dev_key_name)
            except OSError:
                continue
            try:
                try:
                    hash_key = winreg.OpenKey(dev_key, "#")
                    symlink = winreg.QueryValueEx(hash_key, "SymbolicLink")[0]
                    winreg.CloseKey(hash_key)
                except OSError:
                    continue
                try:
                    params = winreg.OpenKey(dev_key, r"#\Device Parameters")
                    friendly = winreg.QueryValueEx(params, "FriendlyName")[0]
                    winreg.CloseKey(params)
                except OSError:
                    friendly = dev_key_name
            finally:
                winreg.CloseKey(dev_key)

            if keywords and not any(k in friendly.lower() for k in keywords):
                continue

            h = kernel32.CreateFileW(
                symlink,
                GENERIC_READ,
                FILE_SHARE_READ | FILE_SHARE_WRITE,
                None,
                OPEN_EXISTING,
                0,
                None,
            )
            if h == INVALID_HANDLE_VALUE:
                if kernel32.GetLastError() == ERROR_SHARING_VIOLATION:
                    active.append(friendly)
            else:
                kernel32.CloseHandle(h)
    finally:
        winreg.CloseKey(root)

    return sorted(set(active))


def _detect_active_capture_linux():
    import glob

    video_devs = {}
    for dev in glob.glob("/dev/video*"):
        dev_name = os.path.basename(dev)
        try:
            with open("/sys/class/video4linux/%s/name" % dev_name, encoding="utf-8") as f:
                device_name = f.read().strip()
        except OSError:
            device_name = dev_name
        video_devs[dev] = device_name

    if not video_devs:
        return []

    keywords = [k.lower() for k in SIGNATURES.get("captureDeviceKeywords", [])]
    target_devs = {dev: name for dev, name in video_devs.items()
                   if not keywords or any(k in name.lower() for k in keywords)}
    if not target_devs:
        return []

    try:
        pids = [p for p in os.listdir("/proc") if p.isdigit()]
    except OSError:
        return []

    active, seen = [], set()
    for pid in pids:
        fd_dir = "/proc/%s/fd" % pid
        try:
            fds = os.listdir(fd_dir)
        except OSError:
            continue
        for fd in fds:
            try:
                link = os.readlink(os.path.join(fd_dir, fd))
            except OSError:
                continue
            if link not in target_devs or link in seen:
                continue
            seen.add(link)
            try:
                with open("/proc/%s/comm" % pid, encoding="utf-8") as f:
                    comm = f.read().strip()
            except OSError:
                comm = "pid " + pid
            active.append("Capture card active — %s (%s)" % (target_devs[link], comm))

    return sorted(set(active))


def detect_active_capture_devices():
    """Return capture card names being actively read (not just plugged in)."""
    sysname = platform.system()
    if sysname == "Windows":
        try:
            return _detect_active_capture_windows()
        except Exception as exc:  # noqa: BLE001
            print("[warn] active capture check (Windows) failed ({})".format(exc), file=sys.stderr)
            return []
    if sysname == "Linux":
        try:
            return _detect_active_capture_linux()
        except Exception as exc:  # noqa: BLE001
            print("[warn] active capture check (Linux) failed ({})".format(exc), file=sys.stderr)
            return []
    # macOS: no reliable active-only detection without Screen Recording permission
    return detect_capture_devices()


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
    """Name a process actively writing a video file (recording), else []."""
    sysname = platform.system()
    if sysname == "Linux" and os.path.isdir("/proc"):
        return _detect_active_recording_linux()
    if sysname in ("Windows", "Darwin"):
        return _detect_active_recording_fsgrow()
    return []


# Cross-platform behavioral catch-all for Windows/macOS (no /proc): a recorder
# keeps a video file *growing* and write-locked while it captures. We scan the
# usual output locations and flag any video file that grew since the last scan, or
# is currently write-locked, with a fresh mtime — so OBS, Game Bar, Bandicam, and
# even an unknown/renamed recorder are caught while active.
_FSGROW_CACHE = {}


def _candidate_record_dirs():
    home = os.path.expanduser("~")
    names = ("Videos", "Movies", "Desktop", "Documents", "Downloads", "Pictures")
    dirs = [os.path.join(home, n) for n in names]
    dirs.append(os.path.join(home, "Videos", "Captures"))        # Windows Game Bar default
    dirs.append(os.path.join(home, "Pictures", "Camera Roll"))   # Windows camera/capture
    # OneDrive-redirected Desktop/Documents/Pictures are common on managed Windows.
    od = os.environ.get("OneDrive") or os.environ.get("OneDriveConsumer")
    if od:
        dirs += [os.path.join(od, n) for n in ("Desktop", "Documents", "Pictures", "Videos")]
    pub = os.environ.get("PUBLIC")
    if pub:
        dirs.append(os.path.join(pub, "Videos"))
    tmp = os.environ.get("TEMP") or os.environ.get("TMP") or "/tmp"
    dirs.append(tmp)
    # De-dup while preserving order.
    seen, out = set(), []
    for d in dirs:
        if d not in seen and os.path.isdir(d):
            seen.add(d)
            out.append(d)
    return out


def _file_write_locked(path):
    """Windows: a file another process holds open for writing refuses an append
    open (sharing violation). Elsewhere concurrent opens are usually allowed, so
    the growth check carries macOS."""
    try:
        with open(path, "ab"):
            return False
    except OSError:
        return True


def _detect_active_recording_fsgrow():
    import time as _time
    now = _time.time()
    found, scanned, new_cache = [], 0, {}
    for d in _candidate_record_dirs():
        try:
            entries = os.listdir(d)
        except OSError:
            continue
        for name in entries:
            if not name.lower().endswith(_RECORD_VIDEO_EXTS):
                continue
            path = os.path.join(d, name)
            if any(m in path for m in _PIPELINE_MARKERS):
                continue
            try:
                st = os.stat(path)
            except OSError:
                continue
            scanned += 1
            if scanned > 4000:
                break
            new_cache[path] = st.st_size
            if now - st.st_mtime > 8:
                continue  # not being written right now
            prev = _FSGROW_CACHE.get(path)
            growing = prev is not None and st.st_size > prev
            if growing or _file_write_locked(path):
                found.append("Active screen recording — %s" % name)
    _FSGROW_CACHE.clear()
    _FSGROW_CACHE.update(new_cache)
    return sorted(set(found))[:5]


def _detect_active_recording_linux():
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


# Phrases that appear in the on-screen "you are sharing / presenting" indicator
# windows that Zoom, Teams, Meet, Discord, etc. show ONLY while actively sharing —
# so matching them flags an in-progress share, not merely a running conferencing app.
_WIN_SHARE_TITLE_PHRASES = (
    "you are screen sharing", "you're screen sharing", "stop sharing",
    "sharing your screen", "is sharing your screen", "you are presenting",
    "you're presenting", "stop presenting", "screen sharing", "you are sharing",
    "recording in progress", "go live",
)


def _detect_screen_sharing_windows():
    """Best-effort Windows screen-share detection: scan visible window titles for
    the active-sharing indicator that apps show while a share is in progress."""
    import ctypes
    from ctypes import wintypes

    user32 = ctypes.windll.user32
    titles = []

    @ctypes.WINFUNCTYPE(ctypes.c_bool, wintypes.HWND, wintypes.LPARAM)
    def _cb(hwnd, _lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        n = user32.GetWindowTextLengthW(hwnd)
        if n and n > 0:
            buf = ctypes.create_unicode_buffer(n + 1)
            user32.GetWindowTextW(hwnd, buf, n + 1)
            if buf.value:
                titles.append(buf.value.lower())
        return True

    user32.EnumWindows(_cb, 0)
    for t in titles:
        for p in _WIN_SHARE_TITLE_PHRASES:
            if p in t:
                return ["Active screen sharing — %s" % t[:60]]
    return []


def _macos_screen_watcher_present():
    """True if the WindowServer reports an active screen 'watcher' (i.e. the screen
    is being captured/recorded/mirrored right now), via the private CoreGraphics/
    SkyLight call `bool CGSIsScreenWatcherPresent(void)`.

    This is the strongest macOS signal: it needs NO Screen Recording permission and
    fires for ScreenCaptureKit, the built-in screencapture/QuickTime, Zoom/Teams/
    Discord screen share, and AirPlay mirroring. It cannot name the capturing app
    (the window-title scan below adds that when permission is granted)."""
    import ctypes
    for path in (
        "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics",
        "/System/Library/PrivateFrameworks/SkyLight.framework/SkyLight",
    ):
        try:
            lib = ctypes.cdll.LoadLibrary(path)
        except OSError:
            continue
        if not hasattr(lib, "CGSIsScreenWatcherPresent"):
            continue
        fn = lib.CGSIsScreenWatcherPresent
        fn.restype = ctypes.c_bool
        fn.argtypes = []
        try:
            return bool(fn())
        except Exception:
            continue
    return False


def _macos_share_window_label():
    """Best-effort name of the sharing app from on-screen window titles. Returns ""
    when the agent lacks Screen Recording permission (titles are redacted then)."""
    import ctypes
    from ctypes import c_void_p, c_uint32, c_long, c_char_p, create_string_buffer

    cg = ctypes.cdll.LoadLibrary(
        "/System/Library/Frameworks/CoreGraphics.framework/CoreGraphics")
    cf = ctypes.cdll.LoadLibrary(
        "/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation")
    cg.CGWindowListCopyWindowInfo.restype = c_void_p
    cg.CGWindowListCopyWindowInfo.argtypes = [c_uint32, c_uint32]
    cf.CFArrayGetCount.restype = c_long
    cf.CFArrayGetCount.argtypes = [c_void_p]
    cf.CFArrayGetValueAtIndex.restype = c_void_p
    cf.CFArrayGetValueAtIndex.argtypes = [c_void_p, c_long]
    cf.CFDictionaryGetValue.restype = c_void_p
    cf.CFDictionaryGetValue.argtypes = [c_void_p, c_void_p]
    cf.CFStringCreateWithCString.restype = c_void_p
    cf.CFStringCreateWithCString.argtypes = [c_void_p, c_char_p, c_uint32]
    cf.CFStringGetCString.restype = ctypes.c_bool
    cf.CFStringGetCString.argtypes = [c_void_p, c_char_p, c_long, c_uint32]
    cf.CFRelease.argtypes = [c_void_p]
    UTF8 = 0x08000100

    def to_str(ref):
        if not ref:
            return ""
        buf = create_string_buffer(512)
        if cf.CFStringGetCString(ref, buf, 512, UTF8):
            return buf.value.decode("utf-8", "ignore")
        return ""

    arr = cg.CGWindowListCopyWindowInfo(1, 0)  # kCGWindowListOptionOnScreenOnly, kCGNullWindowID
    if not arr:
        return ""
    key = cf.CFStringCreateWithCString(None, b"kCGWindowName", UTF8)
    titles = []
    try:
        for i in range(cf.CFArrayGetCount(arr)):
            d = cf.CFArrayGetValueAtIndex(arr, i)
            t = to_str(cf.CFDictionaryGetValue(d, key)).lower()
            if t:
                titles.append(t)
    finally:
        cf.CFRelease(arr)
        cf.CFRelease(key)
    for t in titles:
        if any(p in t for p in _WIN_SHARE_TITLE_PHRASES):
            return t[:60]
    return ""


def _detect_screen_sharing_macos():
    """macOS capture/share detection. Primary signal is the WindowServer's screen-
    watcher flag (no permission, catches all capture); the window-title scan adds
    the app name when Screen Recording permission is granted."""
    watching = False
    try:
        watching = _macos_screen_watcher_present()
    except Exception:
        watching = False
    label = ""
    try:
        label = _macos_share_window_label()
    except Exception:
        label = ""
    if watching:
        return ["Active screen capture/recording" + (" — %s" % label if label else " (macOS)")]
    if label:  # watcher API unavailable but a sharing-indicator window is visible
        return ["Active screen sharing — %s" % label]
    return []


def detect_screen_sharing():
    """Detect an active screen share/stream, else []."""
    sysname = platform.system()
    if sysname == "Windows":
        try:
            return _detect_screen_sharing_windows()
        except Exception:
            return []
    if sysname == "Darwin":
        try:
            return _detect_screen_sharing_macos()
        except Exception:
            return []
    if sysname != "Linux":
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
    active_recording = detect_active_recording()        # fresh — must be timely
    screen_sharing = detect_screen_sharing()            # fresh — must be timely
    active_capture = detect_active_capture_devices()   # fresh — active-only, not idle presence

    recorders = [p["name"] for p in proc_threats if p["category"] != "Video downloader"]
    recorders += active_recording + screen_sharing
    downloaders = [p["name"] for p in proc_threats if p["category"] == "Video downloader"]

    threats = list(proc_threats)
    threats += [{"category": "Screen recording", "name": n} for n in active_recording]
    threats += [{"category": "Screen sharing", "name": n} for n in screen_sharing]
    threats += [{"category": "Capture device", "name": n} for n in active_capture]
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


# --- Instance management (used by the tray's "Quit") -------------------------
#
# A single Quit should stop the agent completely — this tray plus any other copy
# (a headless autostart instance, a duplicate, the native binary). We find them by
# command line and terminate each, then exit ourselves last.

_AGENT_MARKERS = ("tray.py", "agent.py", "arqx-agent", "arqx-atlas")


def _proc_cmdlines():
    """Yield (pid, lowercased command line) for all processes. Best-effort, stdlib-only."""
    sysname = platform.system()
    if sysname == "Linux":
        try:
            pids = os.listdir("/proc")
        except OSError:
            return
        for pid in pids:
            if not pid.isdigit():
                continue
            try:
                with open("/proc/%s/cmdline" % pid, "rb") as f:
                    cl = f.read().replace(b"\x00", b" ").decode("utf-8", "ignore")
            except OSError:
                continue
            yield int(pid), cl.lower()
    elif sysname == "Darwin":
        try:
            out = subprocess.check_output(["ps", "-axww", "-o", "pid=,command="],
                                          text=True, timeout=10)
        except Exception:
            return
        for line in out.splitlines():
            line = line.strip()
            num, _, rest = line.partition(" ")
            if num.isdigit():
                yield int(num), rest.lower()
    elif sysname == "Windows":
        ps = ("Get-CimInstance Win32_Process | "
              "ForEach-Object { \"$($_.ProcessId)`t$($_.CommandLine)\" }")
        try:
            out = subprocess.check_output(["powershell", "-NoProfile", "-Command", ps],
                                          text=True, timeout=15)
        except Exception:
            return
        for line in out.splitlines():
            pid, tab, cl = line.partition("\t")
            if tab and pid.strip().isdigit():
                yield int(pid.strip()), cl.lower()


def running_agent_pids():
    """PIDs of every running ARQX Atlas agent process (tray / headless / native)."""
    return [pid for pid, cl in _proc_cmdlines() if any(m in cl for m in _AGENT_MARKERS)]


def kill_all_instances():
    """Terminate every agent process — this one LAST — then exit. A single tray
    Quit stops the agent completely."""
    me = os.getpid()
    for pid in running_agent_pids():
        if pid == me:
            continue
        try:
            if platform.system() == "Windows":
                subprocess.run(["taskkill", "/F", "/T", "/PID", str(pid)],
                               stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=8)
            else:
                os.kill(pid, signal.SIGTERM)
        except Exception:
            pass
    os._exit(0)


# --- HTTP server -------------------------------------------------------------

class AgentServer(ThreadingHTTPServer):
    allow_reuse_address = False  # Crucial on Windows: prevents multiple agents from binding the same port!

    def handle_error(self, request, client_address):
        exc = sys.exc_info()[1]
        if isinstance(exc, (ConnectionAbortedError, BrokenPipeError, ConnectionResetError)):
            return  # client closed connection mid-response — expected, not an error
        super().handle_error(request, client_address)


class AgentHandler(BaseHTTPRequestHandler):
    server_version = "ArqxAtlasAgent/" + VERSION

    def _resolved_origin(self):
        request_origin = self.headers.get("Origin")
        allowed = ["http://localhost:5173", "https://drm-client.vercel.app"]
        if request_origin and (request_origin in allowed or _is_localhost_origin(request_origin)):
            return request_origin
        return "https://drm-client.vercel.app"

    def _cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", self._resolved_origin())
        self.send_header("Access-Control-Allow-Methods", "GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Private-Network", "true")
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
        self.send_response(200)
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
                if sys.stderr:
                    try:
                        print("[error] status build failed ({})".format(exc), file=sys.stderr)
                    except Exception:
                        pass
                self._send_json(200, {"installed": True, "version": VERSION, "brand": BRAND,
                                      "platform": normalize_platform(), "recorders": [], "downloaders": [],
                                      "captureDevices": [], "extensions": [], "threats": [], "clean": True,
                                      "checkedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")})
            return
        self._send_json(404, {"error": "not found"})

    def log_message(self, fmt, *args):  # noqa: A002
        if sys.stderr:
            try:
                sys.stderr.write("[req] %s - %s\n" % (self.address_string(), fmt % args))
            except Exception:
                pass


def _signature_count():
    procs = sum(len(v) for v in SIGNATURES.get("processes", {}).values())
    exts = len(SIGNATURES.get("extensions", {}).get("ids", {}))
    caps = len(SIGNATURES.get("captureDeviceKeywords", []))
    return procs, exts, caps


def main():
    try:
        httpd = AgentServer((AGENT_HOST, AGENT_PORT), AgentHandler)
    except OSError as exc:
        print("[fatal] cannot bind {}:{} ({})".format(AGENT_HOST, AGENT_PORT, exc), file=sys.stderr)
        sys.exit(1)

    procs, exts, caps = _signature_count()
    print(ARQX_ASCII)
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
