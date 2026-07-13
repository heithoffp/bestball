// AdpTrackerView — mobile port of AdpTimeSeries.jsx. Same model: rich player
// list built from ADP snapshots, per-platform trend stats over a selectable
// time window (1W/1M/All), a watchlist of up to 10 charted players (UD solid /
// DK dashed in Both mode), "my pick ranges" quartile overlay, and a sortable
// player table (tap a row to add/remove it from the chart).
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, useWindowDimensions, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { X, Plus } from 'lucide-react-native';
import { parseAdpString, canonicalName } from '../../shared/utils/helpers';
import { posColor } from '../../shared/utils/positionColors';
import MultiLineChart from '../components/MultiLineChart';
import { SearchBar, Segmented, ChipRow } from '../components/ui';
import { colors, spacing, radii, type } from '../theme';
import { usePortfolio } from '../contexts/PortfolioContext';

const LINE_PALETTE = [
  '#3b82f6', '#ea580c', '#8b5cf6', '#059669', '#ec4899',
  '#0d9488', '#d97706', '#6366f1', '#65a30d', '#ef4444',
];
const MAX_SELECTED = 10;

const calculateBoxPlot = (values) => {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const quantile = (arr, q) => {
    const pos = (arr.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    return sorted[base + 1] !== undefined
      ? sorted[base] + rest * (sorted[base + 1] - sorted[base])
      : sorted[base];
  };
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;
  return { min: sorted[0], q1: quantile(sorted, 0.25), median: quantile(sorted, 0.50), q3: quantile(sorted, 0.75), max: sorted[sorted.length - 1], count: sorted.length, mean };
};

const fmtAdp = v => v !== null && v !== undefined ? v.toFixed(1) : '-';
const fmtTrend = v => {
  if (v == null) return '-';
  const icon = v < 0 ? '▲' : v > 0 ? '▼' : '';
  return `${icon} ${Math.abs(v).toFixed(1)}`;
};
const fmtTrendPct = v => {
  if (v == null) return '-';
  const icon = v < 0 ? '▲' : v > 0 ? '▼' : '';
  return `${icon} ${Math.abs(v).toFixed(1)}%`;
};
const trendColor = v => v == null ? colors.textMuted : v < 0 ? colors.positive : v > 0 ? colors.negative : colors.textMuted;

export default function AdpTrackerView() {
  const router = useRouter();
  const { width: screenWidth } = useWindowDimensions();
  const { adpSnapshots, adpByPlatform, masterPlayers, rosterData, setRosterNavContext } = usePortfolio();
  const teams = 12;

  const [query, setQuery] = useState('');
  const [showPickRanges, setShowPickRanges] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [timeScale, setTimeScale] = useState('1m');
  const [calcMode, setCalcMode] = useState('pct');
  const [sortConfig, setSortConfig] = useState({ key: 'udTrend', direction: 'asc' });

  const availablePlatforms = useMemo(
    () => Object.keys(adpByPlatform).filter(p => adpByPlatform[p]?.snapshots?.length > 0 && ['underdog', 'draftkings'].includes(p)),
    [adpByPlatform]
  );
  const isTwoPlat = availablePlatforms.length > 1;
  const [platformFilter, setPlatformFilter] = useState('underdog');
  const isBothMode = platformFilter === 'all' && isTwoPlat;

  const activeSnapshots = useMemo(() => {
    if (platformFilter === 'all') return adpSnapshots;
    return adpByPlatform[platformFilter]?.snapshots ?? [];
  }, [adpSnapshots, adpByPlatform, platformFilter]);

  // 1. Build player list + chart histories
  const richPlayerList = useMemo(() => {
    const playerMap = new Map();

    masterPlayers.forEach(p => {
      playerMap.set(p.player_id, {
        id: p.player_id, name: p.name, team: p.team || 'FA', position: p.position || '?',
        exposure: parseFloat(p.exposure || 0),
        firstAdp: null, lastAdp: null, adpHistory: [], adpHistoryByPlatform: {}, myPicks: [],
      });
    });

    const canonicalToId = new Map();
    for (const [pid, pData] of playerMap.entries()) {
      canonicalToId.set(canonicalName(pData.name), pid);
    }

    activeSnapshots.forEach((snapshot, snapIdx) => {
      snapshot.rows.forEach(row => {
        const fn = row.firstName || row.first_name || row['First Name'] || '';
        const ln = row.lastName || row.last_name || row['Last Name'] || '';
        const rawName = (fn + ' ' + ln).trim() || row['Player Name'] || row.player_name || row.Player || row.Name || '';
        if (!rawName) return;
        const normalizedName = rawName.trim().replace(/\s+/g, ' ');
        const canonKey = canonicalName(normalizedName);

        let matchedId = canonicalToId.get(canonKey) ?? null;
        if (!matchedId) {
          matchedId = `s_${normalizedName.replace(/\W+/g, '_')}`;
          if (!playerMap.has(matchedId)) {
            playerMap.set(matchedId, {
              id: matchedId, name: normalizedName,
              team: row['Team'] || row.team || 'N/A', position: row['Position'] || row.position || 'N/A',
              exposure: 0, firstAdp: null, lastAdp: null, adpHistory: [], adpHistoryByPlatform: {}, myPicks: [],
            });
            canonicalToId.set(canonKey, matchedId);
          }
        }

        const rawAdpVal = row.adp ?? row.ADP ?? row['ADP'] ?? row['Round.Pick'] ?? row['Adp'] ?? '';
        const parsed = parseAdpString(rawAdpVal, teams);
        const pick = parsed && !Number.isNaN(parsed.pick) ? parsed.pick : null;

        if (pick !== null) {
          const entry = playerMap.get(matchedId);
          entry.adpHistory[snapIdx] = pick;
          if (entry.firstAdp === null) entry.firstAdp = pick;
          entry.lastAdp = pick;
          const plat = snapshot.platform;
          if (plat && plat !== 'unknown') {
            entry.adpHistoryByPlatform[plat] ??= [];
            entry.adpHistoryByPlatform[plat][snapIdx] = pick;
          }
        }
      });
    });

    rosterData.forEach(rosterRow => {
      const pid = canonicalToId.get(canonicalName(rosterRow.name));
      if (pid && rosterRow.pick) playerMap.get(pid)?.myPicks.push(rosterRow.pick);
    });

    return Array.from(playerMap.values()).map(p => {
      const change = (p.firstAdp !== null && p.lastAdp !== null) ? p.lastAdp - p.firstAdp : 0;
      const pickStats = calculateBoxPlot(p.myPicks);
      const myAvg = pickStats ? pickStats.mean : null;
      const value = (p.lastAdp !== null && myAvg !== null) ? (myAvg - p.lastAdp) : null;
      return { ...p, change, displayAdp: p.lastAdp ? p.lastAdp.toFixed(1) : '-', pickStats, myAvg, value };
    });
  }, [masterPlayers, activeSnapshots, teams, rosterData]);

  const playerById = useMemo(() => {
    const m = new Map();
    for (const p of richPlayerList) m.set(p.id, p);
    return m;
  }, [richPlayerList]);

  // 2. Per-platform table stats over the time window
  const platStats = useMemo(() => {
    const extractName = row => {
      const fn = row.firstName || row.first_name || row['First Name'] || '';
      const ln = row.lastName || row.last_name || row['Last Name'] || '';
      return (fn + ' ' + ln).trim() || row['Player Name'] || row.player_name || row.Player || row.Name || '';
    };
    const extractAdp = row => {
      const raw = row.adp ?? row.ADP ?? row['ADP'] ?? row['Round.Pick'] ?? row['Adp'] ?? '';
      return parseAdpString(raw)?.pick ?? null;
    };

    const now = new Date();
    let cutoff = null;
    if (timeScale === '1w') cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (timeScale === '1m') cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const byName = {};

    for (const [plat, data] of Object.entries(adpByPlatform)) {
      if (!data?.snapshots?.length) continue;
      const snaps = data.snapshots;
      const windowSnaps = cutoff ? snaps.filter(s => new Date(s.date) >= cutoff) : snaps;
      if (!windowSnaps.length) continue;

      const buildMap = snap => {
        const map = {};
        snap.rows.forEach(row => {
          const name = canonicalName(extractName(row));
          if (!name) return;
          const adp = extractAdp(row);
          if (adp !== null) map[name] = adp;
        });
        return map;
      };

      const latestMap = buildMap(snaps[snaps.length - 1]);
      const firstMap = buildMap(windowSnaps[0]);

      new Set([...Object.keys(latestMap), ...Object.keys(firstMap)]).forEach(name => {
        byName[name] ??= {};
        const latest = latestMap[name] ?? null;
        const first = firstMap[name] ?? null;
        byName[name][plat] = {
          adp: latest,
          trend: latest !== null && first !== null ? latest - first : null,
          trendPct: latest !== null && first ? ((latest - first) / first) * 100 : null,
        };
      });
    }
    return byName;
  }, [adpByPlatform, timeScale]);

  // 3. Time-scale-aware trend
  const timeFilteredPlayers = useMemo(() => {
    const now = new Date();
    let cutoff = null;
    if (timeScale === '1w') cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (timeScale === '1m') cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const windowIndices = [];
    activeSnapshots.forEach((snap, idx) => { if (!cutoff || new Date(snap.date) >= cutoff) windowIndices.push(idx); });
    return richPlayerList.map(p => {
      let firstInWindow = null, lastInWindow = null;
      for (const idx of windowIndices) {
        const val = p.adpHistory[idx];
        if (val !== undefined) { if (firstInWindow === null) firstInWindow = val; lastInWindow = val; }
      }
      const change = firstInWindow !== null && lastInWindow !== null ? lastInWindow - firstInWindow : 0;
      const changePct = firstInWindow && lastInWindow !== null ? ((lastInWindow - firstInWindow) / firstInWindow) * 100 : null;
      return { ...p, change, changePct };
    });
  }, [richPlayerList, activeSnapshots, timeScale]);

  // 4. Enrich with platStats
  const enrichedPlayers = useMemo(() => {
    const allPs = Object.values(platStats);
    const maxUdAdp = allPs.reduce((m, ps) => Math.max(m, ps.underdog?.adp ?? 0), 0) || null;
    const maxDkAdp = allPs.reduce((m, ps) => Math.max(m, ps.draftkings?.adp ?? 0), 0) || null;
    const UD_MAX_PICK = 216;

    return timeFilteredPlayers
      .filter(p => p.lastAdp !== null)
      .map(p => {
        const ps = platStats[canonicalName(p.name)] ?? {};
        const udAdp = ps.underdog?.adp ?? null;
        const dkAdp = ps.draftkings?.adp ?? null;
        const udTrend = ps.underdog?.trend ?? null;
        const dkTrend = ps.draftkings?.trend ?? null;
        const udTrendPct = ps.underdog?.trendPct ?? null;
        const dkTrendPct = ps.draftkings?.trendPct ?? null;
        const dkClamped = dkAdp !== null ? Math.min(dkAdp, UD_MAX_PICK) : null;
        const deltaAdp = udAdp !== null && dkAdp !== null ? udAdp - dkClamped : null;
        const deltaAdpPct = udAdp !== null && dkAdp !== null ? ((udAdp - dkClamped) / ((udAdp + dkClamped) / 2)) * 100 : null;
        return {
          ...p, udAdp, dkAdp, deltaAdp, deltaAdpPct, udTrend, dkTrend, udTrendPct, dkTrendPct,
          udAdpSort: udAdp ?? maxDkAdp, dkAdpSort: dkAdp ?? maxUdAdp,
        };
      });
  }, [timeFilteredPlayers, platStats]);

  const enrichedById = useMemo(() => {
    const m = new Map();
    for (const p of enrichedPlayers) m.set(p.id, p);
    return m;
  }, [enrichedPlayers]);

  // 5. Filter + sort
  const filteredAndSortedList = useMemo(() => {
    let list = enrichedPlayers;
    const q = (query || '').toLowerCase().trim();
    if (q) list = list.filter(p => (`${p.name} ${p.team} ${p.position}`).toLowerCase().includes(q));

    const numericKeys = ['lastAdp', 'udAdp', 'dkAdp', 'deltaAdp', 'udTrend', 'dkTrend', 'value', 'myAvg', 'exposure', 'change'];
    const SORT_FIELD_MAP = { udAdp: 'udAdpSort', dkAdp: 'dkAdpSort' };
    const METRIC_KEYS = new Set(['deltaAdp', 'udTrend', 'dkTrend', 'change']);
    let sortKey = SORT_FIELD_MAP[sortConfig.key] ?? sortConfig.key;
    if (calcMode === 'pct' && METRIC_KEYS.has(sortConfig.key)) sortKey = `${sortConfig.key}Pct`;

    return [...list].sort((a, b) => {
      let vA = a[sortKey], vB = b[sortKey];
      if (sortConfig.key === 'name') {
        vA = (vA || '').toLowerCase();
        vB = (vB || '').toLowerCase();
      } else if (numericKeys.includes(sortConfig.key)) {
        if (vA == null && vB == null) return 0;
        if (vA == null) return 1;
        if (vB == null) return -1;
      }
      if (vA < vB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (vA > vB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [enrichedPlayers, query, sortConfig, calcMode]);

  // Auto-select top 5 on load
  const initialSelectionDone = useRef(false);
  useEffect(() => {
    if (!initialSelectionDone.current && filteredAndSortedList.length > 0) {
      initialSelectionDone.current = true;
      setSelectedIds(filteredAndSortedList.slice(0, 5).map(p => p.id));
    }
  }, [filteredAndSortedList]);

  const selectedPlayers = useMemo(
    () => selectedIds.map(id => playerById.get(id)).filter(Boolean),
    [selectedIds, playerById]
  );

  // 6. Chart data
  const chartData = useMemo(() => {
    const now = new Date();
    let cutoff = null;
    if (timeScale === '1w') cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (timeScale === '1m') cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const dateMap = new Map();
    activeSnapshots.forEach((snap, snapIdx) => {
      if (cutoff && new Date(snap.date) < cutoff) return;
      if (!dateMap.has(snap.date)) dateMap.set(snap.date, { date: snap.date });
      const row = dateMap.get(snap.date);
      selectedPlayers.forEach(player => {
        const id = player.id;
        if (isBothMode) {
          const udVal = player.adpHistoryByPlatform?.underdog?.[snapIdx];
          const dkVal = player.adpHistoryByPlatform?.draftkings?.[snapIdx];
          if (udVal != null) row[`${id}_ud`] = udVal;
          if (dkVal != null) row[`${id}_dk`] = dkVal;
        } else {
          const val = player.adpHistory[snapIdx];
          if (val != null) row[id] = val;
        }
      });
    });
    return Array.from(dateMap.values());
  }, [activeSnapshots, selectedPlayers, timeScale, isBothMode]);

  // 7. Y-axis domain
  const chartDomain = useMemo(() => {
    let min = Infinity, max = -Infinity;
    const keys = isBothMode ? selectedIds.flatMap(id => [`${id}_ud`, `${id}_dk`]) : selectedIds;
    chartData.forEach(row => keys.forEach(k => { const v = row[k]; if (v != null) { if (v < min) min = v; if (v > max) max = v; } }));
    if (showPickRanges && !isBothMode) {
      selectedPlayers.forEach(p => {
        if (p?.pickStats) { if (p.pickStats.min < min) min = p.pickStats.min; if (p.pickStats.max > max) max = p.pickStats.max; }
      });
    }
    if (min === Infinity || max === -Infinity) return [1, teams * 3];
    const pad = (max - min) * 0.05;
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [chartData, selectedIds, selectedPlayers, showPickRanges, isBothMode, teams]);

  // 8. Round-boundary ticks
  const roundTicks = useMemo(() => {
    const [lo, hi] = chartDomain;
    if (typeof lo !== 'number' || typeof hi !== 'number') return undefined;
    const t = teams || 12;
    const starts = [];
    for (let pick = Math.floor((lo - 1) / t) * t + 1; pick <= hi; pick += t) {
      if (pick >= lo) starts.push(pick);
    }
    if (starts.length < 2) return undefined;
    const step = Math.ceil(starts.length / 7);
    return starts.filter((_, i) => i % step === 0);
  }, [chartDomain, teams]);

  const chartSeries = useMemo(() => {
    if (isBothMode) {
      return selectedIds.flatMap((id, idx) => ([
        { key: `${id}_ud`, color: LINE_PALETTE[idx] },
        { key: `${id}_dk`, color: LINE_PALETTE[idx], dashed: true },
      ]));
    }
    return selectedIds.map((id, idx) => ({ key: id, color: LINE_PALETTE[idx] }));
  }, [selectedIds, isBothMode]);

  const chartBands = useMemo(() => {
    if (!showPickRanges || isBothMode) return [];
    return selectedIds.map((id, idx) => {
      const stats = playerById.get(id)?.pickStats;
      if (!stats || stats.count === 0) return null;
      return { color: LINE_PALETTE[idx], q1: stats.q1, q3: stats.q3, median: stats.median };
    }).filter(Boolean);
  }, [showPickRanges, isBothMode, selectedIds, playerById]);

  // Handlers
  const atCap = selectedIds.length >= MAX_SELECTED;
  const toggleSelect = useCallback((id) => setSelectedIds(prev => {
    if (prev.includes(id)) return prev.filter(x => x !== id);
    return prev.length >= MAX_SELECTED ? prev : [...prev, id];
  }), []);
  const selectTopN = (n = 5) => setSelectedIds(filteredAndSortedList.slice(0, n).map(p => p.id));

  const isPct = calcMode === 'pct';
  const chipStats = p => {
    if (!p) return { adp: null, trend: null };
    if (!isTwoPlat) return { adp: p.lastAdp, trend: isPct ? p.changePct : p.change };
    if (platformFilter === 'draftkings') return { adp: p.dkAdp, trend: isPct ? p.dkTrendPct : p.dkTrend };
    return { adp: p.udAdp, trend: isPct ? p.udTrendPct : p.udTrend };
  };
  const fmtTrendActive = isPct ? fmtTrendPct : fmtTrend;

  const SORT_CHIPS = [
    { key: 'udTrend', label: 'UD Trend' },
    ...(isTwoPlat ? [{ key: 'dkTrend', label: 'DK Trend' }] : []),
    { key: 'udAdp', label: 'ADP' },
    ...(isTwoPlat ? [{ key: 'deltaAdp', label: 'Δ UD-DK' }] : []),
    { key: 'exposure', label: 'Exposure' },
    { key: 'value', label: 'Value' },
    { key: 'name', label: 'Name' },
  ];

  const navigateToRosters = (name) => {
    setRosterNavContext({ players: [name] });
    router.push({ pathname: '/portfolio', params: { view: 'rosters', nav: Date.now() } });
  };

  const chartWidth = screenWidth - spacing.lg * 2 - 2;

  const renderRow = useCallback(({ item: p }) => {
    const selIdx = selectedIds.indexOf(p.id);
    const isSel = selIdx >= 0;
    const adp = isTwoPlat ? (platformFilter === 'draftkings' ? p.dkAdp : p.udAdp) : p.lastAdp;
    const trend = isTwoPlat
      ? (platformFilter === 'draftkings' ? (isPct ? p.dkTrendPct : p.dkTrend) : (isPct ? p.udTrendPct : p.udTrend))
      : (isPct ? p.changePct : p.change);
    return (
      <Pressable
        style={[styles.row, isSel && { backgroundColor: colors.surface2, borderColor: LINE_PALETTE[selIdx] }]}
        onPress={() => toggleSelect(p.id)}
      >
        <View style={[styles.posDot, { backgroundColor: posColor((p.position || '').toUpperCase()) }]} />
        <View style={{ flex: 1 }}>
          <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>{p.name}</Text>
          <Text style={type.muted}>{p.team} · {p.position}{p.exposure > 0 ? ` · ${p.exposure.toFixed(0)}% exp` : ''}</Text>
        </View>
        <View style={{ alignItems: 'flex-end', width: 52 }}>
          <Text style={[type.mono, { fontWeight: '700' }]}>{fmtAdp(adp)}</Text>
          {p.value != null && (
            <Text style={[type.muted, { fontSize: 10 }]}>val {p.value > 0 ? '+' : ''}{p.value.toFixed(1)}</Text>
          )}
        </View>
        <Text style={{ width: 68, textAlign: 'right', fontSize: 12.5, fontWeight: '700', fontVariant: ['tabular-nums'], color: trendColor(trend) }}>
          {fmtTrendActive(trend)}
        </Text>
      </Pressable>
    );
  }, [selectedIds, isTwoPlat, platformFilter, isPct, toggleSelect]);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={filteredAndSortedList}
        keyExtractor={(p) => p.id}
        renderItem={renderRow}
        initialNumToRender={16}
        windowSize={8}
        removeClippedSubviews
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
        ListHeaderComponent={
          <View>
            {/* Controls */}
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
              {isTwoPlat && (
                <Segmented
                  style={{ flex: 1.4 }}
                  options={[{ key: 'all', label: 'Both' }, { key: 'underdog', label: 'UD' }, { key: 'draftkings', label: 'DK' }]}
                  value={platformFilter}
                  onChange={setPlatformFilter}
                />
              )}
              <Segmented
                style={{ flex: 1 }}
                options={[{ key: '1w', label: '1W' }, { key: '1m', label: '1M' }, { key: 'all', label: 'All' }]}
                value={timeScale}
                onChange={setTimeScale}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm, alignItems: 'center' }}>
              <Segmented
                style={{ flex: 1 }}
                options={[{ key: 'pct', label: '% change' }, { key: 'raw', label: 'ADP spots' }]}
                value={calcMode}
                onChange={setCalcMode}
              />
              {!isBothMode && (
                <Pressable
                  onPress={() => setShowPickRanges(v => !v)}
                  style={[styles.chip, showPickRanges && { borderColor: colors.accent, backgroundColor: colors.accentMuted }]}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: showPickRanges ? colors.accent : colors.textSecondary }}>
                    My pick ranges
                  </Text>
                </Pressable>
              )}
            </View>

            {/* Watchlist chips */}
            <View style={styles.watchlist}>
              {selectedIds.map((id, idx) => {
                const player = enrichedById.get(id) ?? playerById.get(id);
                if (!player) return null;
                const stats = chipStats(player);
                return (
                  <View key={id} style={styles.wChip}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: LINE_PALETTE[idx] }} />
                    <Text style={{ color: colors.textPrimary, fontSize: 12 }} numberOfLines={1}>{player.name}</Text>
                    <Text style={[type.mono, { fontSize: 11 }]}>{fmtAdp(stats.adp)}</Text>
                    {stats.trend != null && (
                      <Text style={{ fontSize: 10.5, fontWeight: '700', color: trendColor(stats.trend) }}>{fmtTrendActive(stats.trend)}</Text>
                    )}
                    <Pressable onPress={() => toggleSelect(id)} hitSlop={6}>
                      <X size={11} color={colors.textMuted} />
                    </Pressable>
                  </View>
                );
              })}
              <Pressable style={styles.wAction} onPress={() => selectTopN(5)}>
                <Plus size={11} color={colors.textSecondary} />
                <Text style={{ color: colors.textSecondary, fontSize: 11.5, fontWeight: '600' }}>Top 5</Text>
              </Pressable>
              {selectedIds.length > 0 && (
                <Pressable style={styles.wAction} onPress={() => setSelectedIds([])}>
                  <Text style={{ color: colors.textSecondary, fontSize: 11.5, fontWeight: '600' }}>Clear</Text>
                </Pressable>
              )}
              <Text style={type.muted}>{selectedIds.length}/{MAX_SELECTED}</Text>
            </View>

            {/* Chart */}
            <View style={styles.chartCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <Text style={type.h3}>ADP over time</Text>
                <Text style={type.muted}>lower = drafted earlier{isBothMode ? '  ·  UD solid / DK dashed' : ''}</Text>
              </View>
              {selectedIds.length === 0 ? (
                <View style={{ height: 160, alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={type.secondary}>Tap rows below to add players (up to {MAX_SELECTED})</Text>
                </View>
              ) : (
                <MultiLineChart
                  data={chartData}
                  series={chartSeries}
                  domain={chartDomain}
                  yTicks={roundTicks}
                  bands={chartBands}
                  width={chartWidth - spacing.lg * 2}
                  height={230}
                  teams={teams}
                />
              )}
            </View>

            {/* Table controls */}
            <SearchBar value={query} onChange={setQuery} placeholder="Search name, team, pos..." style={{ marginBottom: spacing.sm }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
              <ChipRow
                options={SORT_CHIPS}
                value={sortConfig.key}
                onChange={(k) => setSortConfig(prev => ({ key: k, direction: prev.key === k && prev.direction === 'asc' ? 'desc' : 'asc' }))}
                style={{ flex: 1 }}
              />
              <Text style={type.muted}>{sortConfig.direction === 'asc' ? '▲' : '▼'}</Text>
            </View>
            {atCap && <Text style={[type.muted, { marginBottom: 4 }]}>Chart full — remove a player to add another.</Text>}
          </View>
        }
        ListEmptyComponent={<Text style={[type.secondary, { textAlign: 'center', padding: spacing.xl }]}>No players match.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  chartCard: {
    backgroundColor: colors.surface1,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  watchlist: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: spacing.sm },
  wChip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.borderDefault,
    borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 4,
    maxWidth: 240,
  },
  wAction: {
    flexDirection: 'row', alignItems: 'center', gap: 3,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.pill,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  chip: {
    paddingHorizontal: 11, paddingVertical: 8, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.surface1,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface1, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md, paddingVertical: 8, marginBottom: 4,
  },
  posDot: { width: 8, height: 8, borderRadius: 4 },
});
