export const API_BASE =
  (import.meta.env.VITE_API_BASE as string | undefined) ?? 'http://localhost:5000/api';

// Localhost proctoring agent (Phase 3). The browser polls this before playback.
export const AGENT_BASE =
  (import.meta.env.VITE_AGENT_BASE as string | undefined) ?? 'http://localhost:7891';
