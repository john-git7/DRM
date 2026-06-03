import { AGENT_BASE } from '../config/api';
import type { AgentStatus } from '../types';

/**
 * Phase 3 integration — ask the localhost proctoring agent whether a screen
 * recorder is running before playback.
 *
 * Outcomes:
 *  - 'clean'         — agent reachable, no recorders → playback allowed
 *  - 'threat'        — agent reachable, recorders running → block
 *  - 'not-installed' — agent unreachable (connection refused / timeout) → prompt install
 *  - 'error'         — agent reachable but returned an unexpected response
 */
export async function checkAgent(timeoutMs = 2500): Promise<AgentStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${AGENT_BASE}/status`, {
      signal: controller.signal,
      cache: 'no-store'
    });
    if (!res.ok) return { state: 'error', recorders: [] };
    const data = (await res.json()) as { clean?: boolean; recorders?: unknown };
    const recorders = Array.isArray(data.recorders) ? data.recorders.map(String) : [];
    return data.clean ? { state: 'clean', recorders: [] } : { state: 'threat', recorders };
  } catch {
    // AbortError or network failure → the agent is not running/installed.
    return { state: 'not-installed', recorders: [] };
  } finally {
    clearTimeout(timer);
  }
}
