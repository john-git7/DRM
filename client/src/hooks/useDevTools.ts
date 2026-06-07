import { useEffect, useState } from 'react';
import { detectDevTools } from '@drmshield/client';
import type { DevToolsStatus } from '@drmshield/client';

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
    const run = () => setStatus(detectDevTools());
    window.addEventListener('resize', run);
    const timer = setInterval(run, 500);
    run();
    return () => {
      window.removeEventListener('resize', run);
      clearInterval(timer);
    };
  }, []);

  return status;
}
