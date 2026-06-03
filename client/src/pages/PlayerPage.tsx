import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import {
  ArrowLeft, ShieldAlert, Sparkles, AlertCircle,
  Cpu, Eye, Lock, FileText, ChevronDown, ChevronUp,
} from 'lucide-react';
import VideoPlayer from '../components/VideoPlayer';
import ToggleSwitch from '../components/ToggleSwitch';
import { useDevTools } from '../hooks/useDevTools';
import { API_BASE } from '../config/api';
import axios from 'axios';
// axios kept for isAxiosError type guard; all requests go through apiClient
import { formatBytes, formatDate } from '../utils/format';
import type { Video } from '../types';

export default function PlayerPage() {
  const { filename = '' } = useParams<{ filename: string }>();

  const [video, setVideo] = useState<Video | null>(null);
  const [streamToken, setStreamToken] = useState<string | null>(null);
  const [tokenLoading, setTokenLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [focusLossDetectEnabled, setFocusLossDetectEnabled] = useState(true);
  const [rightClickProtectEnabled, setRightClickProtectEnabled] = useState(true);
  const [keyboardProtectEnabled, setKeyboardProtectEnabled] = useState(true);
  const [watermarkEnabled, setWatermarkEnabled] = useState(true);
  const [screenRecordWarningEnabled, setScreenRecordWarningEnabled] = useState(true);
  const [devToolsDetectEnabled, setDevToolsDetectEnabled] = useState(true);

  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const devToolsStatus = useDevTools();

  useEffect(() => {
    const fetchVideoDetails = async () => {
      try {
        setLoading(true);
        const response = await apiClient.get<Video>(`/videos/${filename}`);
        setVideo(response.data);
        setError(null);

        setTokenLoading(true);
        const tokenResponse = await apiClient.post<{ token: string }>(
          '/stream-token',
          { videoId: response.data.filename },
        );
        setStreamToken(tokenResponse.data.token);
        setTokenLoading(false);
      } catch (err) {
        console.error('Error fetching video details:', err);
        const is404 = axios.isAxiosError(err) && err.response?.status === 404;
        setError(
          is404
            ? 'The requested video metadata could not be found.'
            : 'Connection error: Failed to fetch video details.',
        );
        setTokenLoading(false);
      } finally {
        setLoading(false);
      }
    };
    fetchVideoDetails();
  }, [filename]);

  return (
    <div className="max-w-6xl mx-auto">
      {/* Back */}
      <div className="mb-6">
        <Link
          to="/"
          className="brutal-btn-ghost text-sm inline-flex items-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Library
        </Link>
      </div>

      {loading || tokenLoading ? (
        <div className="space-y-4">
          <div className="aspect-video w-full bg-[#111] border-2 border-white/10 animate-pulse" />
          <div className="h-6 bg-white/10 w-1/3 animate-pulse" />
        </div>
      ) : error ? (
        <div className="brutal-card-danger p-10 max-w-xl mx-auto text-center">
          <AlertCircle className="w-12 h-12 text-[#ef4444] mx-auto mb-4" />
          <p className="text-[#ef4444] font-black text-lg uppercase tracking-wide mb-2">Streaming Error</p>
          <p className="text-gray-400 text-sm font-mono mb-6">{error}</p>
          <Link to="/" className="brutal-btn">Return to Library</Link>
        </div>
      ) : video && streamToken ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Player column */}
          <div className="lg:col-span-2 space-y-4">
            <VideoPlayer
              src={`${API_BASE}/video/${video.filename}?token=${streamToken}`}
              title={video.title}
              watermarkLabel={video.title}
              focusLossDetectEnabled={focusLossDetectEnabled}
              rightClickProtectEnabled={rightClickProtectEnabled}
              keyboardProtectEnabled={keyboardProtectEnabled}
              watermarkEnabled={watermarkEnabled}
              screenRecordWarningEnabled={screenRecordWarningEnabled}
            />
            <div className="border-l-4 border-[#7c3aed] pl-4">
              <h1 className="text-xl font-black text-white uppercase tracking-wide mb-1">{video.title}</h1>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 font-mono">
                <span>File: <span className="text-gray-400 truncate max-w-[180px] inline-block align-bottom">{video.originalName}</span></span>
                <span>·</span>
                <span>Uploaded: <span className="text-gray-400">{formatDate(video.uploadDate, { year: 'numeric', month: 'long', day: 'numeric' })}</span></span>
                <span>·</span>
                <span>Size: <span className="text-gray-400">{formatBytes(video.size)}</span></span>
              </div>
            </div>
          </div>

          {/* Security Monitor */}
          <div>
            <div className="brutal-card p-5 flex flex-col gap-0">
              {/* Panel header */}
              <div className="flex items-center gap-2 pb-4 mb-4 border-b-2 border-white/10">
                <ShieldAlert className="w-5 h-5 text-[#7c3aed]" />
                <h3 className="font-black text-white text-sm font-mono uppercase tracking-widest">
                  Security Monitor
                </h3>
              </div>

              <p className="text-xs text-gray-500 font-mono leading-relaxed mb-5">
                Toggle client-side protection layers to demonstrate lockouts or adjust for DPI false positives.
              </p>

              {/* Toggle rows */}
              <div className="space-y-0">
                {/* DevTools */}
                <SecurityRow
                  icon={<Cpu className="w-4 h-4" />}
                  label="DevTools Detection"
                  badge={
                    devToolsDetectEnabled
                      ? devToolsStatus.isOpen
                        ? <span className="brutal-badge brutal-badge-red animate-pulse">LOCKOUT</span>
                        : <span className="brutal-badge brutal-badge-green">PASS</span>
                      : <span className="brutal-badge brutal-badge-gray">DISABLED</span>
                  }
                  checked={devToolsDetectEnabled}
                  onChange={setDevToolsDetectEnabled}
                />

                <SecurityRow
                  icon={<Lock className="w-4 h-4" />}
                  label="Right-Click Menu"
                  badge={
                    <span className={`brutal-badge ${rightClickProtectEnabled ? 'brutal-badge-violet' : 'brutal-badge-gray'}`}>
                      {rightClickProtectEnabled ? 'BLOCKED' : 'ALLOW'}
                    </span>
                  }
                  checked={rightClickProtectEnabled}
                  onChange={setRightClickProtectEnabled}
                />

                <SecurityRow
                  icon={<Lock className="w-4 h-4" />}
                  label="Shortcuts (F12, Inspect)"
                  badge={
                    <span className={`brutal-badge ${keyboardProtectEnabled ? 'brutal-badge-violet' : 'brutal-badge-gray'}`}>
                      {keyboardProtectEnabled ? 'BLOCKED' : 'ALLOW'}
                    </span>
                  }
                  checked={keyboardProtectEnabled}
                  onChange={setKeyboardProtectEnabled}
                />

                <SecurityRow
                  icon={<Eye className="w-4 h-4" />}
                  label="Focus Loss Pause"
                  badge={
                    <span className={`brutal-badge ${focusLossDetectEnabled ? 'brutal-badge-violet' : 'brutal-badge-gray'}`}>
                      {focusLossDetectEnabled ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  }
                  checked={focusLossDetectEnabled}
                  onChange={setFocusLossDetectEnabled}
                />

                <SecurityRow
                  icon={<Sparkles className="w-4 h-4" />}
                  label="Floating Watermark"
                  badge={
                    <span className={`brutal-badge ${watermarkEnabled ? 'brutal-badge-violet animate-pulse' : 'brutal-badge-gray'}`}>
                      {watermarkEnabled ? 'MOVING' : 'OFF'}
                    </span>
                  }
                  checked={watermarkEnabled}
                  onChange={setWatermarkEnabled}
                />

                <SecurityRow
                  icon={<AlertCircle className="w-4 h-4" />}
                  label="Capture Warning"
                  badge={
                    <span className={`brutal-badge ${screenRecordWarningEnabled ? 'brutal-badge-violet' : 'brutal-badge-gray'}`}>
                      {screenRecordWarningEnabled ? 'ACTIVE' : 'OFF'}
                    </span>
                  }
                  checked={screenRecordWarningEnabled}
                  onChange={setScreenRecordWarningEnabled}
                />

                {/* Static proxied row */}
                <div className="flex items-center justify-between py-2.5 border-t-2 border-white/5">
                  <div className="flex items-center gap-2 text-gray-500">
                    <FileText className="w-4 h-4" />
                    <span className="text-xs font-mono">File Direct Access</span>
                  </div>
                  <span className="brutal-badge brutal-badge-amber">PROXIED</span>
                </div>
              </div>

              {/* Diagnostics drawer */}
              <div className="mt-5 border-t-2 border-white/10 pt-4">
                <button
                  onClick={() => setShowDiagnostics(!showDiagnostics)}
                  className="w-full flex items-center justify-between text-[10px] text-gray-600 font-mono uppercase tracking-widest hover:text-gray-300 transition-colors"
                >
                  <span>DPI &amp; Dimension Diagnostics</span>
                  {showDiagnostics ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                </button>

                {showDiagnostics && (
                  <div className="mt-3 space-y-1 text-[9px] font-mono text-gray-600 bg-[#0a0a0a] border-2 border-white/10 p-3">
                    <DiagRow label="DPR:" value={String(devToolsStatus.devicePixelRatio)} />
                    <DiagRow label="Outer W×H:" value={`${devToolsStatus.outerWidth} × ${devToolsStatus.outerHeight} px`} />
                    <DiagRow label="Inner W×H:" value={`${devToolsStatus.innerWidth} × ${devToolsStatus.innerHeight} px`} />
                    <DiagRow
                      label="Width Diff:"
                      value={`${devToolsStatus.cssDiffW} px`}
                      highlight={devToolsStatus.cssDiffW > 200}
                    />
                    <DiagRow
                      label="Height Diff:"
                      value={`${devToolsStatus.cssDiffH} px`}
                      highlight={devToolsStatus.cssDiffH > 200}
                    />
                    <div className="border-t border-white/5 pt-1 mt-1">
                      <DiagRow label="Debugger Trap:" value={devToolsStatus.consoleHookTriggered ? 'YES' : 'NO'} highlight={devToolsStatus.consoleHookTriggered} />
                      <DiagRow label="Size Locked:" value={devToolsStatus.dimensionsTriggered ? 'YES' : 'NO'} highlight={devToolsStatus.dimensionsTriggered} />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

interface SecurityRowProps {
  icon: React.ReactNode;
  label: string;
  badge: React.ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
}

function SecurityRow({ icon, label, badge, checked, onChange }: SecurityRowProps) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b-2 border-white/5">
      <div className="flex items-center gap-2 text-gray-500">
        {icon}
        <span className="text-xs font-mono text-gray-300">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {badge}
        <ToggleSwitch checked={checked} onChange={onChange} />
      </div>
    </div>
  );
}

interface DiagRowProps {
  label: string;
  value: string;
  highlight?: boolean;
}

function DiagRow({ label, value, highlight = false }: DiagRowProps) {
  return (
    <div className="flex justify-between">
      <span>{label}</span>
      <span className={highlight ? 'text-[#ef4444] font-bold' : 'text-gray-400'}>{value}</span>
    </div>
  );
}
