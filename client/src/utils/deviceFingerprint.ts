/**
 * Compute a stable device fingerprint used to bind key grants to a device (Phase 2).
 *
 * This is a best-effort fingerprint from low-entropy, stable browser attributes —
 * enough to make a grant minted on one device not trivially reusable on another.
 * It is not a hardware identifier and can be spoofed; it raises the bar, no more.
 */
let cached: string | null = null;

export async function getDeviceFingerprint(): Promise<string> {
  if (cached) return cached;

  const parts = [
    navigator.userAgent,
    navigator.language,
    (navigator.languages ?? []).join(','),
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String(new Date().getTimezoneOffset()),
    String(navigator.hardwareConcurrency ?? ''),
    String((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? '')
  ];

  const bytes = new TextEncoder().encode(parts.join('|'));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  cached = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
  return cached;
}
