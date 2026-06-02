# DRMShield — Secure Video Player Prototype

A production-quality prototype of a Secure Video Player web application showcasing aggressive visual and behavior-based client-side digital rights protection mechanisms. Built with **React + TypeScript (Vite + Tailwind CSS v4)** on the frontend and **Node.js + TypeScript (Express + Multer)** on the backend. Styled with a **dark neobrutalism** design language — hard borders, offset shadows, flat surfaces — built for authority and clarity.

---

## Architecture & Security Showcase

This prototype demonstrates advanced visual deterrence, DOM eradication, and runtime safety features without requiring complex DRM integrations (like Widevine or FairPlay). It is tailored for client presentations to demonstrate strict client-side environment lockdown.

### 🛡️ Core Security Features

1. **Hidden Media Access & DOM Eradication (Anti-Inspect)**
   - The React client never queries the filesystem paths (e.g. `/uploads/video.mp4`) directly. Video streams are proxied via a backend route `/api/video/:filename` supporting chunked HTTP range-based requests.
   - **Ultimate DevTools Lockout**: If Developer Tools are detected (via ultra-aggressive 100px dimension monitoring or a continuous background `debugger` execution timing trap), the entire React application is instantly unmounted. The DOM is replaced with a blank screen, permanently hiding the video URL and eradicating all source code from the Elements inspector.

2. **Invisible Click Shield (Anti-Right Click)**
   - A 100% transparent overlay perfectly covers the video element. When a user right-clicks the video, the shield silently intercepts and destroys the click, ensuring the browser's native "Save Video As" context menu can **never** be triggered.
   - Brute-force `oncontextmenu="return false;"` applied to the document root prevents global context menus.
   - As a visual deterrent, any right-click attempt anywhere on the page instantly and permanently **blurs the entire application**, requiring a hard refresh to resume.

3. **Keyboard Shortcut & Screen Capture Blocking**
   - Event listeners (attached in the Capture Phase to prevent bypassing) intercept global keystrokes for `F12`, `Ctrl+Shift+I` (Inspect), `Ctrl+Shift+J` (Console), `Ctrl+U` (View Source), `Ctrl+S` (Save Page), and OS-level capture shortcuts (`PrintScreen`, `Win+Shift+S`, macOS `Cmd+Shift+3/4/5`).
   - The exact millisecond a screenshot shortcut is pressed, the application **aggressively overwrites the user's clipboard** with a warning message, ruining paste attempts.

4. **Focus Loss & Screen Record Deterrence**
   - Automatically pauses playback and heavily blurs the player if the user switches browser tabs, minimizes the window, or navigates focus elsewhere.
   - If focus is lost, an immediate clipboard rewrite occurs to deter background snipping tools.
   - Triggers an overlay: *"Playback Paused — Window Focus Lost"*. Multiple quick focus losses trigger a *"Capture Detected"* warning stamp.

5. **Dynamic Watermarking**
   - Overlays a semi-transparent floating text label containing the username, date, and live time context.
   - Repositioned randomly inside the player container every 4 seconds to deter screen recording crops.

6. **Mobile Keyboard Compatibility**
   - Intelligently detects touch devices (iOS/Android) and safely disables the viewport-shrinking checks. This prevents the app from destroying itself (false positive DevTools detection) when the virtual mobile keyboard opens, while leaving background execution traps active to prevent USB remote-debugging.

---

## Design System — Dark Neobrutalism

The UI uses a dark neobrutalism design language applied to a security-terminal context:

| Token | Value | Role |
|-------|-------|------|
| Base background | `#0a0a0a` | Page canvas |
| Surface | `#111111` | Cards, panels |
| Border | `2px solid #ffffff` | All card/component borders |
| Hard shadow | `4px 4px 0px #7c3aed` | Violet offset shadow (brand) |
| Accent | `#7c3aed` | Primary actions, active states |
| Amber | `#f59e0b` | Warnings, caution badges |
| Green | `#22c55e` | Pass / success badges |
| Red | `#ef4444` | Lockout / danger states |

