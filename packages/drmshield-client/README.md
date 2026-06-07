# @drmshield/client

A framework-agnostic browser package that provides all of the client-side protections from the DRMShield video security system. It works in any browser environment — React, Vue, Svelte, Solid, or plain JavaScript — without importing any framework-specific code.

The package is built around a single class, `DRMShieldClient`, which orchestrates authenticated HLS video playback and optional browser hardening routines. Every protection method returns an explicit `() => void` teardown callback so that cleanup is always deterministic, regardless of which framework you are using.

## Requirements

- A modern browser with `fetch`, `SubtleCrypto`, and `AbortController` support (all browsers released after 2020 qualify)
- `hls.js` installed as a peer dependency (not bundled)

## Installation

```bash
pnpm add @drmshield/client hls.js
```

The `hls.js` package is listed as a peer dependency. It is intentionally not bundled so that you can control the version and avoid shipping it twice if your project already depends on it.

---

## Quick Start

The following example sets up authenticated video playback with keyboard protection and DevTools monitoring. All teardowns are collected into a single array and called on cleanup.

```typescript
import { DRMShieldClient } from '@drmshield/client';

const videoEl = document.querySelector<HTMLVideoElement>('#player')!;
const teardowns: Array<() => void> = [];

// 1. Create the client. The JWT must come from your own login flow.
const drm = new DRMShieldClient({
  apiBase: 'https://your-api.example.com/api',
  token: yourJwt,
});

// 2. Check for screen recorders before allowing playback.
const agentStatus = await drm.checkAgent();
if (agentStatus.state !== 'clean') {
  console.warn('Playback blocked:', agentStatus.state, agentStatus.threats);
  return;
}

// 3. Attach the authenticated HLS stream. This mints a key grant and
//    hooks it onto every AES-128 key request automatically.
const teardownPlayer = await drm.protectContent('your-video-id', videoEl);
teardowns.push(teardownPlayer);

// 4. Attach optional browser hardening. All methods return teardown callbacks.
teardowns.push(drm.enableKeyboardProtection(() => console.warn('Blocked key action')));
teardowns.push(drm.enableFocusLossProtection(videoEl));
teardowns.push(drm.startDevToolsMonitor((status) => {
  if (status.isOpen) console.warn('DevTools opened');
}));

// 5. When the player is unmounted or the page navigates away, call all teardowns.
function cleanup() {
  teardowns.forEach(fn => fn());
}
```

---

## The Teardown Pattern

Every method on `DRMShieldClient` that attaches listeners or creates long-lived resources returns a teardown function with the signature `() => void`. Calling the teardown removes event listeners, clears intervals, and destroys any underlying HLS instance.

You are responsible for calling teardowns when the player is unmounted or the user navigates away. Failing to call them will leave orphaned event listeners and, in the case of `protectContent`, a live HLS instance with an open network connection.

A simple pattern for managing multiple teardowns:

```typescript
const teardowns: Array<() => void> = [];

// Add teardowns as you attach protections.
teardowns.push(drm.enableKeyboardProtection());
teardowns.push(await drm.protectContent(videoId, videoEl));

// Later, tear everything down in one call.
teardowns.forEach(fn => fn());
teardowns.length = 0;
```

---

## API Reference

### `class DRMShieldClient`

#### `constructor(options: DRMShieldClientOptions)`

Creates a new DRM client. The options are stored at construction time and used for all subsequent method calls.

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiBase` | `string` | Yes | Base URL of your DRMShield API, for example `https://api.example.com/api`. A trailing slash is stripped automatically. |
| `token` | `string` | Yes | A valid Bearer JWT obtained from your login endpoint. This token is sent as the `Authorization` header on key-grant requests. |
| `agentBase` | `string` | No | Base URL of the localhost recorder-detection agent. Defaults to `http://localhost:7891`. |

Both `apiBase` and `token` must be non-empty strings — the constructor throws an `Error` if either is missing.

```typescript
const drm = new DRMShieldClient({
  apiBase: 'https://api.example.com/api',
  token: jwtFromLogin,
  agentBase: 'http://localhost:7891', // optional, this is the default
});
```

