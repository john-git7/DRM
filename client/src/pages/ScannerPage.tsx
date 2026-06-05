import { useCallback, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import {
  ArrowLeft, ScanLine, ShieldCheck, AlertCircle, ImageUp, Loader2, Fingerprint, Clock, Globe, Cpu,
} from 'lucide-react';
import { decodeForensicQr } from '../utils/forensicDecode';
import type { ForensicData } from '../utils/forensic';
import apiClient from '../utils/apiClient';

/** Largest canvas dimension we'll process (keeps things responsive). */
const CAP = 4096;

/**
 * Decode the forensic QR from a capture. A QR self-localises (finder patterns) and
 * is binarised locally, so it reads anywhere on the frame over any video content —
 * we just try the whole image at a few scales. Returns the raw token text or null.
 */
function sweepDecode(img: HTMLImageElement): string | null {
  const NW = img.naturalWidth, NH = img.naturalHeight;
  if (!NW || !NH) return null;
  const tryScale = (mult: number) => {
    let dw = Math.round(NW * mult), dh = Math.round(NH * mult);
    const fit = Math.min(1, CAP / Math.max(dw, dh));
    dw = Math.round(dw * fit); dh = Math.round(dh * fit);
    if (dw < 8 || dh < 8) return null;
    const cv = document.createElement('canvas');
    cv.width = dw; cv.height = dh;
    const ctx = cv.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, dw, dh);
    return decodeForensicQr(cv);
  };
  for (const mult of [1, 2, 0.5, 3]) {
    const r = tryScale(mult);
    if (r) return r;
  }
  return null;
}

function prettyTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

type Result =
  | { kind: 'idle' }
  | { kind: 'scanning' }
  | { kind: 'hit'; data: ForensicData }
  | { kind: 'foreign' }
  | { kind: 'miss' }
  | { kind: 'error' };

