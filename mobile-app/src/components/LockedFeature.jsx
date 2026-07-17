// LockedFeature — mobile port of the web LockedFeature gate. Pro features show
// this for guest/free tiers; upgrading opens the in-app plan picker (ADR-027).
import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { Lock } from 'lucide-react-native';
import { colors, spacing, type } from '../theme';
import { useAuth } from '../contexts/AuthContext';
import { Button } from './ui';
import PlanPicker from './PlanPicker';

export default function LockedFeature({ featureName }) {
  const router = useRouter();
  const { user } = useAuth();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <View style={styles.wrap}>
      <View style={styles.iconRing}>
        <Lock size={26} color={colors.accent} />
      </View>
      <Text style={[type.h2, { marginTop: spacing.lg }]}>{featureName} is a Pro feature</Text>
      <Text style={[type.secondary, { textAlign: 'center', marginTop: spacing.sm, lineHeight: 20, maxWidth: 300 }]}>
        {user
          ? 'Upgrade to Pro to unlock this tab — the same subscription works on BestBallExposures.com.'
          : 'Sign in to your Best Ball Exposures account, or create one, to get started.'}
      </Text>
      <View style={{ marginTop: spacing.xl, gap: spacing.sm, alignSelf: 'stretch', paddingHorizontal: spacing.xl }}>
        {user ? (
          <Button title="Upgrade to Pro" onPress={() => setPickerOpen(true)} />
        ) : (
          <Button title="Sign in" onPress={() => router.push('/account')} />
        )}
      </View>
      <PlanPicker visible={pickerOpen} onClose={() => setPickerOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.xl },
  iconRing: {
    width: 64, height: 64, borderRadius: 32,
    backgroundColor: colors.accentMuted,
    alignItems: 'center', justifyContent: 'center',
  },
});
