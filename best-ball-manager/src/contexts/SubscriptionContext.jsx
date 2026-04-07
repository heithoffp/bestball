import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../utils/supabaseClient';
import { useAuth } from './AuthContext';
import { trackEvent } from '../utils/analytics';

const SubscriptionContext = createContext(null);

const SUPABASE_FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : null;

export function SubscriptionProvider({ children }) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [profile, setProfile] = useState(null);
  const [trialUsed, setTrialUsed] = useState(false);
  const [loading, setLoading] = useState(true);

  // Beta access derived state
  const betaExpiresAt = profile?.beta_expires_at ? new Date(profile.beta_expires_at) : null;
  const isBetaActive = betaExpiresAt ? betaExpiresAt > new Date() : false;
  const isBetaExpired = betaExpiresAt ? betaExpiresAt <= new Date() : false;
  const betaDaysRemaining = isBetaActive
    ? Math.ceil((betaExpiresAt - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  // Derive tier from auth state + subscription status + beta flag
  // Subscription takes precedence over beta
  // ?demo=true unlocks pro features for demo/screenshot mode
  const isDemoMode = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === 'true';
  const hasActiveSubscription = subscription?.status === 'active' || subscription?.status === 'trialing';
  const tier = isDemoMode
    ? 'pro'
    : !user
      ? 'guest'
      : hasActiveSubscription || isBetaActive
        ? 'pro'
        : 'free';

  const isProUser = tier === 'pro';

  // Plan picker modal state
  const [planPickerOpen, setPlanPickerOpen] = useState(false);
  const [planPickerPromoCode, setPlanPickerPromoCode] = useState('');

  const openPlanPicker = useCallback((promoCode) => {
    setPlanPickerPromoCode(promoCode || '');
    setPlanPickerOpen(true);
  }, []);

  const closePlanPicker = useCallback(() => {
    setPlanPickerOpen(false);
    setPlanPickerPromoCode('');
  }, []);

  // Fetch subscription and profile on user change
  useEffect(() => {
    if (!user || !supabase) {
      /* eslint-disable react-hooks/set-state-in-effect */
      setSubscription(null);
      setProfile(null);
      setTrialUsed(false);
      setLoading(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }

    let cancelled = false;

    async function fetchUserData() {
      setLoading(true);

      const [subResult, profileResult, anySubResult] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('*')
          .eq('user_id', user.id)
          .in('status', ['active', 'trialing', 'past_due'])
          .limit(1)
          .maybeSingle(),
        supabase
          .from('profiles')
          .select('beta_expires_at')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('subscriptions')
          .select('id')
          .eq('user_id', user.id)
          .limit(1)
          .maybeSingle(),
      ]);

      if (!cancelled) {
        if (subResult.error) {
          console.error('Error fetching subscription:', subResult.error);
          setSubscription(null);
        } else {
          setSubscription(subResult.data);
        }

        if (profileResult.error) {
          console.error('Error fetching profile:', profileResult.error);
          setProfile(null);
        } else {
          setProfile(profileResult.data);
        }

        setTrialUsed(anySubResult.data !== null);

        setLoading(false);
      }
    }

    fetchUserData();

    // Subscribe to realtime changes for instant updates after checkout
    const channel = supabase
      .channel('subscription-changes')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'subscriptions',
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          if (payload.new) {
            setSubscription(payload.new);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      channel.unsubscribe();
    };
  }, [user]);

  const redirectToCheckout = useCallback(async (priceId, { trialDays, promoCode } = {}) => {
    if (!user || !supabase || !SUPABASE_FUNCTIONS_URL) {
      console.error('Cannot create checkout session: missing auth or Supabase config');
      return;
    }
    trackEvent('subscription_checkout_started');

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('No active session for checkout');
      return;
    }

    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/create-checkout-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        priceId,
        trialDays,
        promoCode: promoCode || undefined,
        successUrl: `${window.location.origin}?checkout=success`,
        cancelUrl: `${window.location.origin}?checkout=canceled`,
      }),
    });

    const data = await response.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      console.error('Checkout session error:', data.error);
    }
  }, [user]);

  const redirectToPortal = useCallback(async () => {
    if (!user || !supabase || !SUPABASE_FUNCTIONS_URL) {
      console.error('Cannot create portal session: missing auth or Supabase config');
      return;
    }

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      console.error('No active session for portal');
      return;
    }

    const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/create-portal-session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${session.access_token}`,
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({
        returnUrl: window.location.origin,
      }),
    });

    const data = await response.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      console.error('Portal session error:', data.error);
    }
  }, [user]);

  return (
    <SubscriptionContext.Provider value={{
      tier,
      status: subscription?.status ?? null,
      isProUser,
      subscription,
      loading,
      trialUsed,
      isBetaActive,
      isBetaExpired,
      betaDaysRemaining,
      betaExpiresAt,
      redirectToCheckout,
      redirectToPortal,
      planPickerOpen,
      planPickerPromoCode,
      openPlanPicker,
      closePlanPicker,
    }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (ctx === null) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
}
