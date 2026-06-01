import { useEffect } from 'react';

/**
 * Hook to block developer keyboard shortcuts, copy commands, and capture shortcut keys.
 * @param {Function} onBlocked - Callback executed when a shortcut is blocked.
 */
export const useKeyboardProtection = (onBlocked) => {
  useEffect(() => {
    const handleKeyDown = (e) => {
      // 1. DevTools and View Source
      const isF12 = e.key === 'F12' || e.keyCode === 123;
      const isInspect = e.ctrlKey && e.shiftKey && (
        e.key === 'I' || e.key === 'i' || e.keyCode === 73 ||
        e.key === 'J' || e.key === 'j' || e.keyCode === 74 ||
        e.key === 'C' || e.key === 'c' || e.keyCode === 67
      );
      const isViewSource = e.ctrlKey && (e.key === 'U' || e.key === 'u' || e.keyCode === 85);
      const isSavePage = e.ctrlKey && (e.key === 'S' || e.key === 's' || e.keyCode === 83);

      // 2. Screenshot keys (Print Screen)
      const isPrintScreen = e.key === 'PrintScreen' || e.keyCode === 44;

      // 3. macOS Screenshot Shortcuts (Cmd + Shift + 3, Cmd + Shift + 4, Cmd + Shift + 5)
      // Note: macOS intercepts these at the OS level before they reach the browser,
      // but if the browser receives them (e.g. in some nested windows), we block them.
      const isMacScreenshot = e.metaKey && e.shiftKey && (
        e.key === '3' || e.key === '4' || e.key === '5' ||
        e.keyCode === 51 || e.keyCode === 52 || e.keyCode === 53
      );

      // 4. Windows shortcuts (Win + Shift + S / Win + Alt + R)
      // Note: Win key (Meta) is usually trapped by Windows OS, but we listen for safety.
      const isWinCapture = e.metaKey && (
        (e.shiftKey && (e.key === 'S' || e.key === 's' || e.keyCode === 83)) ||
        (e.altKey && (e.key === 'R' || e.key === 'r' || e.keyCode === 82))
      );

      // 5. ChromeOS Screenshot (Ctrl + Show Windows)
      // In Chromebooks, the 'Show Windows' key is mapped to F5 or similar media keys.
      const isChromeOsCapture = e.ctrlKey && (e.key === 'F5' || e.keyCode === 116) && e.shiftKey;

      if (isF12 || isInspect || isViewSource || isSavePage || isPrintScreen || isMacScreenshot || isWinCapture || isChromeOsCapture) {
        e.preventDefault();
        
        // If it's a screenshot shortcut, overwrite clipboard to ruin the screenshot if it goes to clipboard
        if (isPrintScreen || isMacScreenshot || isWinCapture || isChromeOsCapture) {
          try {
            if (navigator.clipboard && navigator.clipboard.writeText) {
              navigator.clipboard.writeText('PROTECTED SECURE CONTENT - SCREENSHOT INTERCEPTED').catch(() => {});
            }
          } catch (err) {}
        }

        if (onBlocked) {
          onBlocked(`Security Warning: Screen Capture / Access shortcut blocked.`);
        }
      }
    };

    const handleCopy = (e) => {
      // Intercept Ctrl+C / Cmd+C or context-menu copy events
      e.preventDefault();
      if (onBlocked) {
        onBlocked('Copy command blocked. Content is protected.');
      }
      try {
        e.clipboardData.setData('text/plain', 'PROTECTED CONTENT - COPY BLOCKED');
      } catch (err) {
        console.error('Clipboard write block error:', err);
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('copy', handleCopy, true);

    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('copy', handleCopy, true);
    };
  }, [onBlocked]);
};