export default function ScannerPage() {
  const [result, setResult] = useState<Result>({ kind: 'idle' });
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const prevUrl = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith('image/')) { setResult({ kind: 'miss' }); return; }
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      if (prevUrl.current) URL.revokeObjectURL(prevUrl.current);
      prevUrl.current = url;
      setPreviewUrl(url);
      setResult({ kind: 'scanning' });
      window.setTimeout(async () => {
        const token = sweepDecode(im);
        if (!token) { setResult({ kind: 'miss' }); return; }
        try {
          // Decryption is server-side + auth-gated — only our scanner can read it.
          const res = await apiClient.post<{ data: ForensicData }>('/forensic/decode', { token });
          setResult({ kind: 'hit', data: res.data.data });
        } catch (err) {
          const code = axios.isAxiosError(err) ? err.response?.status : undefined;
          setResult({ kind: code === 422 ? 'foreign' : 'error' });
        }
      }, 30);
    };
    im.onerror = () => { URL.revokeObjectURL(url); setResult({ kind: 'miss' }); };
    im.src = url;
  }, []);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
  };
  const onDrag = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragActive(e.type === 'dragenter' || e.type === 'dragover');
  };
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault(); e.stopPropagation();
    setIsDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) loadFile(f);
  };

  return (
    <div className="max-w-5xl mx-auto">
      <div className="mb-6">
        <Link to="/" className="brutal-btn-ghost text-sm inline-flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          Back to Library
        </Link>
      </div>

      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 bg-[#7c3aed] border-2 border-white" style={{ boxShadow: '3px 3px 0px #fff' }}>
            <ScanLine className="w-5 h-5 text-white" />
          </div>
          <h1 className="text-3xl font-black tracking-tight text-white uppercase">Forensic Scanner</h1>
        </div>
        <p className="text-gray-500 text-sm font-mono ml-14 max-w-2xl">
          Read the forensic mark from a leaked frame. The QR carries an encrypted token — a generic
          scanner only sees gibberish. Upload a screenshot that caught the QR and this authenticated
          scanner decrypts it to reveal the viewer, device, IP, and time.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: upload + preview */}
        <div className="space-y-5">
          <div
            onDragEnter={onDrag}
            onDragOver={onDrag}
            onDragLeave={onDrag}
            onDrop={onDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`cursor-pointer border-2 border-dashed p-8 text-center transition-all duration-75 ${
              isDragActive ? 'border-[#7c3aed] bg-[#7c3aed]/10' : 'border-white/20 bg-[#0a0a0a] hover:border-white/40'
            }`}
            style={isDragActive ? { boxShadow: '4px 4px 0px #7c3aed' } : {}}
          >
            <input type="file" ref={fileInputRef} onChange={onFileInput} accept="image/*" className="hidden" />
            <div className="flex flex-col items-center gap-4">
              <div className="p-4 border-2 border-white/10 bg-[#111]"><ImageUp className="w-10 h-10 text-gray-600" /></div>
              <div>
                <p className="text-white font-bold text-sm">Drop a captured frame here or <span className="text-[#a78bfa] underline underline-offset-2">browse</span></p>
                <p className="text-gray-600 text-xs mt-1 font-mono">PNG / JPG — must include the QR mark</p>
              </div>
            </div>
          </div>

          {previewUrl && (
            <div className="brutal-card p-3">
              <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest mb-2">Captured Frame</p>
              <img src={previewUrl} alt="capture" className="w-full border-2 border-white/10" />
            </div>
          )}
        </div>

        {/* Right: result */}
        <div className="space-y-5">
          {result.kind === 'idle' && (
            <div className="brutal-card p-10 text-center text-gray-500">
              <ScanLine className="w-12 h-12 mx-auto mb-4 text-gray-700" />
              <p className="font-mono text-sm">Awaiting a capture to analyze.</p>
            </div>
          )}

          {result.kind === 'scanning' && (
            <div className="brutal-card p-10 text-center">
              <Loader2 className="w-12 h-12 mx-auto mb-4 text-[#7c3aed] animate-spin" />
              <p className="font-mono text-sm text-gray-300 uppercase tracking-widest">Decrypting…</p>
            </div>
          )}

          {result.kind === 'hit' && (
            <div className="brutal-card-danger p-6">
              <div className="flex items-center gap-2 pb-4 mb-4 border-b-2 border-[#ef4444]/30">
                <ShieldCheck className="w-5 h-5 text-[#ef4444]" />
                <h3 className="font-black text-white text-sm font-mono uppercase tracking-widest">Mark Decrypted</h3>
                <span className="brutal-badge brutal-badge-red ml-auto">TRACED</span>
              </div>
              <p className="text-sm text-gray-300 font-mono mb-5">This frame is forensically traced to:</p>
              <div className="space-y-3">
                <Field icon={<Fingerprint className="w-4 h-4" />} label="Identity" value={result.data.identity} strong />
                <Field icon={<Cpu className="w-4 h-4" />} label="Device" value={result.data.deviceId || '—'} mono />
                <Field icon={<Globe className="w-4 h-4" />} label="IP Address" value={result.data.ip || '—'} mono />
                <Field icon={<Clock className="w-4 h-4" />} label="Captured" value={prettyTime(result.data.issuedAt)} />
              </div>
            </div>
          )}

          {result.kind === 'foreign' && (
            <Notice title="Not a DRMShield Mark"
              body="A QR was decoded, but it is not a valid encrypted DRMShield token (or it was tampered with)." />
          )}
          {result.kind === 'miss' && (
            <Notice title="No Mark Found"
              body="No QR decoded from this capture. Make sure the frame caught the QR while it was visible and is reasonably sharp, then try again." />
          )}
          {result.kind === 'error' && (
            <Notice title="Decode Failed"
              body="Could not reach the decryption service. Check that you are signed in and the server is running, then retry." />
          )}
        </div>
      </div>
    </div>
  );
}

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div className="brutal-card p-6">
      <div className="flex items-center gap-2 mb-3">
        <AlertCircle className="w-5 h-5 text-[#f59e0b]" />
        <h3 className="font-black text-white text-sm font-mono uppercase tracking-widest">{title}</h3>
      </div>
      <p className="text-sm text-gray-400 font-mono">{body}</p>
    </div>
  );
}

function Field({ icon, label, value, strong, mono }: {
  icon: React.ReactNode; label: string; value: string; strong?: boolean; mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="text-[#ef4444] mt-0.5">{icon}</div>
      <div className="min-w-0">
        <p className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">{label}</p>
        <p className={`${strong ? 'text-white font-black text-base' : 'text-gray-200'} ${mono ? 'font-mono text-xs break-all' : 'text-sm'}`}>{value}</p>
      </div>
    </div>
  );
}
