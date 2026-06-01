import { useEffect, useState } from 'react';

/**
 * Hook to detect if browser developer tools are open.
 * Uses viewport dimension changes to reliably detect docked DevTools without sticky console bugs.
 */
export const useDevTools = () => {
  const [status, setStatus] = useState({
    isOpen: false,
    dimensionsTriggered: false,
    cssDiffW: 0,
    cssDiffH: 0
  });

  useEffect(() => {
    const runDetection = () => {
      const outerW = window.outerWidth;
      const innerW = window.innerWidth;
      const outerH = window.outerHeight;
      const innerH = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;

      // Correct OS scaling differences for Windows where outerWidth is often in physical pixels
      const isOuterPhysical = outerW > window.screen.width;
      const cssOuterW = isOuterPhysical ? outerW / dpr : outerW;
      const cssOuterH = isOuterPhysical ? outerH / dpr : outerH;

      const cssDiffW = Math.max(0, cssOuterW - innerW);
      const cssDiffH = Math.max(0, cssOuterH - innerH);

      // On mobile devices, the virtual keyboard opening shrinks innerHeight dramatically,
      // which would trigger a false positive for DevTools. 
      // Also, mobile browsers do not have dockable DevTools. 
      // We can disable the dimension checks for touch devices (mobile/tablets).
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || (window.matchMedia && window.matchMedia("(pointer: coarse)").matches);

      let dimensionsTriggered = false;
      if (!isMobile) {
        // Trigger if viewport width or height is shrunk by more than 100 CSS pixels (ultra-aggressive)
        dimensionsTriggered = cssDiffW > 100 || cssDiffH > 100;
      }

      // Debugger Timing Trap: 
      // If devtools is open, this debugger statement will pause execution.
      // We measure how long it takes to run. If it takes longer than 100ms, DevTools is open.
      let debuggerTriggered = false;
      const start = performance.now();
      Function("debugger")(); 
      if (performance.now() - start > 100) {
        debuggerTriggered = true;
      }

      setStatus({
        isOpen: dimensionsTriggered || debuggerTriggered,
        dimensionsTriggered: dimensionsTriggered,
        cssDiffW: Math.round(cssDiffW),
        cssDiffH: Math.round(cssDiffH)
      });
    };

    window.addEventListener('resize', runDetection);
    // Run frequently to trap the debugger
    const timer = setInterval(runDetection, 500);
    runDetection();

    return () => {
      window.removeEventListener('resize', runDetection);
      clearInterval(timer);
    };
  }, []);

  return status;
};
