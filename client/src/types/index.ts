export interface Video {
  id: string;
  filename: string;
  originalName: string;
  title: string;
  size: number;
  uploadDate: string;
  mimetype?: string;
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
  src: string;
  title: string;
  focusLossDetectEnabled?: boolean;
  rightClickProtectEnabled?: boolean;
  keyboardProtectEnabled?: boolean;
  watermarkEnabled?: boolean;
  screenRecordWarningEnabled?: boolean;
}

export interface UploadResponse {
  message: string;
  video: Video;
}
