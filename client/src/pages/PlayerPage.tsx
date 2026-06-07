import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import apiClient from '../utils/apiClient';
import {
  ArrowLeft, ShieldAlert, AlertCircle, Loader2, MonitorCheck, MonitorX, Download,
  Cpu, Eye, Lock, FileText, ChevronDown, ChevronUp,
} from 'lucide-react';
import VideoPlayer from '../components/VideoPlayer';
import ToggleSwitch from '../components/ToggleSwitch';
import { useDevTools } from '../hooks/useDevTools';
import { useAuthContext } from '../context/AuthContext';
import { API_BASE } from '../config/api';
import axios from 'axios';
import { getDeviceFingerprint } from '../utils/deviceFingerprint';
import { checkAgent } from '../utils/agentCheck';
import { sendAudit } from '../utils/audit';
import { onCaptureEvent } from '../utils/mobileProtection';
import { formatBytes, formatDate } from '../utils/format';
import type { Video, AgentStatus, AgentThreat } from '../types';

export default function PlayerPage() {
  const { filename = '' } = useParams<{ filename: string }>();
  const { username } = useAuthContext();

  const [video, setVideo] = useState<Video | null>(null);
  const [keyGrant, setKeyGrant] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentStatus>({ state: 'checking', threats: [] });
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screenCaptureActive, setScreenCaptureActive] = useState(false);

  const [focusLossDetectEnabled, setFocusLossDetectEnabled] = useState(true);
  const [rightClickProtectEnabled, setRightClickProtectEnabled] = useState(true);
  const [keyboardProtectEnabled, setKeyboardProtectEnabled] = useState(true);
  const [forensicWatermarkEnabled, setForensicWatermarkEnabled] = useState(true);
  const [devToolsDetectEnabled, setDevToolsDetectEnabled] = useState(true);

  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const devToolsStatus = useDevTools();
  const devToolsOpen = devToolsDetectEnabled && devToolsStatus.isOpen;
  const deviceIdRef = useRef<string | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const auditedDevTools = useRef(false);

  /** Run the agent pre-check, then (if clean) acquire a 30s key grant. */
  const preparePlayback = useCallback(async (current: Video) => {
    setPreparing(true);
    setKeyGrant(null);
    try {
      const fingerprint = deviceIdRef.current ?? (deviceIdRef.current = await getDeviceFingerprint());
      setDeviceId(fingerprint);
      const deviceId = fingerprint;

      const agentStatus = await checkAgent();
      setAgent(agentStatus);
      const threatLabels = agentStatus.threats.map((t: AgentThreat) => `${t.category}: ${t.name}`);
      sendAudit({
        event: 'agent-check',
        videoId: current.filename,
        deviceId,
        agentStatus: agentStatus.state,
        recorders: threatLabels,
      });

      if (agentStatus.state !== 'clean') {
        sendAudit({ event: 'playback-blocked', videoId: current.filename, deviceId, agentStatus: agentStatus.state, recorders: threatLabels });
        return;
      }

      const grantRes = await apiClient.post<{ grant: string; ttl: number }>(
        `/hls/${current.filename}/key-grant`,
        { deviceId, agentStatus: agentStatus.state },
      );
      setKeyGrant(grantRes.data.grant);
      sendAudit({ event: 'playback-start', videoId: current.filename, deviceId, agentStatus: agentStatus.state });
    } catch (err) {
      console.error('Playback preparation failed:', err);
      const status = axios.isAxiosError(err) ? err.response?.status : undefined;
      setError(
        status === 403 ? 'You are not enrolled in this content.'
          : status === 409 ? 'This video is still being encrypted. Try again shortly.'
          : 'Failed to authorize secure playback.',
      );
    } finally {
      setPreparing(false);
    }
  }, []);

  // Load metadata, then prepare playback.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await apiClient.get<Video>(`/videos/${filename}`);
        if (cancelled) return;
        const v = response.data;
        setVideo(v);

        if (v.hlsStatus === 'ready') {
          await preparePlayback(v);
        } else if (v.hlsStatus !== 'processing') {
          // No encrypted stream yet (legacy upload) or a prior failure — (re)start it,
          // then let the poll effect below carry it to 'ready'.
          try {
            await apiClient.post(`/videos/${filename}/transcode`);
            if (!cancelled) setVideo({ ...v, hlsStatus: 'processing' });
          } catch (e) {
            if (cancelled) return;
            const code = axios.isAxiosError(e) ? e.response?.status : undefined;
            setError(code === 409
              ? 'This video has no encrypted stream and its source file is unavailable — please re-upload it.'
              : 'Could not start encryption for this video.');
          }
        }
        // 'processing' is handled by the poll effect.
      } catch (err) {
        if (cancelled) return;
        const is404 = axios.isAxiosError(err) && err.response?.status === 404;
        setError(is404 ? 'The requested video could not be found.' : 'Connection error: failed to fetch video details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [filename, preparePlayback]);

  // Poll while encrypting — refresh each tick so the progress bar advances.
  useEffect(() => {
    if (video?.hlsStatus !== 'processing') return;
    const poll = setInterval(async () => {
      try {
        const res = await apiClient.get<Video>(`/videos/${filename}`);
        setVideo(res.data);
        if (res.data.hlsStatus === 'ready') preparePlayback(res.data);
      } catch { /* keep polling */ }
    }, 2000);
    return () => clearInterval(poll);
  }, [filename, video?.hlsStatus, preparePlayback]);

  // Re-check the agent mid-session so a recorder launched after playback starts
  // triggers a near-instant blackout (the recorder then captures only black).
  // Uses randomised recursive setTimeout (1500–4000ms) instead of a fixed interval
  // to avoid predictable polling gaps. Three event-driven instant re-polls fire on
  // tab-visible, window-focus, and video-play — each cancels the pending timer first.
  useEffect(() => {
    if (agent.state !== 'clean') return;

    let timerId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      const status = await checkAgent();
      if (status.state !== 'clean') {
        setAgent(status);
        sendAudit({ event: 'playback-blocked', videoId: filename, deviceId: deviceIdRef.current ?? undefined, agentStatus: status.state, recorders: status.threats.map((t: AgentThreat) => `${t.category}: ${t.name}`) });
        return; // agent.state changes → effect re-runs, loop stops naturally
      }
      timerId = setTimeout(poll, 1500 + Math.random() * 2500);
    };

    const fireNow = () => {
      if (timerId !== null) { clearTimeout(timerId); timerId = null; }
      void poll();
    };

    const onVisibility = () => { if (!document.hidden) fireNow(); };

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', fireNow);
    document.addEventListener('play', fireNow, true); // capture phase — play doesn't bubble

    timerId = setTimeout(poll, 1500 + Math.random() * 2500);

    return () => {
      if (timerId !== null) clearTimeout(timerId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', fireNow);
      document.removeEventListener('play', fireNow, true);
    };
  }, [agent.state, filename]);

  // Audit a DevTools lockout once.
  useEffect(() => {
    if (devToolsOpen && !auditedDevTools.current) {
      auditedDevTools.current = true;
      sendAudit({ event: 'devtools-lockout', videoId: filename, deviceId: deviceIdRef.current ?? undefined });
    }
  }, [devToolsOpen, filename]);

  // Native (Capacitor) builds: FLAG_SECURE / iOS overlay already black out
  // recordings at the OS level — here we also react in-app, blacking out the
  // player and logging a forensic/audit event, like the desktop recorder agent.
  // No-op on the web build.
  useEffect(() => {
    let unsubscribe = () => {};
    onCaptureEvent((event) => {
      const deviceId = deviceIdRef.current ?? undefined;
      if (event === 'screenRecordingStarted') {
        setScreenCaptureActive(true);
        sendAudit({ event: 'screen-capture-detected', videoId: filename, deviceId });
      } else if (event === 'screenRecordingStopped') {
        setScreenCaptureActive(false);
      } else if (event === 'screenshotTaken') {
        sendAudit({ event: 'screenshot-detected', videoId: filename, deviceId });
      }
    }).then((u) => { unsubscribe = u; });
    return () => unsubscribe();
  }, [filename]);

  const retry = () => { if (video) preparePlayback(video); };
  const reprocess = async () => {
    try {
      await apiClient.post(`/videos/${filename}/transcode`);
      setVideo((prev) => (prev ? { ...prev, hlsStatus: 'processing' } : prev));
      setError(null);
    } catch (e) {
      const code = axios.isAxiosError(e) ? e.response?.status : undefined;
      setError(code === 409 ? 'Source video unavailable — please re-upload it.' : 'Could not start encryption.');
    }
  };
  const playbackReady = video?.hlsStatus === 'ready' && agent.state === 'clean' && !!keyGrant;

  return (
    <div className="max-w-6xl mx-auto">
      {/* Full-screen blackout the instant a recorder/capture threat is detected:
          a screen recording of the page now captures only black + the viewer's identity. */}
      {(agent.state === 'threat' || screenCaptureActive) && (
        <CaptureBlackout identity={username ?? 'Authenticated User'} threats={agent.threats} onRetry={retry} />
      )}

      <div className="mb-6">
        <Link to="/" className="brutal-btn-ghost text-sm inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Library
        </Link>
      </div>

      {loading || preparing ? (
        <div className="space-y-4">
          <div className="aspect-video w-full bg-[#111] border-2 border-white/10 animate-pulse flex items-center justify-center">
            <div className="flex items-center gap-3 text-gray-500 font-mono text-xs uppercase tracking-widest">
              <Loader2 className="w-5 h-5 animate-spin" />
              {preparing ? 'Authorizing secure playback…' : 'Loading…'}
            </div>
          </div>
          <div className="h-6 bg-white/10 w-1/3 animate-pulse" />
        </div>
      ) : error ? (
        <div className="brutal-card-danger p-10 max-w-xl mx-auto text-center">
          <AlertCircle className="w-12 h-12 text-[#ef4444] mx-auto mb-4" />
          <p className="text-[#ef4444] font-black text-lg uppercase tracking-wide mb-2">Playback Error</p>
          <p className="text-gray-400 text-sm font-mono mb-6">{error}</p>
          <div className="flex gap-3 justify-center">
            {video?.hlsStatus === 'ready' && <button onClick={retry} className="brutal-btn">Retry</button>}
            <Link to="/" className="brutal-btn-ghost">Return to Library</Link>
          </div>
        </div>
      ) : video && video.hlsStatus !== 'ready' ? (
        <VideoStatusCard status={video.hlsStatus} progress={video.hlsProgress} onRetry={reprocess} />
      ) : video ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {playbackReady ? (
              <VideoPlayer
                key={keyGrant}
                hlsUrl={`${API_BASE}${video.hlsPlaylist}`}
                keyGrant={keyGrant!}
                deviceId={deviceId}
                title={video.title}
                devToolsOpen={devToolsOpen}
                onWatchTimeTick={(sec) => sendAudit({ event: 'watch-heartbeat', videoId: video.filename, deviceId: deviceIdRef.current ?? undefined, watchTimeSec: sec })}
                focusLossDetectEnabled={focusLossDetectEnabled}
                rightClickProtectEnabled={rightClickProtectEnabled}
                keyboardProtectEnabled={keyboardProtectEnabled}
                forensicWatermarkEnabled={forensicWatermarkEnabled}
              />
            ) : (
              <AgentBlock agent={agent} onRetry={retry} />
            )}
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
              <div className="flex items-center gap-2 pb-4 mb-4 border-b-2 border-white/10">
                <ShieldAlert className="w-5 h-5 text-[#7c3aed]" />
                <h3 className="font-black text-white text-sm font-mono uppercase tracking-widest">Security Monitor</h3>
              </div>

              <p className="text-xs text-gray-500 font-mono leading-relaxed mb-5">
                Toggle client-side protection layers to demonstrate lockouts or adjust for DPI false positives.
              </p>

              <div className="space-y-0">
                {/* Recorder agent status (read-only) */}
                <div className="flex items-center justify-between py-2.5 border-b-2 border-white/5">
                  <div className="flex items-center gap-2 text-gray-500">
                    <MonitorCheck className="w-4 h-4" />
                    <span className="text-xs font-mono text-gray-300">Recorder Agent</span>
                  </div>
                  <AgentBadge agent={agent} />
                </div>

                <SecurityRow
                  icon={<Cpu className="w-4 h-4" />}
                  label="DevTools Detection"
                  badge={devToolsDetectEnabled
                    ? devToolsStatus.isOpen
                      ? <span className="brutal-badge brutal-badge-red animate-pulse">LOCKOUT</span>
                      : <span className="brutal-badge brutal-badge-green">PASS</span>
                    : <span className="brutal-badge brutal-badge-gray">DISABLED</span>}
                  checked={devToolsDetectEnabled}
                  onChange={setDevToolsDetectEnabled}
                />
                <SecurityRow
                  icon={<Lock className="w-4 h-4" />}
                  label="Right-Click Menu"
                  badge={<span className={`brutal-badge ${rightClickProtectEnabled ? 'brutal-badge-violet' : 'brutal-badge-gray'}`}>{rightClickProtectEnabled ? 'BLOCKED' : 'ALLOW'}</span>}
                  checked={rightClickProtectEnabled}
                  onChange={setRightClickProtectEnabled}
                />
                <SecurityRow
                  icon={<Lock className="w-4 h-4" />}
                  label="Shortcuts (F12, Inspect)"
                  badge={<span className={`brutal-badge ${keyboardProtectEnabled ? 'brutal-badge-violet' : 'brutal-badge-gray'}`}>{keyboardProtectEnabled ? 'BLOCKED' : 'ALLOW'}</span>}
                  checked={keyboardProtectEnabled}
                  onChange={setKeyboardProtectEnabled}
                />
                <SecurityRow
                  icon={<Eye className="w-4 h-4" />}
                  label="Focus Loss Pause"
                  badge={<span className={`brutal-badge ${focusLossDetectEnabled ? 'brutal-badge-violet' : 'brutal-badge-gray'}`}>{focusLossDetectEnabled ? 'ACTIVE' : 'INACTIVE'}</span>}
                  checked={focusLossDetectEnabled}
                  onChange={setFocusLossDetectEnabled}
                />
                <SecurityRow
                  icon={<FileText className="w-4 h-4" />}
                  label="Forensic Mark"
                  badge={<span className={`brutal-badge ${forensicWatermarkEnabled ? 'brutal-badge-violet' : 'brutal-badge-gray'}`}>{forensicWatermarkEnabled ? 'EMBEDDED' : 'OFF'}</span>}
                  checked={forensicWatermarkEnabled}
                  onChange={setForensicWatermarkEnabled}
                />
                <div className="flex items-center justify-between py-2.5 border-t-2 border-white/5">
                  <div className="flex items-center gap-2 text-gray-500">
                    <Lock className="w-4 h-4" />
                    <span className="text-xs font-mono">Stream Encryption</span>
                  </div>
                  <span className="brutal-badge brutal-badge-green">AES-128</span>
                </div>
              </div>

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
                    <DiagRow label="Width Diff:" value={`${devToolsStatus.cssDiffW} px`} highlight={devToolsStatus.cssDiffW > 200} />
                    <DiagRow label="Height Diff:" value={`${devToolsStatus.cssDiffH} px`} highlight={devToolsStatus.cssDiffH > 200} />
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

function VideoStatusCard({ status, progress, onRetry }: { status?: string; progress?: number; onRetry: () => void }) {
  const failed = status === 'failed';
  const pct = Math.max(0, Math.min(100, Math.round(progress ?? 0)));
  return (
    <div className="brutal-card p-10 max-w-xl mx-auto text-center">
      {failed ? <AlertCircle className="w-12 h-12 text-[#ef4444] mx-auto mb-4" /> : <Loader2 className="w-12 h-12 text-[#7c3aed] mx-auto mb-4 animate-spin" />}
      <p className="font-black text-lg uppercase tracking-wide mb-2 text-white">
        {failed ? 'Encryption Failed' : 'Encrypting Video'}
      </p>
      <p className="text-gray-400 text-sm font-mono mb-6">
        {failed
          ? 'This video could not be transcoded into a secure stream. You can try again.'
          : 'Splitting into AES-128 encrypted segments. This page continues automatically when done.'}
      </p>
      {!failed && (
        <div className="max-w-sm mx-auto mb-6">
          <div className="h-3 w-full bg-[#0a0a0a] border-2 border-white/20 overflow-hidden">
            <div
              className="h-full bg-[#7c3aed] transition-[width] duration-500 ease-out"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="mt-2 text-xs font-mono text-gray-500 tracking-widest">{pct}% ENCRYPTED</p>
        </div>
      )}
      <div className="flex gap-3 justify-center">
        {failed && <button onClick={onRetry} className="brutal-btn">Retry Encryption</button>}
        <Link to="/" className="brutal-btn-ghost">Return to Library</Link>
      </div>
    </div>
  );
}

function CaptureBlackout({ identity, threats, onRetry }: { identity: string; threats: AgentThreat[]; onRetry: () => void }) {
  const [pos, setPos] = useState({ top: '38%', left: '30%' });
  const [stamp, setStamp] = useState(() => new Date().toLocaleString());
  useEffect(() => {
    const move = setInterval(() => setPos({ top: `${Math.floor(Math.random() * 70) + 10}%`, left: `${Math.floor(Math.random() * 60) + 10}%` }), 1500);
    const clock = setInterval(() => setStamp(new Date().toLocaleString()), 1000);
    return () => { clearInterval(move); clearInterval(clock); };
  }, []);
  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center text-center px-6 select-none">
      <div style={{ top: pos.top, left: pos.left, transition: 'all 1s ease-in-out' }} className="absolute text-white/30 text-xs font-mono pointer-events-none whitespace-nowrap uppercase tracking-wider">
        {identity} · {stamp}
      </div>
      <MonitorX className="w-16 h-16 text-[#ef4444] mb-5" />
      <h1 className="text-2xl font-black text-white uppercase tracking-widest mb-2">Screen Capture Blocked</h1>
      <p className="text-gray-400 text-sm font-mono max-w-md mb-5">
        A capture tool or recorder was detected. Playback is blacked out, and this session is logged to <span className="text-gray-200">{identity}</span>.
      </p>
      {threats.length > 0 && (
        <ul className="mb-6 text-xs font-mono text-left max-w-md w-full space-y-1">
          {threats.slice(0, 8).map((t, i) => (
            <li key={i} className="flex items-center gap-2 border border-[#ef4444]/40 px-2 py-1">
              <span className="text-[#ef4444] font-bold uppercase text-[10px] tracking-wider whitespace-nowrap">{t.category}</span>
              <span className="text-gray-300 truncate">{t.name}</span>
            </li>
          ))}
        </ul>
      )}
      <button onClick={onRetry} className="brutal-btn">Close it &amp; Resume</button>
    </div>
  );
}

function AgentBlock({ agent, onRetry }: { agent: AgentStatus; onRetry: () => void }) {
  const notInstalled = agent.state === 'not-installed';
  const threat = agent.state === 'threat';
  return (
    <div className="aspect-video w-full bg-black border-2 border-[#ef4444] flex flex-col items-center justify-center text-center px-6 overflow-y-auto" style={{ boxShadow: '6px 6px 0px #ef4444' }}>
      {notInstalled ? <Download className="w-12 h-12 text-[#f59e0b] mb-4" /> : <MonitorX className="w-12 h-12 text-[#ef4444] mb-4" />}
      <p className="font-black text-lg uppercase tracking-wide mb-2 text-white">
        {notInstalled ? 'Security Agent Required' : threat ? 'Capture Threat Detected' : 'Agent Check Failed'}
      </p>
      <p className="text-gray-400 text-sm font-mono mb-4 max-w-md">
        {notInstalled
          ? 'The ARQX Atlas agent must be running on this machine to watch protected content. Start the localhost agent, then retry.'
          : threat
            ? 'Playback is blocked while a capture tool, downloader, or capture device is active. Close or remove it, then retry.'
            : 'The security agent returned an unexpected response. Retry to check again.'}
      </p>
      {threat && agent.threats.length > 0 && (
        <ul className="mb-5 text-xs font-mono text-left max-w-md w-full space-y-1">
          {agent.threats.slice(0, 8).map((t, i) => (
            <li key={i} className="flex items-center gap-2 bg-[#ef4444]/10 border border-[#ef4444]/40 px-2 py-1">
              <span className="text-[#ef4444] font-bold uppercase text-[10px] tracking-wider whitespace-nowrap">{t.category}</span>
              <span className="text-gray-300 truncate">{t.name}</span>
            </li>
          ))}
        </ul>
      )}
      <button onClick={onRetry} className="brutal-btn">Retry Check</button>
    </div>
  );
}

function AgentBadge({ agent }: { agent: AgentStatus }) {
  switch (agent.state) {
    case 'clean': return <span className="brutal-badge brutal-badge-green">CLEAN</span>;
    case 'threat': return <span className="brutal-badge brutal-badge-red animate-pulse">THREAT</span>;
    case 'not-installed': return <span className="brutal-badge brutal-badge-amber">NOT RUNNING</span>;
    case 'checking': return <span className="brutal-badge brutal-badge-gray">CHECKING</span>;
    default: return <span className="brutal-badge brutal-badge-amber">ERROR</span>;
  }
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
