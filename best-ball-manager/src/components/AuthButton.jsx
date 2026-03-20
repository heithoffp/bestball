import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabaseClient';

export default function AuthButton() {
  const { user, loading, signInWithGoogle, signOut } = useAuth();

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
    <button className="toolbar-btn" onClick={signInWithGoogle}>
      Sign in with Google
    </button>
  );
}