---

#### `protectContent(videoId, videoElement): Promise<() => void>`

The central method of the package. It performs the full DRM handshake and attaches an authenticated, AES-128 encrypted HLS stream to a video element. Returns a teardown callback.

**What happens internally:**

1. `getDeviceFingerprint()` is called to compute a stable identifier for this browser instance.
2. A `POST` request is sent to `{apiBase}/hls/{videoId}/key-grant` with the JWT in the `Authorization` header and the device fingerprint in the request body. The server returns a 30-second signed grant.
3. If a previous HLS instance is already attached to the same video element (identified by a `__drmHls` property), it is destroyed before continuing. This prevents orphaned network connections and media source handles.
4. A new `Hls` instance is created with an `xhrSetup` callback that intercepts every AES-128 key request (those matching `/key` in the URL) and injects two headers: `X-Key-Grant` and `X-Device-Id`. The key server reads these headers to verify the grant before releasing the key.
5. `hls.loadSource(playlistUrl)` and `hls.attachMedia(videoElement)` are called. Playback can start.

The returned teardown function calls `hls.destroy()`, which stops all network requests and releases the Media Source Extension handle.

```typescript
const teardown = await drm.protectContent('vid-abc123', videoEl);
// videoEl is now playing an authenticated encrypted HLS stream

// When done:
teardown();
```

**Why the grant is never in the playlist URL.** The AES-128 key URL in the `.m3u8` playlist points to the server's key endpoint with no credentials. The grant is injected as a request header by the `xhrSetup` hook at the moment each key request is made. This means the grant cannot be extracted from a captured playlist file or browser history.

---

#### `checkAgent(timeoutMs?): Promise<AgentStatus>`

Checks whether the localhost recorder-detection agent is running and whether it has detected any capture threats. You should call this before allowing playback to start.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `timeoutMs` | `number` | `3000` | How long to wait for the agent before treating it as not installed. |

Returns an `AgentStatus` object with two fields:
- `state` — one of `'clean'`, `'threat'`, `'not-installed'`, or `'error'`
- `threats` — an array of `AgentThreat` objects (empty when state is `'clean'` or `'not-installed'`)

| State | Meaning |
|-------|---------|
| `'clean'` | The agent is running and no threats are detected. Playback is safe to start. |
| `'threat'` | The agent detected one or more capture processes (screen recorders, video downloaders, etc.). Block playback and show the list of threats. |
| `'not-installed'` | The agent did not respond within the timeout. Prompt the user to install it. |
| `'error'` | The agent responded but returned an unexpected status. Treat as a block. |

```typescript
const status = await drm.checkAgent();

if (status.state === 'clean') {
  // safe to start playback
} else if (status.state === 'threat') {
  console.warn('Threats detected:', status.threats.map(t => t.name));
} else if (status.state === 'not-installed') {
  alert('Please install the DRMShield agent to watch this content.');
}
```

---

#### `getDeviceFingerprint(): Promise<string>`

Computes a 32-character hex string derived from stable, low-entropy browser attributes: user agent, language, screen resolution, color depth, timezone offset, hardware concurrency, and device memory. The result is computed using `SubtleCrypto.digest('SHA-256')` and is cached for the lifetime of the page — repeated calls return the same value without recomputing.

This fingerprint is used by `protectContent` to bind the key grant to the current device. You generally do not need to call this method directly, but it is available if you need the fingerprint for other purposes (for example, passing it to your own audit endpoint).

```typescript
const deviceId = await drm.getDeviceFingerprint();
// e.g. 'a3f2b1c9d4e5f6a7b8c9d0e1f2a3b4c5'
```

**Note:** This fingerprint is a best-effort identifier based on browser-visible attributes. It raises the bar against casual misuse but is not a hardware-level ID and can be spoofed by a determined attacker.

---

#### `startDevToolsMonitor(onChange): () => void`

Starts monitoring the browser window for open DevTools. Detection uses two independent signals:

