import { useState, useEffect, useCallback, useRef } from 'react';
import { ShieldCheck, AlertCircle, Loader2, MonitorX, Download } from 'lucide-react';
import apiClient from '../utils/apiClient';
import VideoPlayer from '../components/VideoPlayer';
import { useSecurity } from '../context/SecurityContext';
import { useDevTools } from '../hooks/useDevTools';
import { API_BASE } from '../config/api';
import axios from 'axios';
import { getDeviceFingerprint } from '../utils/deviceFingerprint';
import { checkAgent } from '../utils/agentCheck';
import { sendAudit } from '../utils/audit';
import { onCaptureEvent } from '../utils/mobileProtection';
import type { Video, AgentStatus, AgentThreat } from '../types';

export default function LandingPage() {
  const [filename, setFilename] = useState<string | null>(null);
  const [video, setVideo] = useState<Video | null>(null);
  const [keyGrant, setKeyGrant] = useState<string | null>(null);
  const [agent, setAgent] = useState<AgentStatus>({ state: 'checking', threats: [] });
  const [loading, setLoading] = useState(true);
  const [preparing, setPreparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [screenCaptureActive, setScreenCaptureActive] = useState(false);

  const { 
    focusLossDetectEnabled, 
    rightClickProtectEnabled, 
    keyboardProtectEnabled, 
    forensicWatermarkEnabled,
    devToolsDetectEnabled 
  } = useSecurity();

  const devToolsStatus = useDevTools();
  const devToolsOpen = devToolsDetectEnabled && devToolsStatus.isOpen;
  const deviceIdRef = useRef<string | null>(null);
  const [deviceId, setDeviceId] = useState('');
  const auditedDevTools = useRef(false);

  // Fetch the first available video
  useEffect(() => {
    let cancelled = false;
    apiClient.get<Video[]>('/videos')
      .then((res) => {
        if (cancelled) return;
        if (res.data.length > 0) {
          setFilename(res.data[0].filename);
        } else {
          setError('No video available.');
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setError('Failed to fetch videos.');
          setLoading(false);
        }
      });
    return () => { cancelled = true; };
  }, []);

  const preparePlayback = useCallback(async (current: Video) => {
    setPreparing(true);
    setKeyGrant(null);
    try {
      const fingerprint = deviceIdRef.current ?? (deviceIdRef.current = await getDeviceFingerprint());
      setDeviceId(fingerprint);
      const deviceId = fingerprint;

      // Bypass agent check for the demo so it plays on mobile devices
      const agentStatus: AgentStatus = { state: 'clean', threats: [] };
      setAgent(agentStatus);

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

  useEffect(() => {
    if (!filename) return;
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
          try {
            await apiClient.post(`/videos/${filename}/transcode`);
            if (!cancelled) setVideo({ ...v, hlsStatus: 'processing' });
          } catch (e) {
            if (cancelled) return;
            const code = axios.isAxiosError(e) ? e.response?.status : undefined;
            setError(code === 409
              ? 'This video has no encrypted stream and its source file is unavailable.'
              : 'Could not start encryption for this video.');
          }
        }
      } catch (err) {
        if (cancelled) return;
        setError('Connection error: failed to fetch video details.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => { cancelled = true; };
  }, [filename, preparePlayback]);

  // Poll while encrypting
  useEffect(() => {
    if (!filename || video?.hlsStatus !== 'processing') return;
    const poll = setInterval(async () => {
      try {
        const res = await apiClient.get<Video>(`/videos/${filename}`);
        setVideo(res.data);
        if (res.data.hlsStatus === 'ready') preparePlayback(res.data);
      } catch { /* keep polling */ }
    }, 2000);
    return () => clearInterval(poll);
  }, [filename, video?.hlsStatus, preparePlayback]);

  // Re-check agent
  useEffect(() => {
    if (agent.state !== 'clean' || !filename) return;

    let timerId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      const status = await checkAgent();
      if (status.state !== 'clean') {
        setAgent(status);
        sendAudit({ event: 'playback-blocked', videoId: filename, deviceId: deviceIdRef.current ?? undefined, agentStatus: status.state, recorders: status.threats.map((t: AgentThreat) => `${t.category}: ${t.name}`) });
        return;
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
    document.addEventListener('play', fireNow, true);

    timerId = setTimeout(poll, 1500 + Math.random() * 2500);

    return () => {
      if (timerId !== null) clearTimeout(timerId);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('focus', fireNow);
      document.removeEventListener('play', fireNow, true);
    };
  }, [agent.state, filename]);

  useEffect(() => {
    if (devToolsOpen && !auditedDevTools.current && filename) {
      auditedDevTools.current = true;
      sendAudit({ event: 'devtools-lockout', videoId: filename, deviceId: deviceIdRef.current ?? undefined });
    }
  }, [devToolsOpen, filename]);

  useEffect(() => {
    if (!filename) return;
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
  const playbackReady = video?.hlsStatus === 'ready' && agent.state === 'clean' && !!keyGrant;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header for Landing Page */}
      <div className="flex items-center justify-center gap-3 mb-10 mt-4">
        <div className="p-3 bg-[#7c3aed] border-2 border-white" style={{ boxShadow: '4px 4px 0px #fff' }}>
          <ShieldCheck className="w-8 h-8 text-white" />
        </div>
        <span className="font-mono text-3xl font-black tracking-tight text-white uppercase">
          DRM<span className="text-[#7c3aed]">Shield</span>
        </span>
      </div>

      {(agent.state === 'threat' || screenCaptureActive) && (
        <CaptureBlackout identity="Guest User" threats={agent.threats} onRetry={retry} />
      )}

      {loading || preparing ? (
        <div className="space-y-4">
          <div className="aspect-video w-full bg-[#111] border-2 border-white/10 animate-pulse flex items-center justify-center">
            <div className="flex items-center gap-3 text-gray-500 font-mono text-xs uppercase tracking-widest">
              <Loader2 className="w-5 h-5 animate-spin" />
              {preparing ? 'Authorizing secure playback…' : 'Loading…'}
            </div>
          </div>
          <div className="h-6 bg-white/10 w-1/3 animate-pulse mx-auto" />
        </div>
      ) : error ? (
        <div className="brutal-card-danger p-10 max-w-xl mx-auto text-center">
          <AlertCircle className="w-12 h-12 text-[#ef4444] mx-auto mb-4" />
          <p className="text-[#ef4444] font-black text-lg uppercase tracking-wide mb-2">Notice</p>
          <p className="text-gray-400 text-sm font-mono mb-6">{error}</p>
        </div>
      ) : video && video.hlsStatus !== 'ready' ? (
        <VideoStatusCard status={video.hlsStatus} progress={video.hlsProgress} />
      ) : video ? (
        <div className="space-y-4">
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
          <div className="text-center mt-6">
            <h1 className="text-2xl font-black text-white uppercase tracking-wide mb-2">{video.title}</h1>
            <p className="text-gray-400 font-mono text-sm">Protected by Military-Grade DRM Encryption</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function VideoStatusCard({ status, progress }: { status?: string; progress?: number }) {
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
          ? 'This video could not be transcoded into a secure stream.'
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
          ? 'The security agent must be running to watch protected content. Start the localhost agent, then retry.'
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
