// AuthContext — mobile port of best-ball-manager/src/contexts/AuthContext.jsx.
// Differences from web: no Chrome-extension session push, and password reset
// hands off to the website. Google and Apple sign-in use native SDKs and
// exchange the provider ID token via supabase.auth.signInWithIdToken (ADR-029) —
// this supersedes the earlier email-only design (adding Google on iOS triggers
// App Store Guideline 4.8, which is why Sign in with Apple ships alongside it).
import React, { createContext, useContext, useEffect, useState } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { supabase } from '../../shared/utils/supabaseClient';
import { clearAllData } from '../../shared/utils/storage';
import { isAuthorEmail } from '../../shared/utils/authorPreview';
import {
  WEB_APP_URL, SUPABASE_FUNCTIONS_URL, SUPABASE_ANON_KEY,
  GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID,
} from '../../shared/config';

// Configure Google Sign-In once at module load. The web (server) client ID is
// the audience Supabase validates the returned ID token against; without it the
// button stays hidden (see googleEnabled below).
const googleEnabled = !!(GOOGLE_IOS_CLIENT_ID && GOOGLE_WEB_CLIENT_ID);
if (googleEnabled) {
  GoogleSignin.configure({
    iosClientId: GOOGLE_IOS_CLIENT_ID,
    webClientId: GOOGLE_WEB_CLIENT_ID,
  });
}

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appleAvailable, setAppleAvailable] = useState(false);

  const emailVerified = user?.email_confirmed_at != null;
  const isAuthor = isAuthorEmail(user?.email);

  useEffect(() => {
    // Sign in with Apple is iOS 13+ only; hide the button where unavailable.
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => setAppleAvailable(false));
  }, []);

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

  // Native Sign in with Apple → exchange the returned identity token for a
  // Supabase session (ADR-029). No client nonce: the expo-apple-authentication
  // flow follows Supabase's documented native pattern, which omits it.
  async function signInWithApple() {
    if (!supabase) return { error: { message: 'Auth is not available.' } };
    setAuthError(null);
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        const error = { message: 'Apple did not return an identity token.' };
        setAuthError(error.message);
        return { error };
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) setAuthError(error.message);
      return { error };
    } catch (e) {
      // User dismissed the native sheet — not an error worth surfacing.
      if (e?.code === 'ERR_REQUEST_CANCELED') return { error: null };
      const message = e?.message || 'Apple sign-in failed.';
      setAuthError(message);
      return { error: { message } };
    }
  }

  // Native Google Sign-In → exchange the returned ID token for a Supabase
  // session (ADR-029). GoogleSignin is pre-configured at module load.
  async function signInWithGoogle() {
    if (!supabase) return { error: { message: 'Auth is not available.' } };
    if (!googleEnabled) return { error: { message: 'Google sign-in is not configured.' } };
    setAuthError(null);
    try {
      await GoogleSignin.hasPlayServices();
      const response = await GoogleSignin.signIn();
      const idToken = response?.data?.idToken ?? response?.idToken;
      if (!idToken) {
        // A cancelled sign-in returns no token — treat as a silent dismiss.
        if (response?.type === 'cancelled') return { error: null };
        const error = { message: 'Google did not return an ID token.' };
        setAuthError(error.message);
        return { error };
      }
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'google',
        token: idToken,
      });
      if (error) setAuthError(error.message);
      return { error };
    } catch (e) {
      if (e?.code === statusCodes.SIGN_IN_CANCELLED) return { error: null };
      const message = e?.message || 'Google sign-in failed.';
      setAuthError(message);
      return { error: { message } };
    }
  }

  async function signOut() {
    if (googleEnabled) {
      // Clear the cached Google account so the next sign-in shows the picker.
      try { await GoogleSignin.signOut(); } catch { /* not signed in via Google */ }
    }
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
      // The auth user is gone server-side — clear local state only.
      await clearAllData();
      await supabase.auth.signOut({ scope: 'local' });
      // hadActiveAppleSub: Apple IAP can't be canceled server-side, so the UI
      // reminds the user to cancel it in iOS Settings (ADR-028).
      return { error: null, hadActiveAppleSub: !!data?.hadActiveAppleSub };
    } catch {
      return { error: { message: 'Could not delete account. Check your connection.' } };
    }
  }

  return (
    <AuthContext.Provider value={{
      user, loading, emailVerified, isAuthor, authError, clearError,
      signOut, signUpWithEmail, signInWithEmail, resetPassword, deleteAccount,
      signInWithApple, signInWithGoogle,
      appleAvailable, googleAvailable: googleEnabled,
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
