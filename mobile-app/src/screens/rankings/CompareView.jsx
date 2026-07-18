// CompareView.jsx — mobile UD-vs-DK compare: an interactive diff of the two
// platform boards (TASK-351). Synced dual columns, rank-delta curves in the
// gutter (CompareCurves), movers filter, tap-to-highlight counterpart.
// Editing happens on the single-platform board; this view is read-only.
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet } from 'react-native';
import { Lock, Unlock } from 'lucide-react-native';
import { posColor } from '../../../shared/utils/positionColors';
import { SearchBar, Segmented } from '../../components/ui';
import { colors, spacing, radii, type, withAlpha } from '../../theme';
import { usePortfolio } from '../../contexts/PortfolioContext';
import { buildPlayersFromSource } from './buildPlayers';
import CompareCurves from './CompareCurves';

const ROW_H = 40;
const GUTTER_W = 56;
const OVERSCAN_ROWS = 6;
const VIEWS = ['overall', 'QB', 'RB', 'WR', 'TE'];
const MOVER_STEPS = [
  { key: 0, label: 'All' },
  { key: 5, label: '5+' },
  { key: 10, label: '10+' },
  { key: 25, label: '25+' },
  { key: 50, label: '50+' },
];

const CompareRow = React.memo(function CompareRow({ player, rank, selected, accent, onPress }) {
  const pc = posColor((player.slotName || '').toUpperCase());
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.compareRow,
        { borderLeftColor: pc },
        selected && { backgroundColor: withAlpha(accent, 0.16), borderColor: accent },
      ]}
    >
      <Text style={styles.compareRank}>{rank}</Text>
      <Text style={[type.body, { fontSize: 12, fontWeight: '600', flex: 1 }]} numberOfLines={1}>
        {player.name}
      </Text>
      <Text style={[type.muted, { fontSize: 10, fontVariant: ['tabular-nums'] }]}>{player.adpStr}</Text>
    </Pressable>
  );
});

