// SubscriptionContext — mobile port of the web SubscriptionContext.
// Tier derivation (subscription/beta/comp → guest|free|pro) is identical.
// Checkout and the billing portal are desktop steps: Apple's IAP rules keep
// purchases out of the app, so upgrade paths open the website instead
// (see openUpgradeOnWeb / openBillingOnWeb).
import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../../shared/utils/supabaseClient';
import { useAuth } from './AuthContext';
import { trackEvent } from '../../shared/utils/analytics';
import { WEB_APP_URL } from '../../shared/config';

const SubscriptionContext = createContext(null);

export function SubscriptionProvider({ children }) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Beta access derived state
  const betaExpiresAt = profile?.beta_expires_at ? new Date(profile.beta_expires_at) : null;
  const isBetaActive = betaExpiresAt ? betaExpiresAt > new Date() : false;
  const isBetaExpired = betaExpiresAt ? betaExpiresAt <= new Date() : false;
  const betaDaysRemaining = isBetaActive
    ? Math.ceil((betaExpiresAt - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  // Comp access (admin-granted). Independent of beta.
  const compExpiresAt = profile?.comp_expires_at ? new Date(profile.comp_expires_at) : null;
  const isCompActive = compExpiresAt ? compExpiresAt > new Date() : false;

  // Derive tier from auth state + subscription status + beta/comp flags.
  const hasActiveSubscription = subscription?.status === 'active' || subscription?.status === 'trialing';
  const tier = !user
    ? 'guest'
    : hasActiveSubscription || isBetaActive || isCompActive
      ? 'pro'
      : 'free';

  const isProUser = tier === 'pro';

  useEffect(() => {
    if (!user || !supabase) {
      setSubscription(null);
      setProfile(null);
      setLoading(false);
      return;
    }

    let cancelled = false;

    async function fetchUserData() {
      setLoading(true);

      const [subResult, profileResult] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ['active', 'trialing', 'past_due'])
          .limit(1)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('beta_expires_at, comp_expires_at')
          .eq('id', user.id)
          .maybeSingle(),
      ]);

      if (!cancelled) {
        setSubscription(subResult.error ? null : subResult.data);
        setProfile(profileResult.error ? null : profileResult.data);
        setLoading(false);
      }
    }

    fetchUserData();

    const channel = supabase
      .channel('subscription-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'subscriptions', filter: `user_id=eq.${user.id}` },
        (payload) => {
          if (payload.new) setSubscription(payload.new);
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      channel.unsubscribe();
    };
  }, [user]);

  // Desktop hand-offs — subscriptions are managed on the website.
  const openUpgradeOnWeb = useCallback(async () => {
    trackEvent('subscription_upgrade_web_handoff');
    await WebBrowser.openBrowserAsync(`${WEB_APP_URL}?upgrade=1`);
  }, []);

  const openBillingOnWeb = useCallback(async () => {
    await WebBrowser.openBrowserAsync(WEB_APP_URL);
  }, []);

  return (
    <SubscriptionContext.Provider value={{
      tier,
      status: subscription?.status ?? null,
      isProUser,
      subscription,
      loading,
      isBetaActive,
      isBetaExpired,
      betaDaysRemaining,
      betaExpiresAt,
      isCompActive,
      compExpiresAt,
      openUpgradeOnWeb,
      openBillingOnWeb,
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (ctx === null) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
}
