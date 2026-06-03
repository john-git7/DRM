import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { ShieldCheck, Film, Upload, AlertTriangle, LogOut } from 'lucide-react';
import LibraryPage from './pages/LibraryPage';
import UploadPage from './pages/UploadPage';
import PlayerPage from './pages/PlayerPage';
import LoginPage from './pages/LoginPage';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { useAuth } from './hooks/useAuth';
import { useDevTools } from './hooks/useDevTools';

function Header() {
  const location = useLocation();
  const { isAuthenticated, logout } = useAuth();
  const isActive = (path: string) => location.pathname === path;

  return (
    <header className="sticky top-0 z-50 bg-[#0a0a0a] border-b-2 border-white py-4 px-6 md:px-12 flex items-center justify-between">
      <Link to="/" className="flex items-center gap-3 group">
        <div className="p-2 bg-[#7c3aed] border-2 border-white group-hover:-translate-y-0.5 transition-transform"
          style={{ boxShadow: '3px 3px 0px #fff' }}>
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        <span className="font-mono text-base md:text-lg font-black tracking-tight text-white uppercase">
          DRM<span className="text-[#7c3aed]">Shield</span>
        </span>
      </Link>

      <nav className="flex items-center gap-2 md:gap-4">
        {isAuthenticated && (
          <>
            <Link
              to="/"
              className={`flex items-center gap-1.5 text-xs md:text-sm font-bold uppercase tracking-wide px-3 py-1.5 border-2 transition-all duration-75 ${
                isActive('/')
                  ? 'bg-[#7c3aed] border-white text-white'
                  : 'bg-transparent border-transparent text-gray-400 hover:border-white/40 hover:text-white'
              }`}
            >
              <Film className="w-4 h-4" />
              Library
            </Link>
            <Link
              to="/upload"
              className={`flex items-center gap-1.5 text-xs md:text-sm font-bold uppercase tracking-wide px-3 py-1.5 border-2 transition-all duration-75 ${
                isActive('/upload')
                  ? 'bg-[#7c3aed] border-white text-white'
                  : 'bg-transparent border-transparent text-gray-400 hover:border-white/40 hover:text-white'
              }`}
            >
              <Upload className="w-4 h-4" />
              Upload
            </Link>
            <button
              onClick={logout}
              className="flex items-center gap-1.5 text-xs md:text-sm font-bold uppercase tracking-wide px-3 py-1.5 border-2 border-transparent text-gray-400 hover:border-white/40 hover:text-white transition-all duration-75"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
              <span className="hidden md:inline">Sign Out</span>
            </button>
          </>
        )}
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="border-t-2 border-white/10 py-5 text-center text-xs text-gray-600 font-mono uppercase tracking-widest">
      &copy; {new Date().getFullYear()} DRMShield Video Player Prototype — Secured client-side environment
    </footer>
  );
}

function AppShell() {
  const [windowFocused, setWindowFocused] = useState(true);

  const devToolsStatus = useDevTools();

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

  if (devToolsStatus.isOpen) {
    return <div className="w-screen h-screen bg-black" />;
  }

  const isBlurred = !windowFocused;

  return (
    <div className="flex flex-col min-h-screen bg-[#0a0a0a] text-gray-100 relative">
      <div className={`flex flex-col min-h-screen transition-all duration-300 ${isBlurred ? 'blur-xl select-none pointer-events-none' : ''}`}>
        <Header />
        <main className="flex-grow container mx-auto px-4 md:px-8 py-8">
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<ProtectedRoute><LibraryPage /></ProtectedRoute>} />
            <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
            <Route path="/player/:filename" element={<ProtectedRoute><PlayerPage /></ProtectedRoute>} />
            <Route path="*" element={
              <div className="text-center py-24">
                <div className="inline-block brutal-card p-10 max-w-md">
                  <p className="font-mono text-6xl font-black text-[#7c3aed] mb-4">404</p>
                  <h2 className="text-xl font-black text-white uppercase tracking-wide mb-2">Page Not Found</h2>
                  <p className="text-gray-400 text-sm mb-8">The page you are looking for does not exist.</p>
                  <Link to="/" className="brutal-btn">Return to Library</Link>
                </div>
              </div>
            } />
          </Routes>
        </main>
        <Footer />
      </div>

      {!windowFocused && (
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
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </BrowserRouter>
  );
}
