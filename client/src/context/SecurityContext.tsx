import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';

interface SecurityConfig {
  focusLossDetectEnabled: boolean;
  rightClickProtectEnabled: boolean;
  keyboardProtectEnabled: boolean;
  forensicWatermarkEnabled: boolean;
  visibleWatermarkEnabled: boolean;
  devToolsDetectEnabled: boolean;
}

interface SecurityContextValue extends SecurityConfig {
  updateConfig: (key: keyof SecurityConfig, value: boolean) => void;
}

const defaultConfig: SecurityConfig = {
  focusLossDetectEnabled: true,
  rightClickProtectEnabled: true,
  keyboardProtectEnabled: true,
  forensicWatermarkEnabled: true,
  visibleWatermarkEnabled: true,
  devToolsDetectEnabled: true,
};

const SecurityContext = createContext<SecurityContextValue | null>(null);

export function SecurityProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<SecurityConfig>(() => {
    const saved = localStorage.getItem('drm_security_config');
    if (saved) {
      try {
        return { ...defaultConfig, ...JSON.parse(saved) };
      } catch {
        return defaultConfig;
      }
    }
    return defaultConfig;
  });

  useEffect(() => {
    localStorage.setItem('drm_security_config', JSON.stringify(config));
  }, [config]);

  const updateConfig = (key: keyof SecurityConfig, value: boolean) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <SecurityContext.Provider value={{ ...config, updateConfig }}>
      {children}
    </SecurityContext.Provider>
  );
}

export function useSecurity() {
  const ctx = useContext(SecurityContext);
  if (!ctx) throw new Error('useSecurity must be used within SecurityProvider');
  return ctx;
}
