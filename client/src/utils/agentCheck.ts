import { checkAgent as _checkAgent } from '@drmshield/client';
import { AGENT_BASE } from '../config/api.js';

export type { AgentStatus, AgentThreat, AgentState } from '@drmshield/client';

export async function checkAgent(timeoutMs = 3000) {
  return _checkAgent(AGENT_BASE, timeoutMs);
}
