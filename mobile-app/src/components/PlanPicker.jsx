// PlanPicker — mobile port of the web PlanPicker (best-ball-manager/src/
// components/PlanPicker.jsx). Same plans and promo-code validation flow;
// checkout opens Stripe in an auth browser session via startCheckout (ADR-027)
// instead of a full-page redirect.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, Modal, ActivityIndicator, StyleSheet } from 'react-native';
import { X, Check, Tag } from 'lucide-react-native';
import { colors, spacing, radii, type } from '../theme';
import { useSubscription } from '../contexts/SubscriptionContext';
import { supabase } from '../../shared/utils/supabaseClient';
import { trackEvent } from '../../shared/utils/analytics';
import {
  SUPABASE_FUNCTIONS_URL, SUPABASE_ANON_KEY,
  STRIPE_PRO_MONTHLY_PRICE_ID, STRIPE_PRO_YEARLY_PRICE_ID,
} from '../../shared/config';
import { Button } from './ui';

const PLANS = {
  monthly: { price: 20, label: 'Monthly', period: '/mo', priceId: STRIPE_PRO_MONTHLY_PRICE_ID },
  seasonal: { price: 67, label: 'Annual', period: '/yr', badge: 'Save 72%', priceId: STRIPE_PRO_YEARLY_PRICE_ID },
};

