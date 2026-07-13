// DraftExplorerView — mobile port of DraftExplorer.jsx. Same data model
// (draftModel.js pick-path counts from real drafts): tap players round by
// round to build a 4-pick path; cells heat-map how often real drafts took
// that player next; combo frequency and your matching rosters update live.
// The web's 12-wide snake grid becomes one horizontally-scrolling row per
// round on mobile.
import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import { loadTier3Initial, getTier3Cache, computeDraftState } from '../../shared/utils/draftModel';
import { canonicalName } from '../../shared/utils/helpers';
import { Segmented } from '../components/ui';
import { colors, spacing, radii, type } from '../theme';

const POS_COLORS = { QB: '#bf44ef', RB: '#10b981', WR: '#f59e0b', TE: '#3b82f6' };
const TEAMS = 12;
const MAX_DISPLAY_ROUNDS = 6;
const MAX_PICK_ROUNDS = 4;
const PRE_DRAFT_ADP_DATE = '2026-04-13';

/** Look up a player's ADP at a specific snapshot date, averaging across platforms. */
function adpAtDate(player, targetDate) {
  const hist = Array.isArray(player.history) ? player.history : [];
  if (hist.length === 0) return { adpPick: player.adpPick ?? null, adpDisplay: player.adpDisplay ?? '-' };

  const exact = hist.filter(h => h.date === targetDate && Number.isFinite(h.adpPick));
  if (exact.length > 0) {
    const avg = exact.reduce((s, h) => s + h.adpPick, 0) / exact.length;
    return { adpPick: avg, adpDisplay: avg.toFixed(1) };
  }

  const earlier = hist
    .filter(h => h.date <= targetDate && Number.isFinite(h.adpPick))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (earlier.length === 0) return { adpPick: null, adpDisplay: '-' };
  const latestDate = earlier[0].date;
  const sameDate = earlier.filter(h => h.date === latestDate);
  const avg = sameDate.reduce((s, h) => s + h.adpPick, 0) / sameDate.length;
  return { adpPick: avg, adpDisplay: avg.toFixed(1) };
}

