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
  const [loading, setLoading] = useState(true);

  // Beta access derived state
  const betaExpiresAt = profile?.beta_expires_at ? new Date(profile.beta_expires_at) : null;
  const isBetaActive = betaExpiresAt ? betaExpiresAt > new Date() : false;
  const isBetaExpired = betaExpiresAt ? betaExpiresAt <= new Date() : false;
  const betaDaysRemaining = isBetaActive
    ? Math.ceil((betaExpiresAt - new Date()) / (1000 * 60 * 60 * 24))
    : null;

  // Comp access (admin-granted via scripts/grant-pro.mjs). Independent of beta.
  const compExpiresAt = profile?.comp_expires_at ? new Date(profile.comp_expires_at) : null;
  const isCompActive = compExpiresAt ? compExpiresAt > new Date() : false;

  // Derive tier from auth state + subscription status + beta/comp flags.
  // Subscription takes precedence; beta and comp are equivalent grants of Pro.
  const hasActiveSubscription = subscription?.status === 'active' || subscription?.status === 'trialing';
  const tier = !user
    ? 'guest'
    : hasActiveSubscription || isBetaActive || isCompActive
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
      setLoading(false);
      /* eslint-enable react-hooks/set-state-in-effect */
      return;
    }

    let cancelled = false;

    async function fetchUserData({ initial = false } = {}) {
      if (initial) setLoading(true);

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

        if (initial) setLoading(false);
      }

      return subResult.error ? null : subResult.data;
    }

    fetchUserData({ initial: true });

    // Targeted refetches instead of a realtime channel (TASK-361): the
    // postgres_changes subscription kept Realtime's WAL pollers running for
    // every signed-in session, and checkout completion is the only event it
    // ever delivered.
    //
    // 1. Checkout return: the Stripe webhook can land seconds after the
    //    redirect, so poll briefly until the subscription row shows up.
    // 2. Tab refocus: catches portal-driven changes (cancel / resubscribe)
    //    made in another tab without requiring a reload.
    let pollTimer = null;
    if (new URLSearchParams(window.location.search).get('checkout') === 'success') {
      let attempts = 0;
      pollTimer = setInterval(async () => {
        attempts += 1;
        const sub = await fetchUserData();
        const isActive = sub?.status === 'active' || sub?.status === 'trialing';
        if ((isActive || attempts >= 20 || cancelled) && pollTimer) {
          clearInterval(pollTimer);
          pollTimer = null;
        }
      }, 3000);
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') fetchUserData();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [user]);

  const redirectToCheckout = useCallback(async (priceId, { promoCode } = {}) => {
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
      isBetaActive,
      isBetaExpired,
      betaDaysRemaining,
      betaExpiresAt,
      isCompActive,
      compExpiresAt,
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