export default function PlanPicker({ visible, onClose }) {
  const { startCheckout, checkoutFinalizing } = useSubscription();

  const [interval, setInterval] = useState('seasonal');
  const [promoCode, setPromoCode] = useState('');
  const [promoState, setPromoState] = useState('idle'); // idle | validating | valid | invalid
  const [promoResult, setPromoResult] = useState(null);
  const [promoError, setPromoError] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  const plan = PLANS[interval];

  async function validatePromoCode() {
    const trimmed = promoCode.trim();
    if (!trimmed || !supabase) return;
    setPromoState('validating');
    setPromoError('');
    setPromoResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch(`${SUPABASE_FUNCTIONS_URL}/validate-promo-code`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(session ? { 'Authorization': `Bearer ${session.access_token}` } : {}),
          'apikey': SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await response.json();
      if (data.valid) {
        setPromoState('valid');
        setPromoResult(data);
        trackEvent('promo_code_applied', { success: true });
      } else {
        setPromoState('invalid');
        setPromoError(data.error || 'Invalid code');
        trackEvent('promo_code_applied', { success: false });
      }
    } catch {
      setPromoState('invalid');
      setPromoError('Could not validate code');
      trackEvent('promo_code_applied', { success: false });
    }
  }

  function handlePromoCodeChange(value) {
    setPromoCode(value.toUpperCase());
    if (promoState !== 'idle') {
      setPromoState('idle');
      setPromoResult(null);
      setPromoError('');
    }
  }

  function getDiscountedPrice(basePrice) {
    if (promoState !== 'valid' || !promoResult) return null;
    if (promoResult.percentOff) return Math.round(basePrice * (1 - promoResult.percentOff / 100));
    if (promoResult.amountOff) return Math.max(0, basePrice - promoResult.amountOff / 100);
    return null;
  }

  async function handleSubscribe() {
    if (!plan.priceId || loading) return;
    setLoading(true);
    setCheckoutError('');
    const result = await startCheckout(plan.priceId, {
      promoCode: promoState === 'valid' ? promoCode.trim() : undefined,
    });
    setLoading(false);
    if (result?.error) {
      setCheckoutError(result.error);
    } else if (result?.status === 'success') {
      onClose();
    }
  }

  const busy = loading || checkoutFinalizing;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <Pressable style={styles.closeBtn} onPress={onClose} hitSlop={10} disabled={busy}>
            <X size={18} color={colors.textSecondary} />
          </Pressable>

          <Text style={type.h2}>Choose Your Plan</Text>
          <Text style={[type.secondary, { marginTop: 4, marginBottom: spacing.lg }]}>
            Subscribe to unlock all Pro analytics features.
          </Text>

          <View style={{ flexDirection: 'row', gap: spacing.md, marginBottom: spacing.lg }}>
            {Object.entries(PLANS).map(([key, p]) => (
              <PlanCard
                key={key}
                plan={p}
                discountedPrice={getDiscountedPrice(p.price)}
                active={interval === key}
                onPress={() => setInterval(key)}
              />
            ))}
          </View>

          <Text style={[type.muted, { marginBottom: 6 }]}>Promo Code</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm }}>
            <TextInput
              style={[
                styles.promoInput,
                promoState === 'valid' && { borderColor: colors.positive },
                promoState === 'invalid' && { borderColor: colors.negative },
              ]}
              value={promoCode}
              onChangeText={handlePromoCodeChange}
              placeholder="Enter code"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="characters"
              autoCorrect={false}
              editable={promoState !== 'validating'}
              onSubmitEditing={validatePromoCode}
            />
            <Pressable
              style={[styles.applyBtn, promoState === 'valid' && { backgroundColor: colors.positive, borderColor: colors.positive }]}
              onPress={validatePromoCode}
              disabled={!promoCode.trim() || promoState === 'validating' || promoState === 'valid'}
            >
              {promoState === 'validating' ? (
                <ActivityIndicator size="small" color={colors.textPrimary} />
              ) : promoState === 'valid' ? (
                <Check size={14} color={colors.textInverse} />
              ) : null}
              <Text style={[styles.applyText, promoState === 'valid' && { color: colors.textInverse }]}>
                {promoState === 'valid' ? 'Applied' : promoState === 'validating' ? 'Checking' : 'Apply'}
              </Text>
            </Pressable>
          </View>

          {promoState === 'valid' && promoResult && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 }}>
              <Tag size={12} color={colors.positive} />
              <Text style={{ color: colors.positive, fontSize: 13, fontWeight: '500' }}>
                {promoCode.trim()} — {promoResult.discountLabel}
              </Text>
            </View>
          )}
          {promoState === 'invalid' && promoError ? (
            <Text style={{ color: colors.negative, fontSize: 13, marginTop: 6 }}>{promoError}</Text>
          ) : null}
          {checkoutError ? (
            <Text style={{ color: colors.negative, fontSize: 13, marginTop: spacing.md }}>{checkoutError}</Text>
          ) : null}

          <View style={{ marginTop: spacing.lg }}>
            <Button
              title={checkoutFinalizing ? 'Finalizing…' : loading ? 'Opening checkout…' : 'Subscribe'}
              onPress={handleSubscribe}
              disabled={busy || !plan.priceId}
            />
          </View>
          <Text style={[type.muted, { textAlign: 'center', marginTop: spacing.md }]}>
            Secure checkout by Stripe. Manage or cancel anytime.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function PlanCard({ plan, discountedPrice, active, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.planCard, active && { borderColor: colors.accent, backgroundColor: colors.accentMuted }]}
    >
      {plan.badge ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{plan.badge}</Text>
        </View>
      ) : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
        <View style={[styles.radio, active && { borderColor: colors.accent }]}>
          {active ? <Check size={10} color={colors.accent} /> : null}
        </View>
        <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }}>{plan.label}</Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, flexWrap: 'wrap' }}>
        {discountedPrice != null ? (
          <>
            <Text style={{ color: colors.textMuted, fontSize: 14, textDecorationLine: 'line-through' }}>
              ${plan.price}
            </Text>
            <Text style={{ color: colors.positive, fontSize: 22, fontWeight: '700' }}>${discountedPrice}</Text>
          </>
        ) : (
          <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '700' }}>${plan.price}</Text>
        )}
        <Text style={{ color: colors.textMuted, fontSize: 12 }}>{plan.period}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.lg,
  },
  sheet: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface1,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.xl,
  },
  closeBtn: { position: 'absolute', top: spacing.md, right: spacing.md, zIndex: 1 },
  planCard: {
    flex: 1,
    borderWidth: 2,
    borderColor: colors.borderDefault,
    borderRadius: radii.md,
    padding: spacing.md,
    position: 'relative',
  },
  badge: {
    position: 'absolute',
    top: -9,
    right: 8,
    backgroundColor: colors.positive,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  badgeText: { color: colors.textInverse, fontSize: 9, fontWeight: '700', textTransform: 'uppercase' },
  radio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.borderDefault,
    alignItems: 'center',
    justifyContent: 'center',
  },
  promoInput: {
    flex: 1,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    borderRadius: radii.md,
    color: colors.textPrimary,
    paddingHorizontal: spacing.md,
    height: 42,
    fontSize: 14,
    letterSpacing: 0.5,
  },
  applyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    backgroundColor: colors.surface2,
    justifyContent: 'center',
  },
  applyText: { color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
});
