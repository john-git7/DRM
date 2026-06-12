import fs from 'fs';
import { AUDIT_LOG_PATH } from '../config/paths';

/**
 * Phase 6 — session audit log.
 *
 * Append-only record of who watched what, from where, on which device, with what
 * agent (recorder-detection) status and how much watch time. Stored in
 * data/audit-log.json (gitignored). Forensic intent: if a recording leaks, the log
 * narrows down who had access and under what conditions.
 */
export interface AuditEntry {
  timestamp: string;
  username: string;
  ip: string;
  event: string;
  videoId?: string;
  deviceId?: string;
  agentStatus?: string;
  recorders?: string[];
  watchTimeSec?: number;
  /** 'mobile' | 'desktop' — client-reported platform for the session. */
  platform?: string;
  userAgent?: string;
}

/** Hard cap so the prototype's flat-file log cannot grow without bound. */
const MAX_ENTRIES = 5000;

export function appendAudit(entry: AuditEntry): void {
  try {
    let log: AuditEntry[] = [];
    if (fs.existsSync(AUDIT_LOG_PATH)) {
      const parsed: unknown = JSON.parse(fs.readFileSync(AUDIT_LOG_PATH, 'utf-8') || '[]');
      if (Array.isArray(parsed)) log = parsed as AuditEntry[];
    }
    log.push(entry);
    if (log.length > MAX_ENTRIES) log = log.slice(-MAX_ENTRIES);
    fs.writeFileSync(AUDIT_LOG_PATH, JSON.stringify(log, null, 2), 'utf-8');
  } catch {
    console.error('Error writing audit log');
  }
}