export default function DraftExplorerView({ masterPlayers = [], rosterData = [], tournamentStatuses = {}, onNavigateToRosters = null, defaultMode = 'pre' }) {
  const [selections, setSelections] = useState([]);
  const [dataVersion, setDataVersion] = useState(0);
  const [mode, setMode] = useState(defaultMode === 'post' ? 'post' : 'pre');

  const source = mode === 'post' ? 'post' : 'pre';
  const dataReady = dataVersion > 0;

  useEffect(() => {
    let cancelled = false;
    loadTier3Initial(source, { masterPlayers, rosterData })
      .then(() => { if (!cancelled) setDataVersion(v => v + 1); })
      .catch(() => { if (!cancelled) setDataVersion(v => v + 1); });
    return () => { cancelled = true; };
  }, [source, masterPlayers, rosterData]);

  const gridPlayers = useMemo(() => {
    if (!masterPlayers.length) return [];
    const annotated = masterPlayers.map(p => {
      const adp = mode === 'pre'
        ? adpAtDate(p, PRE_DRAFT_ADP_DATE)
        : { adpPick: p.adpPick ?? null, adpDisplay: p.adpDisplay ?? '-' };
      return {
        player_id: p.player_id,
        name: p.name,
        position: p.position,
        team: p.team,
        adp: adp.adpPick,
        adpDisplay: adp.adpDisplay,
      };
    });
    return annotated
      .filter(p => p.adp != null && Number.isFinite(p.adp) && p.adp <= 120)
      .sort((a, b) => a.adp - b.adp)
      .slice(0, TEAMS * MAX_DISPLAY_ROUNDS);
  }, [masterPlayers, mode]);

  const playerIdToGrid = useMemo(() => {
    const map = new Map();
    gridPlayers.forEach((p, i) => {
      map.set(p.player_id, i);
      const teamStripped = p.player_id.replace(/^(id-[^-]+-[^-]+-).*$/, '$1');
      if (teamStripped !== p.player_id && !map.has(teamStripped)) {
        map.set(teamStripped, i);
      }
    });
    return map;
  }, [gridPlayers]);

  const rostersByEntry = useMemo(() => {
    const map = new Map();
    rosterData.forEach(p => {
      const tStatus = tournamentStatuses[p.tournamentTitle];
      if (tStatus && tStatus !== mode) return;
      const id = p.entry_id || 'unknown';
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(p);
    });
    return map;
  }, [rosterData, tournamentStatuses, mode]);

  const { probMap, selectedSet, currentRound } = useMemo(() => {
    if (gridPlayers.length === 0 || !dataReady) {
      return { probMap: new Map(), selectedSet: new Set(), currentRound: 1 };
    }
    const cache = getTier3Cache(source);
    return computeDraftState(selections, gridPlayers, playerIdToGrid, cache);
  }, [source, selections, dataReady, dataVersion, gridPlayers, playerIdToGrid]);

  const matchingRosters = useMemo(() => {
    if (selections.length < 1) return [];
    const selectedCanonical = selections.map(s => canonicalName(gridPlayers[s.gridIndex]?.name));
    const matches = [];
    for (const [entryId, roster] of rostersByEntry) {
      const rosterCanonical = new Set(roster.map(p => canonicalName(p.name)));
      if (selectedCanonical.every(n => rosterCanonical.has(n))) {
        matches.push({ entryId, tournamentTitle: roster[0]?.tournamentTitle || entryId });
      }
    }
    return matches;
  }, [selections, gridPlayers, rostersByEntry]);

  const selectionFrequency = useMemo(() => {
    if (selections.length === 0 || !dataReady) return null;
    const cache = getTier3Cache(source);
    const pids = selections.map(s => gridPlayers[s.gridIndex].player_id);
    const totalRosters = cache.metadata?.total_rosters || 1;
    let count = 0;
    if (pids.length === 1) count = cache.r1?.[pids[0]] || 0;
    else if (pids.length === 2) count = cache.r2?.[pids[0]]?.[pids[1]] || 0;
    else if (pids.length === 3) count = cache.r3?.[`${pids[0]}|${pids[1]}`]?.[pids[2]] || 0;
    else if (pids.length === 4) count = cache.r4?.[`${pids[0]}|${pids[1]}|${pids[2]}`]?.[pids[3]] || 0;
    return { count, totalRosters };
  }, [source, selections, gridPlayers, dataReady, dataVersion]);

  const maxProb = useMemo(() => {
    let m = 0;
    for (const p of probMap.values()) m = Math.max(m, p);
    return m || 1;
  }, [probMap]);

  const handleCellPress = useCallback((gridIndex) => {
    if (selectedSet.has(gridIndex)) return;
    if (selections.length >= MAX_PICK_ROUNDS) return;
    setSelections(prev => [...prev, { gridIndex }]);
  }, [selections, selectedSet]);

  const totalTracked = getTier3Cache(source).metadata?.total_rosters || 0;

  // Rounds as horizontally scrolling rows (mobile replacement for the snake grid).
  const rounds = useMemo(() => {
    const out = [];
    for (let r = 0; r < MAX_DISPLAY_ROUNDS; r++) {
      const start = r * TEAMS;
      const end = Math.min(start + TEAMS, gridPlayers.length);
      const row = [];
      for (let i = start; i < end; i++) row.push({ ...gridPlayers[i], _gridIndex: i });
      out.push(row);
    }
    return out;
  }, [gridPlayers]);

  return (
    <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <Segmented
          options={[{ key: 'pre', label: 'Pre-Draft' }, { key: 'post', label: 'Post-Draft' }]}
          value={mode}
          onChange={(m) => { setMode(m); setSelections([]); }}
          style={{ marginBottom: spacing.sm }}
        />
        <Text style={[type.muted, { marginBottom: spacing.sm }]}>
          Tap players in ADP order to build a 4-pick opening. Cell shading = how often real tracked drafts took that player next.
          {dataReady ? ` ${totalTracked.toLocaleString()} tracked drafts.` : ''}
        </Text>

        {/* Selection path */}
        {selections.length > 0 && (
          <View style={styles.pathBox}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 6 }}>
              {selections.map((s, i) => {
                const p = gridPlayers[s.gridIndex];
                return (
                  <View key={i} style={[styles.pathChip, { borderColor: (POS_COLORS[p?.position] || colors.borderStrong) }]}>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>R{i + 1}</Text>
                    <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: '600' }}>{p?.name}</Text>
                  </View>
                );
              })}
            </View>
            {selectionFrequency && (
              <Text style={type.secondary}>
                This opening appears in <Text style={{ color: colors.accent, fontWeight: '700' }}>{selectionFrequency.count.toLocaleString()}</Text> of {selectionFrequency.totalRosters.toLocaleString()} tracked drafts
                {' '}({((selectionFrequency.count / selectionFrequency.totalRosters) * 100).toFixed(2)}%)
              </Text>
            )}
            {matchingRosters.length > 0 && (
              <Pressable onPress={() => onNavigateToRosters && onNavigateToRosters(selections.map(s => gridPlayers[s.gridIndex].name))}>
                <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600', marginTop: 4 }}>
                  {matchingRosters.length} of your rosters have all of these → view
                </Text>
              </Pressable>
            )}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
              <Pressable style={styles.smallBtn} onPress={() => setSelections(prev => prev.slice(0, -1))}>
                <Text style={styles.smallBtnText}>Undo</Text>
              </Pressable>
              <Pressable style={styles.smallBtn} onPress={() => setSelections([])}>
                <Text style={styles.smallBtnText}>Clear</Text>
              </Pressable>
            </View>
          </View>
        )}

        {!dataReady && (
          <View style={{ alignItems: 'center', padding: spacing.lg }}>
            <ActivityIndicator color={colors.accent} />
            <Text style={[type.muted, { marginTop: 6 }]}>Loading real-draft data…</Text>
          </View>
        )}
        {dataReady && totalTracked === 0 && (
          <Text style={[type.secondary, { marginBottom: spacing.sm }]}>
            No tracked draft data available (sign in with synced rosters to load real-draft frequencies).
          </Text>
        )}
      </View>

      {rounds.map((row, r) => (
        <View key={r} style={{ marginBottom: spacing.sm }}>
          <Text style={[type.muted, { paddingHorizontal: spacing.lg, marginBottom: 3, fontWeight: '700' }]}>
            ADP Round {r + 1}{currentRound === r + 1 && selections.length < MAX_PICK_ROUNDS ? '  ·  picking' : ''}
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: spacing.lg, gap: 5 }}>
            {row.map(p => {
              const idx = p._gridIndex;
              const isSelected = selectedSet.has(idx);
              const prob = probMap.get(idx) || 0;
              const heat = prob > 0 ? Math.max(0.12, prob / maxProb) : 0;
              const c = POS_COLORS[p.position] || '#6b7280';
              return (
                <Pressable
                  key={idx}
                  onPress={() => handleCellPress(idx)}
                  style={[
                    styles.cell,
                    { borderColor: c + '66' },
                    heat > 0 && { backgroundColor: c + Math.round(heat * 130).toString(16).padStart(2, '0') },
                    isSelected && { borderColor: colors.accent, borderWidth: 2, backgroundColor: colors.accentMuted },
                  ]}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ color: c, fontSize: 9, fontWeight: '800' }}>{p.position}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 9 }}>{p.adpDisplay}</Text>
                  </View>
                  <Text style={{ color: colors.textPrimary, fontSize: 11, fontWeight: '600' }} numberOfLines={2}>{p.name}</Text>
                  {prob > 0 && (
                    <Text style={{ color: colors.textSecondary, fontSize: 9.5, fontVariant: ['tabular-nums'] }}>
                      {(prob * 100).toFixed(1)}% next
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  pathBox: {
    backgroundColor: colors.surface1, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.borderDefault,
    padding: spacing.md, marginBottom: spacing.md,
  },
  pathChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: radii.sm,
    paddingHorizontal: 7, paddingVertical: 3,
    backgroundColor: colors.surface2,
  },
  smallBtn: {
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm,
    paddingHorizontal: 12, paddingVertical: 6,
  },
  smallBtnText: { color: colors.textPrimary, fontSize: 12, fontWeight: '600' },
  cell: {
    width: 96, height: 62, borderRadius: radii.sm,
    borderWidth: 1, padding: 5,
    backgroundColor: colors.surface1,
    justifyContent: 'space-between',
  },
});
