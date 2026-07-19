// BoardView.jsx — single-platform draft board with real drag-and-drop
// (react-native-reorderable-list), tier rails, and inline tier editing.
// Mobile analogue of the web PlayerRankings board (TASK-351).
//
// The list is ONE flat array of players + tier dividers + "+ Tier" pills
// (see boardItems.js). Only player rows expose a drag trigger; after a drop
// the model state is re-derived from the physically rearranged array.
// Board state ({players, breaks, labels}) lives in one object so a reorder
// updates all three atomically.
import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { View, Text, Pressable, TextInput, FlatList, StyleSheet } from 'react-native';
import ReorderableList, { useReorderableDrag } from 'react-native-reorderable-list';
import Papa from 'papaparse';
import * as Haptics from 'expo-haptics';
import { GripVertical, Save, Share2, RotateCcw } from 'lucide-react-native';
import { exportRankingsCSV, saveRankings } from '../../../shared/utils/rankingsExport';
import { deriveTierBreaks, getTierLabel, getTierColor } from '../../../shared/utils/rankingsTiers';
import { posColor } from '../../../shared/utils/positionColors';
import { SearchBar, Segmented } from '../../components/ui';
import { colors, spacing, radii, type } from '../../theme';
import { usePortfolio } from '../../contexts/PortfolioContext';
import { useAuth } from '../../contexts/AuthContext';
import {
  buildRankedPlayers, buildTeamLookup, buildNameToAdpId, buildAdpLookup,
} from './buildPlayers';
import { applyPlayerReorder, applyFilteredReorder, computeTierMaps, moveToRank } from './boardItems';
import { TierRail, InsertPill } from './TierRail';

const VIEWS = ['overall', 'QB', 'RB', 'WR', 'TE'];
const EMPTY_BOARD = { players: [], breaks: new Set(), labels: {} };

/* ── Row body (pure, shared by draggable + read-only lists) ── */
const PlayerRowBody = React.memo(function PlayerRowBody({
  player, rank, expanded, onPress, onGripLongPress, showGrip,
}) {
  const pc = posColor((player.slotName || '').toUpperCase());
  return (
    <Pressable
      style={[styles.row, expanded && { borderColor: colors.accent, backgroundColor: colors.surface2 }]}
      onPress={onPress}
    >
      {showGrip && (
        <Pressable
          onLongPress={onGripLongPress}
          delayLongPress={180}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 4 }}
          style={styles.grip}
        >
          <GripVertical size={17} color={colors.textMuted} />
        </Pressable>
      )}
      <Text style={styles.rank}>{rank}</Text>
      <View style={[styles.posPill, { backgroundColor: `${pc}22`, borderColor: `${pc}55` }]}>
        <Text style={{ color: pc, fontSize: 10, fontWeight: '800' }}>{player.slotName}</Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>{player.name}</Text>
        <Text style={type.muted} numberOfLines={1}>
          {player.teamName || '—'}{player.byeWeek ? ` · Bye ${player.byeWeek}` : ''}{player.projectedPoints ? ` · ${parseFloat(player.projectedPoints).toFixed(0)}pt` : ''}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={type.mono}>{player.latestAdp != null ? player.latestAdp.toFixed(1) : player.originalAdp}</Text>
        <Text style={[type.muted, { fontSize: 10 }]}>ADP</Text>
      </View>
    </Pressable>
  );
});

/* ── Draggable player row (own component: useReorderableDrag is a cell hook) ── */
function DraggablePlayerRow({ player, rank, expanded, onPress }) {
  const drag = useReorderableDrag();
  const startDrag = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
    drag();
  }, [drag]);
  return (
    <PlayerRowBody
      player={player}
      rank={rank}
      expanded={expanded}
      onPress={onPress}
      onGripLongPress={startDrag}
      showGrip
    />
  );
}

