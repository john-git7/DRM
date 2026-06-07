# @drmshield/server

A framework-agnostic Node.js package that provides two security engines for the DRMShield video protection system:

- **`KeyGrantEngine`** — issues and verifies short-lived HMAC-SHA256 stream grants that bind a key-release request to a specific video, IP address, device fingerprint, and username.
- **`AuthEngine`** — issues and verifies signed JWTs for user authentication.

Neither engine has any dependency on Express, environment variables, or any specific HTTP framework. Secrets are passed at construction time, which makes the engines straightforward to test in isolation and safe to reuse across requests.

## Requirements

- Node.js 18 or later (the package imports `node:crypto` and `node:buffer` as explicit ESM specifiers)
- `"type": "module"` in your consuming project, or an ESM-aware bundler

## Installation

```bash
pnpm add @drmshield/server
```

## Quick Start

The example below shows both engines working together on a typical key-grant flow. In a real application you would call `issueStreamToken` inside the route that hands the grant to the browser, and `verifyStreamToken` inside the route that serves the AES-128 decryption key.

```typescript
import { KeyGrantEngine, AuthEngine } from '@drmshield/server';

// Instantiate once — both engines are stateless and safe to reuse.
const grants = new KeyGrantEngine(process.env.STREAM_SECRET!);
const auth   = new AuthEngine(process.env.JWT_SECRET!);

// ── On the key-grant route (JWT-protected) ──────────────────────────────────

function handleKeyGrant(req, res) {
  const { videoId } = req.params;
  const { deviceId } = req.body;
  const ip       = req.ip;
  const username = req.user.username; // from JWT middleware

  const { grant, ttl } = grants.issueStreamToken(videoId, ip, deviceId, username);

  res.json({ grant, ttl });
}

// ── On the key-release route (grant-gated) ──────────────────────────────────

function handleKeyRelease(req, res) {
  const { videoId } = req.params;
  const token    = req.headers['x-key-grant'] as string;
  const deviceId = req.headers['x-device-id'] as string;
  const ip       = req.ip;

  const result = grants.verifyStreamToken(token, { videoId, ip, deviceId });

  if (!result.valid) {
    res.status(401).json({ error: result.reason });
    return;
  }

  // result.claims is now available and fully verified
  res.send(getAesKey(videoId));
}

// ── JWT issuance on login ────────────────────────────────────────────────────

function handleLogin(req, res) {
  const { username, password } = req.body;
  // validate credentials yourself — AuthEngine only handles token mechanics
  if (!credentialsAreValid(username, password)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  const token = auth.issueJwt(username);
  res.json({ token });
}

// ── JWT verification middleware ──────────────────────────────────────────────

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

### `class KeyGrantEngine`

#### `constructor(secret: string)`

Creates a new grant engine. The `secret` is the HMAC key used to sign and verify all tokens produced by this instance. It must not be empty — the constructor throws an `Error` if it is.

The same secret must be used on both the issuing side (key-grant route) and the verifying side (key-release route). Two instances created with the same secret are interchangeable.

```typescript
const grants = new KeyGrantEngine(process.env.STREAM_SECRET!);
```

---

#### `issueStreamToken(videoId, ip, deviceId, username): { grant: string; ttl: number }`

Issues a short-lived grant that binds a key-release request to a specific context.

| Parameter | Type | Description |
|-----------|------|-------------|
| `videoId` | `string` | The ID of the video being requested. |
| `ip` | `string` | The caller's IP address. IPv6-mapped IPv4 addresses are normalized automatically. |
| `deviceId` | `string` | A device fingerprint computed by the browser. |
| `username` | `string` | The authenticated username, for audit purposes. |

Returns an object with:
- `grant` — the token string to send to the browser
- `ttl` — the token lifetime in seconds (always 30)

The grant is a base64url-encoded JSON payload joined by a dot to a base64url HMAC-SHA256 signature. See [Token Format](#token-format) for details.

```typescript
const { grant, ttl } = grants.issueStreamToken(
  'vid-abc123',
  req.ip,
  req.body.deviceId,
  req.user.username,
);
// send { grant, ttl } to the browser
```

---

#### `verifyStreamToken(token, expected): GrantVerifyResult`

Verifies a grant against the live request context. This method performs the following checks in order:

1. The token has the expected `payload.signature` shape.
2. The HMAC-SHA256 signature matches — using a timing-safe byte comparison so the check does not leak information about partial matches.
3. The JSON payload decodes and contains the required fields (`videoId`, `ip`, `deviceId`, `username`, `exp`).
4. The grant has not expired (`exp` is checked against the current Unix timestamp).
5. The `videoId` in the grant matches the video being requested.
6. The IP address in the grant matches the caller's IP (after normalizing both sides).
7. The `deviceId` in the grant matches the device fingerprint presented in the request.

| Parameter | Type | Description |
|-----------|------|-------------|
| `token` | `string` | The grant string received from the browser. |
| `expected.videoId` | `string` | The video ID from the URL being requested. |
| `expected.ip` | `string` | The caller's current IP address. |
| `expected.deviceId` | `string` | The device fingerprint presented in the request (e.g. from an `X-Device-Id` header). |

Returns a discriminated union:

```typescript
type GrantVerifyResult =
  | { valid: true;  claims: GrantClaims }  // all checks passed
  | { valid: false; reason: string };      // which check failed
