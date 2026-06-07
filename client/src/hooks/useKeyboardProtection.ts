import { useEffect } from 'react';
import { enableKeyboardProtection } from '@drmshield/client';

export function useKeyboardProtection(onBlocked?: () => void, enabled = true): void {
  useEffect(() => {
    if (!enabled) return;
    return enableKeyboardProtection(onBlocked);
  }, [onBlocked, enabled]);
}
