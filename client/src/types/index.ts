export interface Video {
  id: string;
  filename: string;
  originalName: string;
  title: string;
  size: number;
  uploadDate: string;
  mimeType?: string;
  hlsStatus?: 'processing' | 'ready' | 'failed';
  hlsPlaylist?: string;
  hlsProgress?: number;
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

export interface VideoPlayerProps {
  /** Absolute URL of the encrypted HLS playlist (.m3u8). */
  hlsUrl: string;
  /** 30-second signed key grant attached to the HLS key request. */
  keyGrant: string;
  /** Device fingerprint sent with the key request; must match the grant. */
  deviceId: string;
  title: string;
  /** When true, the player tears down the video source (DevTools open). */
  devToolsOpen?: boolean;
  /** Called with elapsed watch-time seconds for audit heartbeats. */
  onWatchTimeTick?: (seconds: number) => void;
  focusLossDetectEnabled?: boolean;
  rightClickProtectEnabled?: boolean;
  keyboardProtectEnabled?: boolean;
  /** Intermittent faint QR (encrypted token) for covert leak tracing. */
  forensicWatermarkEnabled?: boolean;
  /** Always-on visible per-session identity overlay (username · IP · device · time). */
  visibleWatermarkEnabled?: boolean;
  /** Viewer identity shown in the visible watermark (username from the JWT). */
  viewerIdentity?: string;
  /** Caller IP (from the key-grant response) shown in the visible watermark. */
  viewerIp?: string;
}

export type AgentState = 'clean' | 'threat' | 'not-installed' | 'error' | 'checking';

export interface AgentThreat {
  /** e.g. "Screen recorder", "Video downloader", "Browser extension", "Capture device". */
  category: string;
  name: string;
}

export interface AgentStatus {
  state: AgentState;
  threats: AgentThreat[];
}

export interface UploadResponse {
  message: string;
  video: Video;
}
