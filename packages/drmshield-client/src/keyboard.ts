/**
 * Attach keyboard and clipboard protection listeners to the current window.
 *
 * Blocks: F12, Ctrl+Shift+[I/J/C], Ctrl+[U/S], PrintScreen,
 *         Mac Cmd+Shift+[3/4/5], Win+Shift+S, Win+Alt+R, ChromeOS Ctrl+Shift+F5.
 * On screenshot keys: overwrites the clipboard with an interception notice.
 * On copy: prevents the event and blocks clipboard data.
 *
 * @param onBlocked - Optional callback fired on every blocked action.
 * @returns Teardown callback. Call it to remove all attached listeners.
 */
export function enableKeyboardProtection(onBlocked?: () => void): () => void {
  const handleKeyDown = (e: KeyboardEvent): void => {
    const isF12 = e.key === 'F12' || e.keyCode === 123;
    const isInspect =
      e.ctrlKey && e.shiftKey && ['I', 'i', 'J', 'j', 'C', 'c'].includes(e.key);
    const isViewSource = e.ctrlKey && ['U', 'u'].includes(e.key);
    const isSavePage = e.ctrlKey && ['S', 's'].includes(e.key);
    const isPrintScreen = e.key === 'PrintScreen' || e.keyCode === 44;
    const isMacScreenshot = e.metaKey && e.shiftKey && ['3', '4', '5'].includes(e.key);
    const isWinCapture =
      e.metaKey &&
      ((e.shiftKey && ['S', 's'].includes(e.key)) ||
        (e.altKey && ['R', 'r'].includes(e.key)));
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

  const handleCopy = (e: ClipboardEvent): void => {
    e.preventDefault();
    onBlocked?.();
    try {
      e.clipboardData?.setData('text/plain', 'PROTECTED CONTENT - COPY BLOCKED');
    } catch {
      // Clipboard API unavailable in this context — silently skip.
    }
  };

  window.addEventListener('keydown', handleKeyDown, true);
  document.addEventListener('copy', handleCopy, true);

  return () => {
    window.removeEventListener('keydown', handleKeyDown, true);
    document.removeEventListener('copy', handleCopy, true);
  };
}
