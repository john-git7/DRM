import { useEffect } from 'react';

export function useKeyboardProtection(onBlocked?: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const isF12 = e.key === 'F12' || e.keyCode === 123;
      const isInspect =
        e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key);
      const isViewSource = e.ctrlKey && ['U', 'u'].includes(e.key);
      const isSavePage = e.ctrlKey && ['S', 's'].includes(e.key);
      const isPrintScreen = e.key === 'PrintScreen' || e.keyCode === 44;
      const isMacScreenshot =
        e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key);
      const isWinCapture =
        e.metaKey &&
        ((e.shiftKey && ['S', 's'].includes(e.key)) ||
          (e.altKey && ['R', 'r'].includes(e.key)));
      // ChromeOS: Ctrl+Shift+F5 (Show Windows key)
      const isChromeOsCapture = e.ctrlKey && e.shiftKey && e.key === 'F5';

      if (
        isF12 || isInspect || isViewSource || isSavePage ||
        isPrintScreen || isMacScreenshot || isWinCapture || isChromeOsCapture
      ) {
        e.preventDefault();

        if (isPrintScreen || isMacScreenshot || isWinCapture || isChromeOsCapture) {
          navigator.clipboard
            ?.writeText('PROTECTED SECURE CONTENT - SCREENSHOT INTERCEPTED')
            .catch(() => {});
        }

        onBlocked?.();
      }
    };

    const handleCopy = (e: ClipboardEvent) => {
      e.preventDefault();
      onBlocked?.();
      try {
        e.clipboardData?.setData('text/plain', 'PROTECTED CONTENT - COPY BLOCKED');
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
  }, [onBlocked, enabled]);
}
