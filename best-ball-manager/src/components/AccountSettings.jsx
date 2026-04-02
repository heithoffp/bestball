import React, { useState } from 'react';
import { X, CreditCard, ArrowUpCircle, AlertTriangle, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { supabase } from '../utils/supabaseClient';
import styles from './AccountSettings.module.css';

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
  active: 'var(--positive)',
  trialing: 'var(--accent)',
  past_due: 'var(--negative)',
  canceled: 'var(--text-muted)',
};

const SUPABASE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : null;

export default function AccountSettings({ isOpen, onClose }) {
  const { user, signOut } = useAuth();
  const { tier, status, subscription, isProUser, openPlanPicker, redirectToPortal } = useSubscription();
  const [loading, setLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleteError, setDeleteError] = useState(null);

  if (!isOpen) return null;

  const displayName = user?.user_metadata?.full_name ?? user?.user_metadata?.name ?? null;

  const tierLabel = tier === 'pro' ? 'Pro' : tier === 'free' ? 'Free' : 'Guest';
  const tierColor = tier === 'pro' ? 'var(--accent)' : 'var(--text-muted)';
  const renewalDate = formatDate(subscription?.current_period_end);
  const cancelAtPeriodEnd = subscription?.cancel_at_period_end;
  const trialDaysRemaining = status === 'trialing' && subscription?.current_period_end
    ? Math.max(0, Math.ceil((new Date(subscription.current_period_end) - new Date()) / (1000 * 60 * 60 * 24)))
    : null;

  async function handleManageBilling() {
    setLoading(true);
    await redirectToPortal();
    setLoading(false);
  }

  function handleUpgrade() {
    openPlanPicker();
    onClose();
  }

  async function handleSignOut() {
    await signOut();
    onClose();
  }

  async function handleDeleteAccount() {
    setLoading(true);
    setDeleteError(null);
    const { data: refreshData } = await supabase.auth.refreshSession();
    const session = refreshData?.session;
    if (!session) {
      setDeleteError('Session expired — please sign out and sign back in, then try again.');
      setLoading(false);
      return;
    }
    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/delete-account`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
    });
    const data = await response.json();
    if (data.error) {
      setDeleteError('Something went wrong. Please try again.');
      setLoading(false);
      return;
    }
    await signOut();
    onClose();
  }

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <button className="modal-close-btn" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>

        <h3 className={styles.heading}>Account</h3>

        <div className={styles.section}>
          {displayName && (
            <div className={styles.row}>
              <span className={styles.label}>Name</span>
              <span className={styles.value}>{displayName}</span>
            </div>
          )}
          {user?.email && (
            <div className={styles.row}>
              <span className={styles.label}>Email</span>
              <span className={styles.value}>{user.email}</span>
            </div>
          )}
        </div>

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
                {status === 'trialing' && trialDaysRemaining != null
                  ? `Trial — ${trialDaysRemaining} day${trialDaysRemaining !== 1 ? 's' : ''} remaining`
                  : STATUS_LABELS[status] || status}
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
            <button className={styles.primaryBtn} onClick={handleUpgrade}>
              <ArrowUpCircle size={16} />
              {loading ? 'Redirecting...' : 'Upgrade to Pro'}
            </button>
          )}
          <button className={styles.secondaryBtn} onClick={handleSignOut} disabled={loading}>
            <LogOut size={16} />
            Sign Out
          </button>
        </div>

        {supabase && SUPABASE_FUNCTIONS_URL && (
          <div className={styles.dangerZone}>
            {!deleteConfirm ? (
              <button className={styles.dangerLink} onClick={() => setDeleteConfirm(true)}>
                Delete account
              </button>
            ) : (
              <div className={styles.deleteConfirm}>
                <p className={styles.deleteWarning}>
                  This will permanently delete your account and all data. This cannot be undone.
                </p>
                {deleteError && <p className={styles.deleteError}>{deleteError}</p>}
                <div className={styles.deleteActions}>
                  <button className={styles.cancelBtn} onClick={() => { setDeleteConfirm(false); setDeleteError(null); }} disabled={loading}>
                    Cancel
                  </button>
                  <button className={styles.destructiveBtn} onClick={handleDeleteAccount} disabled={loading}>
                    {loading ? 'Deleting...' : 'Delete permanently'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
