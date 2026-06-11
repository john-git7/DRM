import { checkAgent as _checkAgent } from '@drmshield/client';
import { AGENT_BASE } from '../config/api.js';

export type { AgentStatus, AgentThreat, AgentState } from '@drmshield/client';

export async function checkAgent(timeoutMs = 8000) {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  if (isMobile) {
    return { state: 'clean', threats: [] } as any;
  }
  return _checkAgent(AGENT_BASE, timeoutMs);
}
