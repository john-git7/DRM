# DRMShield — Developer Handoff

This is a snapshot of the in-progress work so another developer (and their Claude Code session) can continue. For architecture and conventions read [`CLAUDE.md`](./CLAUDE.md) first; for the security model read [`SECURITY.md`](./SECURITY.md).

_Last updated: 2026-06-06._

## TL;DR

DRMShield (AES-128 HLS + JWT key server + recorder-detection agent + hardened HLS.js player + encrypted forensic QR) has been extended in three streams, on three stacked feature branches that are **not yet merged to `main`**:

1. **Forensic QR + fixes** (web/server)
2. **Agent cross-platform packaging** (Windows installers)
3. **Mobile** (Capacitor hybrid app with Android/iOS screen protection, incl. a built Android APK)

## Branch map

Branches stack in this order (each based on the previous); `main` is behind all of them.

| Branch | Tip | Pushed? | Contains |
|---|---|---|---|
| `feat/forensic-encrypted-qr` | `025dcd5` | **no** | Encrypted forensic QR + Scanner; global rate-limiter fix; React lint fixes |
| `feat/agent-winpy-dist` | `78b8f90` | partial (**1 commit ahead** of origin) | + cross-platform agent, embeddable-Python Windows dist, NSIS setup.exe, `INSTALL.md`, `MOBILE_SECURITY.md` |
| `feat/mobile-capacitor-protection` ← **current** | `4264de6` | **no** | + Capacitor hybrid, Android/iOS screen protection, `MOBILE_APP.md`, built APK |

Because they stack, the current branch's history already includes everything. Decide a merge/PR order (forensic → agent → mobile) or open three PRs.

## Feature status

### Web client + server — `feat/forensic-encrypted-qr`
- **Encrypted forensic QR** replaces the old moving watermark. A small, faint QR appears at a random spot ~every 5 min carrying an **AES-256-GCM token** (`POST /api/forensic/token`, stamped server-side with identity/device/IP/time). A generic phone scanner sees only ciphertext.
- **Forensic Scanner** page (`/scanner`): reads the QR (ZXing), sends the token to `POST /api/forensic/decode` (JWT-gated) → shows identity/device/IP/time. Server: `forensicService.ts`, `forensicController.ts`.
- **Fix:** global rate limiter no longer 429s HLS streaming (`server/src/middleware/rateLimiter.ts`).
- Removed the legacy floating watermark + tab-switch "capture warning".
- Verified: `tsc`/`eslint` (0 errors, 1 pre-existing harmless `react-refresh` warning)/`vite build` clean; encryption round-trip tested against the live server.

### Desktop agent — `feat/agent-winpy-dist`
- Cross-platform detection + `pystray` tray (ARQX branding); `signatures.json` broadened.
- **Embeddable-Python Windows distribution** built **from Linux** (no Windows/PyInstaller): `agent/packaging/make-winpy.sh` (downloads embeddable Python, installs deps via win wheels) + `build_bundles.sh` (zips runtime + app + launchers) + `win/` (install.bat/uninstall.bat/launch-tray.vbs/installer.iss).
- **NSIS `setup.exe`**: `agent/packaging/build-win-installer.sh` + `win/installer.nsi` → `agent/dist/arqx-atlas-agent-2.0.0-setup.exe` (18 MB, verified PE32 installer).
- Docs: `agent/INSTALL.md` (all-OS), `agent/PACKAGING.md` updated.
- **Note:** the GitHub Release upload of the .exe was blocked by a safety guard — publish manually (see Open items).

### Mobile — `feat/mobile-capacitor-protection` (current)
- **Capacitor hybrid** wraps the existing web client (Option B; see `MOBILE_SECURITY.md` for why, vs native/pure-web).
- `@capacitor-community/privacy-screen` → Android **FLAG_SECURE** (capture comes out black) + iOS privacy overlay/screenshot prevention; recording/screenshot events wired in `client/src/utils/mobileProtection.ts`, `App.tsx`, and `PlayerPage.tsx` (recording → `CaptureBlackout` + `screen-capture-detected`/`screenshot-detected` audit, mirroring the desktop agent).
- **Built Android APK:** `client/dist-mobile/drmshield-2.0.0-debug.apk` (`com.arqx.drmshield`, targetSdk 36, FLAG_SECURE + `DETECT_SCREEN_RECORDING`). Built headlessly via Gradle.
- Docs: `MOBILE_APP.md` (build/run), `MOBILE_SECURITY.md` (Android/iOS protections + the SDK plan).
- `client/android` / `client/ios` and `client/dist-mobile/` are **gitignored** (regenerate with `cap add`). The `DETECT_SCREEN_RECORDING` manifest edit lives only in the local `client/android` — commit the native project to keep it.

