import { checkAgent as _checkAgent } from '@drmshield/client';
import type { AgentStatus } from '@drmshield/client';
import { AGENT_BASE } from '../config/api.js';
import { isMobilePlatform, isAndroidPlatform } from './platform';

export type { AgentStatus, AgentThreat, AgentState } from '@drmshield/client';

/**
 * Opt-in Android companion agent. Off by default: Android playback stays
 * forensic-watermark-only until the companion APK (see agent-android/) is actually
 * distributed — otherwise every Android viewer without it would be hard-blocked.
 * Set VITE_ANDROID_AGENT=1 once the APK is published to enforce the recorder gate
 * on Android too. iOS Safari can never run a localhost agent, so it is excluded.
 */
const ANDROID_AGENT_ENABLED = import.meta.env.VITE_ANDROID_AGENT === '1';

export async function checkAgent(timeoutMs = 8000): Promise<AgentStatus> {
  // Android + companion agent enabled → poll localhost exactly like desktop. The
  // agent serves the same /status contract on the same AGENT_BASE.
  if (isAndroidPlatform() && ANDROID_AGENT_ENABLED) {
    return _checkAgent(AGENT_BASE, timeoutMs);
  }
  // Any other mobile browser (iOS, or Android without the companion agent) cannot
  // run a recorder-detection agent. Report clean so the gate does not block, but
  // the session is still audited with platform:'mobile' and watermarked.
  if (isMobilePlatform()) {
    return { state: 'clean', threats: [] };
  }
  return _checkAgent(AGENT_BASE, timeoutMs);
}
