// CaptureGuide — the Draft Assistant's quiet "good to know" guidance (TASK-342,
// ADR-026). Rendered under the setup rail pre-session and under the
// LiveSessionPanel in-session. Five tip rows, no cards: the Lock Screen /
// Dynamic Island Live Activity first (real glance screenshot + P·S·C·E column
// legend), fast drafts, the platform's slow-draft recovery tip (Underdog: tap
// your username in the room banner, with a real UD room-banner screenshot,
// TASK-328; DraftKings: glance at the Board tab — every cell carries its exact
// pick number, TASK-350), where the team lives (the mobile assistant is
// capture-only — it never re-displays the roster in app), and the privacy
// line. No session or portfolio state; safe pre- and in-session.
import React, { useState } from 'react';
import { View, Text, Image, StyleSheet } from 'react-native';
import {
  Zap, Hourglass, ShieldCheck, LayoutGrid, Smartphone,
} from 'lucide-react-native';
import { colors, spacing, radii } from '../../theme';

// RN's aspectRatio style is unreliable on <Image> here — the image lays out at
// its intrinsic height and `cover` zooms the crop — so the height is computed
// explicitly from the measured width instead.
function ShotImage({ source, aspect }) {
  const [width, setWidth] = useState(0);
  return (
    <View onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width > 0 && (
        <Image source={source} style={{ width, height: Math.round(width / aspect) }} />
      )}
    </View>
  );
}

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

// Real UD draft-room top banner (header + drafter cards; other drafters'
// usernames pixelated): the accent ring marks the user's own drafter card —
// the tap that anchors the slot (TASK-328) and hands the new-draft auto-detect
// its roster panel. The screenshot's real username is masked at render time by
// a generic placeholder overlay so no personal account name ships in the UI.
function BannerShot() {
  return (
    <View>
      <View style={styles.bannerWrap}>
        <ShotImage
          source={require('../../../assets/slow-draft-banner.png')}
          aspect={1179 / 450}
        />
        <View style={styles.bannerNameMask} pointerEvents="none">
          <Text
            style={styles.bannerNameMaskTxt}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.4}
          >
            YOURUSERNAME
          </Text>
        </View>
        <View style={styles.bannerRing} pointerEvents="none" />
      </View>
      <Text style={styles.bannerCaption}>
        Your card shows <Text style={styles.bannerCaptionStrong}>your username</Text>. Tap it.
      </Text>
    </View>
  );
}

// Live Activity glance (assets/live-activity-glance.png, 1086x382 crop of a
// real in-draft Lock Screen pill). The legend decodes the four metric columns
// exactly as sessionEngine.buildTargets emits them (TASK-337).
const GLANCE_LEGEND = [
  ['P', 'Playoff game stack: the week (15–17) their team plays one of your picks. "15+" means multiple weeks.'],
  ['S', '✓ when they stack with one of your picks (same team, QB involved).'],
  ['C', 'Correlation: how often they already appear alongside your current picks across your synced rosters.'],
  ['E', 'Exposure: the share of your synced rosters that hold this player.'],
];

function GlanceShot() {
  return (
    <View>
      <View style={styles.bannerWrap}>
        <ShotImage
          source={require('../../../assets/live-activity-glance.png')}
          aspect={1086 / 382}
        />
      </View>
      <Text style={styles.bannerCaption}>
        Top row: picks until you&apos;re up, plus the live pick
        (<Text style={styles.bannerCaptionStrong}>P117 · R10</Text> = pick 117, round 10).
        The grid is your six best available players by your rankings; the bottom line
        counts your roster by position.
      </Text>
      {GLANCE_LEGEND.map(([key, txt]) => (
        <View key={key} style={styles.legendRow}>
          <Text style={styles.legendKey}>{key}</Text>
          <Text style={styles.legendTxt}>{txt}</Text>
        </View>
      ))}
    </View>
  );
}

export default function CaptureGuide({ platform = 'underdog' }) {
  const dk = platform === 'draftkings';
  const platformName = dk ? 'DraftKings' : 'Underdog';
  return (
    <View style={styles.wrap}>
      <Text style={styles.eyebrow}>GOOD TO KNOW</Text>

      <TipRow
        icon={<Smartphone size={15} color={colors.accent} />}
        lead="Your Lock Screen & Dynamic Island."
        extra={<GlanceShot />}
      >
        While you record, a Live Activity keeps the whole draft on your Lock Screen
        and in the Dynamic Island at the top of your screen. No app-switching needed.
      </TipRow>

      <TipRow icon={<Zap size={15} color={colors.accent} />} lead="Fast drafts.">
        Nothing to manage. Keep recording and every pick lands on its own within seconds.
      </TipRow>

      {dk ? (
        <TipRow icon={<Hourglass size={15} color={colors.accent} />} lead="Slow drafts.">
          Coming back hours later? Glance at the Board tab: every cell carries its exact
          pick number, so BBE refills the whole draft (your slot, your roster, everyone
          else&apos;s picks) in a single look.
        </TipRow>
      ) : (
        <TipRow
          icon={<Hourglass size={15} color={colors.accent} />}
          lead="Slow drafts."
          extra={<BannerShot />}
        >
          Coming back hours later, or jumping into your next draft? Tap your username
          in the room&apos;s top banner: BBE locks in your slot, refills your roster,
          and spots a brand-new draft on its own. No need to reset anything in the app.
        </TipRow>
      )}

      <TipRow icon={<LayoutGrid size={15} color={colors.textSecondary} />} lead="Your team.">
        Lives on {platformName} while the draft runs. Once your rosters sync, every BBE tab
        picks them up.
      </TipRow>

      <TipRow icon={<ShieldCheck size={15} color={colors.positive} />} lead="Private by design." last>
        Every frame is read on your device and instantly discarded. Screenshots never
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
  // Real screenshot crop is 1179x450 (room header + full drafter-card row);
  // the ring hugs the user's own card — readable username, center of the crop.
  bannerRing: {
    position: 'absolute', left: '38.4%', width: '21.6%', top: '32.5%', height: '65.5%',
    borderWidth: 2, borderColor: colors.accent, borderRadius: 6,
  },
  // Covers the real account name baked into the screenshot (x≈470–692,
  // y≈254–282 of the 1179x450 crop) with a generic placeholder.
  bannerNameMask: {
    position: 'absolute', left: '39.2%', width: '20%', top: '55.3%', height: '8.2%',
    backgroundColor: '#0b0b0b', alignItems: 'center', justifyContent: 'center',
  },
  bannerNameMaskTxt: {
    color: '#fff', fontWeight: '700', fontSize: 11, letterSpacing: 0.3,
    textAlign: 'center',
  },
  bannerCaption: {
    marginTop: 6, fontSize: 11, lineHeight: 15, color: colors.textMuted,
  },
  bannerCaptionStrong: { color: colors.accent, fontWeight: '700' },

  legendRow: { flexDirection: 'row', gap: spacing.sm, marginTop: 6 },
  legendKey: {
    width: 14, fontSize: 11, fontWeight: '800', textAlign: 'center',
    color: colors.accent,
  },
  legendTxt: { flex: 1, fontSize: 11, lineHeight: 15, color: colors.textMuted },
});
