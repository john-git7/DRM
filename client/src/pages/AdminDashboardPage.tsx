import { ShieldCheck, ToggleRight, MonitorX, EyeOff, Keyboard, Fingerprint, Upload, Film } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useSecurity } from '../context/SecurityContext';
import UploadPage from './UploadPage';
import LibraryPage from './LibraryPage';

function ToggleSwitch({ enabled, onChange, disabled = false }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={`relative inline-flex h-6 w-11 items-center border-2 border-white transition-colors focus:outline-none focus:ring-2 focus:ring-[#7c3aed] focus:ring-offset-2 focus:ring-offset-[#0a0a0a] ${
        enabled ? 'bg-[#7c3aed]' : 'bg-transparent'
      } ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
    >
      <span
        className={`inline-block h-4 w-4 transform bg-white transition-transform ${
          enabled ? 'translate-x-5' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

export default function AdminDashboardPage() {
  const {
    focusLossDetectEnabled,
    rightClickProtectEnabled,
    keyboardProtectEnabled,
    forensicWatermarkEnabled,
    devToolsDetectEnabled,
    updateConfig,
  } = useSecurity();

  return (
    <div className="max-w-6xl mx-auto space-y-12">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-[#7c3aed] border-2 border-white" style={{ boxShadow: '4px 4px 0px #fff' }}>
            <ShieldCheck className="w-8 h-8 text-white" />
          </div>
          <h1 className="font-mono text-3xl font-black tracking-tight text-white uppercase">
            Admin Dashboard
          </h1>
        </div>
        <Link to="/" className="brutal-btn bg-gray-800 text-white hover:bg-gray-700">
          Back to Player
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-6">
          {/* Security Configuration Panel */}
          <div className="brutal-card p-6">
            <h2 className="text-lg font-black text-white uppercase tracking-wide mb-6 flex items-center gap-2">
              <ToggleRight className="w-5 h-5 text-[#7c3aed]" />
              Security Overlays
            </h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MonitorX className="w-4 h-4 text-gray-400" />
                  <span className="font-mono text-xs text-gray-300">Background Blur</span>
                </div>
                <ToggleSwitch enabled={focusLossDetectEnabled} onChange={(v) => updateConfig('focusLossDetectEnabled', v)} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <EyeOff className="w-4 h-4 text-gray-400" />
                  <span className="font-mono text-xs text-gray-300">Right-Click Lock</span>
                </div>
                <ToggleSwitch enabled={rightClickProtectEnabled} onChange={(v) => updateConfig('rightClickProtectEnabled', v)} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Keyboard className="w-4 h-4 text-gray-400" />
                  <span className="font-mono text-xs text-gray-300">Keyboard Lock</span>
                </div>
                <ToggleSwitch enabled={keyboardProtectEnabled} onChange={(v) => updateConfig('keyboardProtectEnabled', v)} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Fingerprint className="w-4 h-4 text-gray-400" />
                  <span className="font-mono text-xs text-gray-300">Forensic Mark</span>
                </div>
                <ToggleSwitch enabled={forensicWatermarkEnabled} onChange={(v) => updateConfig('forensicWatermarkEnabled', v)} />
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-gray-400" />
                  <span className="font-mono text-xs text-gray-300">DevTools Lockout</span>
                </div>
                <ToggleSwitch enabled={devToolsDetectEnabled} onChange={(v) => updateConfig('devToolsDetectEnabled', v)} />
              </div>
            </div>
            <p className="mt-6 text-[10px] font-mono text-gray-500 uppercase tracking-widest border-t border-white/10 pt-4">
              Changes apply instantly to the landing page.
            </p>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-8">
          <div id="upload-section" className="brutal-card p-6">
            <h2 className="text-lg font-black text-white uppercase tracking-wide mb-6 flex items-center gap-2">
              <Upload className="w-5 h-5 text-[#7c3aed]" />
              Upload New Video
            </h2>
            <UploadPage />
          </div>

          <div className="brutal-card p-6">
            <h2 className="text-lg font-black text-white uppercase tracking-wide mb-6 flex items-center gap-2">
              <Film className="w-5 h-5 text-[#7c3aed]" />
              Video Library
            </h2>
            <LibraryPage />
          </div>
        </div>
      </div>
    </div>
  );
}

// Inline AlertCircle so we don't have to change lucide imports just for this
function AlertCircle(props: any) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="12" cy="12" r="10" />
      <line x1="12" x2="12" y1="8" y2="12" />
      <line x1="12" x2="12.01" y1="16" y2="16" />
    </svg>
  );
}