1. **Dimension difference** — when DevTools is docked to the side or bottom, `window.outerWidth` or `window.outerHeight` is significantly larger than `window.innerWidth` or `window.innerHeight`. A difference of more than 100 CSS pixels triggers detection. On Windows, the outer dimensions are often reported in physical pixels, so the method corrects for the device pixel ratio before comparing. This check is skipped on mobile devices, where the virtual keyboard causes similar dimension changes during normal use.

2. **Debugger timing trap** — evaluating `new Function('debugger')()` causes the JavaScript engine to pause at the debugger statement when DevTools is open. The elapsed time is measured with `performance.now()`. If more than 100 milliseconds pass, the DevTools panel is considered open.

`onChange` is called only when the detected state changes — it fires once when DevTools opens and once when it closes. It is not called on every poll tick. The status object passed to `onChange` contains detailed measurements if you need them.

| Parameter | Type | Description |
|-----------|------|-------------|
| `onChange` | `(status: DevToolsStatus) => void` | Callback fired when the open/closed state changes. |

Returns a teardown callback that removes the `resize` event listener and clears the 500ms polling interval.

```typescript
const teardown = drm.startDevToolsMonitor((status) => {
  if (status.isOpen) {
    // destroy the video source or show a warning
    console.warn('DevTools detected, pausing playback');
  }
});

// When done:
teardown();
```

---

#### `enableKeyboardProtection(onBlocked?): () => void`

Attaches `keydown` and `copy` event listeners to the window that block keyboard shortcuts and clipboard access commonly used to inspect or copy protected content.

The following key combinations are blocked:

| Key Combination | Platform | Would Normally Do |
|-----------------|----------|-------------------|
| `F12` | All | Open DevTools |
| `Ctrl+Shift+I` | Windows/Linux | Open DevTools |
| `Ctrl+Shift+J` | Windows/Linux | Open DevTools console |
| `Ctrl+Shift+C` | Windows/Linux | Open DevTools element picker |
| `Ctrl+U` | Windows/Linux | View page source |
| `Ctrl+S` | Windows/Linux | Save page |
| `PrintScreen` | Windows | Capture screenshot |
| `Cmd+Shift+3` | macOS | Capture full-screen screenshot |
| `Cmd+Shift+4` | macOS | Capture selection screenshot |
| `Cmd+Shift+5` | macOS | Open screenshot/recording toolbar |
| `Win+Shift+S` | Windows | Open Snipping Tool |
| `Win+Alt+R` | Windows | Start screen recording |
| `Ctrl+Shift+F5` | ChromeOS | Take screenshot |

When a screenshot-related key is intercepted, the clipboard is immediately overwritten with `'PROTECTED SECURE CONTENT - SCREENSHOT INTERCEPTED'`. When a copy event is intercepted, the clipboard data is replaced with `'PROTECTED CONTENT - COPY BLOCKED'`.

| Parameter | Type | Description |
|-----------|------|-------------|
| `onBlocked` | `() => void` | Optional callback fired every time an action is blocked. |

Returns a teardown callback that removes both event listeners.

```typescript
const teardown = drm.enableKeyboardProtection(() => {
  showNotification('That action is not allowed on this page.');
});

// When done:
teardown();
```

---

#### `enableFocusLossProtection(videoElement): () => void`

Pauses the video element whenever the browser window loses focus (`blur` event on `window`) or the page becomes hidden (`visibilitychange` event on `document`). This prevents a user from recording the video by switching to a screen capture tool while the video continues playing in the background.

| Parameter | Type | Description |
|-----------|------|-------------|
| `videoElement` | `HTMLVideoElement` | The video element to pause on focus loss. |

Returns a teardown callback that removes both event listeners.

```typescript
const teardown = drm.enableFocusLossProtection(videoEl);

// When done:
teardown();
```

---

### Standalone Exports

All of the protection utilities are also exported as standalone functions, independent of the `DRMShieldClient` class. These are useful when you only need one feature, or when you want to use the utilities in a context where constructing a full client is unnecessary.

