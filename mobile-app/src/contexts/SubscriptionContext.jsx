// SubscriptionContext — mobile port of the web SubscriptionContext.
// Tier derivation (subscription/beta/comp → guest|free|pro) is identical and
// still reads from the shared `subscriptions` table.
// Purchasing runs through native Apple StoreKit 2 IAP (ADR-028): purchasePro
// drives the native purchase sheet, then posts the verified transaction JWS to
// the sync-apple-purchase edge function (with App Store Server Notifications as
// the durable backstop) so the tier flips on both the app and the website. The
// billing portal branches by provider — Apple purchases open Apple's
// subscription management, Stripe purchases open the Stripe billing portal.
import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '../../shared/utils/supabaseClient';
import { useAuth } from './AuthContext';
import { trackEvent } from '../../shared/utils/analytics';
import {
  SUPABASE_FUNCTIONS_URL, SUPABASE_ANON_KEY,
  APPLE_MANAGE_SUBSCRIPTIONS_URL, WEB_APP_URL,
} from '../../shared/config';
import {
  initIap, endIap, purchaseSubscription, getActivePurchases, finishPurchase, jwsOf,
} from '../iap';

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

  // Open the StoreKit connection once so products load quickly and the purchase
  // listeners are live before the user taps Subscribe (ADR-028). No-op off iOS.
  useEffect(() => {
    initIap().catch(() => {});
    return () => { endIap().catch(() => {}); };
  }, []);

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

  // POST a verified StoreKit 2 transaction JWS to the sync-apple-purchase edge
  // function, which validates Apple's signature and upserts the subscriptions
  // row (ADR-028). This is the immediate cross-platform write; App Store Server
  // Notifications reconcile the same row later. Returns { status } or { error }.
  const syncApplePurchase = useCallback(async (accessToken, transactionJws) => {
    try {
      const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/sync-apple-purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ transactionJws }),
      });
      return await response.json();
    } catch {
      return { error: 'Could not reach the server. Check your connection.' };
    }
  }, []);

  // Buy Pro via the native Apple purchase sheet (ADR-028). `productId` is an
  // App Store product ID. The Supabase user id is passed as the StoreKit
  // appAccountToken so the server can map the transaction back to this account.
  // Returns { status: 'success' | 'canceled' } or { error }.
  const purchasePro = useCallback(async (productId) => {
    if (!supabase || !productId) return { error: 'Purchases are not available.' };
    const { data: { session } } = await supabase.auth.getSession();
    const userId = userIdRef.current;
    if (!session || !userId) return { error: 'Sign in to subscribe.' };
    trackEvent('subscription_checkout_started');

    let purchase;
    try {
      purchase = await purchaseSubscription(productId, userId);
    } catch {
      return { error: 'The purchase could not be completed.' };
    }
    if (purchase?.cancelled) return { status: 'canceled' };

    const jws = jwsOf(purchase);
    let syncResult = null;
    if (jws) syncResult = await syncApplePurchase(session.access_token, jws);
    // Clear the transaction from the StoreKit queue now that the server has it.
    await finishPurchase(purchase);

    if (syncResult?.error) return { error: syncResult.error };
    await finalizeCheckout();
    return { status: 'success' };
  }, [finalizeCheckout, syncApplePurchase]);

  // Restore Purchases (required by Apple): re-sync every active StoreKit
  // entitlement for the signed-in Apple ID, then refetch the tier.
  const restorePurchases = useCallback(async () => {
    if (!supabase) return { error: 'Restore is not available.' };
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { error: 'Sign in to restore your purchase.' };

    let purchases;
    try {
      purchases = await getActivePurchases();
    } catch {
      return { error: 'Could not restore purchases.' };
    }
    let synced = 0;
    for (const purchase of purchases) {
      const jws = jwsOf(purchase);
      if (!jws) continue;
      const result = await syncApplePurchase(session.access_token, jws);
      if (!result?.error) synced += 1;
    }
    const sub = await refetchSubscription();
    const active = sub?.status === 'active' || sub?.status === 'trialing';
    if (active) return { status: 'restored' };
    return synced === 0 ? { status: 'none' } : { status: 'inactive' };
  }, [refetchSubscription, syncApplePurchase]);

  // Manage subscription. Apple-purchased subscriptions can only be managed in
  // Apple's account settings (ADR-028); Stripe-purchased ones use the Stripe
  // billing portal via the existing create-portal-session edge function.
  const openBillingPortal = useCallback(async () => {
    if (subscription?.provider === 'apple') {
      await WebBrowser.openBrowserAsync(APPLE_MANAGE_SUBSCRIPTIONS_URL);
      return { status: 'done' };
    }
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
        body: JSON.stringify({ returnUrl: WEB_APP_URL }),
      });
      data = await response.json();
    } catch {
      return { error: 'Could not reach billing. Check your connection.' };
    }
    if (!data?.url) return { error: data?.error || 'Could not open billing.' };

    await WebBrowser.openBrowserAsync(data.url);
    await refetchSubscription();
    return { status: 'done' };
  }, [subscription, refetchSubscription]);

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
      purchasePro,
      restorePurchases,
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
