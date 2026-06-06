# DRMShield Mobile App (Capacitor hybrid — Option B)

This wraps the existing React/HLS.js web client as a native **Android and iOS** app using [Capacitor](https://capacitorjs.com), so it can use OS-level screen protection that a mobile browser cannot. The web codebase is reused unchanged; the native shell adds the protection.

See [`MOBILE_SECURITY.md`](./MOBILE_SECURITY.md) for the rationale (Option B vs. native vs. pure web).

## What protection the native build adds

Driven by `@capacitor-community/privacy-screen`, configured in `client/capacitor.config.ts` and wired in `client/src/utils/mobileProtection.ts`:

- **Android** — `WindowManager.FLAG_SECURE` is set, so screenshots, screen recordings, and the recents/app-switcher preview are **blocked at the OS level** (the capture comes out black).
- **iOS** — a privacy overlay covers the app in the app switcher and screenshots are prevented; FairPlay video (when used) is blacked out of recordings by the OS.
- **Detection → blackout + audit** — the plugin's `screenRecordingStarted/Stopped` and `screenshotTaken` events are handled in `PlayerPage`: a recording blacks out the player (the same `CaptureBlackout` overlay the desktop agent triggers) and logs `screen-capture-detected` / `screenshot-detected` to the audit log.
- **Forensic QR + scanner, DevTools/focus hardening, and the encrypted key flow** all work unchanged from the web build.

On the plain web build every native call is a guarded no-op, so one codebase runs everywhere.

## Prerequisites

- Node 24 + pnpm (as for the web client).
- **Android:** Android Studio + JDK 17. The screen-recording detection events use the Android 15 (API 35) `DETECT_SCREEN_RECORDING` permission, which the plugin declares; `FLAG_SECURE` works on all versions.
- **iOS:** macOS + Xcode (iOS builds cannot be produced on Linux/Windows).

## Build & run

From `client/`:

```bash
pnpm install
pnpm build                 # produce the web bundle in client/dist

# add the native platforms once (generates client/android and/or client/ios)
pnpm exec cap add android
pnpm exec cap add ios      # macOS only

# thereafter, sync the latest web build + config into the native projects
pnpm cap:android           # = pnpm build && cap sync android && cap open android
pnpm cap:ios               # = pnpm build && cap sync ios   && cap open ios
```

`cap open` launches Android Studio / Xcode; build and run on a device or emulator from there. `client/android` and `client/ios` are gitignored by default — once you customize the native side (icons, manifest, signing), un-ignore and commit them.

## Pointing the app at your server (important)

The bundled web app calls the API at `VITE_API_BASE` (default `http://localhost:5000/api`). On a phone, `localhost` is the phone, not your server — set a reachable address **before building**:

```bash
VITE_API_BASE="https://your-server.example.com/api" pnpm build && pnpm exec cap sync
```

The recorder-detection *desktop agent* (`localhost:7891`) is not used on mobile — the OS screen protection above replaces it. If you keep the agent gate, make it skip on native (it already treats an unreachable agent as "not installed"; gate that on `isNativeApp()` if you want playback to proceed on mobile).

## DRM on mobile (where to go next)

Video plays through the WebView's EME stack: **Widevine** on Android, **FairPlay** on iOS. For hardware-grade key protection, point the player at Widevine/FairPlay license endpoints (the natural extension of the existing key-grant server). Note that `FLAG_SECURE` already blocks screen capture regardless of the Widevine security level, so casual screen recording is stopped even without Widevine L1.

## Limitations

- **Rooted / jailbroken** devices can defeat `FLAG_SECURE`. Add integrity attestation (Play Integrity API / Apple App Attest) and refuse protected playback when it fails (e.g. via Talsec freeRASP).
- A WebView generally does **not** get Widevine **L1** (hardware) — fine for blocking screen capture (that's `FLAG_SECURE`), relevant only if a content owner contractually requires L1.
- iOS cannot truly *block* screenshots (only detect); FairPlay video is blacked out regardless.
- A **camera pointed at the screen** defeats all OS controls — that is what the forensic QR watermark is for.
