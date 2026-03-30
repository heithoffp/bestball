import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabaseClient';
import AuthModal from './AuthModal';

export default function AuthButton() {
  const { user, loading, signOut } = useAuth();
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
        <button className="toolbar-btn" onClick={signOut}>
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
