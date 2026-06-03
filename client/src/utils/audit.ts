import apiClient from './apiClient';

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
}

export function sendAudit(payload: AuditPayload): void {
  apiClient.post('/audit', payload).catch(() => {
    /* best-effort: never surface audit errors to the viewer */
  });
}
