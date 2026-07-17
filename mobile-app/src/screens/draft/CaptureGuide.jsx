// CaptureGuide — the Draft Assistant's quiet "good to know" guidance (TASK-342,
// ADR-026). Rendered under the setup rail pre-session and under the
// LiveSessionPanel in-session. Four tip rows, no cards: fast drafts, the
// slow-draft username-in-banner tip that anchors your slot and refills your
// roster (TASK-328, with the drafter-card diagram), where the team lives (the
// mobile assistant is capture-only — it never re-displays the roster in app),
// and the privacy line. No session or portfolio state; safe pre- and in-session.
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Zap, Hourglass, AtSign, ShieldCheck, LayoutGrid,
} from 'lucide-react-native';
import { colors, spacing, radii } from '../../theme';

function TipRow({ icon, lead, last, extra, children }) {
  return (
    <View style={[styles.tipRow, !last && styles.tipRowDivider]}>
      <View style={styles.tipIcon}>{icon}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.tipTxt}>
          <Text style={styles.tipLead}>{lead}</Text>
          <Text>{'  '}{children}</Text>
        </Text>
        {extra}
      </View>
    </View>
  );
}

// Mini drafter-card diagram: your username chip in the room's top banner,
// with the tap target that anchors your slot (TASK-328).
function BannerMock() {
  return (
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
  );
}

export default function CaptureGuide() {
  return (
    <View style={styles.wrap}>
      <Text style={styles.eyebrow}>GOOD TO KNOW</Text>

      <TipRow icon={<Zap size={15} color={colors.accent} />} lead="Fast drafts.">
        Nothing to manage — keep recording and every pick lands on its own within seconds.
      </TipRow>

      <TipRow
        icon={<Hourglass size={15} color={colors.accent} />}
        lead="Slow drafts."
        extra={<BannerMock />}
      >
        Coming back to a room hours or days later? Tap your username in the top banner —
        BBE refills your roster from the board and locks in your slot.
      </TipRow>

      <TipRow icon={<LayoutGrid size={15} color={colors.textSecondary} />} lead="Your team.">
        Lives on Underdog while the draft runs. Once your rosters sync, every BBE tab
        picks them up.
      </TipRow>

      <TipRow icon={<ShieldCheck size={15} color={colors.positive} />} lead="Private by design." last>
        Every frame is read on your device and instantly discarded — screenshots never
        leave your phone.
      </TipRow>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginTop: spacing.xl, paddingHorizontal: spacing.xs },
  eyebrow: {
    fontSize: 10, fontWeight: '800', letterSpacing: 0.8,
    color: colors.textMuted, marginBottom: spacing.xs,
  },
  tipRow: { flexDirection: 'row', gap: spacing.md, paddingVertical: spacing.md },
  tipRowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderSubtle },
  tipIcon: { width: 18, alignItems: 'center', marginTop: 1 },
  tipTxt: { fontSize: 12.5, lineHeight: 18, color: colors.textSecondary },
  tipLead: { color: colors.textPrimary, fontWeight: '800' },

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
});
