// CaptureGuide — the Draft Assistant's quiet "good to know" guidance (TASK-342,
// ADR-026). Rendered under the setup rail pre-session and under the
// LiveSessionPanel in-session. Four tip rows, no cards: fast drafts, the
// slow-draft username-in-banner tip that anchors your slot, refills your
// roster, and auto-detects the next draft room (TASK-328, with a real
// blurred-usernames UD banner screenshot), where the team lives (the
// mobile assistant is capture-only — it never re-displays the roster in app),
// and the privacy line. No session or portfolio state; safe pre- and in-session.
import React from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import {
  Zap, Hourglass, ShieldCheck, LayoutGrid,
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

// Real UD draft-room banner (usernames blurred): the accent ring marks the
// user's own drafter card — the tap that anchors the slot (TASK-328) and
// hands the new-draft auto-detect its roster panel.
function BannerShot() {
  return (
    <View>
      <View style={styles.bannerWrap}>
        <Image
          source={require('../../../assets/slow-draft-banner.png')}
          style={styles.bannerImg}
          resizeMode="cover"
        />
        <View style={styles.bannerRing} pointerEvents="none" />
      </View>
      <Text style={styles.bannerCaption}>
        Your card shows <Text style={styles.bannerCaptionStrong}>your username</Text> — tap it.
      </Text>
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
        extra={<BannerShot />}
      >
        Coming back hours later — or jumping into your next draft? Tap your username
        in the room&apos;s top banner: BBE locks in your slot, refills your roster,
        and spots a brand-new draft on its own. No need to reset anything in the app.
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

  bannerWrap: {
    marginTop: spacing.md,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderStrong,
    overflow: 'hidden', position: 'relative',
    backgroundColor: colors.surface2,
  },
  // Real screenshot crop is 1179x327; the ring hugs the user's own card
  // (the yellow-outlined one, center of the crop).
  bannerImg: { width: '100%', aspectRatio: 1179 / 327 },
  bannerRing: {
    position: 'absolute', left: '38.2%', width: '22%', top: '2%', height: '94%',
    borderWidth: 2, borderColor: colors.accent, borderRadius: 6,
  },
  bannerCaption: {
    marginTop: 6, fontSize: 11, lineHeight: 15, color: colors.textMuted,
  },
  bannerCaptionStrong: { color: colors.accent, fontWeight: '700' },
});
