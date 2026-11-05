import { createContext, useContext, useEffect, useMemo, useState } from 'react';

// Theme mode: 'light' | 'dark' | 'auto' (auto follows the OS setting, live).
const ThemeModeContext = createContext(null);
const KEY = 'crm_theme';

const getSaved = () => {
  try { return localStorage.getItem(KEY) || 'auto'; } catch { return 'auto'; }
};
const prefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)').matches
    : false;

export function ThemeModeProvider({ children }) {
  const [mode, setModeState] = useState(getSaved);
  const [systemDark, setSystemDark] = useState(prefersDark);

  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (e) => setSystemDark(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const setMode = (m) => {
    setModeState(m);
    try { localStorage.setItem(KEY, m); } catch { /* ignore */ }
  };

  const isDark = mode === 'dark' || (mode === 'auto' && systemDark);

  // Reflect on <html> + body so areas outside antd components follow the theme.
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
    document.body.style.background = isDark ? '#141414' : '#f0f2f5';
  }, [isDark]);

  const value = useMemo(() => ({ mode, setMode, isDark }), [mode, isDark]);
  return <ThemeModeContext.Provider value={value}>{children}</ThemeModeContext.Provider>;
}

export function useThemeMode() {
  return useContext(ThemeModeContext) || { mode: 'light', setMode: () => {}, isDark: false };
}
