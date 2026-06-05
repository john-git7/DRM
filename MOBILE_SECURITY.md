# Mobile Security & DRM — Android / iOS, and the Library Direction

This document explains how DRMShield's protections translate to mobile (Android and iOS), and recommends how to package the whole system as an importable **library/SDK** for future reuse.

It is the mobile companion to [`SECURITY.md`](./SECURITY.md) (the web/desktop model) and [`agent/INSTALL.md`](./agent/INSTALL.md) (the desktop recorder-detection agent).

---

## 1. The desktop "agent" model does not port to mobile — and does not need to

On desktop, the agent is a **second process** that watches the OS for screen-recorder processes and answers the player over `localhost:7891`. Mobile operating systems make that model impossible:

- Apps are **sandboxed** and cannot enumerate or inspect other apps' processes.
- There is **no persistent localhost background service** an app can rely on the way a desktop daemon works.
- iOS in particular forbids long-lived background networking for this purpose.

Mobile achieves the **same outcomes** a different way, and in fact more strongly, because protection is enforced by the OS and GPU rather than by a cooperating helper a user could kill. The mobile equivalent is three layers:

1. **OS-level prevention** — captures come out black.
2. **OS-level detection** — the app is told a capture/mirror is happening and reacts.
3. **Hardware DRM** — keys and decrypted frames live in a secure pipeline the recorder can't reach.

---

## 2. Layer 1 — OS-level prevention (capture comes out black)

| | Android | iOS |
|---|---|---|
| Mechanism | `WindowManager.LayoutParams.FLAG_SECURE` on the window | FairPlay-protected `AVPlayer` video; a **secure layer** for other UI |
| Effect | Screenshots blocked; screen recordings / casts render **black**; window excluded from the Recents thumbnail | FairPlay video is **automatically blacked out** in screen recordings, QuickTime capture, and AirPlay mirroring |
| Notes | A single flag; works back to old Android versions. The single most important control. | iOS has no public "block screenshot" API. For non-DRM UI, host sensitive content in a `UITextField` with `isSecureTextEntry` — its secure sublayer is omitted from captures. For video, rely on FairPlay. |

This is the mobile analog of DRMShield's `CaptureBlackout`, except the OS compositor enforces it, so it cannot be bypassed by closing a helper process.

## 3. Layer 2 — OS-level detection (react: blackout / pause / log a forensic event)

This is the direct equivalent of the agent's "is a recorder running?" poll.

**Android 15 (API 35)** added real screen-recording **detection**:

- `WindowManager.addScreenRecordingCallback(executor, callback)`, gated by the new install-time permission **`DETECT_SCREEN_RECORDING`**.
- Reports two states (recording / not-recording) and fires on change. Register in `onStart()`, remove in `onStop()`.
- **Critical caveat:** read the value returned at registration. If a recording was *already* running when the app launched, the change callback never fires — an attacker simply starts recording first. Always seed the initial state.
- Pre-15 devices have **no detection API** → fall back to `FLAG_SECURE` (prevention only).

**iOS 11+**:

- `UIScreen.main.isCaptured` is `true` while the screen is being **recorded, mirrored, or AirPlayed**; observe `UIScreen.capturedDidChangeNotification`.
- **iOS 17+** adds the cleaner scene-level `UISceneCaptureState` / observation API.
- Screenshots can't be blocked, but `UIApplication.userDidTakeScreenshotNotification` fires **after** one is taken — ideal for logging a forensic event.

The agent's "threat → blackout + log to identity" maps to: detect via these callbacks → hide the player, overlay the viewer's identity, and POST a forensic event to the server (reusing the existing audit / forensic-token endpoints).

## 4. Layer 3 — Hardware DRM (the real content protection)

This is the mobile upgrade of DRMShield's AES-128 HLS + key-grant server: keys are handled in **secure hardware**, and decrypted frames never reach the screenshot/recording path.

