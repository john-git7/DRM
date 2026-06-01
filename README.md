# Secure Video Player Prototype

A production-quality prototype of a Secure Video Player web application showcasing aggressive visual and behavior-based client-side digital rights protection mechanisms. Built using **React (Vite + Tailwind CSS v4)** on the frontend and **Node.js (Express + Multer)** on the backend.

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
   - Triggers an overlay: *"Playback Paused - Window Focus Lost"*. Multiple quick focus losses trigger a *"Screen Capture Activity Suspected"* warning.

5. **Dynamic Watermarking**
   - Overlays a semi-transparent floating text label containing the username, date, and live time context.
   - Repositioned randomly inside the player container every 4 seconds to deter screen recording crops.

6. **Mobile Keyboard Compatibility**
   - Intelligently detects touch devices (iOS/Android) and safely disables the viewport-shrinking checks. This prevents the app from destroying itself (false positive DevTools detection) when the virtual mobile keyboard opens, while leaving background execution traps active to prevent USB remote-debugging.

---

## Directory Structure

```
d:/DRM/
├── client/                     # React Frontend
│   ├── src/
│   │   ├── components/         # VideoPlayer.jsx
│   │   ├── hooks/              # useDevTools.js, useKeyboardProtection.js
│   │   ├── pages/              # LibraryPage.jsx, UploadPage.jsx, PlayerPage.jsx
│   │   ├── App.jsx             # Router and layouts
│   │   └── index.css           # Tailwind v4 configuration and animations
│   ├── index.html              # Entry DOM structure
│   └── package.json            # Frontend script dependencies
├── server/                     # Express Backend
│   ├── routes/
│   │   └── videoRoutes.js      # Streaming APIs and Multer uploads
│   ├── data/
│   │   └── videos.json         # Mock database store
│   └── server.js               # Entry script
├── uploads/                    # Local raw video file directory
└── README.md                   # Setup guide
```

---

## Local Setup & Run Instructions

Ensure [Node.js](https://nodejs.org) (v18+) is installed on your system.

### 1. Initialize & Start Backend Server

Open a terminal at the project root and execute the following commands:

```powershell
# Navigate to server folder
cd server

# Install server packages
npm install

# Start the dev server (with hot reload via nodemon)
npm run dev
```

The backend server starts on **`http://localhost:5000`**.

### 2. Initialize & Start Frontend Dev Server

Open a second terminal at the project root:

```powershell
# Navigate to client folder
cd client

# Install client packages
npm install

# Start the Vite React app
npm run dev
```

The React client will launch on **`http://localhost:5173`**.

---

## Testing the Prototype

1. Open `http://localhost:5173` in your browser.
2. Navigate to the **Upload** page, select a test `.mp4` file, input a title, and click **Start Secure Upload**. You'll see an upload progress tracker.
3. Once completed, navigate to the **Library** page and click the video card to launch the **Secure Video Player**.
4. Test the extreme security hooks:
   - Try right-clicking anywhere on the page (notice the permanent blur lock).
   - Press `PrintScreen` or a snippet shortcut, then try to paste the image into Paint (notice the clipboard was overwritten).
   - Try opening DevTools via `F12` or the browser menu. The screen will instantly turn black, and the source code will vanish from the Elements tab.
