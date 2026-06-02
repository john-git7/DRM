import { useState, useEffect, useRef } from 'react';
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
import type { VideoPlayerProps } from '../types';

interface WatermarkPos {
  top: string;
  left: string;
}

export default function VideoPlayer({
  src,
  title,
  focusLossDetectEnabled = true,
  rightClickProtectEnabled = true,
  keyboardProtectEnabled = true,
  watermarkEnabled = true,
  screenRecordWarningEnabled = true,
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
  const [showCaptureWarning, setShowCaptureWarning] = useState(false);
  const [watermarkPos, setWatermarkPos] = useState<WatermarkPos>({ top: '15%', left: '15%' });
  const [watermarkTime, setWatermarkTime] = useState(() => new Date().toLocaleTimeString());

  // Use a ref for tab switch count — no UI re-render needed until threshold is crossed
  const tabSwitchCount = useRef(0);

  useKeyboardProtection(undefined, keyboardProtectEnabled);

  useEffect(() => {
    const timeInterval = setInterval(() => {
      setWatermarkTime(new Date().toLocaleTimeString());
    }, 1000);

    const positionInterval = setInterval(() => {
      setWatermarkPos({
        top: `${Math.floor(Math.random() * 65) + 10}%`,
        left: `${Math.floor(Math.random() * 65) + 10}%`,
      });
    }, 4000);

    return () => {
      clearInterval(timeInterval);
      clearInterval(positionInterval);
    };
  }, []);

  useEffect(() => {
    const handleBlur = () => {
      if (!focusLossDetectEnabled) return;

      setWindowFocused(false);
      navigator.clipboard
        ?.writeText('PROTECTED SECURE CONTENT - SCREENSHOT INTERCEPTED')
        .catch(() => {});

      if (screenRecordWarningEnabled) {
        tabSwitchCount.current += 1;
        if (tabSwitchCount.current >= 3) setShowCaptureWarning(true);
      }

      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    };

    const handleFocus = () => setWindowFocused(true);

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [focusLossDetectEnabled, screenRecordWarningEnabled]);

  useEffect(() => {
    const handleRightClick = (e: MouseEvent) => {
      if (rightClickProtectEnabled) e.preventDefault();
    };
    document.addEventListener('contextmenu', handleRightClick, true);
    return () => document.removeEventListener('contextmenu', handleRightClick, true);
  }, [rightClickProtectEnabled]);

  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      return;
    }
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
    if (!videoRef.current) return;

    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch((err) => console.error('Playback interrupted:', err));
      setIsPlaying(true);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) setCurrentTime(videoRef.current.currentTime);
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) setDuration(videoRef.current.duration);
  };

  const handleSeekChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (videoRef.current) {
      videoRef.current.volume = vol;
      videoRef.current.muted = vol === 0;
      setIsMuted(vol === 0);
    }
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
      containerRef.current.requestFullscreen().catch((err) =>
        console.error('Fullscreen error:', err),
      );
    } else {
      document.exitFullscreen();
    }
  };

  const formatTime = (secs: number): string => {
    if (isNaN(secs)) return '00:00';
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const isFocusLost = !windowFocused && focusLossDetectEnabled;

  return (
    <div
      ref={containerRef}
      onMouseMove={() => setShowControls(true)}
      className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-black group select-none"
    >
      <video
        ref={videoRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        className={`w-full h-full object-contain transition-all duration-300 ${isFocusLost ? 'blur-xl select-none pointer-events-none' : ''}`}
        playsInline
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Click shield prevents native video context menu */}
      <div
        className="absolute inset-0 z-0 cursor-pointer"
        onClick={togglePlay}
        onContextMenu={(e) => e.preventDefault()}
      />

      {watermarkEnabled && (
        <div
          style={{ top: watermarkPos.top, left: watermarkPos.left, transition: 'all 1s ease-in-out' }}
          className="absolute pointer-events-none text-white/20 text-xs md:text-sm font-semibold select-none font-mono py-1 px-2 border border-white/5 bg-black/10 rounded backdrop-blur-[1px] tracking-wider z-20 whitespace-nowrap animate-watermark"
        >
          Demo User | {new Date().toLocaleDateString()} | {watermarkTime}
        </div>
      )}

      {!isPlaying && !isFocusLost && (
        <div
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer z-10 hover:bg-black/40 transition-colors"
        >
          <div className="p-5 rounded-full bg-violet-600/90 text-white shadow-lg shadow-violet-600/30 scale-100 hover:scale-110 active:scale-95 transition-all duration-200">
            <Play fill="currentColor" className="w-8 h-8 translate-x-0.5" />
          </div>
        </div>
      )}

      {isFocusLost && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-35 text-center px-4">
          <div className="glass-panel p-6 rounded-2xl border border-white/10 max-w-sm">
            <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
            <h2 className="text-lg md:text-xl font-bold text-white mb-1">Playback Paused</h2>
            <p className="text-gray-400 text-xs md:text-sm">
              Window Focus Lost. Re-focus window to resume watching.
            </p>
          </div>
        </div>
      )}

      {showCaptureWarning && screenRecordWarningEnabled && (
        <div className="absolute bottom-16 right-4 z-40 animate-pulse">
          <div className="flex items-center gap-2 bg-amber-600/95 text-white font-semibold text-xs py-1.5 px-3 rounded-md shadow-lg border border-amber-400">
            <AlertTriangle className="w-4 h-4" />
            <span>Screen Capture Activity Suspected</span>
            <button
              onClick={() => {
                setShowCaptureWarning(false);
                tabSwitchCount.current = 0;
              }}
              className="ml-2 hover:bg-white/20 p-0.5 rounded transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <div
        className={`absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-4 z-30 transition-all duration-300 flex flex-col gap-2 ${
          showControls ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none'
        }`}
      >
        <div className="w-full flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={duration || 100}
            value={currentTime}
            onChange={handleSeekChange}
            className="video-seek-slider w-full"
          />
        </div>

        <div className="flex items-center justify-between w-full text-white mt-1">
          <div className="flex items-center gap-4">
            <button
              onClick={togglePlay}
              className="hover:text-violet-400 transition-colors cursor-pointer disabled:opacity-50"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current" />
              )}
            </button>

            <div className="flex items-center gap-2">
              <button
                onClick={toggleMute}
                className="hover:text-violet-400 transition-colors cursor-pointer"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                className="video-volume-slider w-16 md:w-20"
              />
            </div>

            <div className="text-xs md:text-sm font-mono tracking-wide text-gray-300 select-none">
              {formatTime(currentTime)} <span className="text-gray-500">/</span> {formatTime(duration)}
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className="hidden md:inline text-xs text-gray-400 truncate max-w-[200px] font-mono">
              {title || 'Secure Video'}
            </span>
            <button
              onClick={toggleFullscreen}
              className="hover:text-violet-400 transition-colors cursor-pointer"
              title="Fullscreen"
            >
              {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
