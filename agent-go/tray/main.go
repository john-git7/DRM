// ARQX Atlas agent — system tray / taskbar wrapper.
//
// Shows the ARQX logo in the tray and runs the headless `arqx-agent` binary as a
// child process. Quitting the tray stops the agent.
//
// NOT built/verified in the headless CI box (no display/GTK). Build it on your
// target machine:
//
//   Linux  : sudo apt install libgtk-3-dev libayatana-appindicator3-dev
//            cd agent-go/tray && go mod tidy && go build -o arqx-tray .
//   macOS  : cd agent-go/tray && go mod tidy && go build -o arqx-tray .
//   Windows: cd agent-go\tray && go mod tidy && go build -o arqx-tray.exe .
//            (convert arqx-logo.png -> icon.ico for the Windows tray icon)
//
// Place the headless `arqx-agent` (or arqx-agent.exe) next to the tray binary.
package main

import (
	_ "embed"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"

	"fyne.io/systray"
)

//go:embed icon.png
var iconPNG []byte

var agent *exec.Cmd

func main() {
	systray.Run(onReady, onExit)
}

func onReady() {
	systray.SetIcon(iconPNG) // on Windows, replace with an .ico via go:embed icon.ico
	systray.SetTitle("ARQX")
	systray.SetTooltip("ARQX Atlas — endpoint protection active")

	systray.AddMenuItem("ARQX Atlas — Protecting", "").Disable()
	systray.AddSeparator()
	mStatus := systray.AddMenuItem("Open status (:7891)", "Open the agent status endpoint")
	mQuit := systray.AddMenuItem("Quit", "Stop the agent")

	startAgent()

	go func() {
		for {
			select {
			case <-mStatus.ClickedCh:
				openURL("http://127.0.0.1:7891/status")
			case <-mQuit.ClickedCh:
				systray.Quit()
				return
			}
		}
	}()
}

func onExit() {
	if agent != nil && agent.Process != nil {
		_ = agent.Process.Kill()
	}
}

func startAgent() {
	exeDir, _ := os.Executable()
	bin := filepath.Join(filepath.Dir(exeDir), "arqx-agent")
	if runtime.GOOS == "windows" {
		bin += ".exe"
	}
	agent = exec.Command(bin)
	agent.Stdout, agent.Stderr = os.Stdout, os.Stderr
	_ = agent.Start()
}

func openURL(url string) {
	var cmd string
	var args []string
	switch runtime.GOOS {
	case "windows":
		cmd, args = "cmd", []string{"/c", "start", url}
	case "darwin":
		cmd, args = "open", []string{url}
	default:
		cmd, args = "xdg-open", []string{url}
	}
	_ = exec.Command(cmd, args...).Start()
}
