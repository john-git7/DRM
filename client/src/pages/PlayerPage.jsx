import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, ShieldAlert, Sparkles, AlertCircle, Cpu, Eye, Lock, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import VideoPlayer from '../components/VideoPlayer';
import { useDevTools } from '../hooks/useDevTools';

export default function PlayerPage() {
  const { filename } = useParams();
  const [video, setVideo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Security Toggles
  const [devToolsDetectEnabled, setDevToolsDetectEnabled] = useState(true);
  const [focusLossDetectEnabled, setFocusLossDetectEnabled] = useState(true);
  const [rightClickProtectEnabled, setRightClickProtectEnabled] = useState(true);
  const [keyboardProtectEnabled, setKeyboardProtectEnabled] = useState(true);
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [screenRecordWarningEnabled, setScreenRecordWarningEnabled] = useState(true);

  // Diagnostic Drawer State
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  // Parent Hook for Dashboard rendering
  const devToolsStatus = useDevTools();

  const API_BASE = 'http://localhost:5000/api';

  useEffect(() => {
    const fetchVideoDetails = async () => {
      try {
        setLoading(true);
        const response = await axios.get(`${API_BASE}/videos`);
        const foundVideo = response.data.find(v => v.filename === filename);
        
        if (foundVideo) {
          setVideo(foundVideo);
          setError(null);
        } else {
          setError('The requested video metadata could not be found.');
        }
      } catch (err) {
        console.error('Error fetching video details:', err);
        setError('Connection error: Failed to fetch video details.');
      } finally {
        setLoading(false);
      }
    };

    fetchVideoDetails();
  }, [filename]);

  const formatBytes = (bytes) => {
    if (!bytes) return '0 Bytes';
    const k = 1024;
    const dm = 2;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  // Toggle Switch UI helper
  const ToggleSwitch = ({ checked, onChange }) => (
    <label className="relative inline-flex items-center cursor-pointer">
      <input 
        type="checkbox" 
        checked={checked} 
        onChange={(e) => onChange(e.target.checked)} 
        className="sr-only peer" 
      />
      <div className="w-8 h-4 bg-gray-800 rounded-full peer peer-checked:after:translate-x-4 peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-violet-600 peer-checked:after:bg-white"></div>
    </label>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-8 flex-grow">
      {/* Back button */}
      <div className="mb-6">
        <Link
          to="/"
          className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition-colors text-sm font-semibold group"
        >
          <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
          Back to Video Library
        </Link>
      </div>

      {loading ? (
        <div className="space-y-6">
          <div className="aspect-video w-full bg-white/5 rounded-xl animate-pulse" />
          <div className="h-6 bg-white/10 rounded w-1/3 animate-pulse" />
        </div>
      ) : error ? (
        <div className="text-center py-16 bg-red-950/20 border border-red-500/20 rounded-2xl max-w-xl mx-auto p-8">
          <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
          <p className="text-red-400 font-semibold text-lg mb-2">Streaming Error</p>
          <p className="text-gray-400 text-sm mb-6">{error}</p>
          <Link
            to="/"
            className="bg-violet-600 hover:bg-violet-500 text-white font-semibold py-2 px-5 rounded-xl transition-all"
          >
            Return to Library
          </Link>
        </div>
      ) : (
        <div className="space-y-8">
          {/* Main Video View */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Player block */}
            <div className="lg:col-span-2 space-y-4">
              <VideoPlayer 
                src={`${API_BASE}/video/${video.filename}`}
                title={video.title} 
                devToolsDetectEnabled={devToolsDetectEnabled}
                focusLossDetectEnabled={focusLossDetectEnabled}
                rightClickProtectEnabled={rightClickProtectEnabled}
                keyboardProtectEnabled={keyboardProtectEnabled}
                watermarkEnabled={watermarkEnabled}
                screenRecordWarningEnabled={screenRecordWarningEnabled}
              />
              <div>
                <h1 className="text-2xl font-bold text-white mb-1">{video.title}</h1>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 font-mono">
                  <span className="text-gray-500">File:</span>
                  <span className="truncate max-w-[220px]" title={video.originalName}>{video.originalName}</span>
                  <span className="text-gray-700">|</span>
                  <span className="text-gray-500">Uploaded:</span>
                  <span>{formatDate(video.uploadDate)}</span>
                  <span className="text-gray-700">|</span>
                  <span className="text-gray-500">Size:</span>
                  <span>{formatBytes(video.size)}</span>
                </div>
              </div>
            </div>

            {/* Security Demonstration Panel */}
            <div className="space-y-6">
              <div className="glass-panel border border-white/10 rounded-2xl p-5 md:p-6 shadow-xl relative overflow-hidden flex flex-col h-full justify-between">
                <div className="absolute -top-16 -right-16 w-32 h-32 bg-violet-600/5 rounded-full blur-2xl pointer-events-none" />
                
                <div>
                  <div className="flex items-center gap-2 pb-4 mb-4 border-b border-white/5">
                    <ShieldAlert className="w-5 h-5 text-violet-400" />
                    <h3 className="font-bold text-white text-base font-mono uppercase tracking-wider">
                      Security Monitor
                    </h3>
                  </div>

                  <p className="text-xs text-gray-400 leading-relaxed mb-6">
                    This panel controls active client-side visual security features. Toggle specific items to demonstrate lockouts or adjust for DPI false positives.
                  </p>

                  {/* Intercept Metrics & Toggles */}
                  <div className="space-y-3.5">
                    {/* DevTools */}
                    <div className="flex items-center justify-between text-xs border-b border-white/5 pb-2.5">
                      <div className="flex items-center gap-2">
                        <Cpu className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-300 font-medium">DevTools Detection</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {devToolsDetectEnabled ? (
                          devToolsStatus.isOpen ? (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-red-950 text-red-400 border border-red-500/20 font-mono animate-pulse">
                              LOCKOUT
                            </span>
                          ) : (
                            <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-emerald-950 text-emerald-400 border border-emerald-500/15 font-mono">
                              PASS
                            </span>
                          )
                        ) : (
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-gray-950 text-gray-400 border border-white/5 font-mono">
                            DISABLED
                          </span>
                        )}
                        <ToggleSwitch checked={devToolsDetectEnabled} onChange={setDevToolsDetectEnabled} />
                      </div>
                    </div>

                    {/* Right Click */}
                    <div className="flex items-center justify-between text-xs border-b border-white/5 pb-2.5">
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-300 font-medium">Right-Click Context Menu</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase font-mono ${rightClickProtectEnabled ? 'bg-violet-950 text-violet-400 border border-violet-500/15' : 'bg-gray-950 text-gray-400 border border-white/5'}`}>
                          {rightClickProtectEnabled ? 'BLOCKED' : 'ALLOW'}
                        </span>
                        <ToggleSwitch checked={rightClickProtectEnabled} onChange={setRightClickProtectEnabled} />
                      </div>
                    </div>

                    {/* Keyboard Shortcuts */}
                    <div className="flex items-center justify-between text-xs border-b border-white/5 pb-2.5">
                      <div className="flex items-center gap-2">
                        <Lock className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-300 font-medium">Shortcuts (F12, Inspect)</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase font-mono ${keyboardProtectEnabled ? 'bg-violet-950 text-violet-400 border border-violet-500/15' : 'bg-gray-950 text-gray-400 border border-white/5'}`}>
                          {keyboardProtectEnabled ? 'BLOCKED' : 'ALLOW'}
                        </span>
                        <ToggleSwitch checked={keyboardProtectEnabled} onChange={setKeyboardProtectEnabled} />
                      </div>
                    </div>

                    {/* Focus Loss */}
                    <div className="flex items-center justify-between text-xs border-b border-white/5 pb-2.5">
                      <div className="flex items-center gap-2">
                        <Eye className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-300 font-medium">Focus Loss Pause</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase font-mono ${focusLossDetectEnabled ? 'bg-violet-950 text-violet-400 border border-violet-500/15' : 'bg-gray-950 text-gray-400 border border-white/5'}`}>
                          {focusLossDetectEnabled ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                        <ToggleSwitch checked={focusLossDetectEnabled} onChange={setFocusLossDetectEnabled} />
                      </div>
                    </div>

                    {/* Watermark */}
                    <div className="flex items-center justify-between text-xs border-b border-white/5 pb-2.5">
                      <div className="flex items-center gap-2">
                        <Sparkles className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-300 font-medium">Floating Watermark</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase font-mono ${watermarkEnabled ? 'bg-violet-950 text-violet-400 border border-violet-500/15 animate-pulse' : 'bg-gray-950 text-gray-400 border border-white/5'}`}>
                          {watermarkEnabled ? 'MOVING' : 'OFF'}
                        </span>
                        <ToggleSwitch checked={watermarkEnabled} onChange={setWatermarkEnabled} />
                      </div>
                    </div>

                    {/* Screen Record warnings */}
                    <div className="flex items-center justify-between text-xs border-b border-white/5 pb-2.5">
                      <div className="flex items-center gap-2">
                        <AlertCircle className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-300 font-medium">Screen Capture Warning</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase font-mono ${screenRecordWarningEnabled ? 'bg-violet-950 text-violet-400 border border-violet-500/15' : 'bg-gray-950 text-gray-400 border border-white/5'}`}>
                          {screenRecordWarningEnabled ? 'ACTIVE' : 'OFF'}
                        </span>
                        <ToggleSwitch checked={screenRecordWarningEnabled} onChange={setScreenRecordWarningEnabled} />
                      </div>
                    </div>

                    {/* Stream Hiding */}
                    <div className="flex items-center justify-between text-xs pb-1">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-gray-500" />
                        <span className="text-gray-300 font-medium">File Direct Access</span>
                      </div>
                      <span className="px-1.5 py-0.5 rounded text-[8px] font-bold uppercase bg-amber-950 text-amber-400 border border-amber-500/20 font-mono">
                        PROXIED
                      </span>
                    </div>
                  </div>
                </div>

                {/* Live Screen Size Diagnostics (Collapsible Drawer) */}
                <div className="mt-6 border-t border-white/5 pt-4">
                  <button
                    onClick={() => setShowDiagnostics(!showDiagnostics)}
                    className="w-full flex items-center justify-between text-[10px] text-gray-400 font-mono hover:text-white transition-colors"
                  >
                    <span>DPI & DIMENSION DIAGNOSTICS</span>
                    {showDiagnostics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                  </button>

                  {showDiagnostics && (
                    <div className="mt-3 space-y-1.5 text-[9px] font-mono text-gray-500 bg-black/40 rounded-lg p-3 border border-white/5 animate-fadeIn">
                      <div className="flex justify-between">
                        <span>Device Pixel Ratio (DPR):</span>
                        <span className="text-gray-300">{devToolsStatus.devicePixelRatio}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Outer Window W x H:</span>
                        <span className="text-gray-300">{devToolsStatus.outerWidth} x {devToolsStatus.outerHeight} px</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Inner Viewport W x H:</span>
                        <span className="text-gray-300">{devToolsStatus.innerWidth} x {devToolsStatus.innerHeight} px</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Corrected Width Diff:</span>
                        <span className={`font-semibold ${devToolsStatus.cssDiffW > 200 ? 'text-red-400' : 'text-emerald-400'}`}>
                          {devToolsStatus.cssDiffW} px
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Corrected Height Diff:</span>
                        <span className={`font-semibold ${devToolsStatus.cssDiffH > 200 ? 'text-red-400' : 'text-emerald-400'}`}>
                          {devToolsStatus.cssDiffH} px
                        </span>
                      </div>
                      <div className="flex justify-between border-t border-white/5 pt-1.5 mt-1.5">
                        <span>Console Hook Fired:</span>
                        <span className={devToolsStatus.consoleHookTriggered ? 'text-red-400' : 'text-gray-400'}>
                          {devToolsStatus.consoleHookTriggered ? 'YES' : 'NO'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Size Check Locked:</span>
                        <span className={devToolsStatus.dimensionsTriggered ? 'text-red-400' : 'text-gray-400'}>
                          {devToolsStatus.dimensionsTriggered ? 'YES' : 'NO'}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
