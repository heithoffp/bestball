// ScreenScaffold — per-tab chrome shared by every screen: safe-area padding,
// brand header row with contextual help toggle, demo-data banner, and the
// loading / error states from the data bootstrap.
import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CircleQuestionMark, Info, X } from 'lucide-react-native';
import { colors, spacing, type, radii } from '../theme';
import { usePortfolio } from '../contexts/PortfolioContext';
import { LoadingView } from './ui';

export default function ScreenScaffold({ title, help, children, right, waitForData = true }) {
  const insets = useSafeAreaInsets();
  const { status, isUsingDemoData } = usePortfolio();
  const [helpOpen, setHelpOpen] = useState(false);

  return (
    <View style={[styles.fill, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 8, flex: 1 }}>
          <Text style={styles.brand}>BB EXPOSURES</Text>
          <Text style={styles.title} numberOfLines={1}>{title}</Text>
        </View>
        {right}
        {help ? (
          <Pressable onPress={() => setHelpOpen(true)} hitSlop={10} style={{ marginLeft: spacing.md }}>
            <CircleQuestionMark size={20} color={colors.textSecondary} />
          </Pressable>
        ) : null}
      </View>

      {isUsingDemoData && (
        <View style={styles.demoBanner}>
          <Info size={14} color={colors.accent} />
          <Text style={styles.demoText}>
            Sample data. Sign in and sync with the Chrome extension on desktop to load your portfolio.
          </Text>
        </View>
      )}

      {waitForData && status.type === 'loading' ? (
        <LoadingView msg={status.msg} />
      ) : waitForData && status.type === 'error' ? (
        <View style={styles.errBox}>
          <Text style={{ color: colors.negative, fontWeight: '700' }}>Load failed</Text>
          <Text style={[type.secondary, { marginTop: 4 }]}>{status.msg}</Text>
        </View>
      ) : (
        children
      )}

      <Modal visible={helpOpen} animationType="slide" transparent onRequestClose={() => setHelpOpen(false)}>
        <View style={styles.helpBackdrop}>
          <View style={styles.helpSheet}>
            <View style={styles.helpHeader}>
              <Text style={type.h2}>{title} · Help</Text>
              <Pressable onPress={() => setHelpOpen(false)} hitSlop={10}>
                <X size={20} color={colors.textSecondary} />
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={{ paddingBottom: 30 }}>
              {help}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

/** Help sheet building blocks (shared by every tab's help content). */
export function HelpSection({ heading, children }) {
  return (
    <View style={{ marginTop: spacing.lg }}>
      <Text style={[type.h3, { color: colors.accent, marginBottom: 4 }]}>{heading}</Text>
      <Text style={[type.secondary, { lineHeight: 20 }]}>{children}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: colors.surface0 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  brand: { fontSize: 11, fontWeight: '800', letterSpacing: 1.2, color: colors.accent },
  title: { ...type.title, fontSize: 18, flexShrink: 1 },
  demoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accentMuted,
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
  },
  demoText: { fontSize: 11.5, color: colors.textSecondary, flex: 1 },
  errBox: { margin: spacing.lg, padding: spacing.lg, backgroundColor: colors.surface1, borderRadius: radii.md },
  helpBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  helpSheet: {
    backgroundColor: colors.surface1,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    maxHeight: '75%',
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: colors.borderDefault,
  },
  helpHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
});
