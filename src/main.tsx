import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './components/FirebaseProvider.tsx';
import { ErrorBoundary } from './components/ErrorBoundary.tsx';

// Ensure no stale service workers interfere, guarded against sandboxed iframe security policies
if (typeof window !== 'undefined') {
  try {
    if ('serviceWorker' in navigator && typeof navigator.serviceWorker.getRegistrations === 'function') {
      navigator.serviceWorker.getRegistrations()
        .then((registrations) => {
          if (Array.isArray(registrations)) {
            for (const registration of registrations) {
              try {
                registration.unregister().catch(() => {});
              } catch {}
            }
          }
        })
        .catch(() => {});
    }
  } catch {
    // ignore iframe security restrictions
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(
    <StrictMode>
      <ErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ErrorBoundary>
    </StrictMode>,
  );
}
