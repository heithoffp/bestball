// LiveSessionPanel — in-session status layer for the iOS Live Draft Session
// (docs/LIVE_SESSION_V1.md). Session start lives in the AssistantSetup screen
// (TASK-339); this renders only while a session is active and doubles as the
// confidence hub: capture heartbeat, record CTA, room presence, parse log,
// warnings, and session tools. Slot is auto-detected from the username's
// drafter card (TASK-328) — there is no manual slot control anywhere.
import React, { useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal, Share, Alert } from 'react-native';
import {
  Radio, Square, TriangleAlert, ChevronDown, ChevronUp, Cast, ShieldCheck,
  History, Bug, Film, DoorOpen, RotateCcw,
} from 'lucide-react-native';
import {
  subscribeSession, endSession, exportDebug, resetDraftBoard,
  getFrameLogPath, BROADCAST_EXTENSION_ID,
} from '../draft/sessionController';
import {
  getBroadcastPickerComponent, broadcastPickerLaunchable, launchBroadcastPicker,
} from '../draft/liveActivity';
import { colors, spacing, radii, type } from '../theme';

const GOLD = '#E8BF4A';

function WarnRow({ color = colors.negative, children }) {
  return (
    <View style={styles.warnRow}>
      <TriangleAlert size={11} color={color} />
      <Text style={[styles.warnTxt, { color }]}>{children}</Text>
    </View>
  );
}

// Pre-flight privacy explainer (TASK-326). Shown before we launch the iOS
// system broadcast picker so users understand what BBE actually captures —
// Apple's own "Everything on your screen…" sheet is system UI we can't reword.
// Everything stated here is what FrameProcessor.swift already enforces:
// on-device processing, draft-screen-only OCR, derived pick JSON only.
const preflightPoints = platformName => [
  `Reads only the ${platformName} draft board to follow your picks.`,
  'Processes each frame on your device, then discards it instantly.',
  'Sends only draft data (picks, your slot), never screenshots, notifications, or messages.',
];

