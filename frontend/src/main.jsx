import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, App as AntApp, theme as antdTheme } from 'antd';
import { AuthProvider } from './auth';
import { ConfigProvider as AppConfigProvider } from './config';
import { ThemeModeProvider, useThemeMode } from './theme';
import App from './App';
import 'antd/dist/reset.css';

const BRAND_TOKENS = {
  colorPrimary: '#0d9488',
  colorLink: '#0d9488',
  colorInfo: '#0d9488',
  fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  fontSize: 14,
  borderRadius: 8,
};

function ThemedApp() {
  const { isDark } = useThemeMode();
  return (
    <ConfigProvider
      theme={{
        token: BRAND_TOKENS,
        algorithm: isDark ? antdTheme.darkAlgorithm : antdTheme.defaultAlgorithm,
      }}
    >
      <AntApp>
        <BrowserRouter>
          <AuthProvider>
            <AppConfigProvider>
              <App />
            </AppConfigProvider>
          </AuthProvider>
        </BrowserRouter>
      </AntApp>
    </ConfigProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeModeProvider>
      <ThemedApp />
    </ThemeModeProvider>
  </React.StrictMode>
);
