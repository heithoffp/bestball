import React, { useState } from 'react';
import { X } from 'lucide-react';
import { trackEvent } from '../utils/analytics';
import { APP_STORE_URL, AppleLogo } from './AppStoreBadge';
import styles from './AppStoreBanner.module.css';

const DISMISS_KEY = 'bbe:iosLaunchBannerDismissed';

/**
 * One-time launch announcement for the iOS app, shown inside the app shell
 * (signed-in and demo users). Dismissal is remembered per browser — the
 * persistent entry points live in the rail/sheet account cluster.
 */
export default function AppStoreBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(DISMISS_KEY) === '1'; } catch { return false; }
  });

  if (dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* private mode */ }
  };

  return (
    <div className={styles.banner} role="status">
      <span className={styles.appleMark}><AppleLogo size={15} /></span>
      <span className={styles.copy}>
        <strong>BBE for iPhone is on the App Store.</strong>
        <span className={styles.copyDetail}> Your whole portfolio on your phone — Pro members get the live draft overlay on every pick.</span>
      </span>
      <a
        href={APP_STORE_URL}
        target="_blank"
        rel="noopener noreferrer"
        className={styles.action}
        onClick={() => trackEvent('app_store_link_clicked', { placement: 'app_banner' })}
      >
        Get the app
      </a>
      <button className={styles.dismiss} onClick={dismiss} aria-label="Dismiss iPhone app announcement">
        <X size={14} />
      </button>
    </div>
  );
}
