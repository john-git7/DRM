import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link, useLocation } from 'react-router-dom';
import { ShieldCheck, Film, Upload, ShieldAlert, AlertTriangle } from 'lucide-react';
import LibraryPage from './pages/LibraryPage';
import UploadPage from './pages/UploadPage';
import PlayerPage from './pages/PlayerPage';
import { useDevTools } from './hooks/useDevTools';
import { useKeyboardProtection } from './hooks/useKeyboardProtection';

function Header() {
  const location = useLocation();

  const isLinkActive = (path) => {
    return location.pathname === path;
  };

  return (
    <header className="sticky top-0 z-50 glass-panel border-b border-white/5 py-4 px-6 md:px-12 flex items-center justify-between shadow-md">
      <Link to="/" className="flex items-center gap-2.5 group">
        <div className="p-2 rounded-lg bg-violet-600/90 text-white shadow-md shadow-violet-600/20 group-hover:scale-105 transition-all">
          <ShieldCheck className="w-5 h-5" />
        </div>
        <span className="font-mono text-base md:text-lg font-bold tracking-tight text-white group-hover:text-violet-400 transition-colors">
          DRM<span className="text-violet-500">Shield</span>.io
        </span>
      </Link>

      <nav className="flex items-center gap-6">
        <Link
          to="/"
          className={`flex items-center gap-1.5 text-xs md:text-sm font-semibold transition-colors duration-200 ${
            isLinkActive('/') 
              ? 'text-violet-400 font-bold' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Film className="w-4 h-4" />
          Library
        </Link>
        <Link
          to="/upload"
          className={`flex items-center gap-1.5 text-xs md:text-sm font-semibold transition-colors duration-200 ${
            isLinkActive('/upload') 
              ? 'text-violet-400 font-bold' 
              : 'text-gray-400 hover:text-white'
          }`}
        >
          <Upload className="w-4 h-4" />
          Upload
        </Link>
      </nav>
    </header>
  );
}

function Footer() {
  return (
    <footer className="py-6 border-t border-white/5 text-center text-xs text-gray-500 font-mono">
      &copy; {new Date().getFullYear()} DRMShield Video Player Prototype. Secured client-side environment.
    </footer>
  );
}

export default function App() {
  const [rightClickWarning, setRightClickWarning] = useState(false);
  const [keyboardWarning, setKeyboardWarning] = useState(null);
  const [windowFocused, setWindowFocused] = useState(true);
  const [rightClickBlur, setRightClickBlur] = useState(false);

  // Global Keyboard Protection
  useKeyboardProtection(() => {
    // Silently block shortcuts without showing a UI warning
  });

  // Global DevTools Detection
  const devToolsStatus = useDevTools();
  const isDevToolsSuspected = devToolsStatus.isOpen;

  // Global Window Focus (for screen capture blur)
  useEffect(() => {
    const handleBlur = () => {
      setWindowFocused(false);
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          navigator.clipboard.writeText('PROTECTED SECURE CONTENT - SCREENSHOT INTERCEPTED').catch(() => {});
        }
      } catch (err) {}
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
  }, []);

  // Global Right-Click Protection
  useEffect(() => {
    const handleGlobalRightClick = (e) => {
      e.preventDefault();
      // Permanently lock the app into a blurred state
      setRightClickBlur(true);
    };

    document.addEventListener('contextmenu', handleGlobalRightClick, true);
    return () => {
      document.removeEventListener('contextmenu', handleGlobalRightClick, true);
    };
  }, []);

  // If DevTools detected, immediately unmount the entire app to hide source code and video URL
  if (isDevToolsSuspected) {
    return (
      <div className="w-screen h-screen bg-black flex items-center justify-center">
        {/* We render a completely blank page to destroy the DOM and hide the video URL */}
      </div>
    );
  }

  // If window loses focus OR right-click was just pressed, blur the entire app
  const isBlurred = !windowFocused || rightClickBlur;

  return (
    <BrowserRouter>
      <div className="flex flex-col min-h-screen bg-brand-dark text-gray-100 relative">
        <div className={`flex flex-col min-h-screen transition-all duration-300 ${isBlurred ? 'blur-xl select-none pointer-events-none' : ''}`}>
          <Header />
          
          <main className="flex-grow container mx-auto px-4 md:px-8 py-6">
            <Routes>
              <Route path="/" element={<LibraryPage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/player/:filename" element={<PlayerPage />} />
              <Route path="*" element={
                <div className="text-center py-20">
                  <h2 className="text-2xl font-bold text-white mb-2">404 - Page Not Found</h2>
                  <p className="text-gray-400 text-sm mb-6">The page you are looking for does not exist.</p>
                  <Link to="/" className="bg-violet-600 hover:bg-violet-500 text-white font-bold py-2.5 px-6 rounded-xl transition-all">
                    Return to Library
                  </Link>
                </div>
              } />
            </Routes>
          </main>

          <Footer />
        </div>

        {!windowFocused && (
          <div className="fixed inset-0 flex flex-col items-center justify-center bg-black/80 z-[100] text-center px-4">
            <div className="glass-panel p-6 rounded-2xl border border-white/10 max-w-sm">
              <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
              <h2 className="text-lg md:text-xl font-bold text-white mb-1">App Paused</h2>
              <p className="text-gray-400 text-xs md:text-sm">
                Window Focus Lost. Re-focus window to resume.
              </p>
            </div>
          </div>
        )}

      </div>
    </BrowserRouter>
  );
}
