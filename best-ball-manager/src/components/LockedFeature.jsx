import React from 'react';
import { Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import styles from './LockedFeature.module.css';

export default function LockedFeature({ featureName, onSignUp }) {
  const { user } = useAuth();
  const { redirectToCheckout } = useSubscription();

  const priceId = import.meta.env.VITE_STRIPE_PRO_PRICE_ID;

  function handleUpgrade() {
    if (user) {
      redirectToCheckout(priceId);
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
      <button className={styles.upgradeBtn} onClick={handleUpgrade}>
        {user ? 'Upgrade to Pro' : 'Sign Up to Unlock'}
      </button>
    </div>
  );
}