## Build / run quick reference

- **Server:** `cd server && pnpm dev` (ts-node-dev, :5000). Needs `server/.env` (committed with **TEST** secrets — rotate for prod).
- **Web client:** `cd client && pnpm dev` (Vite, :5173) · `pnpm build` · `pnpm lint`.
- **Agent (dev):** `cd agent && python3 agent.py` (:7891) or `python3 tray.py`.
- **Agent Windows installer:** `cd agent && bash packaging/build-win-installer.sh` → `dist/...-setup.exe`.
- **Android APK:** `cd client && pnpm build && pnpm exec cap sync android && (cd android && ./gradlew assembleDebug)`. See `MOBILE_APP.md`.

## This machine's toolchain (already installed this session)

- **Node** v24.15.0 via nvm (`~/.nvm/versions/node/v24.15.0/bin`). **pnpm is not on PATH** — use `corepack pnpm …` or `node_modules/.bin/…`.
- **JDK 21** at `/usr/lib/jvm/java-21-openjdk-amd64` (Capacitor 8 needs 21).
- **Android SDK** at `~/android-sdk` (cmdline-tools, `platforms;android-35`, `build-tools;35.0.0`). Set `ANDROID_HOME=~/android-sdk` + `JAVA_HOME` for Gradle.
- **NSIS** (`makensis`) installed for the Windows `.exe`. (`msitools` was also apt-installed if you want a `.msi`.)
- The recorder-detection agent was previously installed to `/opt/intellia-secure-agent` and **removed**; only the repo source under `agent/` remains.

## Open items / next steps

1. **Push the unpushed branches** (`feat/forensic-encrypted-qr`, `feat/mobile-capacitor-protection`) and the 1-ahead commit on `feat/agent-winpy-dist`, then open PRs (decide stack vs. squash-to-main).
2. **Publish the agent installer** (Release upload was blocked): `cd agent && gh release create agent-v2.0.0 dist/arqx-atlas-agent-2.0.0-setup.exe dist/arqx-atlas-agent-2.0.0-win-amd64.zip --repo john-git7/DRM --target feat/agent-winpy-dist --title "ARQX Atlas Agent v2.0.0"`.
3. **Mobile server URL:** the APK targets `localhost:5000` by default. Rebuild with `VITE_API_BASE="http://<server-ip>:5000/api"` for device connectivity (FLAG_SECURE works regardless).
4. **iOS build** needs macOS + Xcode (`cap add ios`); cannot be produced here.
5. **Commit the native project** (`client/android`) if you want the `DETECT_SCREEN_RECORDING` manifest edit and other native customizations to persist (un-ignore it in `.gitignore`).
6. **Library/SDK extraction** — the planned direction (see `MOBILE_SECURITY.md` §8): extract `@drmshield/web` from `client/`, then native `drmshield-android` (AAR) and `DRMShield` (iOS Swift) SDKs over one server contract; optional Flutter plugin to unify.
7. **DRM upgrade for mobile:** add Widevine (Android) / FairPlay (iOS) license endpoints to harden key handling beyond AES-128 (the natural extension of the Phase-2 key-grant server).
8. **Prod hygiene:** rotate `JWT_SECRET`/`STREAM_SECRET`/`ADMIN_PASSWORD` (the committed `server/.env` holds TEST values only), sign the Windows installer / notarize macOS to avoid SmartScreen/Gatekeeper warnings.

## Documentation index

| Doc | Purpose |
|---|---|
| [`CLAUDE.md`](./CLAUDE.md) | Architecture, conventions, API endpoints, key behaviors |
| [`README.md`](./README.md) | Project overview |
| [`SECURITY.md`](./SECURITY.md) | Web/desktop threat model |
| [`MOBILE_SECURITY.md`](./MOBILE_SECURITY.md) | Android/iOS protections + the library/SDK plan |
| [`MOBILE_APP.md`](./MOBILE_APP.md) | Capacitor app build/run |
| [`USER_GUIDE.md`](./USER_GUIDE.md) | End-user guide |
| [`agent/INSTALL.md`](./agent/INSTALL.md) | Installing the agent on Windows/macOS/Linux |
| [`agent/PACKAGING.md`](./agent/PACKAGING.md) | Building the agent packages/installers |
