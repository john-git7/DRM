// ARQX Atlas — DRMShield endpoint protection agent (Go port).
//
// A single static binary that detects screen recorders, screenshot tools, video
// downloaders, capture browser extensions, hardware capture devices, and active OS
// screen recording, and reports them to the DRMShield player on localhost:7891.
//
// Same HTTP contract and signatures.json format as the Python agent. Standard
// library only — no third-party modules — so it cross-compiles to a single binary
// for Windows, macOS, and Linux with `go build` (see build-all.sh).
//
// Scope: user-space detection. It raises the cost of casual capture and blocks
// playback via the player, but cannot prevent the OS compositor's own capture.
// Built by ARQX Atlas. See ../SECURITY.md.
package main

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"
)

const (
	version = "2.0.0"
	brand   = "ARQX Atlas"
)

//go:embed signatures.json
var embeddedSignatures []byte

// --- Signature model ---------------------------------------------------------

type procSig struct {
	Name  string   `json:"name"`
	Match []string `json:"match"`
}

type signatures struct {
	Processes             map[string][]procSig `json:"processes"`
	CaptureDeviceKeywords []string             `json:"captureDeviceKeywords"`
	Extensions            struct {
		Ids      map[string]string `json:"ids"`
		Keywords []string          `json:"keywords"`
	} `json:"extensions"`
}

type threat struct {
	Category string `json:"category"`
	Name     string `json:"name"`
}

type status struct {
	Installed      bool     `json:"installed"`
	Version        string   `json:"version"`
	Brand          string   `json:"brand"`
	Platform       string   `json:"platform"`
	Recorders      []string `json:"recorders"`
	Downloaders    []string `json:"downloaders"`
	CaptureDevices []string `json:"captureDevices"`
	Extensions     []string `json:"extensions"`
	Threats        []threat `json:"threats"`
	Clean          bool     `json:"clean"`
	CheckedAt      string   `json:"checkedAt"`
}

var sigs signatures

func loadSignatures() {
	// Prefer an external signatures.json next to the binary (lets users customize
	// without rebuilding); fall back to the embedded copy.
	data := embeddedSignatures
	if exe, err := os.Executable(); err == nil {
		ext := filepath.Join(filepath.Dir(exe), "signatures.json")
		if b, err := os.ReadFile(ext); err == nil && len(b) > 0 {
			data = b
		}
	}
	if err := json.Unmarshal(data, &sigs); err != nil {
		fmt.Fprintf(os.Stderr, "[warn] failed to parse signatures.json (%v); using embedded\n", err)
		_ = json.Unmarshal(embeddedSignatures, &sigs)
	}
}

// --- helpers -----------------------------------------------------------------

func normalizePlatform() string {
	switch runtime.GOOS {
	case "windows":
		return "win32"
	case "darwin":
		return "darwin"
	case "linux":
		return "linux"
	default:
		return runtime.GOOS
	}
}

func isAlnum(b byte) bool {
	return (b >= 'a' && b <= 'z') || (b >= '0' && b <= '9')
}

func allDigits(s string) bool {
	if s == "" {
		return false
	}
	for i := 0; i < len(s); i++ {
		if s[i] < '0' || s[i] > '9' {
			return false
		}
	}
	return true
}

// signatureMatches reports whether needle appears in proc as a whole token
// (alphanumeric boundaries) — so "obsidian" does not match the "obs" signature.
// proc and needle must already be lowercased. RE2 has no lookaround, so this is
// implemented manually.
func signatureMatches(proc, needle string) bool {
	if needle == "" {
		return false
	}
	for start := 0; start <= len(proc)-len(needle); {
		idx := strings.Index(proc[start:], needle)
		if idx < 0 {
			return false
		}
		i := start + idx
		before := i == 0 || !isAlnum(proc[i-1])
		end := i + len(needle)
		after := end >= len(proc) || !isAlnum(proc[end])
		if before && after {
			return true
		}
		start = i + 1
	}
	return false
}

