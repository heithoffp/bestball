// LiveSessionPanel — start/stop + status UI for the iOS Live Draft Session
// (docs/LIVE_SESSION_V1.md). Renders at the top of the Draft Assistant.
// Two capture modes: 'live' (ReplayKit broadcast — fully hands-free) and
// 'shots' (screenshot sweep fallback). Active state doubles as the
// confidence hub: capture heartbeat, parse log, slot conflicts, warnings.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import {
  Radio, Camera, Square, Zap, TriangleAlert, ChevronDown, ChevronUp, FlaskConical, Cast,
} from 'lucide-react-native';
import { canonicalName } from '../../shared/utils/helpers';
import { usePortfolio } from '../contexts/PortfolioContext';
import {
  subscribeSession, startSession, endSession, syncNow, demoSync, setSessionSlot,
  BROADCAST_EXTENSION_ID,
} from '../draft/sessionController';
import { getBroadcastPickerComponent } from '../draft/liveActivity';
import { Segmented } from '../components/ui';
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

export default function LiveSessionPanel() {
  const { masterPlayers, adpByPlatform, rankingsByPlatform, rosterData } = usePortfolio();
  const [snap, setSnap] = useState(null);
  const [slotChoice, setSlotChoice] = useState(null); // null = auto-detect
  const [mode, setMode] = useState('live');
  const [expanded, setExpanded] = useState(false);

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
    active, syncing, status, log, capabilities, activityStarted, activityError,
    photoAccess, lastError, captureLive, pushToken,
  } = snap;

  const handleStart = () => {
    startSession({
      poolRows, rankMap, exposureMap,
      slot: slotChoice, teams: TEAMS, rounds: ROUNDS,
      mode: capabilities.nativeModule ? mode : 'shots',
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
            <Segmented
              options={[
                { key: 'live', label: 'Live capture' },
                { key: 'shots', label: 'Screenshots' },
              ]}
              value={mode}
              onChange={setMode}
              style={{ marginTop: spacing.sm }}
            />
            <Text style={[type.muted, { marginTop: 6, lineHeight: 16 }]}>
              {mode === 'live'
                ? 'Hands-free: start the session, tap the record button and pick "BBE Draft Capture", then just draft in Underdog. Your lock-screen Live Activity updates automatically as picks come in.'
                : 'Manual: screenshot the Underdog draft room (Players or Board tab) and flip back to BBE to sync. No broadcast, no server — everything stays on-device.'}
            </Text>
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
            <Pressable style={styles.startBtn} onPress={handleStart}>
              <Zap size={13} color={colors.textInverse} />
              <Text style={styles.startTxt}>Start session</Text>
            </Pressable>
          </>
        )}
      </View>
    );
  }

  // ---------- active ----------
  const isLiveMode = snap.mode === 'live';
  const phaseColor = status?.picksUntil === 0 ? colors.negative
    : status?.picksUntil === 1 ? GOLD : colors.positive;
  const statusLine = status
    ? [
        status.syncCount === 0 ? 'waiting for first sync' : `P${status.currentPick} · R${status.round}`,
        status.picksUntil == null ? null
          : status.picksUntil === 0 ? 'ON THE CLOCK'
          : `up in ${status.picksUntil}`,
        status.slot ? `slot ${status.slot}${status.manualSlot ? '' : ' (auto)'}` : 'slot pending',
      ].filter(Boolean).join(' · ')
    : '';

  return (
    <View style={[styles.card, { borderColor: `${phaseColor}55` }]}>
      <Pressable style={styles.headerRow} onPress={() => setExpanded(v => !v)}>
        <Radio size={13} color={phaseColor} />
        <Text style={[styles.title, { color: phaseColor }]}>LIVE</Text>
        {isLiveMode && (
          <View style={[styles.capChip, { borderColor: captureLive ? colors.positive : colors.textMuted }]}>
            <Cast size={9} color={captureLive ? colors.positive : colors.textMuted} />
            <Text style={{ fontSize: 9, fontWeight: '800', color: captureLive ? colors.positive : colors.textMuted }}>
              {captureLive ? 'CAPTURING' : 'NO CAPTURE'}
            </Text>
          </View>
        )}
        <Text style={[type.secondary, { fontSize: 11.5, flexShrink: 1 }]} numberOfLines={1}>{statusLine}</Text>
        <View style={{ flex: 1 }} />
        {expanded ? <ChevronUp size={14} color={colors.textMuted} /> : <ChevronDown size={14} color={colors.textMuted} />}
      </Pressable>

      {isLiveMode && !captureLive && (
        <View style={styles.broadcastRow}>
          {BroadcastPicker ? (
            <View style={styles.recordBtnWrap}>
              <BroadcastPicker preferredExtension={BROADCAST_EXTENSION_ID} style={{ width: 44, height: 44 }} />
            </View>
          ) : (
            <Cast size={22} color={colors.textMuted} />
          )}
          <Text style={[type.muted, { flex: 1, lineHeight: 15 }]}>
            {BroadcastPicker ? (
              <>
                Tap the record button, choose <Text style={{ color: colors.textPrimary, fontWeight: '700' }}>BBE Draft Capture</Text>,
                then switch to Underdog. Stop it anytime from the red status icon.
              </>
            ) : (
              <>
                This build has no in-app record button. Open Control Center, long-press
                <Text style={{ color: colors.textPrimary, fontWeight: '700' }}> Screen Recording</Text>, choose
                <Text style={{ color: colors.textPrimary, fontWeight: '700' }}> BBE Draft Capture</Text>, then Start Broadcast.
                If it isn't listed, install the latest EAS build.
              </>
            )}
          </Text>
        </View>
      )}

      <View style={styles.btnRow}>
        {!isLiveMode && (
          <Pressable style={[styles.actionBtn, syncing && { opacity: 0.5 }]} onPress={() => syncNow('manual')} disabled={syncing}>
            <Camera size={12} color={colors.textPrimary} />
            <Text style={styles.actionTxt}>{syncing ? 'Syncing…' : 'Sync now'}</Text>
          </Pressable>
        )}
        <Pressable style={styles.actionBtn} onPress={() => demoSync()}>
          <FlaskConical size={12} color={colors.textSecondary} />
          <Text style={[styles.actionTxt, { color: colors.textSecondary }]}>Demo</Text>
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
                Screen evidence says slot {status.inferredSlot}, you set {status.manualSlot}.
              </Text>
              <Pressable onPress={() => setSessionSlot(null)}>
                <Text style={{ color: colors.accent, fontSize: 10.5, fontWeight: '700' }}> Use {status.inferredSlot}</Text>
              </Pressable>
            </View>
          )}
          {!activityStarted && <WarnRow>Live Activity failed: {activityError || 'unknown'}</WarnRow>}
          {isLiveMode && activityStarted && !pushToken && (
            <WarnRow color={GOLD}>
              No push token — the Live Activity refreshes only when you reopen BBE. Check the relay setup (docs/LIVE_SESSION_V1.md).
            </WarnRow>
          )}
          {!isLiveMode && photoAccess === false && (
            <WarnRow>No Photos access — allow "All Photos" in Settings, or use the Shortcut link path.</WarnRow>
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
  slotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.sm },
  slotBtn: {
    width: 26, height: 26, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.surface2 ?? colors.surface1,
    alignItems: 'center', justifyContent: 'center',
  },
  slotBtnOn: { borderColor: colors.accent, backgroundColor: colors.accentMuted },
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
});