```

When `valid` is `true`, the `claims` object contains the fully verified payload and can be trusted. When `valid` is `false`, the `reason` string describes which check failed. Possible reasons are: `'malformed grant'`, `'bad signature'`, `'undecodable grant'`, `'malformed claims'`, `'grant expired'`, `'video mismatch'`, `'ip mismatch'`, `'device mismatch'`.

```typescript
const result = grants.verifyStreamToken(grantHeader, {
  videoId: req.params.videoId,
  ip: req.ip,
  deviceId: req.headers['x-device-id'] as string,
});

if (!result.valid) {
  return res.status(401).json({ error: result.reason });
}

// TypeScript now knows result.claims is GrantClaims
console.log('Verified for user:', result.claims.username);
```

---

### `class AuthEngine`

#### `constructor(jwtSecret: string)`

Creates a new JWT engine. The `jwtSecret` is the signing key for all tokens produced by this instance. It must not be empty — the constructor throws an `Error` if it is.

```typescript
const auth = new AuthEngine(process.env.JWT_SECRET!);
```

---

#### `issueJwt(username: string): string`

Signs and returns a JWT containing `{ username }` as the payload. The token expires after 24 hours.

```typescript
const token = auth.issueJwt('alice');
// returns a compact JWT string: "eyJ..."
```

---

#### `verifyJwt(token: string): JwtPayload`

Verifies the token's signature and expiry. Returns the decoded payload if valid. Throws a `JsonWebTokenError` (from the `jsonwebtoken` library) if the token is malformed, has an invalid signature, or has expired.

```typescript
try {
  const payload = auth.verifyJwt(token);
  console.log(payload.username); // 'alice'
  console.log(payload.iat);      // issued-at Unix timestamp
  console.log(payload.exp);      // expiry Unix timestamp
} catch (err) {
  // token is invalid or expired
}
```

---

### `function normalizeIp(ip: string | undefined): string`

A utility function that normalizes IP address strings for consistent comparison. It handles two common edge cases:

- **IPv6-mapped IPv4 addresses** — `::ffff:192.168.1.1` is normalized to `192.168.1.1`.
- **IPv6 loopback** — `::1` is normalized to `127.0.0.1`.

This function is used internally by `verifyStreamToken` on both sides of the IP comparison. It is also exported in case you need consistent IP normalization elsewhere in your server.

```typescript
import { normalizeIp } from '@drmshield/server';

normalizeIp('::ffff:10.0.0.1');  // → '10.0.0.1'
normalizeIp('::1');              // → '127.0.0.1'
normalizeIp('10.0.0.1');         // → '10.0.0.1'
normalizeIp(undefined);          // → ''
```

---

## Types

```typescript
interface GrantClaims {
  videoId:  string;  // the video this grant was issued for
  ip:       string;  // the IP the grant was issued to
  deviceId: string;  // the device fingerprint the grant was issued to
  username: string;  // the authenticated user
  exp:      number;  // Unix expiry timestamp (30 seconds after issuance)
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

## Token Format

A stream grant has the following structure:

```
<base64url-payload>.<base64url-signature>
```

The payload is the base64url encoding of the JSON-serialized `GrantClaims` object. The signature is a base64url-encoded HMAC-SHA256 digest of the string `keygrant:v1:<payload>`, computed using the secret provided to the `KeyGrantEngine` constructor.

The domain prefix `keygrant:v1:` is mixed into every signature. This means a grant token cannot be replayed against any other HMAC endpoint that happens to share the same secret key, even if the token format looks similar.

The payload is not encrypted — it is only signed. Do not store sensitive values (passwords, raw keys) in the grant claims.

---

## Security Notes

**Timing-safe comparison.** Signature verification uses `crypto.timingSafeEqual` from Node's built-in crypto module. This prevents timing side-channel attacks that could otherwise allow an attacker to infer partial signature matches by measuring how long verification takes.

**Claim-shape validation before field access.** The JSON payload is parsed and every expected field is type-checked before any claim is used in a comparison. This prevents prototype pollution and type confusion bugs that could arise from malformed tokens.

**Domain separation.** The HMAC input is prefixed with `keygrant:v1:`, which makes tokens produced by this engine incompatible with any other HMAC computation using the same key. If you ever need to add a second token type, use a different prefix.

**Short TTL by design.** Grants expire after 30 seconds. This limits the damage window if a grant is captured in transit. The key endpoint should always call `verifyStreamToken` immediately before releasing the key, not before.

**No environment coupling.** The package never reads `process.env`. Secrets are injected at construction time so that the engines work identically in test, staging, and production environments without any special configuration.
