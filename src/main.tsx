import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { ToastProvider } from '@/components/ui/Toast';
import { ConfirmProvider } from '@/components/ui/ConfirmDialog';
import { applyNativeStatusBar, isNative, wireNativeKeyboard } from '@/lib/native';
import './index.css';

// Apply the native status bar treatment in the Capacitor shell (installed app).
void applyNativeStatusBar();

// Keep auth and app screens pinned above the soft keyboard in the installed app.
wireNativeKeyboard();

// Register only in production, and never inside the native shell. A service
// worker on a browser tab can keep serving yesterday's JavaScript while a
// developer is trying to test today's change; in the installed app the assets
// are bundled locally and a cached shell helps nobody.
if (import.meta.env.PROD && !isNative() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // The web app remains fully usable when service workers are unavailable
      // (private browsing, restricted devices, or an interrupted first load).
    });
  });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <ConfirmProvider>
          <App />
        </ConfirmProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);