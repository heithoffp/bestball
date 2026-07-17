// AssistantSetup — the Draft Assistant's front door (TASK-339, TASK-342). Owns
// the tab whenever no live session is active. The setup card IS the
// instructions: a vertical three-step rail where the controls are the steps —
// the username field (anchors automatic slot detection, TASK-328), the Start
// CTA with its warnings, and the record-then-draft hand-off. Markers fill gold
// as steps complete so the next action is always obvious. Quiet "good to know"
// guidance (CaptureGuide) below; no duplicate flow diagrams (ADR-026).
import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, ScrollView, StyleSheet } from 'react-native';
import { Check, Zap, TriangleAlert } from 'lucide-react-native';
import { trackEvent } from '../../../shared/utils/analytics';
import {
  subscribeSession, startSession, getRememberedUsername,
} from '../../draft/sessionController';
import useSessionInputs from './useSessionInputs';
import CaptureGuide from './CaptureGuide';
import { colors, spacing, radii } from '../../theme';

const TEAMS = 12;
const ROUNDS = 18;
const GOLD = '#E8BF4A';

function WarnRow({ color = colors.negative, children }) {
  return (
    <View style={styles.warnRow}>
      <TriangleAlert size={12} color={color} />
      <Text style={[styles.warnTxt, { color }]}>{children}</Text>
    </View>
  );
}

// One step on the setup rail. done -> gold check; active -> gold ring + number.
function StepRow({ n, done, active, last, title, children }) {
  return (
    <View style={styles.stepRow}>
      <View style={styles.railCol}>
        <View style={[styles.marker, done && styles.markerDone, !done && active && styles.markerActive]}>
          {done
            ? <Check size={13} color={colors.textInverse} strokeWidth={3.5} />
            : <Text style={[styles.markerNum, active && { color: colors.accent }]}>{n}</Text>}
        </View>
        {!last && <View style={[styles.railLine, done && { backgroundColor: colors.accent }]} />}
      </View>
      <View style={[styles.stepBody, !last && { paddingBottom: spacing.lg }]}>
        <Text style={styles.stepTitle}>{title}</Text>
        {children}
      </View>
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
    <ScrollView
      contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.card}>
        <View style={styles.headRow}>
          <Text style={styles.headline}>Draft hands-free</Text>
          <Text style={styles.platformTag}>iOS · UNDERDOG</Text>
        </View>
        <Text style={styles.sub}>
          BBE records your screen while you draft and follows every pick — no tapping, no
          manual entry.
        </Text>

        <View style={{ marginTop: spacing.lg }}>
          <StepRow n={1} done={!!name} active={!name} title="Your Underdog username">
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
          </StepRow>

          <StepRow n={2} active={!!name} title="Start your session">
            <Pressable
              style={[styles.startBtn, !canStartLive && { opacity: 0.4 }]}
              onPress={handleStart}
              disabled={!canStartLive}
            >
              <Zap size={14} color={colors.textInverse} />
              <Text style={styles.startTxt}>Start live session</Text>
            </Pressable>
            {!capabilities.nativeModule && (
              <WarnRow>Live capture needs the EAS dev/preview build — install the latest build to record.</WarnRow>
            )}
            {capabilities.nativeModule && !capabilities.activitiesEnabled && (
              <WarnRow color={GOLD}>Live Activities look disabled — check Settings → Best Ball Exposures.</WarnRow>
            )}
            {lastError && <WarnRow>{lastError}</WarnRow>}
          </StepRow>

          <StepRow n={3} last title="Record, then draft">
            <Text style={styles.stepText}>
              Tap the red record button on the next screen, then switch to Underdog and draft
              like you always do. Your turn clock and top targets stay on the Lock Screen the
              whole way.
            </Text>
          </StepRow>
        </View>
      </View>

      <CaptureGuide />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface1, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.borderDefault,
    padding: spacing.lg,
  },
  headRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 },
  headline: { fontSize: 17, fontWeight: '800', color: colors.textPrimary, letterSpacing: 0.2 },
  platformTag: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.8, color: colors.textMuted },
  sub: { fontSize: 12.5, lineHeight: 18, color: colors.textSecondary, marginTop: 6 },

  stepRow: { flexDirection: 'row' },
  railCol: { width: 24, alignItems: 'center', marginRight: spacing.md },
  marker: {
    width: 24, height: 24, borderRadius: 12,
    borderWidth: 1.5, borderColor: colors.borderStrong, backgroundColor: colors.surface2,
    alignItems: 'center', justifyContent: 'center',
  },
  markerActive: { borderColor: colors.accent },
  markerDone: { borderColor: colors.accent, backgroundColor: colors.accent },
  markerNum: { fontSize: 11.5, fontWeight: '800', color: colors.textMuted },
  railLine: { flex: 1, width: 2, borderRadius: 1, marginVertical: 3, backgroundColor: colors.borderDefault },
  stepBody: { flex: 1 },
  stepTitle: { fontSize: 13, fontWeight: '800', color: colors.textPrimary, marginBottom: spacing.sm, marginTop: 3 },
  stepText: { fontSize: 12.5, lineHeight: 18, color: colors.textSecondary, marginTop: -2 },

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
    paddingVertical: 12,
  },
  startTxt: { color: colors.textInverse, fontSize: 14, fontWeight: '800' },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: spacing.sm, flexWrap: 'wrap' },
  warnTxt: { fontSize: 11, flexShrink: 1 },
});
