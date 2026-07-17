// AuthContext — mobile port of best-ball-manager/src/contexts/AuthContext.jsx.
// Differences from web: no Chrome-extension session push, no Google OAuth
// (email/password only — adding a third-party login on iOS would trigger the
// Sign in with Apple requirement), and password reset hands off to the website.
import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../../shared/utils/supabaseClient';
import { clearAllData } from '../../shared/utils/storage';
import { isAuthorEmail } from '../../shared/utils/authorPreview';
import { WEB_APP_URL, SUPABASE_FUNCTIONS_URL, SUPABASE_ANON_KEY } from '../../shared/config';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  const emailVerified = user?.email_confirmed_at != null;
  const isAuthor = isAuthorEmail(user?.email);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  function clearError() {
    setAuthError(null);
  }

  async function signUpWithEmail(email, password) {
    if (!supabase) return { error: { message: 'Auth is not available.' } };
    setAuthError(null);
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) setAuthError(error.message);
    return { error };
  }

  async function signInWithEmail(email, password) {
    if (!supabase) return { error: { message: 'Auth is not available.' } };
    setAuthError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) setAuthError(error.message);
    return { error };
  }

  async function resetPassword(email) {
    if (!supabase) return { error: { message: 'Auth is not available.' } };
    setAuthError(null);
    // The recovery link opens the website, where the update-password flow lives.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: WEB_APP_URL,
    });
    if (error) setAuthError(error.message);
    return { error };
  }

  async function signOut() {
    await clearAllData();
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  // Permanently delete the account via the delete-account edge function
  // (App Review 5.1.1(v): deletion must be initiable in-app). The function
  // cancels any active Stripe subscription before removing data.
  async function deleteAccount() {
    if (!supabase) return { error: { message: 'Auth is not available.' } };
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: { message: 'Not signed in.' } };
    try {
      const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/delete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_ANON_KEY,
        },
      });
      const data = await response.json();
      if (!response.ok || data?.error) {
        return { error: { message: data?.error || 'Could not delete account.' } };
      }
    } catch {
      return { error: { message: 'Could not delete account. Check your connection.' } };
    }
    // The auth user is gone server-side — clear local state only.
    await clearAllData();
    await supabase.auth.signOut({ scope: 'local' });
    return { error: null };
  }

  return (
    <AuthContext.Provider value={{
      user, loading, emailVerified, isAuthor, authError, clearError,
      signOut, signUpWithEmail, signInWithEmail, resetPassword, deleteAccount,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