func normalizeProcName(raw string) string {
	name := strings.ToLower(strings.TrimSpace(raw))
	name = strings.ReplaceAll(name, "\\", "/")
	if i := strings.LastIndex(name, "/"); i >= 0 {
		name = name[i+1:]
	}
	return strings.TrimSuffix(name, ".exe")
}

func runCmd(timeoutSec int, name string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), time.Duration(timeoutSec)*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, name, args...).Output()
	return string(out), err
}

func dedupSorted(in []string) []string {
	seen := map[string]bool{}
	out := []string{}
	for _, s := range in {
		if !seen[s] {
			seen[s] = true
			out = append(out, s)
		}
	}
	sort.Strings(out)
	return out
}

// --- process detection -------------------------------------------------------

func listProcessNames() ([]string, error) {
	if runtime.GOOS == "windows" {
		out, err := runCmd(10, "tasklist", "/FO", "CSV", "/NH")
		if err != nil {
			return nil, err
		}
		var names []string
		for _, line := range strings.Split(out, "\n") {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			first := strings.SplitN(line, ",", 2)[0]
			names = append(names, strings.Trim(first, "\""))
		}
		return names, nil
	}
	out, err := runCmd(10, "ps", "-axco", "comm")
	if err != nil {
		out, err = runCmd(10, "ps", "-eo", "comm")
		if err != nil {
			return nil, err
		}
	}
	var names []string
	for i, line := range strings.Split(out, "\n") {
		if i == 0 && (strings.EqualFold(strings.TrimSpace(line), "COMMAND") || strings.EqualFold(strings.TrimSpace(line), "COMM")) {
			continue
		}
		if strings.TrimSpace(line) != "" {
			names = append(names, line)
		}
	}
	return names, nil
}

func detectProcesses() []threat {
	raw, err := listProcessNames()
	if err != nil {
		fmt.Fprintf(os.Stderr, "[warn] process enumeration failed (%v)\n", err)
		return []threat{}
	}
	normalized := make([]string, 0, len(raw))
	for _, n := range raw {
		normalized = append(normalized, normalizeProcName(n))
	}
	found := []threat{}
	seen := map[string]bool{}
	for category, list := range sigs.Processes {
		for _, sig := range list {
			matched := false
			for _, needle := range sig.Match {
				nd := strings.ToLower(strings.TrimSpace(needle))
				for _, proc := range normalized {
					if signatureMatches(proc, nd) {
						matched = true
						break
					}
				}
				if matched {
					break
				}
			}
			key := category + "|" + sig.Name
			if matched && !seen[key] {
				seen[key] = true
				found = append(found, threat{Category: category, Name: sig.Name})
			}
		}
	}
	return found
}

// --- capture device detection ------------------------------------------------

func detectCaptureDevices() []string {
	if len(sigs.CaptureDeviceKeywords) == 0 {
		return []string{}
	}
	kws := make([]string, 0, len(sigs.CaptureDeviceKeywords))
	for _, k := range sigs.CaptureDeviceKeywords {
		kws = append(kws, strings.ToLower(k))
	}
	var names []string
	switch runtime.GOOS {
	case "linux":
		base := "/sys/class/video4linux"
		if entries, err := os.ReadDir(base); err == nil {
			for _, e := range entries {
				if b, err := os.ReadFile(filepath.Join(base, e.Name(), "name")); err == nil {
					names = append(names, strings.TrimSpace(string(b)))
				}
			}
		}
	case "darwin":
		if out, err := runCmd(12, "system_profiler", "SPCameraDataType", "SPUSBDataType"); err == nil {
			for _, l := range strings.Split(out, "\n") {
				l = strings.TrimRight(strings.TrimSpace(l), ":")
				if l != "" {
					names = append(names, l)
				}
			}
		}
	case "windows":
		ps := "Get-PnpDevice -Class Image,Camera,Media -Status OK | Select-Object -ExpandProperty FriendlyName"
		if out, err := runCmd(12, "powershell", "-NoProfile", "-Command", ps); err == nil {
			for _, l := range strings.Split(out, "\n") {
				if l = strings.TrimSpace(l); l != "" {
					names = append(names, l)
				}
			}
		}
	}
	var matched []string
	for _, n := range names {
		nl := strings.ToLower(n)
		for _, k := range kws {
			if strings.Contains(nl, k) {
				matched = append(matched, n)
				break
			}
		}
	}
	return dedupSorted(matched)
}

