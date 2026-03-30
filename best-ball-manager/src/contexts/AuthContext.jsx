import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../utils/supabaseClient';
import { clearAllData } from '../utils/storage';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [recoveryMode, setRecoveryMode] = useState(false);

  const emailVerified = user?.email_confirmed_at != null;

  useEffect(() => {
    if (!supabase) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setLoading(false);
      return;
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      if (event === 'PASSWORD_RECOVERY') setRecoveryMode(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  function clearError() {
    setAuthError(null);
  }

  async function signInWithGoogle() {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    });
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
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    if (error) setAuthError(error.message);
    return { error };
  }

  async function updatePassword(newPassword) {
    if (!supabase) return { error: { message: 'Auth is not available.' } };
    setAuthError(null);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (!error) setRecoveryMode(false);
    else setAuthError(error.message);
    return { error };
  }

  async function signOut() {
    await clearAllData();
    if (!supabase) return;
    await supabase.auth.signOut();
  }

  return (
    <AuthContext.Provider value={{
      user, loading, emailVerified, authError, clearError,
      signInWithGoogle, signOut,
      signUpWithEmail, signInWithEmail, resetPassword, updatePassword,
      recoveryMode,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (ctx === null) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
