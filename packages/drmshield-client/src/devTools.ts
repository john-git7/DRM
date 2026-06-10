import type { DevToolsStatus } from './types.js';

const POLL_INTERVAL_MS = 500;
const DIMENSION_THRESHOLD_PX = 100;
const SIDEBAR_DIMENSION_THRESHOLD_PX = 160;
const DOCKED_HEIGHT_THRESHOLD_PX = 260;

function detect(): DevToolsStatus {
  const outerW = window.outerWidth;
  const innerW = window.innerWidth;
  const outerH = window.outerHeight;
  const innerH = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;

  // Correct for Windows where outerWidth is often in physical pixels.
  const isOuterPhysical = outerW > window.screen.width;
  const cssOuterW = isOuterPhysical ? outerW / dpr : outerW;
  const cssOuterH = isOuterPhysical ? outerH / dpr : outerH;

  const cssDiffW = Math.max(0, cssOuterW - innerW);
  const cssDiffH = Math.max(0, cssOuterH - innerH);

  // Mobile virtual keyboard shrinks innerHeight — skip dimension check on mobile.
  const isMobile =
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
    window.matchMedia('(pointer: coarse)').matches;

  const dimensionsTriggered =
    !isMobile &&
    (
      cssDiffW > SIDEBAR_DIMENSION_THRESHOLD_PX ||
      cssDiffH > DOCKED_HEIGHT_THRESHOLD_PX ||
      (cssDiffW > DIMENSION_THRESHOLD_PX && cssDiffH > DIMENSION_THRESHOLD_PX)
    );

  // Debugger timing trap: open DevTools pauses this statement, making elapsed > 100ms.
  let consoleHookTriggered = false;
  const start = performance.now();
  // eslint-disable-next-line no-new-func
  new Function('debugger')();
  if (performance.now() - start > 100) consoleHookTriggered = true;

  return {
    isOpen: dimensionsTriggered || consoleHookTriggered,
    dimensionsTriggered,
    cssDiffW: Math.round(cssDiffW),
    cssDiffH: Math.round(cssDiffH),
    outerWidth: Math.round(cssOuterW),
    outerHeight: Math.round(cssOuterH),
    innerWidth: innerW,
    innerHeight: innerH,
    devicePixelRatio: dpr,
    consoleHookTriggered,
  };
}

/**
 * Take a single DevTools detection snapshot. Returns the full status object.
 * Useful for React consumers that manage their own polling cadence.
 */
export function detectDevTools(): DevToolsStatus {
  return detect();
}

/**
 * Start monitoring for open DevTools. Combines dimension-diff detection with a
 * debugger timing trap. Polls every 500ms and also fires on `resize`.
 *
 * @param onChange - Called whenever the `isOpen` state changes.
 * @returns Teardown callback. Call it to stop monitoring and remove all listeners.
 */
export function startDevToolsMonitor(onChange: (status: DevToolsStatus) => void): () => void {
  let lastIsOpen: boolean | undefined;

  const run = () => {
    const status = detect();
    if (status.isOpen !== lastIsOpen) {
      lastIsOpen = status.isOpen;
      onChange(status);
    }
  };

  window.addEventListener('resize', run);
  const timer = setInterval(run, POLL_INTERVAL_MS);
  run();

  return () => {
    window.removeEventListener('resize', run);
    clearInterval(timer);
  };
}