// --- active screen recording (Linux compositor recorders, e.g. GNOME) --------

func screencastDirs() []string {
	home, _ := os.UserHomeDir()
	cands := []string{filepath.Join(home, "Videos", "Screencasts"), filepath.Join(home, "Videos")}
	if out, err := runCmd(3, "xdg-user-dir", "VIDEOS"); err == nil {
		if v := strings.TrimSpace(out); v != "" {
			cands = append(cands, v, filepath.Join(v, "Screencasts"))
		}
	}
	seen := map[string]bool{}
	var dirs []string
	for _, d := range cands {
		rd, err := filepath.EvalSymlinks(d)
		if err != nil {
			rd = d
		}
		if !seen[rd] {
			if info, err := os.Stat(rd); err == nil && info.IsDir() {
				seen[rd] = true
				dirs = append(dirs, rd)
			}
		}
	}
	return dirs
}

func looksLikeScreencast(name string) bool {
	low := strings.ToLower(name)
	return strings.HasPrefix(low, "screencast") &&
		(strings.HasSuffix(low, ".webm") || strings.HasSuffix(low, ".mp4") ||
			strings.HasSuffix(low, ".mkv") || strings.HasSuffix(low, ".ogv"))
}

func openFdHolder(dirs []string) string {
	procEntries, err := os.ReadDir("/proc")
	if err != nil {
		return ""
	}
	for _, pe := range procEntries {
		pid := pe.Name()
		if !allDigits(pid) {
			continue
		}
		fdDir := "/proc/" + pid + "/fd"
		fds, err := os.ReadDir(fdDir)
		if err != nil {
			continue
		}
		for _, fd := range fds {
			target, err := os.Readlink(filepath.Join(fdDir, fd.Name()))
			if err != nil {
				continue
			}
			base := filepath.Base(target)
			if !looksLikeScreencast(base) {
				continue
			}
			for _, d := range dirs {
				if strings.HasPrefix(target, d+string(os.PathSeparator)) {
					comm := "pid " + pid
					if b, err := os.ReadFile("/proc/" + pid + "/comm"); err == nil {
						comm = strings.TrimSpace(string(b))
					}
					return comm + " (" + base + ")"
				}
			}
		}
	}
	return ""
}

func detectActiveScreencast() []string {
	if runtime.GOOS != "linux" {
		return []string{}
	}
	dirs := screencastDirs()
	if len(dirs) == 0 {
		return []string{}
	}
	if h := openFdHolder(dirs); h != "" {
		return []string{"Active screen recording — " + h}
	}
	now := time.Now()
	for _, d := range dirs {
		entries, err := os.ReadDir(d)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if looksLikeScreencast(e.Name()) {
				if info, err := e.Info(); err == nil && now.Sub(info.ModTime()) < 8*time.Second {
					return []string{"Active screen recording — " + e.Name()}
				}
			}
		}
	}
	return []string{}
}

// --- browser extension detection ---------------------------------------------

func chromeUserDataDirs() []string {
	home, _ := os.UserHomeDir()
	var rel []string
	switch runtime.GOOS {
	case "linux":
		base := filepath.Join(home, ".config")
		for _, r := range []string{"google-chrome", "google-chrome-beta", "chromium", "microsoft-edge", "BraveSoftware/Brave-Browser", "opera", "vivaldi"} {
			rel = append(rel, filepath.Join(base, filepath.FromSlash(r)))
		}
	case "darwin":
		base := filepath.Join(home, "Library", "Application Support")
		for _, r := range []string{"Google/Chrome", "Chromium", "Microsoft Edge", "BraveSoftware/Brave-Browser", "Vivaldi"} {
			rel = append(rel, filepath.Join(base, filepath.FromSlash(r)))
		}
	case "windows":
		local := os.Getenv("LOCALAPPDATA")
		rel = []string{
			filepath.Join(local, "Google", "Chrome", "User Data"),
			filepath.Join(local, "Microsoft", "Edge", "User Data"),
			filepath.Join(local, "BraveSoftware", "Brave-Browser", "User Data"),
			filepath.Join(local, "Chromium", "User Data"),
		}
	}
	var dirs []string
	for _, d := range rel {
		if info, err := os.Stat(d); err == nil && info.IsDir() {
			dirs = append(dirs, d)
		}
	}
	return dirs
}

