import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { ShieldCheck, AlertTriangle } from 'lucide-react';
import LandingPage from './pages/LandingPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import { SecurityProvider, useSecurity } from './context/SecurityContext';
import { useDevTools } from './hooks/useDevTools';
import { enableScreenProtection } from './utils/mobileProtection';

function Footer() {
  return (
    <footer className="border-t-2 border-white/10 py-6 flex flex-col items-center gap-2.5">
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest">Built by</span>
        <img src="/arqx-logo.png" alt="ARQX" className="h-4 w-auto" />
        <span className="text-[11px] text-gray-300 font-mono uppercase tracking-[0.2em] font-black">Atlas</span>
      </div>
      <div className="flex items-center gap-4 mt-2">
        <span className="text-[11px] text-gray-600 font-mono uppercase tracking-widest">
          &copy; {new Date().getFullYear()} DRMShield — Secured client-side environment
        </span>
        <Link to="/admin" className="text-gray-800 hover:text-gray-500 transition-colors" title="Admin Dashboard">
          <ShieldCheck className="w-3 h-3" />
        </Link>
      </div>
    </footer>
  );
}

function AppShell() {
  const [windowFocused, setWindowFocused] = useState(true);
  const devToolsStatus = useDevTools();
  const { devToolsDetectEnabled, focusLossDetectEnabled } = useSecurity();

  // Native (Capacitor) builds only
  useEffect(() => { void enableScreenProtection(); }, []);

  useEffect(() => {
    const handleBlur = () => {
      setWindowFocused(false);
      navigator.clipboard
        ?.writeText('PROTECTED SECURE CONTENT - SCREENSHOT INTERCEPTED')
        .catch(() => {});
    };
    const handleFocus = () => setWindowFocused(true);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('focus', handleFocus);
    return () => {
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('focus', handleFocus);
    };
  }, []);

  if (devToolsDetectEnabled && devToolsStatus.isOpen) {
    return <div className="w-screen h-screen bg-black flex items-center justify-center text-white font-mono uppercase">DevTools Detected - Access Blocked</div>;
  }

  const isBlurred = focusLossDetectEnabled && !windowFocused;

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0a] text-gray-100 relative">
      <div className={`flex flex-col min-h-screen transition-all duration-300 ${isBlurred ? 'blur-xl select-none pointer-events-none' : ''}`}>
        <main className="flex-grow container mx-auto px-4 md:px-8 py-8">
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/admin" element={<AdminDashboardPage />} />
            <Route path="*" element={
              <div className="text-center py-24">
                <div className="inline-block brutal-card p-10 max-w-md">
                  <p className="font-mono text-6xl font-black text-[#7c3aed] mb-4">404</p>
                  <h2 className="text-xl font-black text-white uppercase tracking-wide mb-2">Page Not Found</h2>
                  <p className="text-gray-400 text-sm mb-8">The page you are looking for does not exist.</p>
                  <Link to="/" className="brutal-btn">Return Home</Link>
                </div>
              </div>
            } />
          </Routes>
        </main>
        <Footer />
      </div>

      {isBlurred && (
        <div className="fixed inset-0 flex flex-col items-center justify-center bg-black/90 z-[100] text-center px-4">
          <div className="brutal-card p-8 max-w-sm w-full">
            <AlertTriangle className="w-12 h-12 text-[#f59e0b] mx-auto mb-4" />
            <h2 className="text-lg font-black text-white uppercase tracking-wide mb-1">App Paused</h2>
            <p className="text-gray-400 text-sm font-mono">
              Window focus lost — re-focus to resume.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <SecurityProvider>
        <AppShell />
      </SecurityProvider>
    </BrowserRouter>
  );
}
