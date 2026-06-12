import apiClient from './apiClient';
import { platformLabel } from './platform';

/**
 * Phase 6 — fire-and-forget session audit events to the server.
 * Failures are swallowed: auditing must never interrupt or block playback.
 */
export interface AuditPayload {
  event: string;
  videoId?: string;
  deviceId?: string;
  agentStatus?: string;
  recorders?: string[];
  watchTimeSec?: number;
  /** 'mobile' | 'desktop' — so browser sessions that cannot run the recorder
   *  agent are identifiable in the log instead of passing as clean desktops.
   *  Stamped automatically by sendAudit; callers need not set it. */
  platform?: string;
}

export function sendAudit(payload: AuditPayload): void {
  // Every event carries the platform so mobile sessions (no recorder agent) are
  // never indistinguishable from a clean desktop session in the audit trail.
  const body: AuditPayload = { platform: platformLabel(), ...payload };
  apiClient.post('/audit', body).catch(() => {
    /* best-effort: never surface audit errors to the viewer */
  });
}
