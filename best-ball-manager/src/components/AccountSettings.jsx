import React, { useState } from 'react';
import { X, CreditCard, ArrowUpCircle, AlertTriangle } from 'lucide-react';
import { useSubscription } from '../contexts/SubscriptionContext';
import styles from './AccountSettings.module.css';

const STRIPE_PRO_PRICE_ID = import.meta.env.VITE_STRIPE_PRO_PRICE_ID;

function formatDate(dateStr) {
  if (!dateStr) return null;
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

const STATUS_LABELS = {
  active: 'Active',
  trialing: 'Trial',
  past_due: 'Past Due',
  canceled: 'Canceled',
};

const STATUS_COLORS = {
  active: 'var(--accent-green)',
  trialing: 'var(--accent-blue)',
  past_due: 'var(--accent-red)',
  canceled: 'var(--text-muted)',
};

export default function AccountSettings({ isOpen, onClose }) {
  const { tier, status, subscription, isProUser, redirectToCheckout, redirectToPortal } = useSubscription();
  const [loading, setLoading] = useState(false);

  if (!isOpen) return null;

  const tierLabel = tier === 'pro' ? 'Pro' : tier === 'free' ? 'Free' : 'Guest';
  const tierColor = tier === 'pro' ? 'var(--accent-blue)' : 'var(--text-muted)';
  const renewalDate = formatDate(subscription?.current_period_end);
  const cancelAtPeriodEnd = subscription?.cancel_at_period_end;

  async function handleManageBilling() {
    setLoading(true);
    await redirectToPortal();
    setLoading(false);
  }

  async function handleUpgrade() {
    if (!STRIPE_PRO_PRICE_ID) return;
    setLoading(true);
    await redirectToCheckout(STRIPE_PRO_PRICE_ID);
    setLoading(false);
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        <h3 className={styles.heading}>Account</h3>

        <div className={styles.section}>
          <div className={styles.row}>
            <span className={styles.label}>Plan</span>
            <span className={styles.tierBadge} style={{ background: `${tierColor}22`, color: tierColor }}>
              {tierLabel}
            </span>
          </div>

          {status && (
            <div className={styles.row}>
              <span className={styles.label}>Status</span>
              <span style={{ color: STATUS_COLORS[status] || 'var(--text-primary)', fontWeight: 500 }}>
                {STATUS_LABELS[status] || status}
              </span>
            </div>
          )}

          {isProUser && renewalDate && (
            <div className={styles.row}>
              <span className={styles.label}>{cancelAtPeriodEnd ? 'Ends on' : 'Renews on'}</span>
              <span className={styles.value}>{renewalDate}</span>
            </div>
          )}
        </div>

        {cancelAtPeriodEnd && (
          <div className={styles.warning}>
            <AlertTriangle size={16} />
            <span>Your subscription will end on {renewalDate}. You can resubscribe anytime from the billing portal.</span>
          </div>
        )}

        <div className={styles.actions}>
          {isProUser ? (
            <button className={styles.primaryBtn} onClick={handleManageBilling} disabled={loading}>
              <CreditCard size={16} />
              {loading ? 'Opening...' : 'Manage Billing'}
            </button>
          ) : (
            <button className={styles.primaryBtn} onClick={handleUpgrade} disabled={loading || !STRIPE_PRO_PRICE_ID}>
              <ArrowUpCircle size={16} />
              {loading ? 'Redirecting...' : 'Upgrade to Pro'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
