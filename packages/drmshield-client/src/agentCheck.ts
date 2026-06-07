import type { AgentStatus, AgentThreat } from './types.js';

/**
 * Ask the localhost recorder-detection agent whether any capture threat is present.
 *
 * @param agentBase - Base URL of the agent, e.g. `http://localhost:7891`
 * @param timeoutMs - Abort timeout in milliseconds (default 3000)
 *
 * Outcomes:
 *  - 'clean'         — agent reachable, nothing detected
 *  - 'threat'        — agent reachable, one or more threats active
 *  - 'not-installed' — agent unreachable (refused / timeout)
 *  - 'error'         — agent reachable but returned an unexpected response
 */
export async function checkAgent(
  agentBase: string,
  timeoutMs = 3000,
): Promise<AgentStatus> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${agentBase}/status`, {
      signal: controller.signal,
      cache: 'no-store',
    });
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
        ? (data.recorders as unknown[]).map((r) => ({
            category: 'Screen recorder',
            name: String(r),
          }))
        : [];

    return data.clean ? { state: 'clean', threats: [] } : { state: 'threat', threats };
  } catch {
    return { state: 'not-installed', threats: [] };
  } finally {
    clearTimeout(timer);
  }
}
