import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor config — wraps the existing React/HLS.js web client as a native
 * Android/iOS app (Option B: hybrid WebView) so it can use OS-level screen
 * protection that a mobile browser cannot.
 *
 * PrivacyScreen (enabled from startup): on Android sets WindowManager.FLAG_SECURE
 * (blocks screenshots, screen recording, and the recents preview); on iOS adds a
 * privacy overlay when backgrounded and prevents screenshots. The plugin also
 * emits screenRecordingStarted/Stopped + screenshotTaken, which the player wires
 * to its blackout + audit (see src/utils/mobileProtection.ts).
 */
const config: CapacitorConfig = {
  appId: 'com.arqx.drmshield',
  appName: 'DRMShield',
  webDir: 'dist',
  plugins: {
    PrivacyScreen: {
      enable: true,
      preventScreenshots: true,
      contentMode: 'scaleAspectFill',
    },
  },
};

export default config;
