import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSubscription } from '../contexts/SubscriptionContext';
import { supabase } from '../utils/supabaseClient';
import AuthModal from './AuthModal';

export default function AuthButton() {
  const { user, loading, signOut } = useAuth();
  const { isProUser, openPlanPicker } = useSubscription();
  const [modalOpen, setModalOpen] = useState(false);

  if (!supabase) return null;
  if (loading) return null;

  if (user) {
    return (
      <div className="auth-button-group">
        {user.user_metadata?.avatar_url && (
          <img
            src={user.user_metadata.avatar_url}
            alt=""
            className="auth-avatar"
          />
        )}
        {!isProUser && (
          <button className="toolbar-btn toolbar-btn--upgrade" onClick={openPlanPicker}>
            Start Free Trial
          </button>
        )}
        <button className="toolbar-btn toolbar-btn--ghost" onClick={signOut}>
          Sign out
        </button>
      </div>
    );
  }

  return (
    <>
      <button className="toolbar-btn" onClick={() => setModalOpen(true)}>
        Sign In
      </button>
      <AuthModal isOpen={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  );
}
