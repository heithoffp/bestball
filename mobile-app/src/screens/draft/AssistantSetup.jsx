// AssistantSetup — the Draft Assistant's front door (TASK-339, TASK-342). Owns
// the tab whenever no live session is active. Show-don't-tell: a three-step
// visual strip, one required field (Underdog username — it anchors automatic
// slot detection, TASK-328), a Start CTA, and the CaptureGuide diagrams
// (ADR-026). No slot selector, no paragraphs, no demo.
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import {
  Radio, AtSign, Smartphone, ChevronRight, Zap, TriangleAlert,
} from 'lucide-react-native';
import { trackEvent } from '../../../shared/utils/analytics';
import {
  subscribeSession, startSession, getRememberedUsername,
} from '../../draft/sessionController';
import useSessionInputs from './useSessionInputs';
import CaptureGuide from './CaptureGuide';
import { colors, spacing, radii, type } from '../../theme';

const TEAMS = 12;
const ROUNDS = 18;
const GOLD = '#E8BF4A';

function Step({ icon, label }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepIcon}>{icon}</View>
      <Text style={styles.stepLabel}>{label}</Text>
    </View>
  );
}

function WarnRow({ color = colors.negative, children }) {
  return (
    <View style={styles.warnRow}>
      <TriangleAlert size={12} color={color} />
      <Text style={[styles.warnTxt, { color }]}>{children}</Text>
    </View>
  );
}

export default function AssistantSetup() {
  const inputs = useSessionInputs();
  const [snap, setSnap] = useState(null);
  const [username, setUsername] = useState(() => getRememberedUsername() || '');

  React.useEffect(() => subscribeSession(setSnap), []);
  if (!snap) return null;
  const { capabilities, lastError } = snap;

  const name = username.trim();
  const canStartLive = !!name && capabilities.nativeModule;

  const handleStart = () => {
    trackEvent('draft_session_started');
    startSession({ ...inputs, slot: null, teams: TEAMS, rounds: ROUNDS, username: name });
  };

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}>
      <View style={styles.hero}>
        <View style={styles.heroHead}>
          <Radio size={15} color={colors.accent} />
          <Text style={styles.heroTitle}>Live Draft Assistant</Text>
          <View style={{ flex: 1 }} />
          <Text style={[type.muted, { fontSize: 10.5 }]}>iOS · Underdog</Text>
        </View>

        {/* How it works — three icons, six words */}
        <View style={styles.stepStrip}>
          <Step icon={<AtSign size={17} color={colors.accent} />} label="Your username" />
          <ChevronRight size={14} color={colors.textMuted} />
          <Step icon={<View style={styles.recordDot} />} label="Start & record" />
          <ChevronRight size={14} color={colors.textMuted} />
          <Step icon={<Smartphone size={17} color={colors.positive} />} label="Draft in Underdog" />
        </View>

        <Text style={styles.fieldLabel}>UNDERDOG USERNAME</Text>
        <TextInput
          style={styles.usernameInput}
          value={username}
          onChangeText={setUsername}
          placeholder="e.g. DRAFTHAWK99"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="characters"
          autoCorrect={false}
          returnKeyType="done"
        />
        <Text style={styles.microcopy}>
          Exactly as it appears in the draft room — it's how BBE finds your picks and slot.
        </Text>

        {!capabilities.nativeModule && (
          <WarnRow>Live capture needs the EAS dev/preview build — install the latest build to record.</WarnRow>
        )}
        {capabilities.nativeModule && !capabilities.activitiesEnabled && (
          <WarnRow color={GOLD}>Live Activities look disabled — check Settings → Best Ball Exposures.</WarnRow>
        )}
        {lastError && <WarnRow>{lastError}</WarnRow>}

        <Pressable
          style={[styles.startBtn, !canStartLive && { opacity: 0.4 }]}
          onPress={handleStart}
          disabled={!canStartLive}
        >
          <Zap size={14} color={colors.textInverse} />
          <Text style={styles.startTxt}>Start live session</Text>
        </Pressable>
      </View>

      <CaptureGuide />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.surface1, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.borderDefault,
    padding: spacing.lg,
  },
  heroHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  heroTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, letterSpacing: 0.3 },
  stepStrip: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: spacing.lg, marginBottom: spacing.lg,
  },
  step: { alignItems: 'center', gap: 6, width: 92 },
  stepIcon: {
    width: 44, height: 44, borderRadius: 22,
    borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.surface2 ?? colors.surface1,
    alignItems: 'center', justifyContent: 'center',
  },
  recordDot: { width: 16, height: 16, borderRadius: 8, backgroundColor: colors.negative },
  stepLabel: { fontSize: 10.5, fontWeight: '700', color: colors.textSecondary, textAlign: 'center' },
  fieldLabel: {
    fontSize: 10, fontWeight: '800', letterSpacing: 0.8,
    color: colors.textMuted, marginBottom: 6,
  },
  usernameInput: {
    height: 44, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.surface2 ?? colors.surface1,
    paddingHorizontal: 12,
    fontSize: 15, fontWeight: '700', color: colors.textPrimary,
  },
  microcopy: { fontSize: 11, color: colors.textMuted, marginTop: 6, lineHeight: 15 },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
    backgroundColor: colors.accent, borderRadius: radii.md,
    paddingVertical: 12, marginTop: spacing.lg,
  },
  startTxt: { color: colors.textInverse, fontSize: 14, fontWeight: '800' },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, flexWrap: 'wrap' },
  warnTxt: { fontSize: 11, flexShrink: 1 },
});
