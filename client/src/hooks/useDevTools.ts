import { useEffect, useState } from 'react';
import type { DevToolsStatus } from '../types';

const INITIAL_STATUS: DevToolsStatus = {
  isOpen: false,
  dimensionsTriggered: false,
  cssDiffW: 0,
  cssDiffH: 0,
  outerWidth: 0,
  outerHeight: 0,
  innerWidth: 0,
  innerHeight: 0,
  devicePixelRatio: 1,
  consoleHookTriggered: false,
};

export function useDevTools(): DevToolsStatus {
  const [status, setStatus] = useState<DevToolsStatus>(INITIAL_STATUS);

  useEffect(() => {
    const runDetection = () => {
      const outerW = window.outerWidth;
      const innerW = window.innerWidth;
      const outerH = window.outerHeight;
      const innerH = window.innerHeight;
      const dpr = window.devicePixelRatio || 1;

      // Correct for Windows where outerWidth is often in physical pixels
      const isOuterPhysical = outerW > window.screen.width;
      const cssOuterW = isOuterPhysical ? outerW / dpr : outerW;
      const cssOuterH = isOuterPhysical ? outerH / dpr : outerH;

      const cssDiffW = Math.max(0, cssOuterW - innerW);
      const cssDiffH = Math.max(0, cssOuterH - innerH);

      // Mobile devices have no dockable DevTools; virtual keyboard shrinks innerHeight causing false positives
      const isMobile =
        /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        window.matchMedia('(pointer: coarse)').matches;

      const dimensionsTriggered = !isMobile && (cssDiffW > 100 || cssDiffH > 100);

      // Debugger timing trap: open DevTools pauses this statement, making elapsed > 100ms
      let debuggerTriggered = false;
      const start = performance.now();
      // eslint-disable-next-line no-new-func
      new Function('debugger')();
      if (performance.now() - start > 100) {
        debuggerTriggered = true;
      }

      setStatus({
        isOpen: dimensionsTriggered || debuggerTriggered,
        dimensionsTriggered,
        cssDiffW: Math.round(cssDiffW),
        cssDiffH: Math.round(cssDiffH),
        outerWidth: Math.round(cssOuterW),
        outerHeight: Math.round(cssOuterH),
        innerWidth: innerW,
        innerHeight: innerH,
        devicePixelRatio: dpr,
        consoleHookTriggered: false,
      });
    };

    window.addEventListener('resize', runDetection);
    const timer = setInterval(runDetection, 500);
    runDetection();

    return () => {
      window.removeEventListener('resize', runDetection);
      clearInterval(timer);
    };
  }, []);

  return status;
}
