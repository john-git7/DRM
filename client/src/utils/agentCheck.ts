import { AGENT_BASE } from '../config/api';
import type { AgentStatus, AgentThreat } from '../types';

/**
 * Phase 3 integration — ask the ARQX Atlas localhost agent whether any capture
 * threat is present before playback: screen recorders, the Windows Snipping Tool,
 * video-downloader processes, downloader/recorder browser extensions, or hardware
 * capture devices.
 *
 * Outcomes:
 *  - 'clean'         — agent reachable, nothing detected → playback allowed
 *  - 'threat'        — agent reachable, one or more threats → block
 *  - 'not-installed' — agent unreachable (refused / timeout) → prompt install
 *  - 'error'         — agent reachable but returned an unexpected response
 */
export async function checkAgent(timeoutMs = 3000): Promise<AgentStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${AGENT_BASE}/status`, { signal: controller.signal, cache: 'no-store' });
    if (!res.ok) return { state: 'error', threats: [] };
    const data = (await res.json()) as {
      clean?: boolean;
      threats?: Array<{ category?: unknown; name?: unknown }>;
      recorders?: unknown;
    };

    const threats: AgentThreat[] = Array.isArray(data.threats)
      ? data.threats
          .filter((t) => t && typeof t.name === 'string')
          .map((t) => ({ category: String(t.category ?? 'Threat'), name: String(t.name) }))
      : Array.isArray(data.recorders)
        ? data.recorders.map((r) => ({ category: 'Screen recorder', name: String(r) }))
        : [];

    return data.clean ? { state: 'clean', threats: [] } : { state: 'threat', threats };
  } catch {
    return { state: 'not-installed', threats: [] };
  } finally {
    clearTimeout(timer);
  }
}
