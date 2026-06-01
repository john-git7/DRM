import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, 
  Pause, 
  Volume2, 
  VolumeX, 
  Maximize, 
  Minimize, 
  ShieldAlert, 
  AlertTriangle 
} from 'lucide-react';
import { useKeyboardProtection } from '../hooks/useKeyboardProtection';

export default function VideoPlayer({ 
  src, 
  title,
  devToolsDetectEnabled = true,
  focusLossDetectEnabled = true,
  rightClickProtectEnabled = true,
  keyboardProtectEnabled = true,
  watermarkEnabled = true,
  screenRecordWarningEnabled = true
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);

  // Video State
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);

  // Security States
  const [windowFocused, setWindowFocused] = useState(true);
  const [tabSwitchCount, setTabSwitchCount] = useState(0);
  const [showCaptureWarning, setShowCaptureWarning] = useState(false);
  
  // Watermark State
  const [watermarkPos, setWatermarkPos] = useState({ top: '15%', left: '15%' });
  const [watermarkTime, setWatermarkTime] = useState(new Date().toLocaleTimeString());

  // Keyboard protection hook (respects toggled status)
  useKeyboardProtection(() => {
    // Silently block without showing UI warning
  });

  // Watermark update loops
  useEffect(() => {
    const timeInterval = setInterval(() => {
      setWatermarkTime(new Date().toLocaleTimeString());
    }, 1000);

    const positionInterval = setInterval(() => {
      // Random coordinates between 10% and 75%
      const randomTop = Math.floor(Math.random() * 65) + 10;
      const randomLeft = Math.floor(Math.random() * 65) + 10;
      setWatermarkPos({ top: `${randomTop}%`, left: `${randomLeft}%` });
    }, 4000);

    return () => {
      clearInterval(timeInterval);
      clearInterval(positionInterval);
    };
  }, []);

  // Window Focus Detection
  useEffect(() => {
    const handleBlur = () => {
      if (!focusLossDetectEnabled) return;
      
      setWindowFocused(false);
      
      // Overwrite clipboard when capture tools take focus
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText('PROTECTED SECURE CONTENT - SCREENSHOT INTERCEPTED').catch(() => {});
        }
      } catch (err) {}
      
      // Suspect screen capture warning increment
      if (screenRecordWarningEnabled) {
        setTabSwitchCount(prev => {
          const next = prev + 1;
          if (next >= 3) {
            setShowCaptureWarning(true);
          }
          return next;
        });
      }

      // Pause playback immediately
      if (videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
        setIsPlaying(false);
      }
    };

    const handleFocus = () => {
      setWindowFocused(true);
    };

    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);

    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, [focusLossDetectEnabled, screenRecordWarningEnabled]);

  // Global Right-Click Protection
  useEffect(() => {
    const handleGlobalRightClick = (e) => {
      if (rightClickProtectEnabled) {
        e.preventDefault();
        // Silently block without showing warning toast
      }
    };

    document.addEventListener('contextmenu', handleGlobalRightClick, true);
    return () => {
      document.removeEventListener('contextmenu', handleGlobalRightClick, true);
    };
  }, [rightClickProtectEnabled]);

  // Controls Auto-Hide
  useEffect(() => {
    if (!isPlaying) {
      setShowControls(true);
      return;
    }
    const timer = setTimeout(() => {
      setShowControls(false);
    }, 3000);

    return () => clearTimeout(timer);
  }, [showControls, isPlaying]);

  const handleMouseMove = () => {
    setShowControls(true);
  };

  // Play/Pause Action Handler
  const togglePlay = () => {
    // Block action if Window focus lost
    if (!windowFocused && focusLossDetectEnabled) return;

    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
        setIsPlaying(false);
      } else {
        videoRef.current.play().catch(err => console.error("Playback interrupted:", err));
        setIsPlaying(true);
      }
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const handleSeekChange = (e) => {
    const time = parseFloat(e.target.value);
    if (videoRef.current) {
      videoRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const handleVolumeChange = (e) => {
    const vol = parseFloat(e.target.value);
    setVolume(vol);
    if (videoRef.current) {
      videoRef.current.volume = vol;
      videoRef.current.muted = vol === 0;
      setIsMuted(vol === 0);
    }
  };

  const toggleMute = () => {
    if (videoRef.current) {
      const nextMute = !isMuted;
      videoRef.current.muted = nextMute;
      setIsMuted(nextMute);
      if (nextMute) {
        videoRef.current.volume = 0;
      } else {
        videoRef.current.volume = volume;
      }
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;

    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch(err => {
        console.error("Fullscreen error:", err);
      });
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false);
      });
    }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  const formatTime = (secs) => {
    if (isNaN(secs)) return '00:00';
    const minutes = Math.floor(secs / 60);
    const seconds = Math.floor(secs % 60);
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div 
      ref={containerRef}
      onMouseMove={handleMouseMove}
      className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-black group select-none"
    >
      {/* HTML5 Video element */}
      <video
        ref={videoRef}
        src={src}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        className={`w-full h-full object-contain transition-all duration-300 ${
          (!windowFocused && focusLossDetectEnabled) ? 'blur-xl select-none pointer-events-none' : ''
        }`}
        playsInline
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Invisible Click Shield to completely block native video right-clicks */}
      <div 
        className="absolute inset-0 z-0 cursor-pointer" 
        onClick={togglePlay}
        onContextMenu={(e) => e.preventDefault()}
      />

      {/* Dynamic Watermark */}
      {watermarkEnabled && (
        <div 
          style={{ 
            top: watermarkPos.top, 
            left: watermarkPos.left,
            transition: 'all 1s ease-in-out'
          }}
          className="absolute pointer-events-none text-white/20 text-xs md:text-sm font-semibold select-none font-mono py-1 px-2 border border-white/5 bg-black/10 rounded backdrop-blur-[1px] tracking-wider z-20 whitespace-nowrap animate-watermark"
        >
          Demo User | {new Date().toLocaleDateString()} | {watermarkTime}
        </div>
      )}

      {/* Play/Pause Large Center Icon Overlay */}
      {!isPlaying && (windowFocused || !focusLossDetectEnabled) && (
        <div 
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer z-10 hover:bg-black/40 transition-colors"
        >
          <div className="p-5 rounded-full bg-violet-600/90 text-white shadow-lg shadow-violet-600/30 scale-100 hover:scale-110 active:scale-95 transition-all duration-200">
            <Play fill="currentColor" className="w-8 h-8 translate-x-0.5" />
          </div>
        </div>
      )}

      {/* FOCUS LOSS OVERLAY */}
      {!windowFocused && focusLossDetectEnabled && (
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

      {/* SCREEN CAPTURE WARNING */}
      {showCaptureWarning && screenRecordWarningEnabled && (
        <div className="absolute bottom-16 right-4 z-40 animate-pulse">
          <div className="flex items-center gap-2 bg-amber-600/95 text-white font-semibold text-xs py-1.5 px-3 rounded-md shadow-lg border border-amber-400">
            <AlertTriangle className="w-4 h-4" />
            <span>Screen Capture Activity Suspected</span>
            <button 
              onClick={() => {
                setShowCaptureWarning(false);
                setTabSwitchCount(0);
              }}
              className="ml-2 hover:bg-white/20 p-0.5 rounded transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* VIDEO CONTROLS TIMELINE/BUTTONS BAR */}
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
              title={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 fill-current" />
              ) : (
                <Play className="w-5 h-5 fill-current" />
              )}
            </button>

            <div className="flex items-center gap-2 group/volume">
              <button 
                onClick={toggleMute}
                className="hover:text-violet-400 transition-colors cursor-pointer"
                title={isMuted ? "Unmute" : "Mute"}
              >
                {isMuted ? (
                  <VolumeX className="w-5 h-5" />
                ) : (
                  <Volume2 className="w-5 h-5" />
                )}
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
              {title || "Secure Video"}
            </span>

            <button
              onClick={toggleFullscreen}
              className="hover:text-violet-400 transition-colors cursor-pointer"
              title="Fullscreen"
            >
              {isFullscreen ? (
                <Minimize className="w-5 h-5" />
              ) : (
                <Maximize className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
