# @drmshield/client

This package provides all of the browser-side protections for DRMShield. It works in any browser environment — React, Vue, Svelte, or plain JavaScript — without pulling in any framework-specific code.

---

## What does it do?

It handles four things:

1. **Plays protected video** — fetches the AES-128 decryption key using a signed grant, so the key never travels in a URL or playlist file.
2. **Blocks screen recorders** — checks whether a recorder agent is running before allowing playback.
3. **Blocks DevTools** — detects when browser developer tools are open.
4. **Blocks keyboard shortcuts** — intercepts screenshot keys, F12, Ctrl+Shift+I, and other capture shortcuts.

Every protection method returns a cleanup function (`() => void`) that removes all listeners and stops all background checks. You call it when the player is unmounted or the user navigates away.

---

## Requirements

- A modern browser (Chrome, Firefox, Safari, Edge — anything released after 2020)
- `hls.js` installed as a peer dependency

## Installation

```bash
pnpm add @drmshield/client hls.js
```

---

## Quick Start

```typescript
import { DRMShieldClient } from '@drmshield/client';

const videoEl = document.querySelector<HTMLVideoElement>('#player')!;
const teardowns: Array<() => void> = [];

// 1. Create the client with your API base URL and the user's JWT.
const drm = new DRMShieldClient({
  apiBase: 'https://your-api.example.com/api',
  token: yourJwt,
});

// 2. Check for screen recorders before allowing playback.
const agentStatus = await drm.checkAgent();
if (agentStatus.state !== 'clean') {
  console.warn('Playback blocked:', agentStatus.state);
  return;
}

// 3. Start protected playback. This fetches a key grant and attaches the stream.
teardowns.push(await drm.protectContent('your-video-id', videoEl));

// 4. Add optional browser hardening.
teardowns.push(drm.enableKeyboardProtection(() => console.warn('Action blocked')));
teardowns.push(drm.enableFocusLossProtection(videoEl));
teardowns.push(drm.startDevToolsMonitor((status) => {
  if (status.isOpen) console.warn('DevTools opened');
}));

// 5. When the player unmounts, call all teardowns.
function cleanup() {
  teardowns.forEach(fn => fn());
}
```

---

## The Teardown Pattern

Every method returns a `() => void` cleanup function. You are responsible for calling it when the player unmounts. Failing to do so leaves orphaned event listeners and, in the case of `protectContent`, an open network connection.

```typescript
const teardowns: Array<() => void> = [];

teardowns.push(drm.enableKeyboardProtection());
teardowns.push(await drm.protectContent(videoId, videoEl));

// Later — one call cleans everything up.
teardowns.forEach(fn => fn());
teardowns.length = 0;
```

---

## API Reference

### `DRMShieldClient`

#### `new DRMShieldClient(options)`

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiBase` | `string` | Yes | Base URL of your DRMShield API, e.g. `https://api.example.com/api` |
| `token` | `string` | Yes | A valid JWT from your login endpoint |
| `agentBase` | `string` | No | URL of the recorder-detection agent. Defaults to `http://localhost:7891` |

Both `apiBase` and `token` must be non-empty strings — the constructor throws if either is missing.

```typescript
const drm = new DRMShieldClient({
  apiBase: 'https://api.example.com/api',
  token: jwtFromLogin,
});
```

---

#### `drm.protectContent(videoId, videoElement): Promise<() => void>`

The main method. It performs the full DRM handshake and starts playing the video.

**What happens:**

1. Computes a device fingerprint for this browser.
2. Sends a `POST` to `{apiBase}/hls/{videoId}/key-grant` — the server returns a 30-second signed token.
3. Creates an HLS.js instance that injects the token (`X-Key-Grant`) and device ID (`X-Device-Id`) as headers on every key request. The key never appears in the playlist URL.
4. Loads the playlist and attaches it to the video element. Playback starts.

The returned teardown calls `hls.destroy()`, which stops all network requests and frees resources.

```typescript
const teardown = await drm.protectContent('vid-abc123', videoEl);

// When done:
teardown();
```

---

#### `drm.checkAgent(timeoutMs?): Promise<AgentStatus>`

Checks whether the localhost recorder-detection agent is running and whether it has detected any threats. Call this before starting playback.

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `timeoutMs` | `number` | `3000` | How long to wait before treating the agent as not installed |

**Returns** an `AgentStatus` object:

| `state` | Meaning |
|---------|---------|
| `'clean'` | Agent is running, no threats detected. Safe to play. |
| `'threat'` | One or more capture processes detected. Block playback. |
| `'not-installed'` | Agent did not respond. Prompt the user to install it. |
| `'error'` | Agent responded with an unexpected status. Treat as a block. |

```typescript
const status = await drm.checkAgent();

if (status.state === 'clean') {
  // safe to start
} else if (status.state === 'threat') {
  console.warn('Recorder detected:', status.threats.map(t => t.name));
} else if (status.state === 'not-installed') {
  alert('Please install the DRMShield agent to watch this content.');
}
```

