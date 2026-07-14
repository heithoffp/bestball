// LiveSessionPanel — start/stop + status UI for the iOS Live Draft Session
// (docs/LIVE_SESSION_V1.md). Renders at the top of the Draft Assistant.
// Two capture modes: 'live' (ReplayKit broadcast — fully hands-free) and
// 'shots' (screenshot sweep fallback). Active state doubles as the
// confidence hub: capture heartbeat, parse log, slot conflicts, warnings.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, Modal, TextInput, Share } from 'react-native';
import {
  Radio, Square, Zap, TriangleAlert, ChevronDown, ChevronUp, FlaskConical, Cast, ShieldCheck, History, Bug,
} from 'lucide-react-native';
import { canonicalName } from '../../shared/utils/helpers';
import { usePortfolio } from '../contexts/PortfolioContext';
import {
  subscribeSession, startSession, endSession, demoSync, setSessionSlot, exportDebug,
  BROADCAST_EXTENSION_ID,
} from '../draft/sessionController';
import {
  getBroadcastPickerComponent, broadcastPickerLaunchable, launchBroadcastPicker,
} from '../draft/liveActivity';
import { colors, spacing, radii, type } from '../theme';

const TEAMS = 12;
const ROUNDS = 18;
const GOLD = '#E8BF4A';

// Underdog ADP CSV rows -> matcher pool rows (same field fallbacks as
// shared/utils/dataLoader rowName/buildLookupsFromRows).
function poolRowsFromAdpRows(rows) {
  const out = [];
  for (const row of rows || []) {
    const name = (
      `${row.firstName || row.first_name || row['First Name'] || ''} ${row.lastName || row.last_name || row['Last Name'] || ''}`.trim()
      || row.Name || row['Player Name'] || row.player_name || row.Player || ''
    ).trim().replace(/\s+/g, ' ');
    if (!name) continue;
    const adp = parseFloat(row.adp ?? row.ADP ?? row.Adp ?? '');
    out.push({
      name,
      position: row.position || row.Position || row.pos || 'N/A',
      team: (row.teamName || row.team || row.Team || 'N/A').toString().toUpperCase().slice(0, 3),
      adp: Number.isFinite(adp) ? adp : null,
    });
  }
  return out;
}

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
const PREFLIGHT_POINTS = [
  'Reads only the Underdog draft board to follow your picks.',
  'Processes each frame on your device, then discards it instantly.',
  'Sends only draft data (picks, your slot) — never screenshots, notifications, or messages.',
];

