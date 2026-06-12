import { useState, useEffect, useRef } from 'react';
import Hls from 'hls.js';
import QRCode from 'qrcode';
import {
  Play,
  Pause,
  Volume2,
  VolumeX,
  Maximize,
  Minimize,
  AlertTriangle,
} from 'lucide-react';
import { useKeyboardProtection } from '../hooks/useKeyboardProtection';
import apiClient from '../utils/apiClient';
import type { VideoPlayerProps } from '../types';

/**
 * Forensic mark tuning. A small, faint QR (identity + time) appears once every
 * ~5 minutes at a random spot for a few seconds, then hides — deliberately low
 * attention. A QR self-localises and is binarised locally, so even faint it scans
 * reliably anywhere over any video content (~0.3 opacity is the decode floor).
 */
const BARCODE_OPACITY = 0.35;             // faint — low attention, still scannable
const BARCODE_PX = 130;                   // on-screen QR size (encrypted token needs more modules)
const BARCODE_SHOW_MS = [2500, 4000];     // visible duration range (~2.5–4s)
const BARCODE_GAP_MS = [300000, 300000];  // ~5 minutes between appearances

export default function VideoPlayer({
  hlsUrl,
  keyGrant,
  deviceId,
  title,
  devToolsOpen = false,
  onWatchTimeTick,
  focusLossDetectEnabled = true,
  rightClickProtectEnabled = true,
  keyboardProtectEnabled = true,
  forensicWatermarkEnabled = true,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [windowFocused, setWindowFocused] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Forensic mark — a small QR (identity + time) that flashes intermittently at a
  // random spot; built + scheduled below.
  const [barcodeSrc, setBarcodeSrc] = useState<string | null>(null);
  const [barVisible, setBarVisible] = useState(false);
  const [barTop, setBarTop] = useState(10);
  const [barLeft, setBarLeft] = useState(10);

  useKeyboardProtection(undefined, keyboardProtectEnabled);

  // --- HLS.js attach with grant-bound key loading (Phase 2 + 4) -------------
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hlsUrl) return;

    // DevTools open → never wire up the source (Phase 4 hardening).
    if (devToolsOpen) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        // Attach the 30-second signed grant + device fingerprint to the key request only.
        xhrSetup: (xhr, url) => {
          if (/\/key(\?|$)/.test(url)) {
            xhr.setRequestHeader('X-Key-Grant', keyGrant);
            xhr.setRequestHeader('X-Device-Id', deviceId);
          }
        },
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, (_evt, data) => {
        if (data.fatal) {
          setLoadError(`HLS Error: ${data.type} - ${data.details}`);
        }
      });
      return () => hls.destroy();
    }

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari) cannot attach the grant header to key requests, so the
      // grant is passed as a query param instead.
      video.src = `${hlsUrl}#`;
      video.dataset.keyGrant = keyGrant;
      return;
    }

    setLoadError('HLS playback is not supported in this browser.');
  }, [hlsUrl, keyGrant, deviceId, devToolsOpen]);

  // DevTools open → tear down the loaded source so frames cannot be inspected.
  useEffect(() => {
    if (!devToolsOpen) return;
    const video = videoRef.current;
    if (video) {
      video.pause();
      video.removeAttribute('src');
      video.load();
      setIsPlaying(false);
    }
  }, [devToolsOpen]);

  // Forensic barcode scheduler — build the barcode, flash it on a random border
  // for a short while, hide, repeat. All setState calls live inside timers, never
  // synchronously in the effect body. When disabled, the overlay JSX is gated off.
  useEffect(() => {
    if (!forensicWatermarkEnabled || devToolsOpen) return;
    let showT = 0, hideT = 0, cancelled = false;
    const rand = ([a, b]: number[]) => a + Math.random() * (b - a);
    const schedule = () => {
      showT = window.setTimeout(async () => {
        if (cancelled) return;
        try {
          // Server mints the encrypted token (stamps IP + time, embeds device).
          const { data } = await apiClient.post<{ token: string }>('/forensic/token', { deviceId });
          if (cancelled) return;
          const url = await QRCode.toDataURL(data.token, { margin: 4, width: 220, errorCorrectionLevel: 'L' });
          if (cancelled) return;
          setBarcodeSrc(url);
          setBarTop(Math.floor(Math.random() * 64) + 8);   // 8–72%
          setBarLeft(Math.floor(Math.random() * 64) + 8);  // 8–72%
          setBarVisible(true);
          hideT = window.setTimeout(() => {
            if (cancelled) return;
            setBarVisible(false);
            schedule();
          }, rand(BARCODE_SHOW_MS));
        } catch {
          if (!cancelled) schedule();
        }
      }, rand(BARCODE_GAP_MS));
    };
    schedule();
    return () => { cancelled = true; clearTimeout(showT); clearTimeout(hideT); };
  }, [forensicWatermarkEnabled, devToolsOpen, deviceId]);

  // Watch-time heartbeat for audit logging (Phase 6).
  useEffect(() => {
    if (!isPlaying || !onWatchTimeTick) return;
    const tick = setInterval(() => {
      if (videoRef.current) onWatchTimeTick(Math.floor(videoRef.current.currentTime));
    }, 15000);
    return () => clearInterval(tick);
  }, [isPlaying, onWatchTimeTick]);

  // Focus loss + tab visibility → pause (Phase 4).
  useEffect(() => {
    const pauseForFocusLoss = () => {
      if (!focusLossDetectEnabled) return;
      setWindowFocused(false);
      navigator.clipboard?.writeText('PROTECTED SECURE CONTENT - SCREENSHOT INTERCEPTED').catch(() => { });
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    };
    const handleFocus = () => setWindowFocused(true);
    const handleVisibility = () => { if (document.hidden) pauseForFocusLoss(); };

    window.addEventListener('blur', pauseForFocusLoss);
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('blur', pauseForFocusLoss);
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [focusLossDetectEnabled]);

  useEffect(() => {
    const handleRightClick = (e: MouseEvent) => { if (rightClickProtectEnabled) e.preventDefault(); };
    document.addEventListener('contextmenu', handleRightClick, true);
    return () => document.removeEventListener('contextmenu', handleRightClick, true);
  }, [rightClickProtectEnabled]);

  useEffect(() => {
    // Auto-hide only while playing; when paused the controls stay pinned via the
    // `!isPlaying` term on the controls bar below — no setState needed here.
    if (!isPlaying) return;
    const timer = setTimeout(() => setShowControls(false), 3000);
    return () => clearTimeout(timer);
  }, [showControls, isPlaying]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const togglePlay = () => {
    if (!windowFocused && focusLossDetectEnabled) return;
    if (devToolsOpen) return;
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch((err) => console.error('Playback interrupted:', err));
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => { if (videoRef.current) setCurrentTime(videoRef.current.currentTime); };
  const handleLoadedMetadata = () => { if (videoRef.current) setDuration(videoRef.current.duration); };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) { videoRef.current.currentTime = time; setCurrentTime(time); }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (videoRef.current) { videoRef.current.volume = vol; videoRef.current.muted = vol === 0; setIsMuted(vol === 0); }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    const nextMute = !isMuted;
    videoRef.current.muted = nextMute;
    videoRef.current.volume = nextMute ? 0 : volume;
    setIsMuted(nextMute);
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => console.error('Fullscreen error:', err));
    } else {
      document.exitFullscreen();
    }
  };

  const formatTime = (secs: number): string => {
    if (isNaN(secs)) return '00:00';
    return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
  };

  const isFocusLost = !windowFocused && focusLossDetectEnabled;

  return (
    <div
      ref={containerRef}
      onMouseMove={() => setShowControls(true)}
      className={`relative w-full aspect-video overflow-hidden bg-black select-none ${isFullscreen ? '' : 'border-2 border-white'}`}
      style={isFullscreen ? {} : { boxShadow: '6px 6px 0px #7c3aed' }}
    >
      <video
        ref={videoRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        className={`w-full h-full object-contain transition-all duration-300 ${isFocusLost || devToolsOpen ? 'blur-xl select-none pointer-events-none' : ''}`}
        playsInline
        controlsList="nodownload noremoteplayback"
        disablePictureInPicture
        disableRemotePlayback
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Forensic mark — a small QR that flashes briefly at a random spot; encodes
          identity + time for leak tracing, scannable anywhere by the /scanner tool. */}
      {forensicWatermarkEnabled && barVisible && barcodeSrc && !isFocusLost && !devToolsOpen && (
        <img
          src={barcodeSrc}
          alt=""
          aria-hidden
          draggable={false}
          style={{ top: `${barTop}%`, left: `${barLeft}%`, width: `${BARCODE_PX}px`, height: `${BARCODE_PX}px`, opacity: BARCODE_OPACITY }}
          className="absolute z-20 pointer-events-none select-none"
        />
      )}

      {/* Click shield */}
      <div
        className="absolute inset-0 z-0 cursor-pointer"
        onClick={togglePlay}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Load error overlay */}
      {loadError && !devToolsOpen && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-40 text-center px-4">
          <AlertTriangle className="w-10 h-10 text-[#ef4444] mb-3" />
          <p className="text-[#ef4444] font-black text-sm uppercase tracking-wide mb-1">Stream Error</p>
          <p className="text-gray-400 text-xs font-mono max-w-xs">{loadError}</p>
        </div>
      )}

      {/* Play overlay */}
      {!isPlaying && !isFocusLost && !devToolsOpen && !loadError && (
        <div
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/40 cursor-pointer z-10 hover:bg-black/50 transition-colors"
        >
          <div
            className="p-5 bg-[#7c3aed] text-white border-2 border-white transition-transform duration-75 hover:-translate-y-0.5 active:translate-y-0.5"
            style={{ boxShadow: '4px 4px 0px #fff' }}
          >
            <Play fill="currentColor" className="w-8 h-8 translate-x-0.5" />
          </div>
        </div>
      )}

      {/* Focus loss overlay */}
      {isFocusLost && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-35 text-center px-4">
          <div className="brutal-card p-6 max-w-sm">
            <AlertTriangle className="w-10 h-10 text-[#f59e0b] mx-auto mb-3" />
            <h2 className="text-base font-black text-white uppercase tracking-wide mb-1">Playback Paused</h2>
            <p className="text-gray-400 text-xs font-mono">
              Window focus lost — re-focus to resume.
            </p>
          </div>
        </div>
      )}

      {/* Controls bar */}
      <div
        className={`absolute inset-x-0 bottom-0 bg-[#111111] border-t-2 border-white/20 p-3 z-30 transition-all duration-200 flex flex-col gap-2 ${showControls || !isPlaying ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
          }`}
      >
        <input
          type="range"
          min={0}
          max={duration || 100}
          value={currentTime}
          onChange={handleSeekChange}
          className="video-seek-slider w-full"
        />

        <div className="flex items-center justify-between w-full text-white">
          <div className="flex items-center gap-4">
            <button onClick={togglePlay} className="hover:text-[#a78bfa] transition-colors cursor-pointer" title={isPlaying ? 'Pause' : 'Play'}>
              {isPlaying ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 fill-current" />}
            </button>

            <div className="flex items-center gap-2">
              <button onClick={toggleMute} className="hover:text-[#a78bfa] transition-colors cursor-pointer" title={isMuted ? 'Unmute' : 'Mute'}>
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume} onChange={handleVolumeChange} className="video-volume-slider w-16 md:w-20" />
            </div>

            <div className="text-xs font-mono tracking-wide text-gray-300 select-none">
              {formatTime(currentTime)} <span className="text-gray-600">/</span> {formatTime(duration)}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden md:inline text-xs text-gray-500 truncate max-w-[180px] font-mono uppercase tracking-wide">
              {title || 'Secure Video'}
            </span>
            <button onClick={toggleFullscreen} className="hover:text-[#a78bfa] transition-colors cursor-pointer" title="Fullscreen">
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
