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
import { buildFlatItems, applyFlatReorder, applyFilteredReorder, computeTierMaps, moveToRank } from './boardItems';
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
    seededRef.current = activeSource;
    const projMap = adpByPlatform?.[platform]?.projPointsMap ?? {};
    const nameToAdpId = buildNameToAdpId(adpRows);
    const players = buildRankedPlayers(activeSource, { projMap, nameToAdpId, adpLookup, teamLookup });
    const derived = deriveTierBreaks(players);
    setBoard({ players, breaks: derived.breaks, labels: derived.labels });
    setDirty(false);
    setExpandedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSource, platform]);

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

  const flatItems = useMemo(
    () => (viewMode === 'overall' && !isSearching ? buildFlatItems(players, breaks) : []),
    [viewMode, isSearching, players, breaks]
  );

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

  /* ── reorder handlers ── */
  const handleOverallReorder = useCallback(({ from, to }) => {
    setBoard(prev => {
      const items = buildFlatItems(prev.players, prev.breaks);
      const res = applyFlatReorder(items, from, to, prev.labels);
      return res ? { players: res.players, breaks: res.breaks, labels: res.labels } : prev;
    });
    setDirty(true);
  }, []);

  const handleFilteredReorder = useCallback(({ from, to }) => {
    setBoard(prev => {
      const filtered = prev.players.filter(p => (p.slotName || '').toUpperCase() === viewMode);
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

  const renderFlatItem = useCallback(({ item }) => {
    if (item.type === 'divider') {
      return (
        <TierRail
          tierColor={getTierColor(item.tierNum)}
          label={tierLabelFor(item.tierNum)}
          ownerKey={item.ownerId}
          editable
          onLabelChange={handleLabelChange}
          onDelete={handleDeleteBreak}
        />
      );
    }
    if (item.type === 'insert') {
      return <InsertPill ownerId={item.ownerId} onInsert={handleInsertBreak} />;
    }
    const expanded = expandedId === item.player.id;
    return (
      <View>
        <DraggablePlayerRow
          player={item.player}
          rank={item.rank}
          expanded={expanded}
          onPress={() => handleRowPress(item.player.id)}
        />
        {expanded && renderExpandedPanel(item.player)}
      </View>
    );
  }, [tierLabelFor, handleLabelChange, handleDeleteBreak, handleInsertBreak, expandedId, handleRowPress, renderExpandedPanel]);

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
          keyExtractor={(p) => p.id}
          renderItem={renderSearchItem}
          contentContainerStyle={listPad}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={<Text style={[type.secondary, { textAlign: 'center', padding: spacing.xl }]}>No players match.</Text>}
        />
      ) : viewMode === 'overall' ? (
        <ReorderableList
          data={flatItems}
          keyExtractor={(item) => item.key}
          renderItem={renderFlatItem}
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
          keyExtractor={(p) => p.id}
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