func resolveLocalized(versionDir string, manifest map[string]json.RawMessage, msgToken string) string {
	key := msgToken
	if strings.HasPrefix(key, "__MSG_") && strings.HasSuffix(key, "__") {
		key = strings.TrimSuffix(strings.TrimPrefix(key, "__MSG_"), "__")
	}
	locale := "en"
	if raw, ok := manifest["default_locale"]; ok {
		_ = json.Unmarshal(raw, &locale)
	}
	for _, loc := range []string{locale, "en", "en_US"} {
		b, err := os.ReadFile(filepath.Join(versionDir, "_locales", loc, "messages.json"))
		if err != nil {
			continue
		}
		var msgs map[string]struct {
			Message string `json:"message"`
		}
		if json.Unmarshal(b, &msgs) != nil {
			continue
		}
		if m, ok := msgs[key]; ok && m.Message != "" {
			return m.Message
		}
		if m, ok := msgs[strings.ToLower(key)]; ok && m.Message != "" {
			return m.Message
		}
	}
	return ""
}

func readExtensionName(extIDDir string) string {
	versions, err := os.ReadDir(extIDDir)
	if err != nil {
		return ""
	}
	for _, v := range versions {
		if !v.IsDir() {
			continue
		}
		versionDir := filepath.Join(extIDDir, v.Name())
		b, err := os.ReadFile(filepath.Join(versionDir, "manifest.json"))
		if err != nil {
			continue
		}
		var m map[string]json.RawMessage
		if json.Unmarshal(b, &m) != nil {
			continue
		}
		var name string
		if raw, ok := m["name"]; ok {
			_ = json.Unmarshal(raw, &name)
		}
		if name == "" {
			continue
		}
		if strings.HasPrefix(name, "__MSG_") {
			if resolved := resolveLocalized(versionDir, m, name); resolved != "" {
				return resolved
			}
			continue
		}
		return name
	}
	return ""
}

func scanChromiumExtensions() []string {
	known := sigs.Extensions.Ids
	kws := make([]string, 0, len(sigs.Extensions.Keywords))
	for _, k := range sigs.Extensions.Keywords {
		kws = append(kws, strings.ToLower(k))
	}
	var found []string
	for _, udd := range chromeUserDataDirs() {
		profiles, err := os.ReadDir(udd)
		if err != nil {
			continue
		}
		for _, p := range profiles {
			if !(p.Name() == "Default" || strings.HasPrefix(p.Name(), "Profile")) {
				continue
			}
			extDir := filepath.Join(udd, p.Name(), "Extensions")
			ids, err := os.ReadDir(extDir)
			if err != nil {
				continue
			}
			for _, id := range ids {
				if name, ok := known[id.Name()]; ok {
					found = append(found, name)
					continue
				}
				name := readExtensionName(filepath.Join(extDir, id.Name()))
				if name == "" {
					continue
				}
				nl := strings.ToLower(name)
				for _, k := range kws {
					if strings.Contains(nl, k) {
						found = append(found, name)
						break
					}
				}
			}
		}
	}
	return found
}

func detectExtensions() []string {
	return dedupSorted(scanChromiumExtensions())
}

// --- cached scans + status ---------------------------------------------------

var (
	scanMu        sync.Mutex
	scanAt        time.Time
	cachedDevices = []string{}
	cachedExts    = []string{}
	scanCacheTTL  = 20 * time.Second
)