- **Android → Google Widevine** (via ExoPlayer / Media3). **L1** = decrypt inside the TEE / secure video path (required by studios for HD/4K); **L3** = software only. Pair with **HDCP 2.2+** to block protected output over HDMI/cast.
- **iOS → Apple FairPlay Streaming** (via `AVPlayer` / HLS). The license is fetched from your key server; decryption happens in the secure media pipeline. This is why FairPlay video auto-blacks-out under capture.
- (**PlayReady** is the Windows / Smart-TV counterpart.)

With L1 / FairPlay the protected frames are never available to the OS capture path — materially stronger than browser AES-128, where the decrypted frames live in the page.

## 5. Capability mapping

| DRMShield capability (desktop/web) | Android | iOS |
|---|---|---|
| Detect screen recorder running | `addScreenRecordingCallback` (API 35+) | `UIScreen.isCaptured` / `sceneCaptureState` |
| Block capture (blackout) | `FLAG_SECURE` | FairPlay video / secure layer |
| Detect screenshot | (already blocked by `FLAG_SECURE`) | `userDidTakeScreenshotNotification` (after the fact) |
| Encrypted content + key gating | Widevine L1 + license server | FairPlay + license server |
| Output / HDMI restriction | HDCP via Widevine policy | HDCP enforced by FairPlay / AirPlay rules |
| Forensic watermark + scan | in-app overlay QR + `/forensic/decode` | in-app overlay QR + `/forensic/decode` |
| Separate "agent" process | not allowed (sandbox) | not allowed (sandbox, stricter) |

## 6. Recommended mobile architecture

A **native app** (or a cross-platform framework with native plugins), not a mobile browser:

1. **Always** set `FLAG_SECURE` (Android) / use FairPlay + secure entry (iOS) — the unbypassable baseline.
2. Wire the **detection callbacks**: on capture/mirroring, pause and black out the player, show the viewer identity, and log a forensic event to the server.
3. Serve video as **Widevine-L1 (HDCP 2.2+) / FairPlay** HLS/DASH from the existing key-server pattern — the natural extension of Phase-2 key grants to hardware DRM.
4. Keep the **forensic QR** as an in-app overlay; the existing encrypted-token scheme (`/api/forensic/token` + `/api/forensic/decode`) works unchanged.

## 7. Limitations (be honest)

- **Rooted / jailbroken** devices can defeat `FLAG_SECURE` and drop Widevine to L3. Add integrity attestation (**Play Integrity API** / **Apple App Attest**) and root/jailbreak checks, and refuse protected playback when they fail.
- **Detection ≠ prevention.** The Android 15 callback only detects; `FLAG_SECURE` / DRM is what prevents. Use both.
- The Android 15 **record-before-launch** gap (seed the initial state).
- A **camera pointed at the screen** defeats every OS control — which is exactly where the **forensic watermark** earns its place.

---

## 8. Packaging DRMShield as an importable library/SDK

Goal: `import` DRMShield and get the full secure-DRM feature set — encrypted playback, key gating, capture protection, recorder detection, and forensic watermark/scan — behind one small, stable API.

### 8.1 What stays central: the server is the trust anchor

The Express server (key grants, FairPlay/Widevine license issuance, forensic encrypt/decrypt, audit) is the security perimeter and **must not** move into the client. Package it as the **reference backend** with a documented REST contract; every client SDK is a thin, well-behaved client of that contract:

```
POST /api/auth/login            → JWT
POST /api/hls/:id/key-grant     → short-lived grant       (+ Widevine/FairPlay license endpoints)
GET  /api/hls/:id/key           → AES key (grant-gated)
POST /api/forensic/token        → encrypted forensic token (for the on-frame QR)
POST /api/forensic/decode       → decrypt a scanned token (operator-only)
POST /api/audit                 → session/forensic events
```

### 8.2 One conceptual API, three native implementations

Define a **single, platform-agnostic API surface** and implement it natively per platform so each can use the right OS primitives:

