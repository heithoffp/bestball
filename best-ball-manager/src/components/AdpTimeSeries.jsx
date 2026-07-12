import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, CartesianGrid, ReferenceArea, ReferenceLine
} from 'recharts';
import { useVirtualizer } from '@tanstack/react-virtual';
import { X, Plus } from 'lucide-react';
import { parseAdpString, canonicalName } from '../utils/helpers';
import styles from './AdpTimeSeries.module.css';
import { SearchInput } from './filters';
import useMediaQuery from '../hooks/useMediaQuery';
import TabLayout from './TabLayout';

// Categorical line palette — 10 fixed slots validated against the card surface
// (#0C1A30) for OKLCH lightness band, CVD separation, and 3:1 contrast.
// Colors are assigned by selection order and never cycled: selection is capped
// at MAX_SELECTED so identity stays unambiguous.
const LINE_PALETTE = [
  '#3b82f6', '#ea580c', '#8b5cf6', '#059669', '#ec4899',
  '#0d9488', '#d97706', '#6366f1', '#65a30d', '#ef4444'
];
const MAX_SELECTED = 10;
const SURFACE_CARD = '#0C1A30';

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
const fmtAdp  = v => v !== null && v !== undefined ? v.toFixed(1) : '-';
const fmtDelta = v => v == null ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(1)}`;
const fmtDeltaPct = v => v == null ? '-' : `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
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
const trendColor = v => v == null ? 'var(--text-muted)' : v < 0 ? 'var(--positive)' : v > 0 ? 'var(--negative)' : 'var(--text-muted)';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmtDate = d => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(d));
  return m ? `${MONTHS[+m[2] - 1]} ${+m[3]}` : d;
};

const pickRound = (pick, teams) => Math.floor((pick - 1) / teams) + 1;

// Demo/CSV data can carry full team names ("San Francisco 49ers") that wrap
// table rows. Compress to a compact code: initials for multi-word (dropping
// digit-led words like "49ers"), first 3 letters otherwise.
const abbrevTeam = t => {
  if (!t || t === 'N/A') return '';
  const clean = String(t).trim();
  if (clean.length <= 4) return clean.toUpperCase();
  const words = clean.split(/\s+/).filter(w => !/^\d/.test(w));
  if (words.length === 0) return clean.slice(0, 3).toUpperCase();
  const code = words.length > 1 ? words.map(w => w[0]).join('') : words[0].slice(0, 3);
  return code.toUpperCase().slice(0, 3);
};

// Y-axis tick anchored to draft-round boundaries: pick number with the round
// beneath it. compact mode (mobile) drops the round line.
function RoundTick({ x, y, payload, teams, compact }) {
  const pick = payload.value;
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={-6} dy={compact ? 3 : -1} textAnchor="end" fill="#8A9BB5" fontSize={compact ? 10 : 12} fontFamily="'JetBrains Mono', monospace">
        {pick}
      </text>
      {!compact && (
        <text x={-6} dy={11} textAnchor="end" fill="#5a6a80" fontSize={9.5} fontFamily="'JetBrains Mono', monospace">
          R{pickRound(pick, teams)}
        </text>
      )}
    </g>
  );
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

function HeaderCell({ label, col, sortConfig, onSort, alignLeft = false, helpId }) {
  const active = sortConfig.key === col;
  return (
    <button
      type="button"
      className={`${styles.colHeader} ${active ? styles.colHeaderActive : ''}`}
      style={alignLeft ? { justifyContent: 'flex-start' } : undefined}
      onClick={() => onSort(col)}
      data-help-id={helpId}
    >
      {label}
      {active && <span className={styles.sortArrow}>{sortConfig.direction === 'asc' ? '▲' : '▼'}</span>}
    </button>
  );
}

