import Hls from 'hls.js';
import type { AgentStatus, DevToolsStatus, DRMShieldClientOptions } from './types.js';
import { getDeviceFingerprint } from './deviceFingerprint.js';
import { checkAgent } from './agentCheck.js';
import { startDevToolsMonitor } from './devTools.js';
import { enableKeyboardProtection } from './keyboard.js';

const DEFAULT_AGENT_BASE = 'http://localhost:7891';

/**
 * Framework-agnostic DRM client. Works in any browser environment — no React,
 * no framework coupling. All protection routines return explicit teardown callbacks.
 *
 * @example
 * ```ts
 * const drm = new DRMShieldClient({ apiBase: 'http://localhost:5000/api', token: jwt });
 * const teardown = await drm.protectContent('video-id', videoEl);
 * // later:
 * teardown();
 * ```
 */
export class DRMShieldClient {
  private readonly apiBase: string;
  private readonly token: string;
  private readonly agentBase: string;

  constructor(options: DRMShieldClientOptions) {
    if (!options.apiBase) throw new Error('DRMShieldClient: apiBase is required');
    if (!options.token) throw new Error('DRMShieldClient: token is required');
    this.apiBase = options.apiBase.replace(/\/$/, '');
    this.token = options.token;
    this.agentBase = (options.agentBase ?? DEFAULT_AGENT_BASE).replace(/\/$/, '');
  }

  /** Stable device fingerprint derived from browser attributes. Cached per page load. */
  getDeviceFingerprint(): Promise<string> {
    return getDeviceFingerprint();
  }

  /**
   * Check the localhost recorder-detection agent.
   * @param timeoutMs - Abort timeout (default 3000ms).
   */
  checkAgent(timeoutMs?: number): Promise<AgentStatus> {
    return checkAgent(this.agentBase, timeoutMs);
  }

  /**
   * Start DevTools monitoring. Fires `onChange` only when the open/closed state
   * changes (not on every poll tick).
   * @returns Teardown callback — removes all listeners and clears the poll interval.
   */
  startDevToolsMonitor(onChange: (status: DevToolsStatus) => void): () => void {
    return startDevToolsMonitor(onChange);
  }

  /**
   * Attach keyboard and clipboard protection to the window.
   * @returns Teardown callback — removes all event listeners.
   */
  enableKeyboardProtection(onBlocked?: () => void): () => void {
    return enableKeyboardProtection(onBlocked);
  }

  /**
   * Pause `videoElement` on window blur and document visibility loss.
   * @returns Teardown callback — removes all event listeners.
   */
  enableFocusLossProtection(videoElement: HTMLVideoElement): () => void {
    const handleBlur = (): void => {
      videoElement.pause();
    };
    const handleVisibility = (): void => {
      if (document.visibilityState === 'hidden') videoElement.pause();
    };

    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }

  /**
   * Obtain a 30-second key grant from the server, then attach an authenticated
   * HLS stream onto `videoElement` via hls.js. The grant is bound to the caller's
   * device fingerprint; the xhrSetup hook injects it onto every `/key` request so
   * the AES-128 key endpoint can verify it without exposing the grant in the
   * playlist URL.
   *
   * A previous Hls instance attached to `videoElement` is destroyed before a new
   * one is created — no leaked network requests or media source handles.
   *
   * @returns Teardown callback — destroys the Hls instance and detaches media.
   */
  async protectContent(
    videoId: string,
    videoElement: HTMLVideoElement,
  ): Promise<() => void> {
    const deviceId = await this.getDeviceFingerprint();

    const grantRes = await fetch(`${this.apiBase}/hls/${videoId}/key-grant`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.token}`,
      },
      body: JSON.stringify({ deviceId }),
    });

    if (!grantRes.ok) {
      throw new Error(`DRMShieldClient: key-grant request failed with status ${grantRes.status}`);
    }

    const { grant } = (await grantRes.json()) as { grant: string };

    // Destroy any previous Hls instance that may have been attached to this element
    // to prevent leaked media source handles and orphaned XHR threads.
    const existing = (videoElement as HTMLVideoElement & { __drmHls?: Hls }).__drmHls;
    if (existing) {
      existing.destroy();
      delete (videoElement as HTMLVideoElement & { __drmHls?: Hls }).__drmHls;
    }

    const hls = new Hls({
      xhrSetup: (xhr: XMLHttpRequest, url: string) => {
        if (/\/key(\?|$)/.test(url)) {
          xhr.setRequestHeader('X-Key-Grant', grant);
          xhr.setRequestHeader('X-Device-Id', deviceId);
        }
      },
    });

    (videoElement as HTMLVideoElement & { __drmHls?: Hls }).__drmHls = hls;

    const playlistUrl = `${this.apiBase}/hls/${videoId}/index.m3u8`;
    hls.loadSource(playlistUrl);
    hls.attachMedia(videoElement);

    return () => {
      hls.destroy();
      const el = videoElement as HTMLVideoElement & { __drmHls?: Hls };
      if (el.__drmHls === hls) delete el.__drmHls;
    };
  }
}
