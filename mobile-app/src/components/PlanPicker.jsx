// PlanPicker — Pro subscription chooser. Purchasing is native Apple StoreKit 2
// IAP (ADR-028): Subscribe opens the system purchase sheet via purchasePro
// instead of a Stripe checkout browser session. Promo codes are web-only (Apple
// Offer Codes are a future path), so there is no promo field here. Plans mirror
// the web PlanPicker ($20/mo, $67/yr) but are keyed by App Store product ID.
import React, { useState } from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { X, Check } from 'lucide-react-native';
import { colors, spacing, radii, type } from '../theme';
import { useSubscription } from '../contexts/SubscriptionContext';
import {
  APPLE_PRO_MONTHLY_PRODUCT_ID, APPLE_PRO_YEARLY_PRODUCT_ID,
} from '../../shared/config';
import { Button } from './ui';

const PLANS = {
  monthly: { price: 20, label: 'Monthly', period: '/mo', productId: APPLE_PRO_MONTHLY_PRODUCT_ID },
  seasonal: { price: 67, label: 'Annual', period: '/yr', badge: 'Save 72%', productId: APPLE_PRO_YEARLY_PRODUCT_ID },
};

export default function PlanPicker({ visible, onClose }) {
  const { purchasePro, checkoutFinalizing } = useSubscription();

  const [interval, setInterval] = useState('seasonal');
  const [loading, setLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');

  const plan = PLANS[interval];

  async function handleSubscribe() {
    if (!plan.productId || loading) return;
    setLoading(true);
    setCheckoutError('');
    const result = await purchasePro(plan.productId);
    setLoading(false);
    if (result?.error) {
      setCheckoutError(result.error);
    } else if (result?.status === 'success') {
      onClose();
    }
    // 'canceled' — leave the sheet open so the user can try again.
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
                active={interval === key}
                onPress={() => setInterval(key)}
              />
            ))}
          </View>

          {checkoutError ? (
            <Text style={{ color: colors.negative, fontSize: 13, marginTop: spacing.md }}>{checkoutError}</Text>
          ) : null}

          <View style={{ marginTop: spacing.lg }}>
            <Button
              title={checkoutFinalizing ? 'Finalizing…' : loading ? 'Opening App Store…' : 'Subscribe'}
              onPress={handleSubscribe}
              disabled={busy || !plan.productId}
            />
          </View>
          <Text style={[type.muted, { textAlign: 'center', marginTop: spacing.md }]}>
            Billed through your Apple ID. Manage or cancel anytime in Settings.
          </Text>
        </View>
      </View>
    </Modal>
  );
}

function PlanCard({ plan, active, onPress }) {
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
        <Text style={{ color: colors.textPrimary, fontSize: 22, fontWeight: '700' }}>${plan.price}</Text>
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
});
