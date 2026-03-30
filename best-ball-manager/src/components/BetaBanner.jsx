import React, { useState } from 'react';
import { X, Clock, AlertTriangle } from 'lucide-react';
import { useSubscription } from '../contexts/SubscriptionContext';
import styles from './BetaBanner.module.css';

export default function BetaBanner() {
  const {
    tier,
    isBetaActive,
    isBetaExpired,
    betaDaysRemaining,
    openPlanPicker,
    subscription,
  } = useSubscription();
  const [dismissed, setDismissed] = useState(false);

  // Don't render for guests, non-beta users, paid subscribers, or if dismissed
  const hasActiveSubscription = subscription?.status === 'active' || subscription?.status === 'trialing';
  if (dismissed || hasActiveSubscription || tier === 'guest') return null;

  // Countdown mode: beta active, <=7 days remaining
  if (isBetaActive && betaDaysRemaining <= 7) {
    return (
      <div className={`${styles.banner} ${styles.info}`}>
        <Clock size={16} />
        <span>
          Your beta access expires in <strong>{betaDaysRemaining} day{betaDaysRemaining !== 1 ? 's' : ''}</strong>.
          Start a free trial to keep Pro features.
        </span>
        <button className={styles.action} onClick={() => openPlanPicker()}>
          Start Free Trial
        </button>
        <button className={styles.dismiss} onClick={() => setDismissed(true)} aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
    );
  }

  // Conversion mode: beta expired, user is free tier
  if (isBetaExpired && tier === 'free') {
    return (
      <div className={`${styles.banner} ${styles.warning}`}>
        <AlertTriangle size={16} />
        <span>
          Your beta access has ended. Start a 7-day free trial, or use code <strong>BETA25</strong> for 25% off.
        </span>
        <button className={styles.action} onClick={() => openPlanPicker('BETA25')}>
          Subscribe Now
        </button>
        <button className={styles.dismiss} onClick={() => setDismissed(true)} aria-label="Dismiss">
          <X size={14} />
        </button>
      </div>
    );
  }

  return null;
}