function PreflightExplainer({ visible, onStart, onCancel, platformName = 'Underdog' }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={styles.preflightScrim} onPress={onCancel}>
        <Pressable style={styles.preflightCard} onPress={() => {}}>
          <View style={styles.preflightHead}>
            <ShieldCheck size={18} color={colors.positive} />
            <Text style={styles.preflightTitle}>Before you start recording</Text>
          </View>
          <Text style={styles.preflightBody}>
            iOS will ask to record your screen next. That prompt is Apple's standard wording and it
            covers every app, but here's exactly what BBE does:
          </Text>
          <View style={{ gap: 6, marginTop: 8 }}>
            {preflightPoints(platformName).map((line) => (
              <View key={line} style={styles.preflightBullet}>
                <Text style={styles.preflightDot}>•</Text>
                <Text style={styles.preflightBulletTxt}>{line}</Text>
              </View>
            ))}
          </View>
          <Text style={[styles.preflightBody, { marginTop: 8 }]}>
            You can stop capture anytime from the red status icon.
          </Text>
          <View style={styles.preflightActions}>
            <Pressable style={[styles.preflightBtn, styles.preflightBtnGhost]} onPress={onCancel}>
              <Text style={[styles.preflightBtnTxt, { color: colors.textSecondary }]}>Not now</Text>
            </Pressable>
            <Pressable style={[styles.preflightBtn, styles.preflightBtnPrimary]} onPress={onStart}>
              <Text style={[styles.preflightBtnTxt, { color: colors.textInverse }]}>Start recording</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function LiveSessionPanel() {
  const [snap, setSnap] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [showPreflight, setShowPreflight] = useState(false);
  const [debugText, setDebugText] = useState(null); // debug bundle modal

  React.useEffect(() => subscribeSession(setSnap), []);

  const BroadcastPicker = useMemo(() => getBroadcastPickerComponent(), []);

  if (!snap?.active) return null;
  const {
    status, log, activityStarted, activityError,
    captureLive, pushToken, extensionEngine, debug,
  } = snap;
  const platformName = snap.platform === 'draftkings' ? 'DraftKings' : 'Underdog';
  const engineStale = !!extensionEngine && extensionEngine.startsWith('stale');

  const phaseColor = status?.picksUntil === 0 ? colors.negative
    : status?.picksUntil === 1 ? GOLD : colors.positive;
  const statusLine = status
    ? [
        status.syncCount === 0 ? 'waiting for first sync' : `P${status.currentPick} · R${status.round}`,
        status.picksUntil == null ? null
          : status.picksUntil === 0 ? 'ON THE CLOCK'
          : `up in ${status.picksUntil}`,
        status.slot ? `slot ${status.slot} · auto` : 'finding your slot…',
      ].filter(Boolean).join(' · ')
    : '';

  return (
    <View style={[styles.card, { borderColor: `${phaseColor}55` }]}>
      <Pressable style={styles.headerRow} onPress={() => setExpanded(v => !v)}>
        <Radio size={13} color={phaseColor} />
        <Text style={[styles.title, { color: phaseColor }]}>LIVE</Text>
        <View style={[styles.capChip, { borderColor: captureLive ? colors.positive : colors.textMuted }]}>
          <Cast size={9} color={captureLive ? colors.positive : colors.textMuted} />
          <Text style={{ fontSize: 9, fontWeight: '800', color: captureLive ? colors.positive : colors.textMuted }}>
            {captureLive ? 'CAPTURING' : 'NO CAPTURE'}
          </Text>
        </View>
        <Text style={[type.secondary, { fontSize: 11.5, flexShrink: 1 }]} numberOfLines={1}>{statusLine}</Text>
        <View style={{ flex: 1 }} />
        {expanded ? <ChevronUp size={14} color={colors.textMuted} /> : <ChevronDown size={14} color={colors.textMuted} />}
      </Pressable>

      {!captureLive && (
        <View style={styles.broadcastRow}>
          {broadcastPickerLaunchable() ? (
            <Pressable
              style={({ pressed }) => [styles.recordBtnWrap, pressed && { opacity: 0.6 }]}
              onPress={() => setShowPreflight(true)}
            >
              <View style={styles.recordDot} />
            </Pressable>
          ) : BroadcastPicker ? (
            <View style={styles.recordBtnWrap}>
              <BroadcastPicker preferredExtension={BROADCAST_EXTENSION_ID} style={{ width: 44, height: 44 }} />
            </View>
          ) : (
            <Cast size={22} color={colors.textMuted} />
          )}
          <Text style={[type.muted, { flex: 1, lineHeight: 15 }]}>
            {broadcastPickerLaunchable() || BroadcastPicker ? (
              <>
                Tap record → <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Start Broadcast</Text> →
                switch to {platformName}. BBE follows the board from there.
                On-device only. Every frame is read and instantly discarded.
              </>
            ) : (
              <>
                This build has no in-app record button. Open Control Center, long-press
                <Text style={{ color: colors.textPrimary, fontWeight: '700' }}> Screen Recording</Text>, choose
                <Text style={{ color: colors.textPrimary, fontWeight: '700' }}> BBE Draft Capture</Text>, then Start Broadcast.
                If it isn't listed, install the latest EAS build.
                On-device only. Every frame is read and instantly discarded.
              </>
            )}
          </Text>
        </View>
      )}

      {status?.isResume && (
        <View style={styles.resumeRow}>
          <History size={12} color={colors.accent} />
          <Text style={styles.resumeTxt}>
            Resumed mid-draft · {status.picksAtStart} picks already on the board
          </Text>
        </View>
      )}

      {/* Room presence + reset (TASK-336). Back-to-back slow drafts no
          longer need this button: entering the next room and tapping your
          profile card auto-detects the new draft and resets the board
          (sessionEngine new-draft detection). Kept as a manual fallback. */}
      {captureLive && status?.presence === 'unseen' && (
        <View style={styles.roomRow}>
          <DoorOpen size={12} color={colors.textMuted} />
          <Text style={[styles.resumeTxt, { color: colors.textSecondary }]}>
            Waiting to enter a draft room. Open your draft in {platformName}
          </Text>
        </View>
      )}
      {captureLive && status?.presence === 'out' && (
        <View style={styles.roomRow}>
          <DoorOpen size={12} color={GOLD} />
          <Text style={[styles.resumeTxt, { color: GOLD }]}>
            Left the draft room
            {(status.ledgerSize > 0 || status.inferredGone > 0) ? '. Board state held' : ''}
          </Text>
          {(status.ledgerSize > 0 || status.inferredGone > 0) && (
            <Pressable
              style={styles.resetBtn}
              onPress={() => Alert.alert(
                'Reset for next draft?',
                'Usually not needed. Opening your next draft and tapping your username card resets the board automatically. This clears it manually: picks and availability drop; your username, rankings, and exposures are kept.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Reset board', style: 'destructive', onPress: () => resetDraftBoard() },
                ],
              )}
            >
              <RotateCcw size={11} color={colors.textInverse} />
              <Text style={styles.resetTxt}>Reset</Text>
            </Pressable>
          )}
        </View>
      )}

      <View style={styles.btnRow}>
        {/* Debug bundle + OCR frame export: developer accounts only (session
            started with debug — see AssistantSetup / authorPreview). */}
        {expanded && debug && (
          <>
            <Pressable
              style={styles.actionBtn}
              onPress={() => {
                try { setDebugText(exportDebug()); } catch (e) { setDebugText(`export failed: ${e?.message}`); }
              }}
            >
              <Bug size={12} color={colors.textSecondary} />
              <Text style={[styles.actionTxt, { color: colors.textSecondary }]}>Debug</Text>
            </Pressable>
            <Pressable
              style={styles.actionBtn}
              onPress={async () => {
                // TASK-331: share the extension's full-session OCR recording so
                // the whole draft can be replayed offline (replay-frames.mjs).
                try {
                  const path = getFrameLogPath();
                  if (!path) {
                    setDebugText('No frame recording found. The extension writes it during a live broadcast (needs the task329.3+ build).');
                    return;
                  }
                  // eslint-disable-next-line global-require
                  const Sharing = require('expo-sharing');
                  await Sharing.shareAsync(`file://${path}`, { mimeType: 'application/json', dialogTitle: 'Session frames' });
                } catch (e) {
                  setDebugText(`frames export failed: ${e?.message}`);
                }
              }}
            >
              <Film size={12} color={colors.textSecondary} />
              <Text style={[styles.actionTxt, { color: colors.textSecondary }]}>Frames</Text>
            </Pressable>
          </>
        )}
        <Pressable style={[styles.actionBtn, { borderColor: `${colors.negative}66` }]} onPress={() => endSession()}>
          <Square size={11} color={colors.negative} />
          <Text style={[styles.actionTxt, { color: colors.negative }]}>End</Text>
        </Pressable>
      </View>

      {expanded && (
        <>
          {status?.learnedUsername && (
            <Text style={[type.muted, { fontSize: 10.5, marginTop: 6 }]}>
              Tracking {status.learnedUsername}
              {status.slotSource === 'anchored' ? ` · slot ${status.slot} pinned from your card` : ''}
            </Text>
          )}
          {debug && engineStale && (
            <WarnRow>
              The broadcast extension is running an OLD engine build. Parsing fixes are not live.
              Install the latest EAS build to update it (Metro reload is not enough).
            </WarnRow>
          )}
          {!activityStarted && <WarnRow>Live Activity failed: {activityError || 'unknown'}</WarnRow>}
          {activityStarted && activityError && (
            <WarnRow color={GOLD}>
              Live Activity issue: {activityError}. Trying to restore it automatically.
            </WarnRow>
          )}
          {activityStarted && !pushToken && (
            <WarnRow color={GOLD}>
              {debug
                ? 'No push token. The Live Activity refreshes only when you reopen BBE. Check the relay setup (docs/LIVE_SESSION_V1.md).'
                : 'Lock Screen updates refresh only while BBE is open.'}
            </WarnRow>
          )}
          <View style={{ marginTop: 6, gap: 2 }}>
            {log.map((entry) => (
              <Text key={entry.at + entry.message} style={[type.muted, { fontSize: 10.5 }]} numberOfLines={1}>
                {new Date(entry.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })} · {entry.message}
              </Text>
            ))}
          </View>
        </>
      )}

      <PreflightExplainer
        visible={showPreflight}
        platformName={platformName}
        onCancel={() => setShowPreflight(false)}
        onStart={() => {
          setShowPreflight(false);
          launchBroadcastPicker(BROADCAST_EXTENSION_ID);
        }}
      />

      <Modal visible={debugText != null} transparent animationType="fade" onRequestClose={() => setDebugText(null)}>
        <View style={styles.preflightScrim}>
          <View style={[styles.preflightCard, { maxHeight: '80%' }]}>
            <View style={styles.preflightHead}>
              <Bug size={16} color={colors.accent} />
              <Text style={styles.preflightTitle}>Session debug</Text>
            </View>
            <ScrollView style={{ flexShrink: 1 }}>
              <Text selectable style={{ fontSize: 10, lineHeight: 14, color: colors.textSecondary, fontFamily: 'Courier' }}>
                {debugText}
              </Text>
            </ScrollView>
            <View style={styles.preflightActions}>
              <Pressable style={[styles.preflightBtn, styles.preflightBtnGhost]} onPress={() => setDebugText(null)}>
                <Text style={[styles.preflightBtnTxt, { color: colors.textSecondary }]}>Close</Text>
              </Pressable>
              <Pressable
                style={[styles.preflightBtn, styles.preflightBtnPrimary]}
                onPress={async () => {
                  try {
                    await Share.share({ message: debugText });
                  } catch (e) {
                    setDebugText(`share failed: ${e?.message}\n\n${debugText}`);
                  }
                }}
              >
                <Text style={[styles.preflightBtnTxt, { color: colors.textInverse }]}>Share</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderDefault,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  title: { fontSize: 12, fontWeight: '800', color: colors.textPrimary, letterSpacing: 0.4 },
  capChip: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderWidth: 1, borderRadius: radii.sm, paddingHorizontal: 5, paddingVertical: 2,
  },
  broadcastRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    marginTop: spacing.sm, padding: spacing.sm,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderDefault,
    backgroundColor: colors.surface2 ?? colors.surface1,
  },
  recordBtnWrap: {
    width: 48, height: 48, borderRadius: 24,
    borderWidth: 1.5, borderColor: colors.negative,
    alignItems: 'center', justifyContent: 'center',
  },
  recordDot: {
    width: 20, height: 20, borderRadius: 10,
    backgroundColor: colors.negative,
  },
  btnRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5,
    flex: 1, paddingVertical: 7, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.surface2 ?? colors.surface1,
  },
  actionTxt: { fontSize: 12, fontWeight: '700', color: colors.textPrimary },
  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6, flexWrap: 'wrap' },
  warnTxt: { fontSize: 10.5, color: colors.negative, flexShrink: 1 },
  resumeRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: spacing.sm, paddingVertical: 6, paddingHorizontal: spacing.sm,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.accentMuted,
    backgroundColor: colors.accentMuted,
  },
  resumeTxt: { fontSize: 11, fontWeight: '700', color: colors.accent, flexShrink: 1 },
  roomRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    marginTop: spacing.sm, paddingVertical: 6, paddingHorizontal: spacing.sm,
    borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderDefault,
    backgroundColor: colors.surface2 ?? colors.surface1,
  },
  resetBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 'auto',
    backgroundColor: colors.accent, borderRadius: radii.sm,
    paddingHorizontal: 8, paddingVertical: 5,
  },
  resetTxt: { fontSize: 10.5, fontWeight: '800', color: colors.textInverse },
  preflightScrim: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center', justifyContent: 'center', padding: spacing.lg,
  },
  preflightCard: {
    width: '100%', maxWidth: 400,
    backgroundColor: colors.surface1, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.borderDefault, padding: spacing.lg,
  },
  preflightHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  preflightTitle: { fontSize: 15, fontWeight: '800', color: colors.textPrimary, flexShrink: 1 },
  preflightBody: { fontSize: 12.5, lineHeight: 18, color: colors.textSecondary },
  preflightBullet: { flexDirection: 'row', gap: 6 },
  preflightDot: { color: colors.positive, fontSize: 13, lineHeight: 18 },
  preflightBulletTxt: { flex: 1, fontSize: 12.5, lineHeight: 18, color: colors.textPrimary },
  preflightActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  preflightBtn: {
    flex: 1, paddingVertical: 11, borderRadius: radii.md,
    alignItems: 'center', justifyContent: 'center',
  },
  preflightBtnGhost: {
    borderWidth: 1, borderColor: colors.borderDefault,
    backgroundColor: colors.surface2 ?? colors.surface1,
  },
  preflightBtnPrimary: { backgroundColor: colors.accent },
  preflightBtnTxt: { fontSize: 13, fontWeight: '800' },
});
