import React, { useEffect, useMemo, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import BrandLogo from './BrandLogo';

/**
 * Standalone /unsubscribe?token=<uuid> page — no auth required.
 * Calls the SECURITY DEFINER `unsubscribe_digest` RPC to flip the user's
 * weekly_digest preference to false using the token from the email link.
 */
export default function Unsubscribe() {
  const token = useMemo(() => new URLSearchParams(window.location.search).get('token'), []);
  // Resolve the synchronous cases (missing token / no client) up front so the
  // effect only ever performs the async RPC.
  const [status, setStatus] = useState(() => {
    if (!token) return 'invalid';
    if (!supabase) return 'error';
    return 'working'; // working | done | invalid | error
  });

  useEffect(() => {
    if (status !== 'working') return undefined;
    let cancelled = false;
    supabase
      .rpc('unsubscribe_digest', { p_token: token })
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setStatus('error');
        else setStatus(data === true ? 'done' : 'invalid');
      })
      .catch(() => { if (!cancelled) setStatus('error'); });
    return () => { cancelled = true; };
  }, [status, token]);

  const message = {
    working: 'Updating your preferences…',
    done: "You're unsubscribed from the weekly portfolio digest. You can re-enable it anytime from your account settings.",
    invalid: 'This unsubscribe link is invalid or has already been used.',
    error: 'Something went wrong. Please email support@bestballexposures.com and we’ll remove you manually.',
  }[status];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: 24 }}>
      <div style={{ maxWidth: 440, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 16, padding: 32, textAlign: 'center' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 16 }}><BrandLogo /></div>
        <h1 style={{ font: '700 20px/1.3 system-ui, sans-serif', color: '#0f172a', margin: '0 0 12px' }}>Weekly digest</h1>
        <p style={{ font: '400 15px/1.6 system-ui, sans-serif', color: '#475569', margin: 0 }}>{message}</p>
        <a href="/" style={{ display: 'inline-block', marginTop: 20, color: '#7c3aed', textDecoration: 'none', fontWeight: 600 }}>← Back to Best Ball Exposures</a>
      </div>
    </div>
  );
}
