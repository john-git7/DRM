/**
 * Platform detection helpers.
 *
 * Centralises the user-agent sniffing that was previously duplicated across
 * agentCheck, LandingPage, and the agent block UI. Used to (a) decide whether the
 * localhost recorder-detection agent is reachable (desktop, and Android once the
 * companion agent is installed) and (b) stamp audit events with the platform so a
 * mobile-browser session — which cannot run the desktop agent — is clearly
 * distinguishable in the log rather than silently recorded as a clean desktop.
 */

const MOBILE_RE = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i;

export function isMobilePlatform(): boolean {
  return typeof navigator !== 'undefined' && MOBILE_RE.test(navigator.userAgent);
}

export function isAndroidPlatform(): boolean {
  return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);
}

export function isIosPlatform(): boolean {
  return typeof navigator !== 'undefined' && /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export type PlatformLabel = 'mobile' | 'desktop';

export function platformLabel(): PlatformLabel {
  return isMobilePlatform() ? 'mobile' : 'desktop';
}
