# DRMShield Packages

This directory contains two reusable packages extracted from the DRMShield video protection system.

## What are these packages?

When you want to protect a video, two things need to cooperate:

1. **The server** needs to control who gets the decryption key and for how long.
2. **The browser** needs to fetch that key securely and block any attempts to record or copy the video.

These packages handle exactly those two jobs — one for each side.

| Package | Runs on | What it does |
|---------|---------|--------------|
| [`@drmshield/server`](./drmshield-server) | Node.js (server) | Issues short-lived key grants and JWT login tokens |
| [`@drmshield/client`](./drmshield-client) | Browser | Plays encrypted video, blocks screen recorders and DevTools |

Neither package depends on any specific framework. You can use them with Express, Fastify, React, Vue, or plain JavaScript.

---

## How they work together

Think of it as a two-step handshake:

### Step 1 — The server issues a short-lived pass (30 seconds)

When a user wants to watch a video, your server calls `KeyGrantEngine.issueStreamToken()`. This creates a signed token that says:

> "User Alice, on device XYZ, from IP 1.2.3.4, may fetch the key for video `vid-abc` — but only for the next 30 seconds."

This token is sent to the browser.

### Step 2 — The browser uses the pass to fetch the key

The browser calls `DRMShieldClient.protectContent()`. This method:

1. Attaches the token to every AES-128 key request as a request header.
2. The key server checks the token's signature, expiry, IP, and device fingerprint before releasing the key.
3. If everything matches, the key is released and the video plays.

The encrypted video segments are useless without the key, and the key is only released for 30 seconds to the exact device and IP the pass was issued for.

---

## Getting started

```bash
# From the workspace root — installs and links both packages
pnpm install

# Build both packages
pnpm build:packages

# Or build one at a time
cd packages/drmshield-server && pnpm build
cd packages/drmshield-client && pnpm build
```

For full API docs, see the README inside each package directory.
