import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, Legend, CartesianGrid, ReferenceArea, ReferenceLine
} from 'recharts';
import { parseAdpString, canonicalName } from '../utils/helpers';
import styles from './AdpTimeSeries.module.css';
import { SearchInput } from './filters';
import useMediaQuery from '../hooks/useMediaQuery';
import TabLayout from './TabLayout';

// --- Math Helper for Quartiles + mean ---
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

// --- Formatting helpers ---
const fmtAdp  = v => v !== null ? v.toFixed(1) : '-';
const fmtDelta = v => v === null ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
const fmtTrend = v => {
  if (v === null) return '-';
  const icon = v < 0 ? '▲' : v > 0 ? '▼' : '';
  return `${icon} ${Math.abs(v).toFixed(1)}`;
};
const trendColor = v => v === null ? 'var(--text-muted)' : v < 0 ? 'var(--positive)' : v > 0 ? 'var(--negative)' : 'var(--text-muted)';

function DiamondDot({ cx, cy, fill, r = 4 }) {
  if (cx == null || cy == null) return null;
  return <polygon points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`} fill={fill} />;
}

function SortIcon({ col, sortConfig }) {
  if (sortConfig.key !== col) return <span className={styles.sortIcon}>⇅</span>;
  return sortConfig.direction === 'asc' ? '▲' : '▼';
}

function PosBadge({ pos }) {
  const p = (pos || 'N/A').toUpperCase().replace(/\s+/g, '');
  const known = ['QB', 'RB', 'WR', 'TE'];
  return (
    <span className={styles.posBadge} data-pos={known.includes(p) ? p : 'OTHER'}>
      {p === 'N/A' ? '?' : p}
    </span>
  );
}

function CustomTooltip({ active, label, payload, richPlayerList }) {
  if (!active || !label) return null;
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipDate}>{label}</div>
      {payload && payload.map((entry) => {
        const baseId = entry.dataKey.replace(/_ud$|_dk$/, '');
        const player = richPlayerList.find(p => p.id === baseId);
        const platformLabel = entry.dataKey.endsWith('_ud') ? ' (UD)' : entry.dataKey.endsWith('_dk') ? ' (DK)' : '';
        const stats = player?.pickStats;
        const hasStats = stats && stats.count > 0;
        return (
          <div key={entry.dataKey} className={styles.tooltipEntry}>
            <div className={styles.tooltipEntryHeader} style={{ color: entry.stroke }}>
              <span className={styles.tooltipEntryName}>{player?.name || baseId}{platformLabel}:</span>
              <span>{entry.value?.toFixed(1)} ADP</span>
            </div>
            {hasStats && !platformLabel && (
              <div className={styles.tooltipStats}>
                My picks: avg {stats.mean.toFixed(1)} • med {stats.median.toFixed(1)} (range {stats.min}–{stats.max})
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export default function AdpTimeSeries({ adpSnapshots = [], adpByPlatform = {}, masterPlayers = [], rosterData = [], teams = 12, onNavigateToRosters = null, helpOpen = false, onHelpToggle }) {
  const [query, setQuery] = useState('');
  const { isMobile, isTablet } = useMediaQuery();
  const [showPickRanges, setShowPickRanges] = useState(false);
  const [selectedIds, setSelectedIds] = useState([]);
  const [timeScale, setTimeScale] = useState('1m');
  const [sortConfig, setSortConfig] = useState({ key: 'udTrend', direction: 'asc' });

  const colorPalette = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
    '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#84cc16'
  ];

  // Derive which platforms have data
  const availablePlatforms = useMemo(
    () => Object.keys(adpByPlatform).filter(p => adpByPlatform[p]?.snapshots?.length > 0),
    [adpByPlatform]
  );
  const isTwoPlat = availablePlatforms.length > 1;

  const defaultFilter = availablePlatforms.length === 1 ? availablePlatforms[0] : 'all';
  const [platformFilter, setPlatformFilter] = useState(defaultFilter);

  const platformInitDone = useRef(false);
  useEffect(() => {
    if (!platformInitDone.current && availablePlatforms.length > 0) {
      platformInitDone.current = true;
      if (availablePlatforms.length === 1) setPlatformFilter(availablePlatforms[0]);
    }
  }, [availablePlatforms]);

  const isBothMode = platformFilter === 'all' && isTwoPlat;

  const helpAnnotations = useMemo(() => {
    const items = [
      { id: 'controls', label: 'Search & Filters', description: 'Filter players by name, team, or position. Switch the time window to scope trend calculations.' },
      { id: 'player-table', label: 'Player Selection', description: 'Click a row to add that player to the chart. Up to 10 players can be tracked at once.' },
      { id: 'trend-col', label: 'Trend Column', description: 'ADP movement over the selected time window — rising means going earlier in drafts.' },
      { id: 'value-col', label: 'Value Column', description: 'Difference between your average pick and current ADP — positive means you drafted them later than market.' },
    ];
    if (!isBothMode) {
      items.push({ id: 'pick-ranges', label: 'My Pick Ranges', description: 'Overlays a quartile box on the chart showing where you actually picked each player.' });
    }
    items.push({ id: 'chart-area', label: 'ADP History Chart', description: 'ADP over time for selected players. Lower = drafted earlier. Hover for exact values.', anchor: 'above' });
    return items;
  }, [isBothMode]);

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
        firstAdp: null, lastAdp: null, adpHistory: [], adpHistoryByPlatform: {}, myPicks: []
      });
    });

    // Pre-build canonical → pid lookup so ADP row matching is O(1) not O(n×rows×snapshots)
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
              exposure: 0, firstAdp: null, lastAdp: null, adpHistory: [], adpHistoryByPlatform: {}, myPicks: []
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

  // 2. Per-platform table stats — always uses full adpByPlatform regardless of platformFilter
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
        };
      });
    }
    return byName;
  }, [adpByPlatform, timeScale]);

  // 3. Time-scale-aware trend (for chart / single-platform sort)
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
      return { ...p, change };
    });
  }, [richPlayerList, activeSnapshots, timeScale]);

  // 4. Filter, enrich with platStats, and sort
  const filteredAndSortedList = useMemo(() => {
    // Max ADP per platform — used as sort fallback for players missing on one platform
    const allPs = Object.values(platStats);
    const maxUdAdp = allPs.reduce((m, ps) => Math.max(m, ps.underdog?.adp ?? 0), 0) || null;
    const maxDkAdp = allPs.reduce((m, ps) => Math.max(m, ps.draftkings?.adp ?? 0), 0) || null;

    let list = timeFilteredPlayers
      .filter(p => p.lastAdp !== null)
      .map(p => {
        const ps = platStats[canonicalName(p.name)] ?? {};
        const rawUd = ps.underdog?.adp ?? null;
        const rawDk = ps.draftkings?.adp ?? null;
        const udAdp   = rawUd ?? maxDkAdp;
        const dkAdp   = rawDk ?? maxUdAdp;
        const udTrend = ps.underdog?.trend  ?? null;
        const dkTrend = ps.draftkings?.trend ?? null;
        return { ...p, udAdp, dkAdp, deltaAdp: rawUd !== null && rawDk !== null ? rawUd - rawDk : null, udTrend, dkTrend };
      });

    const q = (query || '').toLowerCase().trim();
    if (q) list = list.filter(p => (`${p.name} ${p.team} ${p.position}`).toLowerCase().includes(q));

    const numericKeys = ['lastAdp', 'udAdp', 'dkAdp', 'deltaAdp', 'udTrend', 'dkTrend', 'value', 'myAvg', 'exposure', 'change'];
    return list.sort((a, b) => {
      if (sortConfig.key === 'myPickMedian') {
        const vA = a.pickStats?.median ?? null;
        const vB = b.pickStats?.median ?? null;
        if (vA == null && vB == null) return 0;
        if (vA == null) return 1;
        if (vB == null) return -1;
        return sortConfig.direction === 'asc' ? vA - vB : vB - vA;
      }
      let vA = a[sortConfig.key], vB = b[sortConfig.key];
      if (sortConfig.key === 'name') {
        vA = (vA || '').toLowerCase();
        vB = (vB || '').toLowerCase();
      } else if (numericKeys.includes(sortConfig.key)) {
        // Push nulls (rendered as "-") to the bottom regardless of sort direction
        if (vA == null && vB == null) return 0;
        if (vA == null) return 1;
        if (vB == null) return -1;
      }
      if (vA < vB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (vA > vB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [timeFilteredPlayers, query, sortConfig, platStats]);

  // Auto-select top 5 on load
  const initialSelectionDone = useRef(false);
  useEffect(() => {
    if (!initialSelectionDone.current && filteredAndSortedList.length > 0) {
      initialSelectionDone.current = true;
      setSelectedIds(filteredAndSortedList.slice(0, 5).map(p => p.id));
    }
  }, [filteredAndSortedList]);

  // 5. Chart data — deduplicate by date so UD + DK snapshots on the same date merge into one x-axis point
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
      selectedIds.forEach(id => {
        const player = richPlayerList.find(p => p.id === id);
        if (!player) return;
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
  }, [activeSnapshots, richPlayerList, selectedIds, timeScale, isBothMode]);

  // 6. Y-axis domain
  const chartDomain = useMemo(() => {
    let min = Infinity, max = -Infinity;
    const keys = isBothMode ? selectedIds.flatMap(id => [`${id}_ud`, `${id}_dk`]) : selectedIds;
    chartData.forEach(row => keys.forEach(k => { const v = row[k]; if (v != null) { if (v < min) min = v; if (v > max) max = v; } }));
    if (showPickRanges && !isBothMode) {
      selectedIds.forEach(id => {
        const p = richPlayerList.find(p => p.id === id);
        if (p?.pickStats) { if (p.pickStats.min < min) min = p.pickStats.min; if (p.pickStats.max > max) max = p.pickStats.max; }
      });
    }
    if (min === Infinity || max === -Infinity) return ['auto', 'auto'];
    const pad = (max - min) * 0.05;
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [chartData, selectedIds, richPlayerList, showPickRanges, isBothMode]);

  // Handlers
  const handleSort = key => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  const toggleSelect = id => setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  const selectTopN = (n = 5) => setSelectedIds(filteredAndSortedList.slice(0, n).map(p => p.id));
  const handlePlatformChange = val => setPlatformFilter(val);

  // Responsive grid template — switches between two-platform and single-platform layouts
  const navCol = onNavigateToRosters ? ' 72px' : '';
  const tableGrid = isMobile
    ? `28px 2fr 1fr${navCol}`
    : isTablet
      ? (isTwoPlat ? `28px 2fr 1fr 1fr 1fr 1fr 1fr${navCol}` : `28px 2fr 1fr 1fr 1fr${navCol}`)
      : (isTwoPlat ? `28px 2fr 0.7fr 1fr 1fr 1fr 1fr 1fr 1fr 1fr${navCol}` : `28px 2fr 0.7fr 1fr 1fr 1fr 1fr${navCol}`);

  const tickFontSize = isMobile ? 11 : 14;
  const chartHeight = isMobile ? 260 : isTablet ? 420 : 540;

  return (
    <TabLayout flush helpAnnotations={helpAnnotations} helpOpen={helpOpen} onHelpToggle={onHelpToggle}>
    <div className={styles.root}>

      {/* --- Controls --- */}
      <div className={styles.controls} data-help-id="controls">
        <SearchInput value={query} onChange={setQuery} placeholder="Filter by name, team, pos..." />

        <div className={styles.buttonGroup}>
          <button className="load-button" onClick={() => selectTopN(5)} style={{ width: 'auto', padding: '0.5rem 1rem' }}>Top 5</button>
          <button className="load-button" onClick={() => setSelectedIds([])} style={{ width: 'auto', padding: '0.5rem 1rem' }}>Clear</button>
        </div>

        <div className="filter-btn-group">
          {[['1w', '1W'], ['1m', '1M'], ['all', 'All']].map(([value, label]) => (
            <button key={value} className={`filter-btn-group__item ${timeScale === value ? 'filter-btn-group__item--active' : ''}`} onClick={() => setTimeScale(value)}>
              {label}
            </button>
          ))}
        </div>

        {isTwoPlat && (
          <div className="filter-btn-group">
            {[['all', 'All'], ['underdog', 'Underdog'], ['draftkings', 'DraftKings']]
              .filter(([val]) => val === 'all' || availablePlatforms.includes(val))
              .map(([value, label]) => (
                <button key={value} className={`filter-btn-group__item ${platformFilter === value ? 'filter-btn-group__item--active' : ''}`} onClick={() => handlePlatformChange(value)}>
                  {label}
                </button>
              ))}
          </div>
        )}

        {!isBothMode && (
          <label className="filter-checkbox" data-help-id="pick-ranges">
            <input type="checkbox" checked={showPickRanges} onChange={e => setShowPickRanges(e.target.checked)} />
            My Pick Ranges
          </label>
        )}

        <span className="filter-count">
          <strong>{filteredAndSortedList.length}</strong> players ({selectedIds.length} selected)
        </span>
      </div>

      <div className={styles.mainLayout}>

        {/* --- Top strip: player selector table --- */}
        <div className={`card ${styles.tablePane}`} data-help-id="player-table">

          {/* Header */}
          <div className={styles.tableHeader} style={{ gridTemplateColumns: tableGrid }}>
            <div />
            <div className={styles.colHeader} style={{ textAlign: 'left', cursor: 'pointer' }} onClick={() => handleSort('name')}>
              Player <SortIcon col="name" sortConfig={sortConfig} />
            </div>
            {/* Team — desktop only */}
            {!isMobile && !isTablet && (
              <div className={styles.colHeader} onClick={() => handleSort('team')}>Team</div>
            )}
            {/* Platform-dependent ADP + Trend columns */}
            {isTwoPlat && !isMobile ? (
              <>
                <div className={styles.colHeader} onClick={() => handleSort('udAdp')}>UD ADP <SortIcon col="udAdp" sortConfig={sortConfig} /></div>
                <div className={styles.colHeader} onClick={() => handleSort('dkAdp')}>DK ADP <SortIcon col="dkAdp" sortConfig={sortConfig} /></div>
                {!isTablet && <div className={styles.colHeader} onClick={() => handleSort('deltaAdp')}>Δ UD-DK <SortIcon col="deltaAdp" sortConfig={sortConfig} /></div>}
                <div className={styles.colHeader} data-help-id="trend-col" onClick={() => handleSort('udTrend')}>UD Trend <SortIcon col="udTrend" sortConfig={sortConfig} /></div>
                {!isTablet && <div className={styles.colHeader} onClick={() => handleSort('dkTrend')}>DK Trend <SortIcon col="dkTrend" sortConfig={sortConfig} /></div>}
              </>
            ) : !isTwoPlat && !isMobile ? (
              <>
                <div className={styles.colHeader} onClick={() => handleSort('lastAdp')}>ADP <SortIcon col="lastAdp" sortConfig={sortConfig} /></div>
                <div className={styles.colHeader} data-help-id="trend-col" onClick={() => handleSort('change')}>Trend <SortIcon col="change" sortConfig={sortConfig} /></div>
              </>
            ) : null}
            {!isMobile && <div className={styles.colHeader} onClick={() => handleSort('exposure')}>Exp <SortIcon col="exposure" sortConfig={sortConfig} /></div>}
            {!isMobile && !isTablet && <div className={styles.colHeader} data-help-id="value-col" onClick={() => handleSort('value')}>Value <SortIcon col="value" sortConfig={sortConfig} /></div>}
            {isMobile && <div className={styles.colHeader} onClick={() => handleSort(isTwoPlat ? 'udTrend' : 'change')}>Trend <SortIcon col={isTwoPlat ? 'udTrend' : 'change'} sortConfig={sortConfig} /></div>}
            {onNavigateToRosters && <div />}
          </div>

          {/* Body */}
          <div className={styles.tableBody}>
            {filteredAndSortedList.map(p => {
              const checked = selectedIds.includes(p.id);
              const colorIndex = selectedIds.indexOf(p.id);
              const strokeColor = colorIndex >= 0 ? colorPalette[colorIndex % colorPalette.length] : 'transparent';
              const valueColor = p.value === null ? 'inherit' : p.value > 0 ? 'var(--positive)' : p.value < 0 ? 'var(--negative)' : 'inherit';
              const valueDisplay = p.value !== null ? `${p.value > 0 ? '+' : ''}${p.value.toFixed(1)}` : '-';

              return (
                <div
                  key={p.id}
                  onClick={() => toggleSelect(p.id)}
                  className={`hover-row ${styles.playerRow} ${checked ? styles.playerRowSelected : ''}`}
                  style={{ gridTemplateColumns: tableGrid, borderLeft: checked ? `3px solid ${strokeColor}` : '3px solid transparent' }}
                >
                  <input type="checkbox" checked={checked} readOnly style={{ cursor: 'pointer' }} />

                  {/* Player: badge + name */}
                  <div className={styles.playerCell}>
                    <PosBadge pos={p.position} />
                    <span className={styles.playerName}>{p.name}</span>
                  </div>

                  {/* Team */}
                  {!isMobile && !isTablet && (
                    <div className={styles.dimCell}>{p.team !== 'N/A' ? p.team : '-'}</div>
                  )}

                  {/* ADP + Trend columns */}
                  {isTwoPlat && !isMobile ? (
                    <>
                      <div className={styles.monoCell}>{fmtAdp(p.udAdp)}</div>
                      <div className={styles.monoCell}>{fmtAdp(p.dkAdp)}</div>
                      {!isTablet && <div className={styles.monoCell} style={{ color: 'var(--text-secondary)' }}>{fmtDelta(p.deltaAdp)}</div>}
                      <div className={styles.trendCell} style={{ color: trendColor(p.udTrend) }}>{fmtTrend(p.udTrend)}</div>
                      {!isTablet && <div className={styles.trendCell} style={{ color: trendColor(p.dkTrend) }}>{fmtTrend(p.dkTrend)}</div>}
                    </>
                  ) : !isTwoPlat && !isMobile ? (
                    <>
                      <div className={styles.monoCell}>{p.displayAdp}</div>
                      <div className={styles.trendCell} style={{ color: trendColor(p.change) }}>{fmtTrend(p.change)}</div>
                    </>
                  ) : null}

                  {/* Exposure */}
                  {!isMobile && <div className={styles.monoCell}>{p.exposure > 0 ? `${p.exposure}%` : '-'}</div>}

                  {/* Value (CLV) */}
                  {!isMobile && !isTablet && (
                    <div className={styles.valueCell} style={{ color: valueColor }}>{valueDisplay}</div>
                  )}

                  {/* Mobile: trend only */}
                  {isMobile && (
                    <div className={styles.trendCell} style={{ color: trendColor(isTwoPlat ? p.udTrend : p.change) }}>
                      {fmtTrend(isTwoPlat ? p.udTrend : p.change)}
                    </div>
                  )}

                  {/* Roster nav */}
                  {onNavigateToRosters && (
                    <div className={styles.navBtnCell}>
                      {p.exposure > 0 && (
                        <button
                          className={styles.seeRostersBtn}
                          onClick={e => { e.stopPropagation(); onNavigateToRosters({ players: [p.name] }); }}
                        >
                          Rosters →
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* --- Chart --- */}
        <div className={`card ${styles.chartPane}`} data-help-id="chart-area">
          {selectedIds.length === 0 ? (
            <div className={styles.chartEmpty}>Select players from the list to view ADP history</div>
          ) : (
            <ResponsiveContainer width="100%" height={chartHeight}>
              <LineChart data={chartData} margin={{ top: 5, right: 10, bottom: 20, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: tickFontSize, fill: '#9ca3af', fontFamily: 'var(--font-mono)' }} stroke="#4b5563" />
                <YAxis reversed domain={chartDomain} tick={{ fontSize: tickFontSize, fill: '#9ca3af', fontFamily: 'var(--font-mono)' }} stroke="#4b5563" width={isMobile ? 40 : 50} />
                <Tooltip content={<CustomTooltip richPlayerList={richPlayerList} />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2 }} />
                {!isMobile && <Legend wrapperStyle={{ paddingTop: 13, fontFamily: 'var(--font-sans)', fontSize: 13 }} />}

                {showPickRanges && !isBothMode && selectedIds.map((id, idx) => {
                  const player = richPlayerList.find(p => p.id === id);
                  const stats = player?.pickStats;
                  if (!player || !stats || stats.count === 0) return null;
                  const color = colorPalette[idx % colorPalette.length];
                  return (
                    <React.Fragment key={`box-${id}`}>
                      <ReferenceArea y1={stats.q1} y2={stats.q3} fill={color} fillOpacity={0.25} stroke={color} strokeOpacity={0.5} ifOverflow="visible" />
                      <ReferenceLine y={stats.median} stroke={color} strokeDasharray="4 4" strokeWidth={2} strokeOpacity={0.8} ifOverflow="visible" />
                      <ReferenceLine y={stats.min} stroke={color} strokeOpacity={0.3} strokeDasharray="2 2" />
                      <ReferenceLine y={stats.max} stroke={color} strokeOpacity={0.3} strokeDasharray="2 2" />
                    </React.Fragment>
                  );
                })}

                {selectedIds.map((id, idx) => {
                  const player = richPlayerList.find(p => p.id === id);
                  if (!player) return null;
                  const color = colorPalette[idx % colorPalette.length];
                  if (isBothMode) {
                    return (
                      <React.Fragment key={id}>
                        <Line type="monotone" dataKey={`${id}_ud`} name={`${player.name} (UD)`} stroke={color} strokeWidth={3} dot={{ r: 3, strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls animationDuration={500} />
                        <Line type="monotone" dataKey={`${id}_dk`} name={`${player.name} (DK)`} stroke={color} strokeWidth={2} strokeDasharray="6 3" dot={<DiamondDot fill={color} r={3} />} activeDot={{ r: 6 }} connectNulls animationDuration={500} />
                      </React.Fragment>
                    );
                  }
                  return (
                    <Line key={id} type="monotone" dataKey={id} name={player.name} stroke={color} strokeWidth={3} dot={{ r: 3, strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls animationDuration={500} />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>
    </div>
    </TabLayout>
  );
}