export default function BoardView({ platform }) {
  const { rankingsByPlatform, adpByPlatform, setRankingsByPlatform } = usePortfolio();
  const { user } = useAuth();

  const [board, setBoard] = useState(EMPTY_BOARD);
  const [viewMode, setViewMode] = useState('overall');
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedId, setExpandedId] = useState(null);
  const [rankInput, setRankInput] = useState('');
  const [saveStatus, setSaveStatus] = useState(null);
  const [dirty, setDirty] = useState(false);

  const savedRows = rankingsByPlatform[platform];
  const adpRows = adpByPlatform?.[platform]?.latestRows ?? [];
  const activeSource = useMemo(
    () => (savedRows?.length ? savedRows : adpRows),
    [savedRows, adpRows]
  );
  const isAdpFallback = !(savedRows?.length);

  const teamLookup = useMemo(() => buildTeamLookup(adpRows), [adpRows]);
  const adpLookup = useMemo(() => buildAdpLookup(adpRows), [adpRows]);

  // Seed on source-identity change (web's prevInitialPlayersRef pattern) —
  // ADP refreshes must not wipe a manual order, so lookups aren't dependencies.
  const seededRef = useRef(null);
  useEffect(() => {
    if (!activeSource || activeSource.length === 0) return;
    if (seededRef.current === activeSource) return;
    // Never clobber the board the user is actively editing. A background refresh
    // (ADR-030 / TASK-348) hands PortfolioContext a new array identity even when
    // the content is unchanged, which re-fires this effect; reseeding over an
    // unsaved manual order both wipes the user's work and — if it lands during a
    // drag — desyncs the reorderable list's indices. Skip the reseed while dirty.
    // handleSave pre-sets seededRef to the just-saved rows, so a clean board
    // still adopts legitimately new data on the next identity change.
    if (dirty) return;
    seededRef.current = activeSource;
    const projMap = adpByPlatform?.[platform]?.projPointsMap ?? {};
    const nameToAdpId = buildNameToAdpId(adpRows);
    const players = buildRankedPlayers(activeSource, { projMap, nameToAdpId, adpLookup, teamLookup });
    const derived = deriveTierBreaks(players);
    setBoard({ players, breaks: derived.breaks, labels: derived.labels });
    setDirty(false);
    setExpandedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSource, platform, dirty]);

  /* ── derived ── */
  const { players, breaks, labels } = board;

  const { tierByPlayer, labelByTier } = useMemo(
    () => computeTierMaps(players, breaks, labels),
    [players, breaks, labels]
  );
  const tierLabelFor = useCallback(
    (tierNum) => labelByTier.get(tierNum) || getTierLabel(tierNum),
    [labelByTier]
  );

  const overallRankById = useMemo(() => {
    const m = new Map();
    players.forEach((p, i) => m.set(p.id, i + 1));
    return m;
  }, [players]);

  const isSearching = searchTerm.trim().length > 0;

  const posPlayers = useMemo(
    () => (viewMode !== 'overall' && !isSearching
      ? players.filter(p => (p.slotName || '').toUpperCase() === viewMode)
      : []),
    [viewMode, isSearching, players]
  );

  const searchResults = useMemo(() => {
    if (!isSearching) return [];
    const q = searchTerm.trim().toLowerCase();
    let list = players;
    if (viewMode !== 'overall') list = list.filter(p => (p.slotName || '').toUpperCase() === viewMode);
    return list.filter(p => (`${p.name} ${p.teamName} ${p.slotName}`).toLowerCase().includes(q));
  }, [isSearching, searchTerm, viewMode, players]);

  // Total key function — a keyExtractor must never throw. The library can read a
  // transient out-of-range index during a reorder (e.g. mid-refresh), which would
  // otherwise hand us `undefined` and crash the release bundle. Fall back to the
  // row index for any missing/id-less row instead of dereferencing it.
  const keyOf = useCallback((p, i) => (p && p.id != null ? String(p.id) : `__row_${i}`), []);

  /* ── reorder handlers ── */
  // Overall board is a HOMOGENEOUS reorderable list (player rows only — tier rails
  // and insert pills are per-row decorations, not list items), so from/to index
  // the players array directly. See boardItems.applyPlayerReorder.
  const handleOverallReorder = useCallback(({ from, to }) => {
    setBoard(prev => {
      // Guard stale indices: a refresh that arrived mid-drag can leave from/to
      // pointing past the current array. Out-of-range → treat as a no-op.
      const len = prev.players.length;
      if (from < 0 || from >= len || to < 0 || to >= len) return prev;
      const res = applyPlayerReorder(prev.players, prev.breaks, prev.labels, from, to);
      return res || prev;
    });
    setDirty(true);
  }, []);

  const handleFilteredReorder = useCallback(({ from, to }) => {
    setBoard(prev => {
      const filtered = prev.players.filter(p => (p.slotName || '').toUpperCase() === viewMode);
      if (from < 0 || from >= filtered.length || to < 0 || to >= filtered.length) return prev;
      const next = applyFilteredReorder(prev.players, filtered, from, to);
      return next ? { ...prev, players: next } : prev;
    });
    setDirty(true);
  }, [viewMode]);

  /* ── tier editing ── */
  const handleInsertBreak = useCallback((playerId) => {
    setBoard(prev => {
      const breaksNext = new Set(prev.breaks);
      breaksNext.add(playerId);
      return { ...prev, breaks: breaksNext };
    });
    setDirty(true);
  }, []);

  const handleDeleteBreak = useCallback((playerId) => {
    setBoard(prev => {
      const breaksNext = new Set(prev.breaks);
      breaksNext.delete(playerId);
      const labelsNext = { ...prev.labels };
      delete labelsNext[playerId];
      return { ...prev, breaks: breaksNext, labels: labelsNext };
    });
    setDirty(true);
  }, []);

  const handleLabelChange = useCallback((ownerKey, newLabel) => {
    setBoard(prev => ({ ...prev, labels: { ...prev.labels, [ownerKey]: newLabel } }));
    setDirty(true);
  }, []);

  /* ── row actions ── */
  const handleRowPress = useCallback((id) => {
    setExpandedId(prev => (prev === id ? null : id));
    setRankInput('');
  }, []);

  const handleJumpToRank = useCallback((id) => {
    const r = parseInt(rankInput, 10);
    if (r >= 1) {
      setBoard(prev => {
        const next = moveToRank(prev.players, id, r);
        return next ? { ...prev, players: next } : prev;
      });
      setDirty(true);
    }
    setRankInput('');
    setExpandedId(null);
  }, [rankInput]);

  /* ── toolbar ── */
  const handleReset = useCallback(() => {
    if (adpRows.length === 0) return;
    const projMap = adpByPlatform?.[platform]?.projPointsMap ?? {};
    const nameToAdpId = buildNameToAdpId(adpRows);
    const resetPlayers = buildRankedPlayers(adpRows, { projMap, nameToAdpId, adpLookup, teamLookup });
    setBoard({ players: resetPlayers, breaks: new Set(), labels: {} });
    setDirty(true);
  }, [adpRows, adpByPlatform, platform, adpLookup, teamLookup]);

  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    try {
      const csv = await saveRankings(players, tierByPlayer, labels, platform);
      // Write the saved rows back into the portfolio context so a background
      // refresh (ADR-030 local-first) agrees with the just-saved board instead
      // of clobbering it. Pre-set the seed ref: this content is already on screen.
      const parsed = Papa.parse(csv.trim(), { header: true }).data
        .filter(r => (r.id || r.ID));
      if (parsed.length > 0) {
        seededRef.current = parsed;
        setRankingsByPlatform(prev => ({ ...prev, [platform]: parsed }));
      }
      setSaveStatus('saved');
      setDirty(false);
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [players, tierByPlayer, labels, platform, setRankingsByPlatform]);

  const handleExport = useCallback(() => {
    exportRankingsCSV(players, tierByPlayer, labels, platform).catch(() => {});
  }, [players, tierByPlayer, labels, platform]);

  /* ── renderers ── */
  const renderExpandedPanel = useCallback((player) => {
    const rank = overallRankById.get(player.id) ?? 0;
    const isBreak = breaks.has(player.id);
    return (
      <View style={styles.editPanel}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
          <Text style={[type.muted, { flexShrink: 0 }]}>Move to rank</Text>
          <TextInput
            style={styles.rankInput}
            value={rankInput}
            onChangeText={setRankInput}
            placeholder={`#${rank}`}
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            returnKeyType="done"
            onSubmitEditing={() => handleJumpToRank(player.id)}
          />
          {rank > 1 && (
            <Pressable
              style={styles.tierToggleBtn}
              onPress={() => {
                if (isBreak) handleDeleteBreak(player.id); else handleInsertBreak(player.id);
                setExpandedId(null);
              }}
            >
              <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>
                {isBreak ? 'Remove tier break' : '+ Tier break above'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }, [overallRankById, breaks, rankInput, handleJumpToRank, handleDeleteBreak, handleInsertBreak]);

  // Homogeneous overall list: every cell is a draggable player row. The tier rail
  // (a break above this player) and the "+ Tier" insert pill (a same-tier gap
  // below this player) render INSIDE the cell as decorations, keeping the drag
  // list free of non-draggable items — the mixed-cell layout was crashing the
  // native reorder path.
  const renderOverallItem = useCallback(({ item: player, index }) => {
    const isBreak = index > 0 && breaks.has(player.id);
    const tierNum = tierByPlayer.get(player.id) || 1;
    const expanded = expandedId === player.id;
    const nextPlayer = players[index + 1];
    // Insert pill sits between two same-tier players (i.e. the next player is not
    // itself a break owner); its ownerId is the player the break would sit above.
    const showInsertBelow = nextPlayer && !breaks.has(nextPlayer.id);
    return (
      <View>
        {isBreak && (
          <TierRail
            tierColor={getTierColor(tierNum)}
            label={tierLabelFor(tierNum)}
            ownerKey={player.id}
            editable
            onLabelChange={handleLabelChange}
            onDelete={handleDeleteBreak}
          />
        )}
        <DraggablePlayerRow
          player={player}
          rank={index + 1}
          expanded={expanded}
          onPress={() => handleRowPress(player.id)}
        />
        {expanded && renderExpandedPanel(player)}
        {showInsertBelow && <InsertPill ownerId={nextPlayer.id} onInsert={handleInsertBreak} />}
      </View>
    );
  }, [players, breaks, tierByPlayer, tierLabelFor, handleLabelChange, handleDeleteBreak, handleInsertBreak, expandedId, handleRowPress, renderExpandedPanel]);

  const renderPosItem = useCallback(({ item, index }) => (
    <DraggablePlayerRow
      player={item}
      rank={index + 1}
      expanded={false}
      onPress={() => handleRowPress(item.id)}
    />
  ), [handleRowPress]);

  const renderSearchItem = useCallback(({ item }) => (
    <PlayerRowBody
      player={item}
      rank={overallRankById.get(item.id) ?? '-'}
      expanded={false}
      showGrip={false}
    />
  ), [overallRankById]);

  const tierCount = players.length > 0 ? breaks.size + 1 : 0;
  const listPad = { paddingHorizontal: spacing.lg, paddingBottom: 40 };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <Segmented
          options={VIEWS.map(v => ({ key: v, label: v === 'overall' ? 'All' : v }))}
          value={viewMode}
          onChange={(v) => { setViewMode(v); setExpandedId(null); }}
          style={{ marginBottom: spacing.sm }}
        />
        <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Search the board..." style={{ marginBottom: spacing.sm }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
          <Pressable style={[styles.toolBtn, dirty && { borderColor: colors.accent }]} onPress={handleSave} disabled={!user || saveStatus === 'saving'}>
            <Save size={13} color={user ? colors.accent : colors.textMuted} />
            <Text style={[styles.toolBtnText, !user && { color: colors.textMuted }]}>
              {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved ✓' : saveStatus === 'error' ? 'Failed' : 'Save'}
            </Text>
          </Pressable>
          <Pressable style={styles.toolBtn} onPress={handleExport}>
            <Share2 size={13} color={colors.textSecondary} />
            <Text style={styles.toolBtnText}>Export</Text>
          </Pressable>
          <Pressable style={styles.toolBtn} onPress={handleReset}>
            <RotateCcw size={13} color={colors.textSecondary} />
            <Text style={styles.toolBtnText}>Reset to ADP</Text>
          </Pressable>
        </View>
        <Text style={[type.muted, { marginBottom: spacing.sm }]}>
          {players.length} players · {tierCount} tiers
          {isAdpFallback ? ' · seeded from current ADP' : ' · your saved order'}
          {isSearching ? ' · drag paused while searching' : ' · hold a grip to drag'}
          {!user ? ' · sign in to save' : ''}
        </Text>
      </View>

      {isSearching ? (
        <FlatList
          data={searchResults}
          keyExtractor={keyOf}
          renderItem={renderSearchItem}
          contentContainerStyle={listPad}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={[type.secondary, { textAlign: 'center', padding: spacing.xl }]}>No players match.</Text>}
        />
      ) : viewMode === 'overall' ? (
        <ReorderableList
          data={players}
          keyExtractor={keyOf}
          renderItem={renderOverallItem}
          onReorder={handleOverallReorder}
          contentContainerStyle={listPad}
          keyboardShouldPersistTaps="handled"
          autoscrollThreshold={0.15}
          autoscrollSpeedScale={1.2}
          ListHeaderComponent={players.length > 0 ? (
            <TierRail
              tierColor={getTierColor(1)}
              label={tierLabelFor(1)}
              ownerKey="__tier1__"
              editable
              onLabelChange={handleLabelChange}
            />
          ) : null}
          ListEmptyComponent={<Text style={[type.secondary, { textAlign: 'center', padding: spacing.xl }]}>No players loaded.</Text>}
        />
      ) : (
        <ReorderableList
          data={posPlayers}
          keyExtractor={keyOf}
          renderItem={renderPosItem}
          onReorder={handleFilteredReorder}
          contentContainerStyle={listPad}
          keyboardShouldPersistTaps="handled"
          autoscrollThreshold={0.15}
          autoscrollSpeedScale={1.2}
          ListEmptyComponent={<Text style={[type.secondary, { textAlign: 'center', padding: spacing.xl }]}>No players match.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface1, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.borderSubtle,
    paddingRight: spacing.md, paddingLeft: 4, paddingVertical: 8, marginBottom: 4,
  },
  grip: {
    width: 30, alignSelf: 'stretch',
    alignItems: 'center', justifyContent: 'center',
  },
  rank: { width: 30, textAlign: 'right', color: colors.textSecondary, fontWeight: '700', fontVariant: ['tabular-nums'], fontSize: 13 },
  posPill: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, width: 38, alignItems: 'center' },
  editPanel: {
    backgroundColor: colors.surface2, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.borderDefault,
    padding: spacing.sm, marginBottom: 6,
  },
  rankInput: {
    flex: 1, height: 36, borderRadius: radii.sm,
    backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.borderStrong,
    color: colors.textPrimary, textAlign: 'center', fontSize: 13,
  },
  tierToggleBtn: {
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  toolBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm,
    paddingHorizontal: 11, paddingVertical: 7,
  },
  toolBtnText: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
});
