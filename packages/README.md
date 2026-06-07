# DRMShield Packages

This directory contains two standalone packages extracted from the DRMShield video protection system. Each package provides pure, reusable security logic that can be dropped into any new project without pulling in any framework, HTTP library, or application-specific scaffolding.

## Package Map

| Package | Purpose | Runtime |
|---------|---------|---------|
| [`@drmshield/server`](./drmshield-server) | HMAC-SHA256 short-lived stream grants and JWT issuance/verification | Node.js ≥ 18 |
| [`@drmshield/client`](./drmshield-client) | Browser-side AES-128 HLS playback, DevTools detection, keyboard blocking, focus-loss protection | Browser (ES2020+) |

## Getting Started

Install dependencies from the workspace root, which will link both packages:

```bash
pnpm install
```

To build both packages in one command:

```bash
pnpm build:packages
```

To work on a single package in isolation, navigate into its directory and run the build directly:

```bash
cd packages/drmshield-server
pnpm build

cd packages/drmshield-client
pnpm build
```

## How the Two Packages Work Together

The overall security model is a two-step handshake that keeps the AES-128 decryption key off the network until the moment it is needed, and even then only releases it to a verified, time-bounded request.

**Step 1 — Grant issuance (server side)**

When a user requests playback, the server calls `KeyGrantEngine.issueStreamToken()`, which produces a 30-second HMAC-SHA256 token. The token binds together the video ID, the caller's IP address, a device fingerprint, and the username. This grant is sent to the browser.

**Step 2 — Authenticated stream attachment (client side)**

The browser passes the grant to `DRMShieldClient.protectContent()`. The method creates an HLS.js instance with an `xhrSetup` hook that injects the grant and device fingerprint into every AES-128 key request as request headers. The key server receives the headers, calls `KeyGrantEngine.verifyStreamToken()`, and only releases the key if the signature is valid, the grant has not expired, and every bound claim matches the live request.

The encrypted video segments are served publicly and are useless on their own. The key is released for at most 30 seconds to the exact IP and device the grant was issued for. A stolen grant URL does not help an attacker because the key endpoint checks both the grant and the device fingerprint independently.

---

For full API documentation, see the README inside each package directory.