```ts
// Conceptual, identical shape across Web / Android / iOS
DRMShield.configure({ baseUrl, getAuthToken })

const player = DRMShield.createPlayer(container, {
  videoId,
  protections: {
    encryptedPlayback: true,   // AES-128 / Widevine / FairPlay
    captureBlock:      true,   // FLAG_SECURE / FairPlay secure pipeline
    recorderDetection: true,   // agent (desktop) / OS callbacks (mobile)
    forensicMark:      true,   // encrypted QR overlay
    devtoolsLockout:   true,   // web only
  },
})

player.on('threat',         e => {/* recorder/capture detected */})
player.on('captureBlocked', e => {/* OS blacked out the frame */})
player.on('forensicMark',   e => {/* a mark was shown */})
player.play(); player.pause(); player.destroy()
```

| SDK | Tech | Wraps | Distribution |
|---|---|---|---|
| `@drmshield/web` | TypeScript | the existing React/HLS.js player, agent gate, forensic QR + scanner | npm |
| `drmshield-android` | Kotlin (AAR) | Media3/ExoPlayer + Widevine, `FLAG_SECURE`, `addScreenRecordingCallback`, forensic overlay | Maven / GitHub Packages |
| `DRMShield` (iOS) | Swift package / `.xcframework` | `AVPlayer` + FairPlay, `isCaptured`/scene capture, secure layer, forensic overlay | Swift Package Manager / CocoaPods |

### 8.3 The pragmatic recommendation ("what suits this project")

- **Start with `@drmshield/web`.** The code already exists — extract the player, agent check, forensic QR, and scanner from the React app into a framework-agnostic npm package with the API above. Lowest effort, immediate reuse, and it forces the clean interface the native SDKs will copy.
- **Then add the native mobile SDKs** (`drmshield-android` Kotlin AAR, `DRMShield` iOS Swift package). Mobile DRM and the capture/detection APIs are **native-only**, so a web library cannot deliver them on mobile — native SDKs are the right call for a real DRM library.
- **If you want a single mobile codebase**, build a **Flutter plugin** (or React Native module) that bridges to the native Android/iOS implementations. This gives one app codebase while keeping the strong native security underneath. Prefer this only if you're already committed to Flutter/RN; otherwise two thin native SDKs are simpler and more robust.
- **Keep the backend as a versioned package** (npm package or a small Docker image) with the REST contract above so any SDK — and any future platform — plugs into the same server.

Result: one server contract, one conceptual API, and per-platform SDKs that each use the strongest protection their OS offers. You `import` the SDK, call `createPlayer`, and get encrypted playback + capture protection + recorder detection + forensic tracing on every platform.

### 8.4 Suggested repository layout

```
drmshield/
  server/                 # reference backend (key + license + forensic + audit)
  packages/
    web/                  # @drmshield/web  (extract from current client/)
    android/              # drmshield-android (Kotlin AAR)
    ios/                  # DRMShield (Swift package)
    flutter/              # optional unified plugin over android/ + ios/
  agent/                  # desktop recorder-detection agent (current)
  docs/                   # SECURITY.md, MOBILE_SECURITY.md, INSTALL.md, API contract
```

---

## Sources

- [Guardsquare — How Android 15 protects against screen spying](https://www.guardsquare.com/blog/android-15-screen-spying-protection)
- [ProAndroidDev — Screen recording detection, Android 15](https://proandroiddev.com/screen-recording-detection-android-15-26ee709b66b4)
- [Android Developers — Secure sensitive activities](https://developer.android.com/security/fraud-prevention/activities)
- [Apple — Technical Q&A QA1970: Responding to screen capture](https://developer.apple.com/library/archive/qa/qa1970/_index.html)
- [Apple Developer Documentation — `UIScreen.isCaptured`](https://developer.apple.com/documentation/uikit/uiscreen/iscaptured)
- [castLabs — DRM guide (Widevine / FairPlay / PlayReady)](https://castlabs.com/drm-guide/)
- [Mux — Protect videos with DRM](https://www.mux.com/docs/guides/protect-videos-with-drm)
