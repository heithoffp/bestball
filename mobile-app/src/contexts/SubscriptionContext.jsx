// SubscriptionContext — mobile port of the web SubscriptionContext.
// Tier derivation (subscription/beta/comp → guest|free|pro) is identical.
// Checkout and the billing portal run in-app (ADR-027): Stripe Checkout opens
// in an auth browser session via the existing create-checkout-session edge
// function and returns through the bbexposures:// deep link; the tier flips
// via the realtime subscriptions channel plus a short finalizing poll.
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../../shared/utils/supabaseClient';
import { useAuth } from './AuthContext';
import { trackEvent } from '../../shared/utils/analytics';
import {
  SUPABASE_FUNCTIONS_URL, SUPABASE_ANON_KEY,
  CHECKOUT_RETURN_URL, CHECKOUT_DEEP_LINK,
} from '../../shared/config';

const SubscriptionContext = createContext(null);

export function SubscriptionProvider({ children }) {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checkoutFinalizing, setCheckoutFinalizing] = useState(false);
  const userIdRef = useRef(null);
  userIdRef.current = user?.id ?? null;

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

  // Re-query the subscription + profile rows on demand (after checkout or a
  // billing-portal round-trip). Returns the fresh subscription row, if any.
  const refetchSubscription = useCallback(async () => {
    const userId = userIdRef.current;
    if (!userId || !supabase) return null;
    const [subResult, profileResult] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .in('status', ['active', 'trialing', 'past_due'])
        .limit(1)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('beta_expires_at, comp_expires_at')
        .eq('id', userId)
        .maybeSingle(),
    ]);
    if (userIdRef.current !== userId) return null;
    setSubscription(subResult.error ? null : subResult.data);
    if (!profileResult.error) setProfile(profileResult.data);
    return subResult.error ? null : subResult.data;
  }, []);

  // Belt alongside the realtime channel: the stripe-webhook write can lag the
  // Checkout redirect by a few seconds, so poll briefly after a successful
  // return instead of leaving the user staring at a Free tier.
  const finalizeCheckout = useCallback(async () => {
    setCheckoutFinalizing(true);
    try {
      const deadline = Date.now() + 20000;
      while (Date.now() < deadline) {
        const sub = await refetchSubscription();
        if (sub?.status === 'active' || sub?.status === 'trialing') {
          trackEvent('subscription_checkout_completed');
          return true;
        }
        if (!userIdRef.current) return false;
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
      return false;
    } finally {
      setCheckoutFinalizing(false);
    }
  }, [refetchSubscription]);

  // In-app checkout (ADR-027): Stripe Checkout in an auth browser session.
  // The hosted return page redirects to the bbexposures:// deep link, which
  // dismisses the sheet. Returns { status } or { error }.
  const startCheckout = useCallback(async (priceId, { promoCode } = {}) => {
    if (!supabase || !priceId) return { error: 'Checkout is not available.' };
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Sign in to subscribe.' };
    trackEvent('subscription_checkout_started');

    let data;
    try {
      const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          priceId,
          promoCode: promoCode || undefined,
          successUrl: `${CHECKOUT_RETURN_URL}?status=success`,
          cancelUrl: `${CHECKOUT_RETURN_URL}?status=canceled`,
        }),
      });
      data = await response.json();
    } catch {
      return { error: 'Could not reach checkout. Check your connection.' };
    }
    if (!data?.url) return { error: data?.error || 'Could not start checkout.' };

    const result = await WebBrowser.openAuthSessionAsync(data.url, CHECKOUT_DEEP_LINK);
    const succeeded = result.type === 'success' && result.url?.includes('status=success');
    if (succeeded) {
      await finalizeCheckout();
      return { status: 'success' };
    }
    // Covers explicit cancel and a manual sheet dismiss after paying — the
    // realtime channel still flips the tier in the latter case.
    return { status: 'canceled' };
  }, [finalizeCheckout]);

  // Stripe billing portal, scoped to the user's customer via the existing
  // create-portal-session edge function.
  const openBillingPortal = useCallback(async () => {
    if (!supabase) return { error: 'Billing is not available.' };
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Sign in to manage billing.' };

    let data;
    try {
      const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/create-portal-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ returnUrl: `${CHECKOUT_RETURN_URL}?status=portal` }),
      });
      data = await response.json();
    } catch {
      return { error: 'Could not reach billing. Check your connection.' };
    }
    if (!data?.url) return { error: data?.error || 'Could not open billing.' };

    await WebBrowser.openAuthSessionAsync(data.url, CHECKOUT_DEEP_LINK);
    await refetchSubscription();
    return { status: 'done' };
  }, [refetchSubscription]);

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
      checkoutFinalizing,
      startCheckout,
      openBillingPortal,
      refetchSubscription,
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
