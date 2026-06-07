# @drmshield/server

This package provides the server-side security logic for DRMShield. It handles two things:

- **Key grants** — short-lived tokens that authorize a browser to fetch an AES-128 decryption key
- **JWT authentication** — login tokens for your users

It works with any Node.js HTTP framework (Express, Fastify, Hono, etc.) and has no framework-specific dependencies.

---

## Requirements

- Node.js 18 or later

## Installation

```bash
pnpm add @drmshield/server
```

---

## Core Concept: What is a key grant?

A key grant is a short-lived, signed token (30 seconds) that says:

> "This specific user, on this specific device, from this specific IP address, may fetch the AES-128 key for this specific video — but only for the next 30 seconds."

When the browser requests the decryption key, it presents this grant. The server checks the signature and all the bound claims before releasing the key. If anything does not match — wrong IP, wrong device, expired token — the key is refused.

---

## Quick Start

```typescript
import { KeyGrantEngine, AuthEngine } from '@drmshield/server';

// Create one instance of each engine. Both are stateless and safe to reuse across requests.
const grants = new KeyGrantEngine(process.env.STREAM_SECRET!);
const auth   = new AuthEngine(process.env.JWT_SECRET!);
```

### Issue a key grant (when the user clicks play)

```typescript
function handleKeyGrant(req, res) {
  const { videoId } = req.params;
  const { deviceId } = req.body;

  const { grant, ttl } = grants.issueStreamToken(
    videoId,
    req.ip,
    deviceId,
    req.user.username, // from your JWT middleware
  );

  res.json({ grant, ttl }); // send to browser
}
```

### Verify the grant and release the key

```typescript
function handleKeyRelease(req, res) {
  const { videoId } = req.params;

  const result = grants.verifyStreamToken(
    req.headers['x-key-grant'] as string,
    {
      videoId,
      ip: req.ip,
      deviceId: req.headers['x-device-id'] as string,
    },
  );

  if (!result.valid) {
    res.status(401).json({ error: result.reason });
    return;
  }

  res.send(getAesKey(videoId)); // only reached if the grant is valid
}
```

### Issue and verify login tokens

```typescript
// On login
function handleLogin(req, res) {
  const { username, password } = req.body;

  if (!credentialsAreValid(username, password)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = auth.issueJwt(username);
  res.json({ token });
}

// As middleware on protected routes
function requireAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing token' });
    return;
  }

  try {
    req.user = auth.verifyJwt(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}
```

---

## API Reference

### `KeyGrantEngine`

#### `new KeyGrantEngine(secret: string)`

Creates a grant engine. The `secret` is the HMAC signing key. It must not be empty. Use the same secret on both the issuing side and the verifying side.

```typescript
const grants = new KeyGrantEngine(process.env.STREAM_SECRET!);
```

---

#### `grants.issueStreamToken(videoId, ip, deviceId, username)`

Issues a 30-second grant token.

| Parameter | Type | Description |
|-----------|------|-------------|
| `videoId` | `string` | The video the user is requesting |
| `ip` | `string` | The caller's IP address (IPv6-mapped IPv4 is normalized automatically) |
| `deviceId` | `string` | A fingerprint computed by the browser |
| `username` | `string` | The authenticated username |

**Returns:** `{ grant: string, ttl: number }` — the token string and its lifetime in seconds (always 30).

```typescript
const { grant, ttl } = grants.issueStreamToken('vid-abc123', req.ip, deviceId, 'alice');
```

---

#### `grants.verifyStreamToken(token, expected)`

Verifies a grant before releasing the key. Checks (in order):

1. The token has the correct structure
2. The HMAC signature is valid (timing-safe comparison)
3. The payload contains all required fields
4. The token has not expired
5. The video ID matches
6. The IP address matches
7. The device fingerprint matches

| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | `string` | The grant string from the browser request |
| `expected.videoId` | `string` | The video ID from the URL |
| `expected.ip` | `string` | The caller's current IP |
| `expected.deviceId` | `string` | The device fingerprint from the request header |

**Returns** one of:

```typescript
{ valid: true,  claims: GrantClaims }  // all checks passed — safe to release the key
{ valid: false, reason: string }       // which check failed
```

Possible failure reasons: `'malformed grant'`, `'bad signature'`, `'undecodable grant'`, `'malformed claims'`, `'grant expired'`, `'video mismatch'`, `'ip mismatch'`, `'device mismatch'`.

```typescript
const result = grants.verifyStreamToken(token, { videoId, ip: req.ip, deviceId });

if (!result.valid) {
  return res.status(401).json({ error: result.reason });
}

// TypeScript now knows result.claims is GrantClaims
console.log('Verified for:', result.claims.username);
```

---

### `AuthEngine`

#### `new AuthEngine(jwtSecret: string)`

Creates a JWT engine. The `jwtSecret` must not be empty.

```typescript
const auth = new AuthEngine(process.env.JWT_SECRET!);
```

---

#### `auth.issueJwt(username: string): string`

Returns a signed JWT containing `{ username }`. Expires after 24 hours.

```typescript
const token = auth.issueJwt('alice');
```

---

#### `auth.verifyJwt(token: string): JwtPayload`

Verifies the token's signature and expiry. Returns the decoded payload if valid. Throws a `JsonWebTokenError` if the token is malformed, has an invalid signature, or has expired.

```typescript
try {
  const payload = auth.verifyJwt(token);
  console.log(payload.username); // 'alice'
} catch {
  // token is invalid or expired
}
```

---

### `normalizeIp(ip)`

A utility that normalizes IP address strings so that `::ffff:192.168.1.1` and `192.168.1.1` compare as equal. Used internally by `verifyStreamToken`, but exported in case you need it elsewhere.

```typescript
import { normalizeIp } from '@drmshield/server';

normalizeIp('::ffff:10.0.0.1'); // → '10.0.0.1'
normalizeIp('::1');             // → '127.0.0.1'
normalizeIp('10.0.0.1');        // → '10.0.0.1'
normalizeIp(undefined);         // → ''
```

---

## Types

```typescript
interface GrantClaims {
  videoId:  string;  // the video this grant was issued for
  ip:       string;  // the IP the grant was issued to
  deviceId: string;  // the device fingerprint the grant was issued to
  username: string;  // the authenticated user
  exp:      number;  // Unix expiry timestamp
}

type GrantVerifyResult =
  | { valid: true;  claims: GrantClaims }
  | { valid: false; reason: string };

interface JwtPayload {
  username: string;
  iat:      number;  // issued-at Unix timestamp
  exp:      number;  // expiry Unix timestamp
}
```

---

## Security Notes

**Timing-safe comparison.** Signature verification uses `crypto.timingSafeEqual`, which prevents timing side-channel attacks where an attacker measures how long verification takes to infer partial matches.

**Short TTL by design.** Grants expire after 30 seconds. Even if an attacker captures a grant in transit, they have a very small window to misuse it — and the IP and device fingerprint checks close that window further.

**No environment coupling.** This package never reads `process.env`. Secrets are passed at construction time, so the engines behave identically in test, staging, and production without any special configuration.

**Domain separation.** The HMAC input is prefixed with `keygrant:v1:`, which means grant tokens cannot be replayed against any other HMAC endpoint that shares the same secret key.
