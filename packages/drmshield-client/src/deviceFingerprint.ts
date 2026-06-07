let cached: string | null = null;

/**
 * Compute a stable device fingerprint from low-entropy, stable browser attributes.
 * Enough to bind a key grant to a device — not a hardware ID; can be spoofed.
 * Result is cached for the page lifetime.
 */
export async function getDeviceFingerprint(): Promise<string> {
  if (cached) return cached;

  const parts = [
    navigator.userAgent,
    navigator.language,
    (navigator.languages ?? []).join(','),
    `${screen.width}x${screen.height}x${screen.colorDepth}`,
    String(new Date().getTimezoneOffset()),
    String(navigator.hardwareConcurrency ?? ''),
    String((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? ''),
  ];

  const bytes = new TextEncoder().encode(parts.join('|'));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  cached = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 32);
  return cached;
}