---

#### `drm.getDeviceFingerprint(): Promise<string>`

Returns a 32-character hex string derived from stable browser attributes (user agent, screen resolution, timezone, etc.). The result is computed once using `SubtleCrypto.digest('SHA-256')` and cached for the page lifetime.

`protectContent` calls this internally. You only need to call it directly if you want the fingerprint for your own audit endpoint.

```typescript
const deviceId = await drm.getDeviceFingerprint();
// e.g. 'a3f2b1c9d4e5f6a7b8c9d0e1f2a3b4c5'
```

---

#### `drm.startDevToolsMonitor(onChange): () => void`

Detects whether browser DevTools is open, using two independent methods:

1. **Dimension check** — DevTools docked to the side or bottom causes `window.outerWidth` / `window.outerHeight` to be significantly larger than `window.innerWidth` / `window.innerHeight`. Skipped on mobile (where the virtual keyboard causes similar changes).
2. **Debugger timing trap** — evaluating `new Function('debugger')()` pauses when DevTools is open. If more than 100ms passes, DevTools is considered open.

`onChange` fires only when the state *changes* (opens or closes), not on every poll tick.

```typescript
const teardown = drm.startDevToolsMonitor((status) => {
  if (status.isOpen) {
    console.warn('DevTools detected');
  }
});

teardown(); // when done
```

---

#### `drm.enableKeyboardProtection(onBlocked?): () => void`

Blocks keyboard shortcuts and clipboard access commonly used to capture protected content.

Blocked shortcuts:

| Key | Platform | What it would do |
|-----|----------|-----------------|
| `F12` | All | Open DevTools |
| `Ctrl+Shift+I` | Windows/Linux | Open DevTools |
| `Ctrl+Shift+J` | Windows/Linux | Open DevTools console |
| `Ctrl+Shift+C` | Windows/Linux | Open element picker |
| `Ctrl+U` | Windows/Linux | View page source |
| `Ctrl+S` | Windows/Linux | Save page |
| `PrintScreen` | Windows | Screenshot |
| `Cmd+Shift+3` | macOS | Full-screen screenshot |
| `Cmd+Shift+4` | macOS | Selection screenshot |
| `Cmd+Shift+5` | macOS | Screenshot/recording toolbar |
| `Win+Shift+S` | Windows | Snipping Tool |
| `Win+Alt+R` | Windows | Screen recording |
| `Ctrl+Shift+F5` | ChromeOS | Screenshot |

When a screenshot key is intercepted, the clipboard is overwritten with a protection notice. When a copy event is intercepted, the clipboard data is replaced with a blocked-content message.

```typescript
const teardown = drm.enableKeyboardProtection(() => {
  showNotification('That action is not allowed.');
});

teardown(); // when done
```

---

#### `drm.enableFocusLossProtection(videoElement): () => void`

Pauses the video whenever the browser window loses focus or the page becomes hidden. This prevents a user from switching to a screen recorder while the video continues playing in the background.

```typescript
const teardown = drm.enableFocusLossProtection(videoEl);

teardown(); // when done
```

---

## Standalone Exports

All utilities are also exported as standalone functions if you do not need the full `DRMShieldClient` class.

```typescript
import {
  getDeviceFingerprint,
  checkAgent,
  startDevToolsMonitor,
  enableKeyboardProtection,
} from '@drmshield/client';

const fingerprint = await getDeviceFingerprint();
const status      = await checkAgent('http://localhost:7891', 3000);
const teardown1   = startDevToolsMonitor((s) => console.log(s.isOpen));
const teardown2   = enableKeyboardProtection(() => console.warn('blocked'));
```

Note: the standalone `checkAgent` requires the agent base URL as its first argument. The class method uses the value from the constructor options.

---

## Types

```typescript
interface DRMShieldClientOptions {
  apiBase:    string;
  token:      string;
  agentBase?: string; // defaults to 'http://localhost:7891'
}

type AgentState = 'clean' | 'threat' | 'not-installed' | 'error' | 'checking';

interface AgentThreat {
  category: string; // e.g. 'Screen recorder'
  name:     string; // process or extension name
}

interface AgentStatus {
  state:   AgentState;
  threats: AgentThreat[];
}

interface DevToolsStatus {
  isOpen:               boolean;
  dimensionsTriggered:  boolean;
  consoleHookTriggered: boolean;
  cssDiffW:             number;
  cssDiffH:             number;
  outerWidth:           number;
  outerHeight:          number;
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
```

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

    return () => teardowns.forEach(fn => fn());
  }, [videoId, jwt]);

  return <video ref={videoRef} controls />;
}
```

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

onUnmounted(() => teardowns.forEach(fn => fn()));
</script>

<template>
  <video ref="videoRef" controls />
</template>
```
