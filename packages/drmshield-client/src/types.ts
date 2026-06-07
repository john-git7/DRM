export type AgentState = 'clean' | 'threat' | 'not-installed' | 'error' | 'checking';

export interface AgentThreat {
  category: string;
  name: string;
}

export interface AgentStatus {
  state: AgentState;
  threats: AgentThreat[];
}

export interface DevToolsStatus {
  isOpen: boolean;
  dimensionsTriggered: boolean;
  cssDiffW: number;
  cssDiffH: number;
  outerWidth: number;
  outerHeight: number;
  innerWidth: number;
  innerHeight: number;
  devicePixelRatio: number;
  consoleHookTriggered: boolean;
}

export interface DRMShieldClientOptions {
  /** Base URL of the DRMShield API, e.g. `http://localhost:5000/api`. */
  apiBase: string;
  /** Bearer JWT obtained from the login endpoint. */
  token: string;
  /** Base URL of the localhost recorder-detection agent (default: http://localhost:7891). */
  agentBase?: string;
}
