#!/usr/bin/env python3
"""ARQX Atlas — cross-platform system-tray icon (Windows, macOS, Linux).

Shows the ARQX Atlas logo in the system tray / menu bar and runs the
agent's detection HTTP server in a background thread (or reuses one already running
on :7891). Quitting the tray menu stops it.

Cross-platform via `pystray` + `Pillow` (one code path for all three OSes):

    pip install pystray pillow         # see requirements.txt

Run:
    python tray.py

The per-OS installers set this up to start automatically at login. On Windows use
`pythonw tray.py` (no console window).
"""
import os
import sys
import threading
import webbrowser
from http.server import ThreadingHTTPServer

import agent  # the headless agent module (same directory)


def _resource(name):
    """Path to a bundled resource, working both from source and a frozen build."""
    base = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(base, name)


ICON_PATH = _resource("arqx-logo.png")


def _serve():
    """Serve the agent API, or quietly reuse one already running on the port."""
    try:
        httpd = ThreadingHTTPServer((agent.AGENT_HOST, agent.AGENT_PORT), agent.AgentHandler)
    except OSError:
        print("[tray] an agent is already running on :%d — reusing it" % agent.AGENT_PORT)
        return
    httpd.serve_forever()


def main():
    try:
        import pystray
        from PIL import Image
    except ImportError:
        sys.stderr.write(
            "The tray needs pystray + Pillow:\n    pip install pystray pillow\n"
            "Running headless instead (no tray icon).\n"
        )
        _serve()
        return

    threading.Thread(target=_serve, daemon=True).start()

    image = Image.open(ICON_PATH) if os.path.exists(ICON_PATH) else Image.new("RGBA", (64, 64), (124, 58, 237, 255))
    port = agent.AGENT_PORT

    def open_status(icon, item):
        webbrowser.open("http://127.0.0.1:%d/status" % port)

    def quit_agent(icon, item):
        # Remove the tray icon, then terminate every agent process (this tray plus
        # any headless/duplicate/native copy) so one Quit stops everything.
        try:
            icon.visible = False
            icon.stop()
        except Exception:
            pass
        agent.kill_all_instances()  # kills siblings, then os._exit(0) for self

    menu = pystray.Menu(
        pystray.MenuItem("ARQX Atlas — Protecting", None, enabled=False),
        pystray.MenuItem("Listening on 127.0.0.1:%d" % port, None, enabled=False),
        pystray.MenuItem("Open status page", open_status, default=True),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem("Quit (stop agent)", quit_agent),
    )
    icon = pystray.Icon("arqx-atlas-agent", image, "ARQX Atlas", menu)
    print("ARQX Atlas tray running — agent on http://127.0.0.1:%d" % agent.AGENT_PORT)
    icon.run()


if __name__ == "__main__":
    main()