```typescript
import {
  getDeviceFingerprint,
  checkAgent,
  startDevToolsMonitor,
  enableKeyboardProtection,
} from '@drmshield/client';

// These are the exact same implementations used by DRMShieldClient.

const fingerprint = await getDeviceFingerprint();
const status      = await checkAgent('http://localhost:7891', 3000);
const teardown1   = startDevToolsMonitor((s) => console.log(s.isOpen));
const teardown2   = enableKeyboardProtection(() => console.warn('blocked'));
```

Note that the standalone `checkAgent` requires the `agentBase` URL as its first argument, whereas the class method uses the value from the constructor options.

---

## Types

```typescript
interface DRMShieldClientOptions {
  apiBase:    string;           // required
  token:      string;           // required
  agentBase?: string;           // optional, defaults to 'http://localhost:7891'
}

type AgentState = 'clean' | 'threat' | 'not-installed' | 'error' | 'checking';

interface AgentThreat {
  category: string;  // e.g. 'Screen recorder', 'Video downloader'
  name:     string;  // process or extension name
}

interface AgentStatus {
  state:   AgentState;
  threats: AgentThreat[];
}

interface DevToolsStatus {
  isOpen:               boolean;  // true if DevTools appears to be open
  dimensionsTriggered:  boolean;  // true if the dimension-diff check fired
  consoleHookTriggered: boolean;  // true if the debugger timing trap fired
  cssDiffW:             number;   // horizontal dimension difference in CSS pixels
  cssDiffH:             number;   // vertical dimension difference in CSS pixels
  outerWidth:           number;   // corrected outer width in CSS pixels
  outerHeight:          number;   // corrected outer height in CSS pixels
  innerWidth:           number;
  innerHeight:          number;
  devicePixelRatio:     number;
}
```

---

## Framework Integration Examples

### Vanilla JavaScript

```javascript
import { DRMShieldClient } from '@drmshield/client';

const videoEl = document.getElementById('player');
const teardowns = [];

const drm = new DRMShieldClient({ apiBase: '/api', token: getStoredJwt() });

async function startPlayback(videoId) {
  teardowns.push(await drm.protectContent(videoId, videoEl));
  teardowns.push(drm.enableKeyboardProtection());
  teardowns.push(drm.enableFocusLossProtection(videoEl));
}

function stopPlayback() {
  teardowns.forEach(fn => fn());
  teardowns.length = 0;
}

// Call startPlayback when the user opens a video.
// Call stopPlayback when they close it or navigate away.
```

---

### React

```tsx
import { useEffect, useRef } from 'react';
import { DRMShieldClient } from '@drmshield/client';

function VideoPlayer({ videoId, jwt }: { videoId: string; jwt: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const videoEl = videoRef.current;
    if (!videoEl) return;

    const drm = new DRMShieldClient({ apiBase: '/api', token: jwt });
    const teardowns: Array<() => void> = [];

    drm.protectContent(videoId, videoEl).then((teardown) => {
      teardowns.push(teardown);
      teardowns.push(drm.enableKeyboardProtection());
      teardowns.push(drm.enableFocusLossProtection(videoEl));
    });

    return () => {
      teardowns.forEach(fn => fn());
    };
  }, [videoId, jwt]);

  return <video ref={videoRef} controls />;
}
```

---

### Vue 3

```vue
<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import { DRMShieldClient } from '@drmshield/client';

const props = defineProps<{ videoId: string; jwt: string }>();
const videoRef = ref<HTMLVideoElement | null>(null);
const teardowns: Array<() => void> = [];

onMounted(async () => {
  const videoEl = videoRef.value;
  if (!videoEl) return;

  const drm = new DRMShieldClient({ apiBase: '/api', token: props.jwt });

  teardowns.push(await drm.protectContent(props.videoId, videoEl));
  teardowns.push(drm.enableKeyboardProtection());
  teardowns.push(drm.enableFocusLossProtection(videoEl));
});

onUnmounted(() => {
  teardowns.forEach(fn => fn());
});
</script>

<template>
  <video ref="videoRef" controls />
</template>
```