function PreflightExplainer({ visible, onStart, onCancel }) {
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
            covers every app — but here's exactly what BBE does:
          </Text>
          <View style={{ gap: 6, marginTop: 8 }}>
            {PREFLIGHT_POINTS.map((line) => (
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
  const { masterPlayers, adpByPlatform, rankingsByPlatform, rosterData } = usePortfolio();
  const [snap, setSnap] = useState(null);
  const [slotChoice, setSlotChoice] = useState(null); // null = auto-detect
  const [usernameChoice, setUsernameChoice] = useState(''); // '' = auto-learn
  const [expanded, setExpanded] = useState(false);
  const [showPreflight, setShowPreflight] = useState(false);
  const [debugText, setDebugText] = useState(null); // debug bundle modal

  useEffect(() => subscribeSession(setSnap), []);

  const BroadcastPicker = useMemo(() => getBroadcastPickerComponent(), []);

  const poolRows = useMemo(() => {
    const udRows = poolRowsFromAdpRows(adpByPlatform?.underdog?.latestRows);
    if (udRows.length >= 100) return udRows;
    return (masterPlayers || [])
      .filter(p => p?.name)
      .map(p => ({ name: p.name, position: p.position, team: p.team, adp: p.adpPick }));
  }, [adpByPlatform, masterPlayers]);

  const rankMap = useMemo(() => {
    const map = new Map();
    (rankingsByPlatform?.underdog || []).forEach((row, i) => {
      const name = row.Name || row.name || row.Player || row.player || row['Player Name'] || '';
      if (!name) return;
      const rank = parseInt(row.Rank ?? row.rank ?? '', 10);
      map.set(canonicalName(name), Number.isFinite(rank) ? rank : i + 1);
    });
    return map;
  }, [rankingsByPlatform]);

  const exposureMap = useMemo(() => {
    const rosters = new Set();
    const counts = new Map();
    (rosterData || []).forEach(p => {
      const id = p.entry_id || p.entryId;
      if (!id || !p.name) return;
      rosters.add(id);
      const key = canonicalName(p.name);
      if (!counts.has(key)) counts.set(key, new Set());
      counts.get(key).add(id);
    });
    const map = new Map();
    if (rosters.size > 0) {
      counts.forEach((set, key) => map.set(key, (set.size / rosters.size) * 100));
    }
    return map;
  }, [rosterData]);

  if (!snap) return null;
  const {
    active, status, log, capabilities, activityStarted, activityError,
    lastError, captureLive, pushToken, extensionEngine,
  } = snap;
  const engineStale = !!extensionEngine && extensionEngine.startsWith('stale');

  const handleStart = () => {
    startSession({
      poolRows, rankMap, exposureMap,
      slot: slotChoice, teams: TEAMS, rounds: ROUNDS,
      username: usernameChoice.trim() || null,
    });
  };

  // ---------- idle ----------
  if (!active) {
    return (
      <View style={styles.card}>
        <Pressable style={styles.headerRow} onPress={() => setExpanded(v => !v)}>
          <Radio size={13} color={colors.accent} />
          <Text style={styles.title}>Live Draft Session</Text>
          <Text style={[type.muted, { fontSize: 10.5 }]}>iOS · Underdog</Text>
          <View style={{ flex: 1 }} />
          {expanded ? <ChevronUp size={14} color={colors.textMuted} /> : <ChevronDown size={14} color={colors.textMuted} />}
        </Pressable>
        {expanded && (
          <>
            <Text style={[type.muted, { marginTop: spacing.sm, lineHeight: 16 }]}>
              Hands-free: start the session, tap the record button, confirm Start Broadcast, then just
              draft in Underdog. Your lock-screen Live Activity updates automatically as picks come in.
              Join a draft already in progress and BBE backfills every pick the first time it sees the board.
            </Text>
            <View style={styles.slotRow}>
              <Text style={type.muted}>Username</Text>
              <TextInput
                style={styles.usernameInput}
                value={usernameChoice}
                onChangeText={setUsernameChoice}
                placeholder="Auto-detect from the draft"
                placeholderTextColor={colors.textMuted}
                autoCapitalize="characters"
                autoCorrect={false}
              />
            </View>
            <View style={styles.slotRow}>
              <Text style={type.muted}>Slot</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 3 }}>
                <Pressable
                  onPress={() => setSlotChoice(null)}
                  style={[styles.slotBtn, { width: 44 }, slotChoice == null && styles.slotBtnOn]}
                >
                  <Text style={[styles.slotTxt, slotChoice == null && { color: colors.accent }]}>Auto</Text>
                </Pressable>
                {Array.from({ length: TEAMS }, (_, i) => i + 1).map(n => (
                  <Pressable
                    key={n}
                    onPress={() => setSlotChoice(n)}
                    style={[styles.slotBtn, slotChoice === n && styles.slotBtnOn]}
                  >
                    <Text style={[styles.slotTxt, slotChoice === n && { color: colors.accent }]}>{n}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
            {!capabilities.nativeModule && (
              <WarnRow>Needs the EAS dev/preview build — capture, OCR, and the Live Activity are native.</WarnRow>
            )}
            {capabilities.nativeModule && !capabilities.activitiesEnabled && (
              <WarnRow color={GOLD}>Live Activities look disabled — check Settings → Best Ball Exposures.</WarnRow>
            )}
            {lastError && <WarnRow>{lastError}</WarnRow>}
            <Pressable
              style={[styles.startBtn, !capabilities.nativeModule && { opacity: 0.5 }]}
              onPress={handleStart}
              disabled={!capabilities.nativeModule}
            >
              <Zap size={13} color={colors.textInverse} />
              <Text style={styles.startTxt}>Start session</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  // ---------- active ----------
  const phaseColor = status?.picksUntil === 0 ? colors.negative
    : status?.picksUntil === 1 ? GOLD : colors.positive;
  const statusLine = status
    ? [
        status.syncCount === 0 ? 'waiting for first sync' : `P${status.currentPick} · R${status.round}`,
        status.picksUntil == null ? null
          : status.picksUntil === 0 ? 'ON THE CLOCK'
          : `up in ${status.picksUntil}`,
        status.slot
          ? `slot ${status.slot}${status.slotSource === 'anchored' ? ' (pinned)' : status.slotSource === 'inferred' ? ' (auto)' : ''}`
          : 'slot pending',
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
                Tap the record button, then <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>Start Broadcast</Text> on
                the iOS sheet, then switch to Underdog. Stop anytime from the red status icon.{' '}
                BBE reads only the Underdog draft board on your device and discards every frame instantly — nothing else is stored or sent.
              </>
            ) : (
              <>
                This build has no in-app record button. Open Control Center, long-press
                <Text style={{ color: colors.textPrimary, fontWeight: '700' }}> Screen Recording</Text>, choose
                <Text style={{ color: colors.textPrimary, fontWeight: '700' }}> BBE Draft Capture</Text>, then Start Broadcast.
                If it isn't listed, install the latest EAS build.{' '}
                BBE reads only the Underdog draft board on your device and discards every frame instantly — nothing else is stored or sent.
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

      <View style={styles.btnRow}>
        <Pressable style={styles.actionBtn} onPress={() => demoSync()}>
          <FlaskConical size={12} color={colors.textSecondary} />
          <Text style={[styles.actionTxt, { color: colors.textSecondary }]}>Demo</Text>
        </Pressable>
        <Pressable
          style={styles.actionBtn}
          onPress={() => {
            try { setDebugText(exportDebug()); } catch (e) { setDebugText(`export failed: ${e?.message}`); }
          }}
        >
          <Bug size={12} color={colors.textSecondary} />
          <Text style={[styles.actionTxt, { color: colors.textSecondary }]}>Debug</Text>
        </Pressable>
        <Pressable style={[styles.actionBtn, { borderColor: `${colors.negative}66` }]} onPress={() => endSession()}>
          <Square size={11} color={colors.negative} />
          <Text style={[styles.actionTxt, { color: colors.negative }]}>End</Text>
        </Pressable>
      </View>

      {expanded && (
        <>
          {status?.slotConflict && (
            <View style={styles.warnRow}>
              <TriangleAlert size={11} color={GOLD} />
              <Text style={[styles.warnTxt, { color: GOLD }]}>
                Screen evidence says slot {status.anchoredSlot || status.inferredSlot}
                {status.anchoredSlot ? ` (your card${status.learnedUsername ? `, ${status.learnedUsername}` : ''})` : ''}, you set {status.manualSlot}.
              </Text>
              <Pressable onPress={() => setSessionSlot(null)}>
                <Text style={{ color: colors.accent, fontSize: 10.5, fontWeight: '700' }}> Use {status.anchoredSlot || status.inferredSlot}</Text>
              </Pressable>
            </View>
          )}
          {status?.learnedUsername && !status?.slotConflict && (
            <Text style={[type.muted, { fontSize: 10.5, marginTop: 6 }]}>
              Tracking {status.learnedUsername}
              {status.slotSource === 'anchored' ? ` · slot ${status.slot} pinned from your card` : ''}
            </Text>
          )}
          {engineStale && (
            <WarnRow>
              The broadcast extension is running an OLD engine build — parsing fixes are not live.
              Install the latest EAS build to update it (Metro reload is not enough).
            </WarnRow>
          )}
          {!activityStarted && <WarnRow>Live Activity failed: {activityError || 'unknown'}</WarnRow>}
          {activityStarted && !pushToken && (
            <WarnRow color={GOLD}>
              No push token — the Live Activity refreshes only when you reopen BBE. Check the relay setup (docs/LIVE_SESSION_V1.md).
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
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  slotBtn: {
    width: 26, height: 26, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.surface2 ?? colors.surface1,
    alignItems: 'center', justifyContent: 'center',
  },
  slotBtnOn: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
  usernameInput: {
    flex: 1, height: 30, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.surface2 ?? colors.surface1,
    paddingHorizontal: 8, paddingVertical: 0,
    fontSize: 11.5, fontWeight: '600', color: colors.textPrimary,
  },
  slotTxt: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  startBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6,
    backgroundColor: colors.accent, borderRadius: radii.md,
    paddingVertical: 9, marginTop: spacing.sm,
  },
  startTxt: { color: colors.textInverse, fontSize: 13, fontWeight: '800' },
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
