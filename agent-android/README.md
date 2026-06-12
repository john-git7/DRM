# DRMShield Android Agent

A sideloaded companion app that extends the desktop recorder-detection agent
(Phase 3) to Android. It runs a foreground service hosting a small HTTP API on
`127.0.0.1:7891` — the same `/status` and `/health` contract the web player
already polls — so Chrome on Android can gate playback on the device's recording
state exactly as the desktop browser does.

This exists because no mobile browser can detect or block OS-level screen
recording on its own. A companion app is the only way to get a real on-device
signal without shipping commercial DRM. iOS is intentionally **not** covered:
Safari is sandboxed from other apps' localhost servers, so the same trick cannot
work there. On iOS (and on Android until this agent is installed), the player
falls back to the always-on visible forensic watermark for traceability.

## What it detects (and the honest limits)

Android exposes **no** public API that notifies an arbitrary app when *another*
app starts screen recording (`MediaProjection` callbacks fire only for the
projection your own app created). So this agent combines the signals that a
normal, non-root app genuinely can observe:

1. **Installed known-recorder packages** — a presence signal (a recorder is
   available on the device). Signatures live in `app/src/main/assets/recorders.json`.
2. **Active screen mirroring / casting** — a live signal from `DisplayManager`
   (a non-default display that is on means the screen is going to a TV/cast/capture
   sink).
3. **Active "screen recording" notification** — the closest thing to a live
   "recording in progress" signal, read by the optional `RecordingNotificationListener`
   once the user grants Notification access.

A determined user with root can still kill or spoof the agent — the same caveat
the desktop agent carries. This raises the cost of casual capture and feeds the
audit log; it is not, and cannot be, kernel-level capture prevention. For that you
need hardware DRM (Widevine L1 / FLAG_SECURE), which is explicitly out of scope.

### Stronger detection (optional extension)

For live detection of any recorder UI (not just notifications), add an
`AccessibilityService` that observes window-state changes and the system capture
indicator. It is the usual RASP route but needs the intrusive Accessibility
permission, so it is left out of this minimal build and noted here as the next
step if installed-app + cast + notification signals prove insufficient.

## Build

Requires Android Studio (Giraffe+) or a command-line Android SDK with JDK 17.
This project is **not** built by the repo's pnpm/Node tooling and cannot be
compiled in the web/server dev environment — open it as its own Android project.

```bash
# From agent-android/ with a configured Android SDK:
./gradlew assembleDebug
# → app/build/outputs/apk/debug/app-debug.apk
```

Or open `agent-android/` in Android Studio and Run.

A debug build is already produced and checked in for convenience at
`client/public/downloads/drmshield-agent.apk` (served by the player at
`/downloads/drmshield-agent.apk`). Rebuild it any time with:

```bash
cd agent-android
ANDROID_HOME=/path/to/android-sdk JAVA_HOME=/path/to/jdk17+ ./gradlew :app:assembleDebug
cp app/build/outputs/apk/debug/app-debug.apk ../client/public/downloads/drmshield-agent.apk
```

> Note: the GUI Android Studio IDE is **not** required to produce the APK — only
> the Android SDK + a JDK 17+ are. This build was made headlessly with the SDK and
> the Gradle wrapper.

## Install (sideload)

1. Transfer `app-debug.apk` to the device and install it (allow "install from
   unknown sources" for your file manager / browser).
2. Open **DRMShield Agent**, tap **Start protection**, and accept the notification
   permission. A persistent "DRMShield protection active" notification confirms the
   service and HTTP server are running.
3. (Optional) Tap **Enable live recording detection** and grant Notification access
   so an in-progress recording is detected, not just installed recorders.

## Turn it on in the web player

The player polls the Android agent only when explicitly enabled, so existing
Android viewers without the APK are not hard-blocked. Set this in the client's
`.env` and rebuild:

```
VITE_ANDROID_AGENT=1
```

With it set, `client/src/utils/agentCheck.ts` polls `127.0.0.1:7891` on Android
(via `VITE_AGENT_BASE`) just like desktop. Leave it unset to keep Android on
forensic-watermark-only playback.

### CORS / Private Network Access

An `https` page fetching `http://127.0.0.1` is a Private Network Access request.
Chrome sends a preflight with `Access-Control-Request-Private-Network: true`; the
agent answers with `Access-Control-Allow-Private-Network: true` (see
`AgentHttpServer.kt`). Make sure `VITE_AGENT_BASE` matches the agent's scheme/host
(`http://127.0.0.1:7891`).
