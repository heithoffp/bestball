import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, Legend, CartesianGrid, ReferenceArea, ReferenceLine
} from 'recharts';
import { parseAdpString } from '../utils/helpers';
import styles from './AdpTimeSeries.module.css';
import useMediaQuery from '../hooks/useMediaQuery';

// --- Math Helper for Quartiles + mean ---
const calculateBoxPlot = (values) => {
  if (!values || values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);

  const quantile = (arr, q) => {
    const pos = (arr.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    } else {
      return sorted[base];
    }
  };

  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length;

  return {
    min: sorted[0],
    q1: quantile(sorted, 0.25),
    median: quantile(sorted, 0.50),
    q3: quantile(sorted, 0.75),
    max: sorted[sorted.length - 1],
    count: sorted.length,
    mean
  };
};

export default function AdpTimeSeries({ adpSnapshots = [], masterPlayers = [], rosterData = [], teams = 12 }) {
  const [queryInput, setQueryInput] = useState('');
  const [query, setQuery] = useState('');
  const { isMobile, isTablet } = useMediaQuery();

  useEffect(() => {
    const timer = setTimeout(() => setQuery(queryInput), 250);
    return () => clearTimeout(timer);
  }, [queryInput]);
  const [showPickRanges, setShowPickRanges] = useState(true);
  const [selectedIds, setSelectedIds] = useState([]);
  const [timeScale, setTimeScale] = useState('1m');

  const [sortConfig, setSortConfig] = useState({ key: 'change', direction: 'asc' });

  const colorPalette = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
    '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#84cc16'
  ];

  // 1. Build Comprehensive List + Integrate My Picks
  const richPlayerList = useMemo(() => {
    const playerMap = new Map();

    // A) Initialize from Master
    masterPlayers.forEach(p => {
      playerMap.set(p.player_id, {
        id: p.player_id,
        name: p.name,
        team: p.team || 'FA',
        position: p.position || '?',
        exposure: parseFloat(p.exposure || 0),
        firstAdp: null,
        lastAdp: null,
        adpHistory: [],
        myPicks: []
      });
    });

    // B) Process ADP Snapshots
    adpSnapshots.forEach((snapshot, snapIdx) => {
      snapshot.rows.forEach(row => {
        const firstName = row.firstName || row.first_name || row['First Name'] || '';
        const lastName = row.lastName || row.last_name || row['Last Name'] || '';
        const rawName = (firstName + ' ' + lastName).trim() || row['Player Name'] || row.player_name || row.Player || '';

        if (!rawName) return;
        const normalizedName = rawName.trim().replace(/\s+/g, ' ');

        let matchedId = null;
        for (const [pid, pData] of playerMap.entries()) {
            if (pData.name === normalizedName) {
                matchedId = pid;
                break;
            }
        }

        if (!matchedId) {
            matchedId = `s_${normalizedName.replace(/\W+/g, '_')}`;
            if (!playerMap.has(matchedId)) {
                playerMap.set(matchedId, {
                    id: matchedId,
                    name: normalizedName,
                    team: row['Team'] || row.team || 'N/A',
                    position: row['Position'] || row.position || 'N/A',
                    exposure: 0,
                    firstAdp: null,
                    lastAdp: null,
                    adpHistory: [],
                    myPicks: []
                });
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
        }
      });
    });

    // C) Process RosterData to get User's Picks
    rosterData.forEach(rosterRow => {
        const normName = rosterRow.name;
        for (const [pid, pData] of playerMap.entries()) {
            if (pData.name === normName) {
                if(rosterRow.pick) {
                    pData.myPicks.push(rosterRow.pick);
                }
                break;
            }
        }
    });

    // D) Calculate Stats
    return Array.from(playerMap.values()).map(p => {
        const change = (p.firstAdp !== null && p.lastAdp !== null)
            ? p.lastAdp - p.firstAdp
            : 0;

        const pickStats = calculateBoxPlot(p.myPicks);
        const myAvg = pickStats ? pickStats.mean : null;
        const value = (p.lastAdp !== null && myAvg !== null) ? (myAvg - p.lastAdp) : 0; // ADP - myAvg

        return {
            ...p,
            change,
            displayAdp: p.lastAdp ? p.lastAdp.toFixed(1) : '-',
            pickStats,
            myAvg,
            value
        };
    });
  }, [masterPlayers, adpSnapshots, teams, rosterData]);

  // 2. Compute time-scale-aware trend
  const timeFilteredPlayers = useMemo(() => {
    const now = new Date();
    let cutoff = null;
    if (timeScale === '1w') cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (timeScale === '1m') cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    // Find which snapshot indices fall within the time window
    const windowIndices = [];
    adpSnapshots.forEach((snap, idx) => {
      if (!cutoff || new Date(snap.date) >= cutoff) windowIndices.push(idx);
    });

    return richPlayerList.map(p => {
      let firstInWindow = null;
      let lastInWindow = null;
      for (const idx of windowIndices) {
        const val = p.adpHistory[idx];
        if (val !== undefined) {
          if (firstInWindow === null) firstInWindow = val;
          lastInWindow = val;
        }
      }
      const change = (firstInWindow !== null && lastInWindow !== null)
        ? lastInWindow - firstInWindow
        : 0;
      return { ...p, change };
    });
  }, [richPlayerList, adpSnapshots, timeScale]);

  // 3. Filter and Sort
  const filteredAndSortedList = useMemo(() => {
    let list = timeFilteredPlayers;
    const q = (query || '').toLowerCase().trim();
    if (q) {
        list = list.filter(p => (`${p.name} ${p.team} ${p.position}`).toLowerCase().includes(q));
    }
    return list.sort((a, b) => {
        // Special sort for My Picks (by Median)
        if (sortConfig.key === 'myPickMedian') {
             const valA = a.pickStats ? a.pickStats.median : 9999;
             const valB = b.pickStats ? b.pickStats.median : 9999;
             if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
             if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
             return 0;
        }

        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];
        if (sortConfig.key === 'name') {
             valA = valA.toLowerCase();
             valB = valB.toLowerCase();
        } else if (['lastAdp','value','myAvg'].includes(sortConfig.key)) {
             valA = valA === null ? 9999 : valA;
             valB = valB === null ? 9999 : valB;
        }
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });
  }, [timeFilteredPlayers, query, sortConfig]);

  // Auto-select top 5 from sorted list on initial load
  const initialSelectionDone = useRef(false);
  useEffect(() => {
    if (!initialSelectionDone.current && filteredAndSortedList.length > 0) {
      initialSelectionDone.current = true;
      setSelectedIds(filteredAndSortedList.slice(0, 5).map(p => p.id));
    }
  }, [filteredAndSortedList]);

  // 3. Chart Data
  const chartData = useMemo(() => {
    const now = new Date();
    let cutoff = null;
    if (timeScale === '1w') cutoff = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    else if (timeScale === '1m') cutoff = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    return adpSnapshots
        .map((snap, snapIdx) => {
            if (cutoff && new Date(snap.date) < cutoff) return null;
            const row = { date: snap.date };
            selectedIds.forEach(id => {
                const player = richPlayerList.find(p => p.id === id);
                if (player && player.adpHistory[snapIdx] !== undefined) {
                    row[id] = player.adpHistory[snapIdx];
                } else {
                    row[id] = null;
                }
            });
            return row;
        })
        .filter(Boolean);
  }, [adpSnapshots, richPlayerList, selectedIds, timeScale]);

  // 4. Calculate Custom Y-Axis Domain
  const chartDomain = useMemo(() => {
    let min = Infinity;
    let max = -Infinity;

    chartData.forEach(row => {
        selectedIds.forEach(id => {
            const val = row[id];
            if (val !== null && val !== undefined) {
                if (val < min) min = val;
                if (val > max) max = val;
            }
        });
    });

    if (showPickRanges) {
        selectedIds.forEach(id => {
            const player = richPlayerList.find(p => p.id === id);
            if (player && player.pickStats) {
                if (player.pickStats.min < min) min = player.pickStats.min;
                if (player.pickStats.max > max) max = player.pickStats.max;
            }
        });
    }

    if (min === Infinity || max === -Infinity) return ['auto', 'auto'];

    const padding = (max - min) * 0.05;
    return [Math.floor(min - padding), Math.ceil(max + padding)];

  }, [chartData, selectedIds, richPlayerList, showPickRanges]);

  // Handlers
  const handleSort = (key) => {
    setSortConfig(prev => ({
        key,
        direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      if (prev.includes(id)) return prev.filter(x => x !== id);
      return [...prev, id];
    });
  };

  const selectTopN = (n = 5) => {
    const top = filteredAndSortedList.slice(0, n).map(p => p.id);
    setSelectedIds(top);
  };

  const SortIcon = ({ col }) => {
      if (sortConfig.key !== col) return <span className={styles.sortIcon}>⇅</span>;
      return sortConfig.direction === 'asc' ? '▲' : '▼';
  };

  const tickFontSize = isMobile ? 11 : 14;
  const chartHeight = isMobile ? 280 : isTablet ? 460 : 585;

  const CustomTooltip = ({ active, label, payload }) => {
    if (!active || !label) return null;
    return (
      <div className={`card ${styles.tooltip}`}>
        <div className={styles.tooltipDate}>{label}</div>
        {payload && payload.map((entry, i) => {
            const player = richPlayerList.find(p => p.id === entry.dataKey);
            const stats = player?.pickStats;
            const hasStats = stats && stats.count > 0;

            return (
                <div key={entry.dataKey} className={styles.tooltipEntry}>
                    <div className={styles.tooltipEntryHeader} style={{ color: entry.stroke }}>
                        <span className={styles.tooltipEntryName}>{player?.name || entry.dataKey}:</span>
                        <span>{entry.value?.toFixed(1)} (ADP)</span>
                    </div>
                    {hasStats && (
                        <div className={styles.tooltipStats}>
                            My Picks: Avg {stats.mean.toFixed(1)} • Med {stats.median.toFixed(1)} (Range: {stats.min}-{stats.max})
                        </div>
                    )}
                </div>
            );
        })}
      </div>
    );
  };

  return (
    <div className={styles.root}>

      {/* --- Controls --- */}
      <div className={styles.controls}>
        <input
            className={`path-input ${styles.searchInput}`}
            placeholder="Filter by name, team, pos..."
            value={queryInput}
            onChange={e => setQueryInput(e.target.value)}
        />
        <div className={styles.buttonGroup}>
            <button className="load-button" onClick={() => selectTopN(5)} style={{ width: 'auto', padding: '0.5rem 1rem' }}>Select Top 5</button>
            <button className="load-button" onClick={() => setSelectedIds([])} style={{ width: 'auto', padding: '0.5rem 1rem' }}>Clear All</button>
        </div>

        <div className={styles.timeScaleGroup}>
            {[['1w', '1W'], ['1m', '1M'], ['all', 'All']].map(([value, label]) => (
                <button
                    key={value}
                    className={`${styles.timeScaleBtn} ${timeScale === value ? styles.timeScaleActive : ''}`}
                    onClick={() => setTimeScale(value)}
                >
                    {label}
                </button>
            ))}
        </div>

        <label className={styles.checkboxLabel}>
            <input
                type="checkbox"
                checked={showPickRanges}
                onChange={e => setShowPickRanges(e.target.checked)}
            />
            Show My Pick Ranges
        </label>

        <div className={styles.playerCount}>
            Showing {filteredAndSortedList.length} players ({selectedIds.length} selected)
        </div>
      </div>

      <div className={styles.mainLayout}>

        {/* --- Left Pane: Data Table --- */}
        <div className={`card ${styles.tablePane}`}>

            {/* Header */}
            <div className={styles.tableHeader}>
                <div></div>
                <div style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>Player <SortIcon col="name"/></div>
                <div className={`${styles.sortHeader} ${styles.hideOnMobile}`} onClick={() => handleSort('exposure')}>Exp <SortIcon col="exposure"/></div>
                <div className={`${styles.sortHeader} ${styles.hideOnMobile}`} onClick={() => handleSort('lastAdp')}>ADP <SortIcon col="lastAdp"/></div>
                <div className={`${styles.sortHeader} ${styles.hideOnMobile} ${styles.hideOnTablet}`} onClick={() => handleSort('value')}>Value <SortIcon col="value"/></div>
                <div className={styles.sortHeader} onClick={() => handleSort('change')}>Trend <SortIcon col="change"/></div>
            </div>

            {/* Body */}
            <div className={styles.tableBody}>
                {filteredAndSortedList.map((p) => {
                    const checked = selectedIds.includes(p.id);
                    const colorIndex = selectedIds.indexOf(p.id);
                    const strokeColor = colorIndex >= 0 ? colorPalette[colorIndex % colorPalette.length] : 'transparent';
                    const trendColor = p.change < 0 ? '#10b981' : p.change > 0 ? '#ef4444' : '#6b7280';
                    const trendIcon = p.change < 0 ? '▲' : p.change > 0 ? '▼' : '-';

                    // Formatting My Pick Stats
                    const stats = p.pickStats;
                    const hasPicks = stats && stats.count > 0;

                    // Value = ADP - myAvg (positive = value, negative = reach)
                    const value = p.value;
                    const valueColor = value === null ? 'inherit' : (value > 0 ? '#10b981' : value < 0 ? '#ef4444' : 'inherit');
                    const valueDisplay = value !== null ? `${value > 0 ? '+' : ''}${value.toFixed(1)}` : '-';
                    const myAvgDisplay = p.myAvg !== null ? p.myAvg.toFixed(1) : '-';
                    const adpDisplayRaw = p.lastAdp !== null ? p.lastAdp.toFixed(1) : '-';

                    return (
                        <div key={p.id} onClick={() => toggleSelect(p.id)}
                            className={`hover-row ${styles.playerRow} ${checked ? styles.playerRowSelected : ''}`}
                            style={{ borderLeft: checked ? `4px solid ${strokeColor}` : '4px solid transparent' }}>

                            <input type="checkbox" checked={checked} readOnly style={{ cursor: 'pointer' }} />

                            {/* Name */}
                            <div className={styles.playerName}>
                                <div className={styles.playerNameText}>{p.name}</div>
                                <div className={styles.playerMeta}>{p.team} • {p.position}</div>
                            </div>

                            {/* Exposure */}
                            <div className={`${styles.monoCell} ${styles.hideOnMobile}`}>{p.exposure > 0 ? `${p.exposure}%` : '-'}</div>

                            {/* ADP */}
                            <div className={`${styles.monoCell} ${styles.hideOnMobile}`}>{p.displayAdp}</div>

                            {/* Value column (ADP - myAvg) with small avg/ADP text */}
                            <div className={`${styles.valueCell} ${styles.hideOnMobile} ${styles.hideOnTablet}`}>
                                {hasPicks ? (
                                    <>
                                        <div style={{ fontWeight: 600, color: valueColor }}>
                                            {valueDisplay}
                                        </div>
                                        <div className={styles.valueSub}>
                                            {myAvgDisplay} avg • {adpDisplayRaw}
                                        </div>
                                    </>
                                ) : (
                                    <span className={styles.valuePlaceholder}>-</span>
                                )}
                            </div>

                            {/* Trend */}
                            <div className={styles.trendCell} style={{ color: trendColor }}>
                                {p.change !== 0 && trendIcon} {Math.abs(p.change).toFixed(1)}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* --- Right Pane: Chart --- */}
        <div className={`card ${styles.chartPane}`}>
            {selectedIds.length === 0 ? (
                <div className={styles.chartEmpty}>
                    Select players from the list to view ADP history
                </div>
            ) : (
                <ResponsiveContainer width="100%" height={chartHeight}>
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" tick={{ fontSize: tickFontSize, fill: '#9ca3af' }} stroke="#4b5563" />
                        <YAxis reversed domain={chartDomain} tick={{ fontSize: tickFontSize, fill: '#9ca3af' }} stroke="#4b5563" width={isMobile ? 40 : 50} />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2 }}/>
                        {!isMobile && <Legend wrapperStyle={{ paddingTop: 13 }} />}

                        {showPickRanges && selectedIds.map((id, idx) => {
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
                            return (
                                <Line key={id} type="monotone" dataKey={id} name={player.name} stroke={colorPalette[idx % colorPalette.length]} strokeWidth={3} dot={{ r: 3, strokeWidth: 0 }} activeDot={{ r: 6 }} connectNulls={true} animationDuration={500} />
                            );
                        })}
                    </LineChart>
                </ResponsiveContainer>
            )}
        </div>
      </div>
    </div>
  );
}