export default function CompareView() {
  const { rankingsByPlatform, adpByPlatform } = usePortfolio();

  /* ── per-platform lists (saved order, or ADP fallback) ── */
  const [udPlayers, udSource] = useMemo(() => {
    const projMap = adpByPlatform?.underdog?.projPointsMap ?? {};
    const saved = rankingsByPlatform?.underdog;
    if (saved?.length > 0) return [buildPlayersFromSource(saved, projMap, false), 'saved'];
    const adp = adpByPlatform?.underdog?.latestRows ?? [];
    if (adp.length > 0) return [buildPlayersFromSource(adp, projMap, true), 'adp'];
    return [[], null];
  }, [rankingsByPlatform?.underdog, adpByPlatform?.underdog]);

  const [dkPlayers, dkSource] = useMemo(() => {
    const projMap = adpByPlatform?.draftkings?.projPointsMap ?? {};
    const saved = rankingsByPlatform?.draftkings;
    if (saved?.length > 0) return [buildPlayersFromSource(saved, projMap, false), 'saved'];
    const adp = adpByPlatform?.draftkings?.latestRows ?? [];
    if (adp.length > 0) return [buildPlayersFromSource(adp, projMap, true), 'adp'];
    return [[], null];
  }, [rankingsByPlatform?.draftkings, adpByPlatform?.draftkings]);

  /* ── controls ── */
  const [viewMode, setViewMode] = useState('overall');
  const [searchTerm, setSearchTerm] = useState('');
  const [moversThreshold, setMoversThreshold] = useState(0);
  const [locked, setLocked] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  const isSearching = searchTerm.trim().length > 0;

  /* ── full-list rank maps (movers filter, like the web) ── */
  const udRankMap = useMemo(() => {
    const m = new Map();
    udPlayers.forEach((p, i) => m.set(p.id, i + 1));
    return m;
  }, [udPlayers]);
  const dkRankMap = useMemo(() => {
    const m = new Map();
    dkPlayers.forEach((p, i) => m.set(p.id, i + 1));
    return m;
  }, [dkPlayers]);

  const passesFilters = useCallback((p) => {
    if (viewMode !== 'overall' && (p.slotName || '').toUpperCase() !== viewMode) return false;
    if (isSearching) {
      const q = searchTerm.trim().toLowerCase();
      if (!(`${p.name} ${p.teamName}`).toLowerCase().includes(q)) return false;
    }
    if (moversThreshold > 0) {
      const u = udRankMap.get(p.id);
      const d = dkRankMap.get(p.id);
      if (u != null && d != null && Math.abs(u - d) < moversThreshold) return false;
    }
    return true;
  }, [viewMode, isSearching, searchTerm, moversThreshold, udRankMap, dkRankMap]);

  const udDisplayed = useMemo(() => udPlayers.filter(passesFilters), [udPlayers, passesFilters]);
  const dkDisplayed = useMemo(() => dkPlayers.filter(passesFilters), [dkPlayers, passesFilters]);

  const udDisplayIndex = useMemo(() => {
    const m = new Map();
    udDisplayed.forEach((p, i) => m.set(p.id, i));
    return m;
  }, [udDisplayed]);
  const dkDisplayIndex = useMemo(() => {
    const m = new Map();
    dkDisplayed.forEach((p, i) => m.set(p.id, i));
    return m;
  }, [dkDisplayed]);

  /* ── scroll state ── */
  const udRef = useRef(null);
  const dkRef = useRef(null);
  const suppressSync = useRef({ ud: 0, dk: 0 });
  const [scrollUd, setScrollUd] = useState(0);
  const [scrollDk, setScrollDk] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  const makeScrollHandler = useCallback((side) => (e) => {
    const y = e.nativeEvent.contentOffset.y;
    if (side === 'ud') setScrollUd(y); else setScrollDk(y);
    if (!locked) return;
    if (Date.now() < suppressSync.current[side]) return;
    const other = side === 'ud' ? 'dk' : 'ud';
    const otherRef = side === 'ud' ? dkRef : udRef;
    suppressSync.current[other] = Date.now() + 120;
    otherRef.current?.scrollToOffset({ offset: y, animated: false });
  }, [locked]);

  const onScrollUd = useMemo(() => makeScrollHandler('ud'), [makeScrollHandler]);
  const onScrollDk = useMemo(() => makeScrollHandler('dk'), [makeScrollHandler]);

  /* ── tap-to-highlight + counterpart auto-scroll ── */
  const handleRowPress = useCallback((playerId, side) => {
    setSelectedId(prev => {
      const next = prev === playerId ? null : playerId;
      if (next) {
        const otherIdx = side === 'ud' ? dkDisplayIndex.get(playerId) : udDisplayIndex.get(playerId);
        if (otherIdx != null && viewportH > 0) {
          const otherRef = side === 'ud' ? dkRef : udRef;
          const other = side === 'ud' ? 'dk' : 'ud';
          const offset = Math.max(0, otherIdx * ROW_H - viewportH / 2 + ROW_H / 2);
          suppressSync.current[other] = Date.now() + 500;
          otherRef.current?.scrollToOffset({ offset, animated: true });
        }
      }
      return next;
    });
  }, [dkDisplayIndex, udDisplayIndex, viewportH]);

  /* ── curves for the visible window ── */
  const curves = useMemo(() => {
    if (viewportH <= 0 || udDisplayed.length === 0 || dkDisplayed.length === 0) return [];
    const out = [];
    const seen = new Set();
    const overscan = ROW_H * OVERSCAN_ROWS;

    const addCurve = (id) => {
      if (seen.has(id)) return;
      const li = udDisplayIndex.get(id);
      const ri = dkDisplayIndex.get(id);
      if (li == null || ri == null) return;
      const leftY = li * ROW_H + ROW_H / 2 - scrollUd;
      const rightY = ri * ROW_H + ROW_H / 2 - scrollDk;
      const leftVisible = leftY >= -ROW_H && leftY <= viewportH + ROW_H;
      const rightVisible = rightY >= -ROW_H && rightY <= viewportH + ROW_H;
      if (!leftVisible && !rightVisible) return;
      const player = udDisplayed[li];
      out.push({
        id,
        name: player?.name || '',
        leftY,
        rightY,
        leftRank: li + 1,
        rightRank: ri + 1,
        leftVisible,
        rightVisible,
      });
      seen.add(id);
    };

    const udFrom = Math.max(0, Math.floor((scrollUd - overscan) / ROW_H));
    const udTo = Math.min(udDisplayed.length - 1, Math.ceil((scrollUd + viewportH + overscan) / ROW_H));
    for (let i = udFrom; i <= udTo; i++) addCurve(udDisplayed[i].id);
    const dkFrom = Math.max(0, Math.floor((scrollDk - overscan) / ROW_H));
    const dkTo = Math.min(dkDisplayed.length - 1, Math.ceil((scrollDk + viewportH + overscan) / ROW_H));
    for (let i = dkFrom; i <= dkTo; i++) addCurve(dkDisplayed[i].id);
    if (selectedId) addCurve(selectedId);
    return out;
  }, [viewportH, udDisplayed, dkDisplayed, udDisplayIndex, dkDisplayIndex, scrollUd, scrollDk, selectedId]);

  /* ── shared bits ── */
  const getItemLayout = useCallback((data, index) => (
    { length: ROW_H, offset: ROW_H * index, index }
  ), []);

  const sourcePill = (source) => {
    if (source === 'saved') return <Text style={[styles.pill, { color: colors.positive, borderColor: withAlpha(colors.positive, 0.4) }]}>Saved</Text>;
    if (source === 'adp') return <Text style={[styles.pill, { color: colors.textSecondary, borderColor: colors.borderStrong }]}>ADP</Text>;
    return <Text style={[styles.pill, { color: colors.textMuted, borderColor: colors.borderDefault }]}>—</Text>;
  };

  if (udPlayers.length === 0 && dkPlayers.length === 0) {
    return (
      <View style={{ padding: spacing.xl }}>
        <Text style={type.secondary}>
          No rankings or ADP loaded for either platform. Sync data or save a board first.
        </Text>
      </View>
    );
  }

  const renderColumn = (side) => {
    const displayed = side === 'ud' ? udDisplayed : dkDisplayed;
    const accent = side === 'ud' ? colors.platformUd : colors.platformDk;
    const listRef = side === 'ud' ? udRef : dkRef;
    const onScroll = side === 'ud' ? onScrollUd : onScrollDk;
    return (
      <FlatList
        ref={listRef}
        data={displayed}
        keyExtractor={(p) => p.id}
        getItemLayout={getItemLayout}
        onScroll={onScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        initialNumToRender={16}
        windowSize={7}
        renderItem={({ item, index }) => (
          <CompareRow
            player={item}
            rank={index + 1}
            selected={selectedId === item.id}
            accent={accent}
            onPress={() => handleRowPress(item.id, side)}
          />
        )}
        ListEmptyComponent={
          <Text style={[type.muted, { textAlign: 'center', paddingTop: spacing.xl }]}>No players</Text>
        }
      />
    );
  };

  const selectedDelta = (() => {
    if (!selectedId) return null;
    const u = udDisplayIndex.get(selectedId);
    const d = dkDisplayIndex.get(selectedId);
    if (u == null || d == null) return null;
    return (d + 1) - (u + 1);
  })();

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <Segmented
          options={VIEWS.map(v => ({ key: v, label: v === 'overall' ? 'All' : v }))}
          value={viewMode}
          onChange={(v) => { setViewMode(v); setSelectedId(null); }}
          style={{ marginBottom: spacing.sm }}
        />
        <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Search both boards..." style={{ marginBottom: spacing.sm }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
          <Text style={[type.muted, { flexShrink: 0 }]}>Movers ≥</Text>
          <Segmented
            style={{ flex: 1 }}
            options={MOVER_STEPS}
            value={moversThreshold}
            onChange={(v) => { setMoversThreshold(v); setSelectedId(null); }}
          />
          <Pressable style={styles.lockBtn} onPress={() => setLocked(v => !v)} hitSlop={6}>
            {locked
              ? <Lock size={14} color={colors.accent} />
              : <Unlock size={14} color={colors.textSecondary} />}
          </Pressable>
        </View>
        <Text style={[type.muted, { marginBottom: spacing.sm }]}>
          Your rank on each platform. Tap a player to trace them across boards.
          {selectedDelta != null ? `  Δ ${selectedDelta > 0 ? '+' : ''}${selectedDelta} (UD → DK)` : ''}
          {' '}Edit order on the board view.
        </Text>
      </View>

      {/* Column headers */}
      <View style={styles.columnHeaders}>
        <View style={[styles.columnHeader, { borderBottomColor: colors.platformUd }]}>
          <Text style={[styles.platformLabel, { color: colors.platformUd }]}>Underdog</Text>
          {sourcePill(udSource)}
          <Text style={styles.countLabel}>{udDisplayed.length}</Text>
        </View>
        <View style={{ width: GUTTER_W }} />
        <View style={[styles.columnHeader, { borderBottomColor: colors.platformDk }]}>
          <Text style={[styles.platformLabel, { color: colors.platformDk }]}>DraftKings</Text>
          {sourcePill(dkSource)}
          <Text style={styles.countLabel}>{dkDisplayed.length}</Text>
        </View>
      </View>

      {/* Columns + curve gutter */}
      <View
        style={styles.columnsArea}
        onLayout={(e) => setViewportH(e.nativeEvent.layout.height)}
      >
        <View style={{ flex: 1 }}>{renderColumn('ud')}</View>
        <View style={{ width: GUTTER_W }}>
          <CompareCurves
            width={GUTTER_W}
            height={viewportH}
            curves={curves}
            activePlayerId={selectedId}
          />
        </View>
        <View style={{ flex: 1 }}>{renderColumn('dk')}</View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  compareRow: {
    height: ROW_H - 4, marginBottom: 4,
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: colors.surface1,
    borderRadius: radii.sm, borderWidth: 1, borderColor: colors.borderSubtle,
    borderLeftWidth: 3,
    paddingHorizontal: 6,
  },
  compareRank: {
    width: 24, textAlign: 'right',
    color: colors.textSecondary, fontWeight: '700',
    fontVariant: ['tabular-nums'], fontSize: 11,
  },
  columnHeaders: {
    flexDirection: 'row', paddingHorizontal: spacing.lg, marginBottom: 4,
  },
  columnHeader: {
    flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6,
    borderBottomWidth: 2, paddingBottom: 5,
  },
  platformLabel: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
  pill: {
    fontSize: 9, fontWeight: '700',
    borderWidth: 1, borderRadius: radii.pill,
    paddingHorizontal: 6, paddingVertical: 1, overflow: 'hidden',
  },
  countLabel: { marginLeft: 'auto', fontSize: 10, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  columnsArea: { flex: 1, flexDirection: 'row', paddingHorizontal: spacing.lg },
  lockBtn: {
    width: 34, height: 34, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm,
  },
});
