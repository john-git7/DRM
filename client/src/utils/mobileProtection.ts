import { Capacitor } from '@capacitor/core';
import { PrivacyScreen } from '@capacitor-community/privacy-screen';

/**
 * Mobile (Capacitor) screen-protection layer — Option B, hybrid WebView.
 *
 * On a native Android/iOS build these wrap the OS protections the browser can't
 * reach; on the plain web build every function is a guarded no-op, so the same
 * codebase runs everywhere unchanged.
 *
 *  - enableScreenProtection(): Android FLAG_SECURE (blocks screenshots, screen
 *    recording, recents preview) + iOS privacy overlay / screenshot prevention.
 *  - onCaptureEvent(): subscribe to recording start/stop + screenshot events so
 *    the player can black out and log a forensic/audit event, like the desktop
 *    recorder-detection agent does.
 */

export type CaptureEvent = 'screenRecordingStarted' | 'screenRecordingStopped' | 'screenshotTaken';

/** True only inside a native Capacitor app (false on the web build). */
export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}

/** Turn on OS-level screen protection. No-op on the web. */
export async function enableScreenProtection(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await PrivacyScreen.enable();
  } catch (err) {
    console.warn('[mobileProtection] enable failed:', err);
  }
}

/** Turn it off (e.g. for a non-protected screen). No-op on the web. */
export async function disableScreenProtection(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    await PrivacyScreen.disable();
  } catch {
    /* ignore */
  }
}

/**
 * Subscribe to capture events. Returns an unsubscribe function. No-op on the web
 * (returns a function that does nothing).
 */
export async function onCaptureEvent(handler: (event: CaptureEvent) => void): Promise<() => void> {
  if (!isNativeApp()) return () => {};
  const handles = await Promise.all([
    PrivacyScreen.addListener('screenRecordingStarted', () => handler('screenRecordingStarted')),
    PrivacyScreen.addListener('screenRecordingStopped', () => handler('screenRecordingStopped')),
    PrivacyScreen.addListener('screenshotTaken', () => handler('screenshotTaken')),
  ]);
  return () => { handles.forEach((h) => h.remove()); };
}
