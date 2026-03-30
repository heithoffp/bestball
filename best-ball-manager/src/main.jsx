import React from 'react';
import { createRoot } from 'react-dom/client';
import * as Sentry from '@sentry/react';
import { initSentry } from './utils/sentry';
import { AuthProvider } from './contexts/AuthContext';
import { SubscriptionProvider } from './contexts/SubscriptionContext';
import App from './App';
import './index.css';

initSentry();

// eslint-disable-next-line react-refresh/only-export-components
function FallbackUI() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1rem' }}>
      <h1>Something went wrong</h1>
      <p>An unexpected error occurred. Please try reloading the page.</p>
      <button onClick={() => window.location.reload()} style={{ padding: '0.5rem 1rem', cursor: 'pointer' }}>
        Reload
      </button>
    </div>
  );
}

createRoot(document.getElementById('root')).render(
  <Sentry.ErrorBoundary fallback={<FallbackUI />}>
    <AuthProvider>
      <SubscriptionProvider>
        <App />
      </SubscriptionProvider>
    </AuthProvider>
  </Sentry.ErrorBoundary>
);