function CustomTooltip({ active, label, payload, playerById, teams }) {
  if (!active || !label || !payload?.length) return null;
  const entries = [...payload].sort((a, b) => (a.value ?? Infinity) - (b.value ?? Infinity));
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipDate}>{fmtDate(label)}</div>
      {entries.map((entry) => {
        const baseId = entry.dataKey.replace(/_ud$|_dk$/, '');
        const player = playerById.get(baseId);
        const platformLabel = entry.dataKey.endsWith('_ud') ? 'UD' : entry.dataKey.endsWith('_dk') ? 'DK' : null;
        const stats = player?.pickStats;
        const hasStats = stats && stats.count > 0;
        return (
          <div key={entry.dataKey} className={styles.tooltipEntry}>
            <div className={styles.tooltipEntryHeader}>
              <span className={styles.tooltipDot} style={{ background: entry.stroke }} />
              <span className={styles.tooltipEntryName}>
                {player?.name || baseId}{platformLabel ? ` · ${platformLabel}` : ''}
              </span>
              <span className={styles.tooltipEntryValue}>
                {entry.value?.toFixed(1)}
                <span className={styles.tooltipRound}> R{pickRound(entry.value, teams)}</span>
              </span>
            </div>
            {hasStats && !platformLabel && (
              <div className={styles.tooltipStats}>
                My picks: avg {stats.mean.toFixed(1)} · range {stats.min}–{stats.max}
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
  const [highlightId, setHighlightId] = useState(null);
  const [timeScale, setTimeScale] = useState('1m');
  const [calcMode, setCalcMode] = useState('pct'); // 'pct' = % change | 'raw' = raw ADP spots
  const [sortConfig, setSortConfig] = useState({ key: 'udTrend', direction: 'asc' });

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
      { id: 'chart-controls', label: 'Chart Controls', description: 'Scope the page: platform (Both overlays Underdog solid vs DraftKings dashed), and the time window that clips the chart and drives Trend calculations.' },
      { id: 'watchlist', label: 'Watchlist', description: `The players on the chart, each with current ADP and trend. Hover a chip to spotlight its line, click × to remove, or use Top 5 to grab the top of the table. Up to ${MAX_SELECTED} at once.` },
    ];
    if (!isBothMode) {
      items.push({ id: 'pick-ranges', label: 'My Pick Ranges', description: 'Overlays a quartile box on the chart showing where you actually picked each player.' });
    }
    items.push(
      { id: 'chart-area', label: 'ADP History', description: 'ADP over time — lower means drafted earlier. Gridlines mark draft rounds. Hover for exact values.', anchor: 'above' },
      { id: 'player-table', label: 'Player Table', description: 'Click a row to add or remove that player from the chart. Search by name, team, or position; click column headers to sort.', anchor: 'above' },
      { id: 'trend-col', label: 'Trend Column', description: 'ADP movement over the selected time window — rising means going earlier in drafts. The Trend toggle switches between % change and raw ADP spots.' },
      { id: 'value-col', label: 'Value Column', description: 'Difference between your average pick and current ADP — positive means you drafted them later than market.' },
    );
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

  // O(1) lookup map — eliminates repeated linear scans of richPlayerList in chart paths
  const playerById = useMemo(() => {
    const m = new Map();
    for (const p of richPlayerList) m.set(p.id, p);
    return m;
  }, [richPlayerList]);

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
          trendPct: latest !== null && first ? ((latest - first) / first) * 100 : null,
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
      const changePct = firstInWindow && lastInWindow !== null ? ((lastInWindow - firstInWindow) / firstInWindow) * 100 : null;
      return { ...p, change, changePct };
    });
  }, [richPlayerList, activeSnapshots, timeScale]);

  // 4. Enrich with platStats. Display fields (udAdp/dkAdp) stay raw — a missing
  // platform renders "-" — while *Sort variants substitute the platform's max
  // ADP so those players sink to the tail when sorting by ADP.
  const enrichedPlayers = useMemo(() => {
    const allPs = Object.values(platStats);
    const maxUdAdp = allPs.reduce((m, ps) => Math.max(m, ps.underdog?.adp ?? 0), 0) || null;
    const maxDkAdp = allPs.reduce((m, ps) => Math.max(m, ps.draftkings?.adp ?? 0), 0) || null;

    // DK drafts run 20 rounds (max pick 240) vs Underdog's 18 (max pick 216). For the
    // Δ UD-DK column, clamp DK to UD's depth so a player at the tail of both boards
    // doesn't show an artificially negative delta. Display columns keep the true DK ADP.
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

  // 5. Filter + sort for the table
  const filteredAndSortedList = useMemo(() => {
    let list = enrichedPlayers;
    const q = (query || '').toLowerCase().trim();
    if (q) list = list.filter(p => (`${p.name} ${p.team} ${p.position}`).toLowerCase().includes(q));

    const numericKeys = ['lastAdp', 'udAdp', 'dkAdp', 'deltaAdp', 'deltaAdpPct', 'udTrend', 'dkTrend', 'udTrendPct', 'dkTrendPct', 'value', 'myAvg', 'exposure', 'change', 'changePct'];
    // ADP columns sort on the fallback-substituted variant; in % mode the
    // toggleable metric columns sort by their percentage variant so the
    // displayed values drive the order. Headers still emit the raw base key.
    const SORT_FIELD_MAP = { udAdp: 'udAdpSort', dkAdp: 'dkAdpSort' };
    const METRIC_KEYS = new Set(['deltaAdp', 'udTrend', 'dkTrend', 'change']);
    let sortKey = SORT_FIELD_MAP[sortConfig.key] ?? sortConfig.key;
    if (calcMode === 'pct' && METRIC_KEYS.has(sortConfig.key)) sortKey = `${sortConfig.key}Pct`;

    return [...list].sort((a, b) => {
      if (sortConfig.key === 'myPickMedian') {
        const vA = a.pickStats?.median ?? null;
        const vB = b.pickStats?.median ?? null;
        if (vA == null && vB == null) return 0;
        if (vA == null) return 1;
        if (vB == null) return -1;
        return sortConfig.direction === 'asc' ? vA - vB : vB - vA;
      }
      let vA = a[sortKey], vB = b[sortKey];
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
  }, [enrichedPlayers, query, sortConfig, calcMode]);

  // Auto-select top 5 on load
  const initialSelectionDone = useRef(false);
  useEffect(() => {
    if (!initialSelectionDone.current && filteredAndSortedList.length > 0) {
      initialSelectionDone.current = true;
      setSelectedIds(filteredAndSortedList.slice(0, 5).map(p => p.id));
    }
  }, [filteredAndSortedList]);

  // Hoist selected-player lookup out of hot loops below
  const selectedPlayers = useMemo(
    () => selectedIds.map(id => playerById.get(id)).filter(Boolean),
    [selectedIds, playerById]
  );

  // 6. Chart data — deduplicate by date so UD + DK snapshots on the same date merge into one x-axis point
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
    if (min === Infinity || max === -Infinity) return ['auto', 'auto'];
    const pad = (max - min) * 0.05;
    return [Math.floor(min - pad), Math.ceil(max + pad)];
  }, [chartData, selectedIds, selectedPlayers, showPickRanges, isBothMode]);

  // 8. Round-boundary y ticks — the gridlines double as a draft-round ruler.
  // Falls back to Recharts auto ticks when the window spans less than a round.
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

  // Virtualize the player table body — avoids rendering hundreds of rows per filter change
  const tableBodyRef = useRef(null);
  const rowHeight = isMobile ? 40 : 34;
  const rowVirtualizer = useVirtualizer({
    count: filteredAndSortedList.length,
    getScrollElement: () => tableBodyRef.current,
    estimateSize: () => rowHeight,
    overscan: 8,
  });

  // Handlers
  const handleSort = key => setSortConfig(prev => ({ key, direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc' }));
  const atCap = selectedIds.length >= MAX_SELECTED;
  const toggleSelect = id => setSelectedIds(prev => {
    if (prev.includes(id)) return prev.filter(x => x !== id);
    return prev.length >= MAX_SELECTED ? prev : [...prev, id];
  });
  const selectTopN = (n = 5) => setSelectedIds(filteredAndSortedList.slice(0, n).map(p => p.id));
  const clearSelection = () => setSelectedIds([]);

  // Watchlist chip stats — platform-aware, mirroring the table's calc mode
  const isPct = calcMode === 'pct';
  const chipStats = p => {
    if (!p) return { adp: null, trend: null };
    if (!isTwoPlat) return { adp: p.lastAdp, trend: isPct ? p.changePct : p.change };
    if (platformFilter === 'draftkings') return { adp: p.dkAdp, trend: isPct ? p.dkTrendPct : p.dkTrend };
    return { adp: p.udAdp, trend: isPct ? p.udTrendPct : p.udTrend };
  };
  const fmtTrendActive = isPct ? fmtTrendPct : fmtTrend;
  const fmtDeltaActive = isPct ? fmtDeltaPct : fmtDelta;

  // Responsive grid template — team lives inside the player cell, so columns are purely numeric
  const navCol = onNavigateToRosters ? (isMobile ? ' 34px' : ' 76px') : '';
  const tableGrid = isMobile
    ? `26px minmax(0, 1fr) 58px 82px${navCol}`
    : isTablet
      ? (isTwoPlat ? `26px 1.6fr 1fr 1fr 1.1fr 0.8fr${navCol}` : `26px 1.6fr 1fr 1.1fr 0.8fr${navCol}`)
      : (isTwoPlat ? `26px 1.8fr 1fr 1fr 1fr 1.1fr 1.1fr 0.8fr 0.9fr${navCol}` : `26px 2fr 1fr 1.1fr 0.8fr 0.9fr${navCol}`);

  const mobileAdpKey = isTwoPlat ? (platformFilter === 'draftkings' ? 'dkAdp' : 'udAdp') : 'lastAdp';
  const mobileTrendKey = isTwoPlat ? (platformFilter === 'draftkings' ? 'dkTrend' : 'udTrend') : 'change';

  const dimFor = id => highlightId && highlightId !== id ? 0.18 : 1;

  return (
    <TabLayout flush helpAnnotations={helpAnnotations} helpOpen={helpOpen} onHelpToggle={onHelpToggle}>
    <div className={styles.root}>

      {/* --- Chart hero --- */}
      <section className={styles.chartPane}>
        <div className={styles.chartHeader}>
          <div className={styles.chartTitleBlock}>
            <span className={styles.chartTitle}>ADP over time</span>
            <span className={styles.chartSubtitle}>lower = drafted earlier</span>
          </div>
          <div className={styles.chartControls} data-help-id="chart-controls">
            {isTwoPlat && (
              <div className="filter-btn-group" title="Which platform's ADP to chart">
                {[['all', 'Both'], ['underdog', isMobile ? 'UD' : 'Underdog'], ['draftkings', isMobile ? 'DK' : 'DraftKings']]
                  .filter(([val]) => val === 'all' || availablePlatforms.includes(val))
                  .map(([value, label]) => (
                    <button key={value} className={`filter-btn-group__item ${platformFilter === value ? 'filter-btn-group__item--active' : ''}`} onClick={() => setPlatformFilter(value)}>
                      {label}
                    </button>
                  ))}
              </div>
            )}
            <div className="filter-btn-group" title="Time window — clips the chart and scopes trend calculations">
              {[['1w', '1W'], ['1m', '1M'], ['all', 'All']].map(([value, label]) => (
                <button key={value} className={`filter-btn-group__item ${timeScale === value ? 'filter-btn-group__item--active' : ''}`} onClick={() => setTimeScale(value)}>
                  {label}
                </button>
              ))}
            </div>
            {!isBothMode && (
              <button
                type="button"
                className={`filter-chip ${showPickRanges ? 'filter-chip--active' : ''}`}
                onClick={() => setShowPickRanges(v => !v)}
                data-help-id="pick-ranges"
                title="Overlay quartile boxes of where you actually picked each player"
              >
                My pick ranges
              </button>
            )}
            {isBothMode && (
              <span className={styles.lineKey} aria-hidden="true">
                <svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke="#8A9BB5" strokeWidth="2" /></svg>UD
                <svg width="16" height="6"><line x1="0" y1="3" x2="16" y2="3" stroke="#8A9BB5" strokeWidth="2" strokeDasharray="4 3" /></svg>DK
              </span>
            )}
          </div>
        </div>

        {/* Watchlist — doubles as the chart legend */}
        <div className={styles.watchlist} data-help-id="watchlist">
          {selectedIds.map((id, idx) => {
            const player = enrichedById.get(id) ?? playerById.get(id);
            if (!player) return null;
            const color = LINE_PALETTE[idx];
            const stats = chipStats(player);
            return (
              <div
                key={id}
                className={styles.chip}
                onMouseEnter={() => setHighlightId(id)}
                onMouseLeave={() => setHighlightId(null)}
              >
                <span className={styles.chipDot} style={{ background: color }} />
                <span className={styles.chipName}>{player.name}</span>
                <span className={styles.chipAdp}>{fmtAdp(stats.adp)}</span>
                {stats.trend != null && (
                  <span className={styles.chipTrend} style={{ color: trendColor(stats.trend) }}>{fmtTrendActive(stats.trend)}</span>
                )}
                <button className={styles.chipRemove} onClick={() => toggleSelect(id)} aria-label={`Remove ${player.name} from chart`}>
                  <X size={11} />
                </button>
              </div>
            );
          })}
          <button className={styles.chipAction} onClick={() => selectTopN(5)} title="Replace the selection with the top 5 rows of the table">
            <Plus size={12} />Top 5
          </button>
          {selectedIds.length > 0 && (
            <button className={styles.chipAction} onClick={clearSelection}>Clear</button>
          )}
          <span className={styles.watchCount} title={`Up to ${MAX_SELECTED} players on the chart`}>
            {selectedIds.length}/{MAX_SELECTED}
          </span>
        </div>

        <div className={styles.chartBody} data-help-id="chart-area">
          {selectedIds.length === 0 ? (
            <div className={styles.chartEmpty}>
              <p>No players on the chart</p>
              <p className={styles.chartEmptyHint}>Click rows in the table below to add up to {MAX_SELECTED}, or</p>
              <button className={styles.chipAction} onClick={() => selectTopN(5)}><Plus size={12} />Add top 5</button>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 8, right: 14, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 4" stroke="rgba(138, 155, 181, 0.10)" vertical={false} />
                <XAxis
                  dataKey="date"
                  tickFormatter={fmtDate}
                  tick={{ fontSize: isMobile ? 10 : 12, fill: '#8A9BB5', fontFamily: 'var(--font-mono)' }}
                  stroke="#1a2d50"
                  tickLine={false}
                  tickMargin={8}
                  minTickGap={32}
                />
                <YAxis
                  reversed
                  domain={chartDomain}
                  ticks={roundTicks}
                  interval={0}
                  tick={<RoundTick teams={teams} compact={isMobile} />}
                  axisLine={false}
                  tickLine={false}
                  width={isMobile ? 40 : 52}
                />
                <Tooltip
                  content={<CustomTooltip playerById={playerById} teams={teams} />}
                  cursor={{ stroke: 'rgba(138, 155, 181, 0.3)', strokeWidth: 1, strokeDasharray: '4 4' }}
                />

                {showPickRanges && !isBothMode && selectedIds.map((id, idx) => {
                  const player = playerById.get(id);
                  const stats = player?.pickStats;
                  if (!player || !stats || stats.count === 0) return null;
                  const color = LINE_PALETTE[idx];
                  return (
                    <React.Fragment key={`box-${id}`}>
                      <ReferenceArea y1={stats.q1} y2={stats.q3} fill={color} fillOpacity={0.18} stroke={color} strokeOpacity={0.4} ifOverflow="visible" />
                      <ReferenceLine y={stats.median} stroke={color} strokeDasharray="4 4" strokeWidth={2} strokeOpacity={0.7} ifOverflow="visible" />
                      <ReferenceLine y={stats.min} stroke={color} strokeOpacity={0.25} strokeDasharray="2 2" />
                      <ReferenceLine y={stats.max} stroke={color} strokeOpacity={0.25} strokeDasharray="2 2" />
                    </React.Fragment>
                  );
                })}

                {selectedIds.map((id, idx) => {
                  const player = playerById.get(id);
                  if (!player) return null;
                  const color = LINE_PALETTE[idx];
                  const dim = dimFor(id);
                  const active = highlightId === id;
                  if (isBothMode) {
                    return (
                      <React.Fragment key={id}>
                        <Line type="monotone" dataKey={`${id}_ud`} name={`${player.name} (UD)`} stroke={color} strokeWidth={active ? 3 : 2} strokeOpacity={dim} dot={{ r: 2, strokeWidth: 0, fill: color, fillOpacity: dim }} activeDot={{ r: 4.5, strokeWidth: 2, stroke: SURFACE_CARD }} connectNulls animationDuration={350} />
                        <Line type="monotone" dataKey={`${id}_dk`} name={`${player.name} (DK)`} stroke={color} strokeWidth={active ? 2.5 : 1.75} strokeOpacity={dim} strokeDasharray="5 4" dot={{ r: 2, strokeWidth: 0, fill: color, fillOpacity: dim }} activeDot={{ r: 4.5, strokeWidth: 2, stroke: SURFACE_CARD }} connectNulls animationDuration={350} />
                      </React.Fragment>
                    );
                  }
                  return (
                    <Line key={id} type="monotone" dataKey={id} name={player.name} stroke={color} strokeWidth={active ? 3 : 2} strokeOpacity={dim} dot={{ r: 2, strokeWidth: 0, fill: color, fillOpacity: dim }} activeDot={{ r: 4.5, strokeWidth: 2, stroke: SURFACE_CARD }} connectNulls animationDuration={350} />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </section>

      {/* --- Player table --- */}
      <section className={styles.tablePane} data-help-id="player-table">
        <div className={styles.tableToolbar}>
          <SearchInput value={query} onChange={setQuery} placeholder="Search player, team, pos…" />
          <div className={styles.trendMode} title="Show Trend and Δ UD-DK as % change or raw ADP spots">
            <span className={styles.trendModeLabel}>Trend</span>
            <div className="filter-btn-group">
              {[['pct', '%'], ['raw', 'Spots']].map(([value, label]) => (
                <button key={value} className={`filter-btn-group__item ${calcMode === value ? 'filter-btn-group__item--active' : ''}`} onClick={() => setCalcMode(value)}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <span className="filter-count"><strong>{filteredAndSortedList.length}</strong> players</span>
        </div>

        {/* Header */}
        <div className={styles.tableHeader} style={{ gridTemplateColumns: tableGrid }}>
          <div />
          <HeaderCell label="Player" col="name" sortConfig={sortConfig} onSort={handleSort} alignLeft />
          {isTwoPlat && !isMobile ? (
            <>
              <HeaderCell label="UD ADP" col="udAdp" sortConfig={sortConfig} onSort={handleSort} />
              <HeaderCell label="DK ADP" col="dkAdp" sortConfig={sortConfig} onSort={handleSort} />
              {!isTablet && <HeaderCell label="Δ UD-DK" col="deltaAdp" sortConfig={sortConfig} onSort={handleSort} />}
              <HeaderCell label="UD Trend" col="udTrend" sortConfig={sortConfig} onSort={handleSort} helpId="trend-col" />
              {!isTablet && <HeaderCell label="DK Trend" col="dkTrend" sortConfig={sortConfig} onSort={handleSort} />}
            </>
          ) : !isTwoPlat && !isMobile ? (
            <>
              <HeaderCell label="ADP" col="lastAdp" sortConfig={sortConfig} onSort={handleSort} />
              <HeaderCell label="Trend" col="change" sortConfig={sortConfig} onSort={handleSort} helpId="trend-col" />
            </>
          ) : null}
          {isMobile && <HeaderCell label="ADP" col={mobileAdpKey} sortConfig={sortConfig} onSort={handleSort} />}
          {isMobile && <HeaderCell label="Trend" col={mobileTrendKey} sortConfig={sortConfig} onSort={handleSort} helpId="trend-col" />}
          {!isMobile && <HeaderCell label="Exp" col="exposure" sortConfig={sortConfig} onSort={handleSort} />}
          {!isMobile && !isTablet && <HeaderCell label="Value" col="value" sortConfig={sortConfig} onSort={handleSort} helpId="value-col" />}
          {onNavigateToRosters && <div />}
        </div>

        {/* Body */}
        <div className={styles.tableBody} ref={tableBodyRef}>
        <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
          {rowVirtualizer.getVirtualItems().map(virtualRow => {
            const p = filteredAndSortedList[virtualRow.index];
            const checked = selectedIds.includes(p.id);
            const colorIndex = selectedIds.indexOf(p.id);
            const strokeColor = colorIndex >= 0 ? LINE_PALETTE[colorIndex] : null;
            const valueColor = p.value === null ? 'inherit' : p.value > 0 ? 'var(--positive)' : p.value < 0 ? 'var(--negative)' : 'inherit';
            const valueDisplay = p.value !== null ? `${p.value > 0 ? '+' : ''}${p.value.toFixed(1)}` : '-';
            const blocked = atCap && !checked;

            const udTrendVal = isPct ? p.udTrendPct : p.udTrend;
            const dkTrendVal = isPct ? p.dkTrendPct : p.dkTrend;
            const changeVal  = isPct ? p.changePct  : p.change;
            const deltaVal   = isPct ? p.deltaAdpPct : p.deltaAdp;
            const mobileTrendVal = isTwoPlat ? (platformFilter === 'draftkings' ? dkTrendVal : udTrendVal) : changeVal;
            const teamCode = abbrevTeam(p.team);

            return (
              <div
                key={p.id}
                data-index={virtualRow.index}
                role="checkbox"
                aria-checked={checked}
                tabIndex={0}
                onClick={() => toggleSelect(p.id)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggleSelect(p.id); } }}
                className={`${styles.playerRow} ${checked ? styles.playerRowSelected : ''}`}
                title={blocked ? `Chart is full — remove a player first (max ${MAX_SELECTED})` : undefined}
                style={{
                  gridTemplateColumns: tableGrid,
                  borderLeftColor: checked ? strokeColor : 'transparent',
                  cursor: blocked ? 'not-allowed' : 'pointer',
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  width: '100%',
                  height: virtualRow.size,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                {/* Selection swatch — filled with the player's line color */}
                <span
                  className={`${styles.swatch} ${checked ? styles.swatchOn : ''}`}
                  style={checked ? { background: strokeColor, borderColor: strokeColor } : undefined}
                  aria-hidden="true"
                />

                {/* Player: badge + name + team */}
                <div className={styles.playerCell}>
                  <PosBadge pos={p.position} />
                  <span className={styles.playerName}>{p.name}</span>
                  {teamCode && <span className={styles.playerTeam}>{teamCode}</span>}
                </div>

                {/* ADP + Trend columns */}
                {isTwoPlat && !isMobile ? (
                  <>
                    <div className={styles.monoCell}>{fmtAdp(p.udAdp)}</div>
                    <div className={styles.monoCell}>{fmtAdp(p.dkAdp)}</div>
                    {!isTablet && <div className={`${styles.monoCell} ${styles.dimCell}`}>{fmtDeltaActive(deltaVal)}</div>}
                    <div className={styles.trendCell} style={{ color: trendColor(udTrendVal) }}>{fmtTrendActive(udTrendVal)}</div>
                    {!isTablet && <div className={styles.trendCell} style={{ color: trendColor(dkTrendVal) }}>{fmtTrendActive(dkTrendVal)}</div>}
                  </>
                ) : !isTwoPlat && !isMobile ? (
                  <>
                    <div className={styles.monoCell}>{p.displayAdp}</div>
                    <div className={styles.trendCell} style={{ color: trendColor(changeVal) }}>{fmtTrendActive(changeVal)}</div>
                  </>
                ) : null}

                {/* Mobile: ADP + trend */}
                {isMobile && <div className={styles.monoCell}>{fmtAdp(isTwoPlat ? p[mobileAdpKey] : p.lastAdp)}</div>}
                {isMobile && (
                  <div className={styles.trendCell} style={{ color: trendColor(mobileTrendVal) }}>
                    {fmtTrendActive(mobileTrendVal)}
                  </div>
                )}

                {/* Exposure */}
                {!isMobile && <div className={styles.monoCell}>{p.exposure > 0 ? `${p.exposure}%` : '-'}</div>}

                {/* Value (CLV) */}
                {!isMobile && !isTablet && (
                  <div className={styles.valueCell} style={{ color: valueColor }}>{valueDisplay}</div>
                )}

                {/* Roster nav — revealed on hover (always visible on touch) */}
                {onNavigateToRosters && (
                  <div className={styles.navBtnCell}>
                    {p.exposure > 0 && (
                      <button
                        className={styles.seeRostersBtn}
                        onClick={e => { e.stopPropagation(); onNavigateToRosters({ players: [p.name] }); }}
                        aria-label={`See rosters with ${p.name}`}
                      >
                        {isMobile ? '→' : 'Rosters →'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        </div>
      </section>
    </div>
    </TabLayout>
  );
}
