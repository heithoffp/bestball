// CaptureGuide — the Draft Assistant's show-don't-tell guidance (TASK-342,
// ADR-026). The mobile Draft Assistant is capture + guide only: it records the
// live draft and explains how, but does not re-display or analyze the roster in
// app (that lives on Underdog during the draft, and on BBE's other tabs after
// sync). This presentational component carries the diagrams — the capture flow,
// the username-in-banner tip that anchors your slot and fills your roster (most
// useful for slow drafts), where to review your team, and the privacy line.
// No session or portfolio state; safe to render pre- and in-session.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Smartphone, Cast, AtSign, Anchor, ShieldCheck, LayoutGrid, ChevronRight,
} from 'lucide-react-native';
import { colors, spacing, radii } from '../../theme';

function FlowNode({ icon, label }) {
  return (
    <View style={styles.flowNode}>
      <View style={styles.flowIcon}>{icon}</View>
      <Text style={styles.flowLabel}>{label}</Text>
    </View>
  );
}

export default function CaptureGuide() {
  return (
    <View style={styles.wrap}>
      {/* How capture works — three nodes, no prose */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>HOW IT WORKS</Text>
        <View style={styles.flowStrip}>
          <FlowNode icon={<View style={styles.recordDot} />} label="Start & record" />
          <ChevronRight size={14} color={colors.textMuted} />
          <FlowNode icon={<Smartphone size={18} color={colors.positive} />} label="Draft in Underdog" />
          <ChevronRight size={14} color={colors.textMuted} />
          <FlowNode icon={<Cast size={18} color={colors.accent} />} label="Picks captured" />
        </View>
        <Text style={styles.cardBody}>
          Keep BBE recording in the background and draft like you always do. Your picks are read
          off the board automatically — no tapping, no manual entry.
        </Text>
      </View>

      {/* The headline tip: username in the banner -> slot + roster (TASK-328) */}
      <View style={[styles.card, styles.tipCard]}>
        <View style={styles.tipHead}>
          <Anchor size={15} color={colors.accent} />
          <Text style={styles.tipTitle}>Select your username in the banner</Text>
        </View>

        {/* Mini drafter-card diagram */}
        <View style={styles.bannerMock}>
          <View style={styles.avatar} />
          <View style={styles.usernameChip}>
            <AtSign size={11} color={colors.textInverse} />
            <Text style={styles.usernameChipTxt}>yourname</Text>
          </View>
          <View style={{ flex: 1 }} />
          <View style={styles.tapDot} />
          <Text style={styles.tapHint}>tap</Text>
        </View>

        <Text style={styles.cardBody}>
          Picking your own drafter card in the room banner locks your draft slot and fills your
          roster from the board. Especially handy for <Text style={styles.emph}>slow drafts</Text> you
          come back to over several days — reopen, record, and BBE picks up right where you left off.
        </Text>
      </View>

      {/* Where to review the team (it is not shown here on purpose) */}
      <View style={styles.card}>
        <View style={styles.tipHead}>
          <LayoutGrid size={14} color={colors.textSecondary} />
          <Text style={styles.miniTitle}>Want to see your team?</Text>
        </View>
        <Text style={styles.cardBody}>
          Open Underdog during the draft, or head to your other BBE tabs once your rosters sync —
          that's where the full portfolio view and analytics live.
        </Text>
      </View>

      {/* Privacy reassurance (single source; AssistantSetup no longer duplicates it) */}
      <View style={styles.privacyRow}>
        <ShieldCheck size={13} color={colors.positive} />
        <Text style={styles.privacyTxt}>
          On-device only — BBE reads the draft board, discards every frame, and never sends screenshots.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginTop: spacing.md },
  card: {
    backgroundColor: colors.surface1, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.borderDefault,
    padding: spacing.md,
  },
  cardTitle: {
    fontSize: 10, fontWeight: '800', letterSpacing: 0.8,
    color: colors.textMuted, marginBottom: spacing.sm,
  },
  cardBody: { fontSize: 12.5, lineHeight: 18, color: colors.textSecondary, marginTop: spacing.sm },
  emph: { color: colors.textPrimary, fontWeight: '700' },

  flowStrip: {
    flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between',
  },
  flowNode: { alignItems: 'center', gap: 6, width: 84 },
  flowIcon: {
    width: 42, height: 42, borderRadius: 21,
    borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  flowLabel: { fontSize: 10.5, fontWeight: '700', color: colors.textSecondary, textAlign: 'center' },
  recordDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.negative },

  tipCard: { borderColor: colors.accentMuted },
  tipHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  tipTitle: { fontSize: 13.5, fontWeight: '800', color: colors.textPrimary, flexShrink: 1 },
  miniTitle: { fontSize: 12.5, fontWeight: '800', color: colors.textSecondary },

  bannerMock: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    marginTop: spacing.md,
    paddingVertical: 8, paddingHorizontal: 10,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderStrong,
    backgroundColor: colors.surface2,
  },
  avatar: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surface3 },
  usernameChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    backgroundColor: colors.accent, borderRadius: radii.sm,
    paddingHorizontal: 7, paddingVertical: 3,
  },
  usernameChipTxt: { fontSize: 12, fontWeight: '800', color: colors.textInverse },
  tapDot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2, borderColor: colors.accent, backgroundColor: 'transparent',
  },
  tapHint: { fontSize: 10, fontWeight: '700', color: colors.accent },

  privacyRow: {
    flexDirection: 'row', alignItems: 'center', gap: 7,
    paddingHorizontal: spacing.sm, marginTop: spacing.xs,
  },
  privacyTxt: { fontSize: 10.5, color: colors.textMuted, flex: 1, lineHeight: 14 },
});
