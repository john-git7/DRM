#!/usr/bin/env python3
"""ARQX Atlas agent — system tray / taskbar icon (Linux, PyGObject + AppIndicator).

Shows the ARQX logo in the GNOME top bar and runs the agent's HTTP server in a
background thread (or reuses one already running on :7891). Quitting the menu stops it.

Unlike agent.py (stdlib only), the tray needs system GObject bindings — no pip, no
compiler:

    sudo apt install -y python3-gi gir1.2-ayatana-appindicator3-0.1

Run:
    python3 agent/tray.py

Autostart at login:
    mkdir -p ~/.config/autostart
    printf '[Desktop Entry]\\nType=Application\\nName=ARQX Atlas Agent\\nExec=python3 %s\\nX-GNOME-Autostart-enabled=true\\n' \\
      "$PWD/agent/tray.py" > ~/.config/autostart/arqx-atlas-agent.desktop
"""
import os
import sys
import threading
import webbrowser
from http.server import ThreadingHTTPServer

import gi
gi.require_version("Gtk", "3.0")
try:
    gi.require_version("AyatanaAppIndicator3", "0.1")
    from gi.repository import AyatanaAppIndicator3 as AppIndicator3
except (ValueError, ImportError):
    try:
        gi.require_version("AppIndicator3", "0.1")
        from gi.repository import AppIndicator3
    except (ValueError, ImportError):
        sys.stderr.write(
            "AppIndicator typelib not found. Install it:\n"
            "  sudo apt install -y gir1.2-ayatana-appindicator3-0.1\n"
        )
        sys.exit(1)
from gi.repository import Gtk

import agent  # the headless agent module (same directory)

AGENT_DIR = os.path.dirname(os.path.abspath(__file__))
ICON = os.path.join(AGENT_DIR, "arqx-logo.png")


def _serve():
    """Serve the agent API, or quietly reuse one already running on the port."""
    try:
        httpd = ThreadingHTTPServer((agent.AGENT_HOST, agent.AGENT_PORT), agent.AgentHandler)
    except OSError:
        print("[tray] an agent is already running on :%d — reusing it" % agent.AGENT_PORT)
        return
    httpd.serve_forever()


def main():
    threading.Thread(target=_serve, daemon=True).start()

    indicator = AppIndicator3.Indicator.new(
        "arqx-atlas-agent",
        ICON if os.path.exists(ICON) else "security-high",
        AppIndicator3.IndicatorCategory.APPLICATION_STATUS,
    )
    indicator.set_status(AppIndicator3.IndicatorStatus.ACTIVE)
    indicator.set_title("ARQX Atlas")

    menu = Gtk.Menu()

    heading = Gtk.MenuItem(label="ARQX Atlas — Protecting")
    heading.set_sensitive(False)
    menu.append(heading)
    menu.append(Gtk.SeparatorMenuItem())

    status = Gtk.MenuItem(label="Open status (:%d)" % agent.AGENT_PORT)
    status.connect("activate", lambda *_: webbrowser.open("http://127.0.0.1:%d/status" % agent.AGENT_PORT))
    menu.append(status)

    quit_item = Gtk.MenuItem(label="Quit")
    quit_item.connect("activate", lambda *_: Gtk.main_quit())
    menu.append(quit_item)

    menu.show_all()
    indicator.set_menu(menu)

    print("ARQX Atlas tray running — agent on http://127.0.0.1:%d" % agent.AGENT_PORT)
    try:
        Gtk.main()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
