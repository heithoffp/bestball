import React from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import styles from './LockedFeature.module.css';

export default function LockedFeature({ featureName, onSignUp }) {
  const { user } = useAuth();
  const { openPlanPicker } = useSubscription();

  function handleUpgrade() {
    if (user) {
      openPlanPicker();
    } else if (onSignUp) {
      onSignUp();
    }
  }

  return (
    <div className={styles.overlay}>
      <Lock size={48} className={styles.icon} />
      <h2 className={styles.title}>{featureName} is a Pro feature</h2>
      <p className={styles.description}>
        Upgrade to Pro for full access to {featureName} and all advanced analytics.
      </p>
      <p className={styles.trialHint}>Start with a 7-day free trial — no charge until day 8.</p>
      <button className={styles.upgradeBtn} onClick={handleUpgrade}>
        {user ? 'Start Free Trial' : 'Sign Up to Unlock'}
      </button>
    </div>
  );
}
