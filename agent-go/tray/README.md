# ARQX Atlas agent — tray / taskbar app

Shows the **ARQX logo** in the system tray and runs the headless `arqx-agent` binary
as a child (Quit stops it). Menu: status link + Quit.

> ⚠️ Built on your machine, not in CI. A tray needs a GUI toolkit, so unlike the
> headless agent it is **not** pure-stdlib and does **not** cross-compile cleanly. It
> was not verified in the headless build environment.

## Build

```bash
# Linux (Debian/Ubuntu)
sudo apt install libgtk-3-dev libayatana-appindicator3-dev
cd agent-go/tray && go mod tidy && go build -o arqx-tray .

# macOS
cd agent-go/tray && go mod tidy && go build -o arqx-tray .

# Windows  (convert ../arqx-logo.png to icon.ico and embed it instead of icon.png)
cd agent-go\tray && go mod tidy && go build -o arqx-tray.exe .
```

Put the headless `arqx-agent` (from `../dist/`) next to the tray binary, then run
`./arqx-tray`. It launches the agent and shows the ARQX icon.

Dependency: [`fyne.io/systray`](https://github.com/fyne-io/systray) (MIT). `go mod tidy`
fetches it and writes `go.sum`.