**Key principles:** No glassmorphism, no `backdrop-filter`, no soft drop shadows, no gradients. Flat surfaces + thick borders + hard offset shadows. Security status badges styled as physical rubber stamps (uppercase monospace, square corners, offset shadow in accent color).

---

## Directory Structure

```
d:/DRM/
├── client/                         # React + TypeScript frontend
│   ├── src/
│   │   ├── types/index.ts          # Shared TS interfaces (Video, DevToolsStatus, etc.)
│   │   ├── config/api.ts           # API_BASE constant
│   │   ├── utils/format.ts         # formatBytes, formatDate helpers
│   │   ├── components/
│   │   │   ├── VideoPlayer.tsx     # Core DRM player logic
│   │   │   └── ToggleSwitch.tsx    # Reusable toggle component
│   │   ├── hooks/
│   │   │   ├── useDevTools.ts      # DevTools detection → app lockout
│   │   │   └── useKeyboardProtection.ts  # Blocks F12, PrintScreen, Ctrl+Shift+I, etc.
│   │   ├── pages/
│   │   │   ├── LibraryPage.tsx     # Video grid with brutal cards
│   │   │   ├── UploadPage.tsx      # Drag-drop upload with progress
│   │   │   └── PlayerPage.tsx      # Player + Security Monitor panel
│   │   ├── App.tsx                 # Router + global protections
│   │   ├── main.tsx                # React entry point
│   │   └── index.css               # Tailwind v4 + neobrutalism utilities
│   ├── tsconfig.json               # Root TS project references
│   ├── tsconfig.app.json           # App strict TS config
│   ├── tsconfig.node.json          # Vite config TS
│   ├── index.html                  # Entry DOM
│   └── package.json                # Frontend dependencies
├── server/                         # Express + TypeScript backend
│   ├── src/
│   │   ├── app.ts                  # Express setup (CORS, parsers, routes)
│   │   ├── server.ts               # Entry: dirs, app.listen()
│   │   ├── types/video.ts          # Video Zod schema + inferred types
│   │   ├── middleware/errorHandler.ts  # AppError + typed error handler
│   │   └── routes/videoRoutes.ts   # Upload (Multer), listing, range streaming
│   ├── data/videos.json            # Flat-file metadata store (auto-created)
│   └── package.json
├── uploads/                        # Raw MP4 files (auto-created, gitignored)
└── README.md
```

---

## Local Setup & Run Instructions

Requires [Node.js](https://nodejs.org) v18+ and [pnpm](https://pnpm.io) installed.

### 1. Start Backend Server

```bash
cd server
pnpm install
pnpm dev          # ts-node-dev hot reload
```

Server starts on **`http://localhost:5000`**.

### 2. Start Frontend Dev Server

```bash
cd client
pnpm install
pnpm dev          # Vite dev server
```

Client launches on **`http://localhost:5173`**.

### Additional Client Scripts

```bash
pnpm build        # tsc type check + Vite production build
pnpm type-check   # TypeScript only (no emit)
pnpm lint         # ESLint
pnpm preview      # Preview production build
```

---

## Testing the Prototype

1. Open `http://localhost:5173` in your browser.
2. Navigate to the **Upload** page, select a test `.mp4` file, input a title, and click **Start Secure Upload**. You'll see a flat progress bar.
3. Once completed, navigate to the **Library** page and click a video card to launch the **Secure Video Player**.
4. Test the security hooks:
   - Right-click anywhere — notice the permanent blur lockout.
   - Press `PrintScreen` or a screenshot shortcut, then try pasting — the clipboard has been overwritten.
   - Open DevTools via `F12` or the browser menu — the screen instantly turns black and source code vanishes.
   - Switch to another tab — playback pauses and the player blurs.
   - Open the **Security Monitor** panel to toggle individual protections or inspect real-time DPI diagnostics.