func cachedScans() ([]string, []string) {
	scanMu.Lock()
	defer scanMu.Unlock()
	if scanAt.IsZero() || time.Since(scanAt) > scanCacheTTL {
		cachedDevices = detectCaptureDevices()
		cachedExts = detectExtensions()
		scanAt = time.Now()
	}
	return cachedDevices, cachedExts
}

func buildStatus() status {
	proc := detectProcesses()
	devices, exts := cachedScans()
	active := detectActiveScreencast()

	recorders := []string{}
	downloaders := []string{}
	for _, p := range proc {
		if p.Category == "Video downloader" {
			downloaders = append(downloaders, p.Name)
		} else {
			recorders = append(recorders, p.Name)
		}
	}
	recorders = append(recorders, active...)

	threats := []threat{}
	threats = append(threats, proc...)
	for _, n := range active {
		threats = append(threats, threat{Category: "Screen recording", Name: n})
	}
	for _, n := range devices {
		threats = append(threats, threat{Category: "Capture device", Name: n})
	}
	for _, n := range exts {
		threats = append(threats, threat{Category: "Browser extension", Name: n})
	}

	return status{
		Installed: true, Version: version, Brand: brand, Platform: normalizePlatform(),
		Recorders: recorders, Downloaders: downloaders, CaptureDevices: devices,
		Extensions: exts, Threats: threats, Clean: len(threats) == 0,
		CheckedAt: time.Now().UTC().Format(time.RFC3339),
	}
}

// --- HTTP server -------------------------------------------------------------

var allowedOrigin = envOr("AGENT_ALLOWED_ORIGIN", "http://localhost:5173")

func cors(w http.ResponseWriter, r *http.Request) {
	origin := allowedOrigin
	if o := r.Header.Get("Origin"); o == allowedOrigin {
		origin = o
	}
	w.Header().Set("Access-Control-Allow-Origin", origin)
	w.Header().Set("Access-Control-Allow-Methods", "GET, OPTIONS")
	w.Header().Set("Access-Control-Allow-Headers", "Content-Type")
	w.Header().Set("Cache-Control", "no-store")
}

func writeJSON(w http.ResponseWriter, r *http.Request, code int, payload any) {
	cors(w, r)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(payload)
}

func handler(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodOptions {
		cors(w, r)
		w.WriteHeader(http.StatusNoContent)
		return
	}
	path := strings.TrimRight(strings.SplitN(r.URL.Path, "?", 2)[0], "/")
	if path == "" {
		path = "/"
	}
	switch path {
	case "/health":
		writeJSON(w, r, 200, map[string]any{"ok": true, "brand": brand, "version": version})
	case "/status":
		writeJSON(w, r, 200, buildStatus())
	default:
		writeJSON(w, r, 404, map[string]string{"error": "not found"})
	}
}

func envOr(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func main() {
	loadSignatures()
	host := envOr("AGENT_HOST", "127.0.0.1")
	port := envOr("AGENT_PORT", "7891")
	addr := host + ":" + port

	procCount := 0
	for _, l := range sigs.Processes {
		procCount += len(l)
	}
	fmt.Println(strings.Repeat("=", 64))
	fmt.Printf(" ARQX Atlas — DRMShield endpoint protection agent v%s (Go)\n", version)
	fmt.Println(" Built by ARQX Atlas")
	fmt.Printf(" listening on http://%s\n", addr)
	fmt.Printf(" platform: %s\n", normalizePlatform())
	fmt.Printf(" signatures: %d process, %d extension ids, %d capture keywords\n",
		procCount, len(sigs.Extensions.Ids), len(sigs.CaptureDeviceKeywords))
	fmt.Printf(" allowed origin: %s\n", allowedOrigin)
	fmt.Println(strings.Repeat("=", 64))
	fmt.Println(" endpoints: GET /status  GET /health   (Ctrl+C to stop)")

	mux := http.NewServeMux()
	mux.HandleFunc("/", handler)
	srv := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
	if err := srv.ListenAndServe(); err != nil {
		fmt.Fprintf(os.Stderr, "[fatal] %v\n", err)
		os.Exit(1)
	}
}
