// MobileCheckoutReturn — standalone https landing page for the iOS app's
// Stripe Checkout / billing-portal round-trip (ADR-027). Stripe requires
// https success/cancel/return URLs, so the app points Stripe here and this
// page immediately deep-links back into the app. The app normally intercepts
// the redirect inside its auth browser session; this page's visible UI only
// matters when the user broke out into plain Safari.
import React, { useEffect } from 'react';

const DEEP_LINK_BASE = 'bbexposures://checkout-return';

const COPY = {
  success: {
    title: 'Payment complete',
    body: 'Your Pro subscription is active. Head back to the app — it updates within a few seconds.',
  },
  canceled: {
    title: 'Checkout canceled',
    body: 'No charge was made. You can restart the upgrade from the app at any time.',
  },
  portal: {
    title: 'Billing updated',
    body: 'Any subscription changes are reflected in the app after you return.',
  },
};

export default function MobileCheckoutReturn() {
  const status = new URLSearchParams(window.location.search).get('status') || 'success';
  const { title, body } = COPY[status] || COPY.success;
  const deepLink = `${DEEP_LINK_BASE}?status=${encodeURIComponent(status)}`;

  useEffect(() => {
    // Fire the app deep link on load. Inside the app's auth session this
    // redirect is intercepted and the sheet closes; in plain Safari it opens
    // the app if installed, and the button below is the manual fallback.
    window.location.href = deepLink;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: '0.75rem',
      padding: '2rem',
      textAlign: 'center',
      background: 'var(--surface-0, #0d1117)',
      color: 'var(--text-primary, #e6edf3)',
    }}>
      <h1 style={{ margin: 0, fontSize: '1.4rem' }}>{title}</h1>
      <p style={{ margin: 0, maxWidth: 420, color: 'var(--text-muted, #8b949e)', fontSize: '0.95rem', lineHeight: 1.5 }}>
        {body}
      </p>
      <a
        href={deepLink}
        style={{
          marginTop: '1rem',
          padding: '0.75rem 1.5rem',
          background: 'var(--accent, #e8bf4a)',
          color: '#000',
          borderRadius: '10px',
          fontWeight: 600,
          textDecoration: 'none',
          fontSize: '0.95rem',
        }}
      >
        Return to the Best Ball Exposures app
      </a>
    </div>
  );
}
