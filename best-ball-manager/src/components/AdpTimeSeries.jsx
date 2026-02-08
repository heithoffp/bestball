import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, Legend, CartesianGrid, ReferenceArea, ReferenceLine
} from 'recharts';
import { parseAdpString } from '../utils/helpers';

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
  const [query, setQuery] = useState('');
  const [showPickRanges, setShowPickRanges] = useState(true);
  const [selectedIds, setSelectedIds] = useState(() => {
    return [...masterPlayers]
      .sort((a, b) => parseFloat(b.exposure || 0) - parseFloat(a.exposure || 0))
      .slice(0, 5)
      .map(p => p.player_id);
  });
  
  const [sortConfig, setSortConfig] = useState({ key: 'exposure', direction: 'desc' });

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

  // 2. Filter and Sort
  const filteredAndSortedList = useMemo(() => {
    let list = richPlayerList;
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
  }, [richPlayerList, query, sortConfig]);

  // 3. Chart Data
  const chartData = useMemo(() => {
    return adpSnapshots.map((snap, snapIdx) => {
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
    });
  }, [adpSnapshots, richPlayerList, selectedIds]);

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
      if (sortConfig.key !== col) return <span style={{opacity:0.3, fontSize: 10}}>⇅</span>;
      return sortConfig.direction === 'asc' ? '▲' : '▼';
  };

  const CustomTooltip = ({ active, label, payload }) => {
    if (!active || !label) return null;
    return (
      <div className="card" style={{ padding: '8px 12px', minWidth: 180, border: '1px solid #444', backgroundColor: 'rgba(20,20,20, 0.95)' }}>
        <div style={{ fontSize: 13, marginBottom: 8, borderBottom:'1px solid #333', paddingBottom:4 }}>{label}</div>
        {payload && payload.map((entry, i) => {
            const player = richPlayerList.find(p => p.id === entry.dataKey);
            const stats = player?.pickStats;
            const hasStats = stats && stats.count > 0;
            
            return (
                <div key={entry.dataKey} style={{ marginBottom: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: entry.stroke }}>
                        <span style={{ fontWeight: 600 }}>{player?.name || entry.dataKey}:</span>
                        <span>{entry.value?.toFixed(1)} (ADP)</span>
                    </div>
                    {hasStats && (
                        <div style={{ fontSize: 10, color: '#aaa', marginLeft: 8 }}>
                            My Picks: Avg {stats.mean.toFixed(1)} • Med {stats.median.toFixed(1)} (Range: {stats.min}-{stats.max})
                        </div>
                    )}
                </div>
            );
        })}
      </div>
    );
  };

  // Define Grid Columns here for easy adjustment
  const gridTemplate = '30px 1fr 50px 50px 75px 50px';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
      
      {/* --- Controls --- */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <input
            className="path-input"
            placeholder="Filter by name, team, pos..."
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ width: 250 }}
        />
        <div style={{ display: 'flex', gap: 8 }}>
            <button className="load-button" onClick={() => selectTopN(5)} style={{ width: 'auto', padding: '0.4rem 0.8rem' }}>Select Top 5</button>
            <button className="load-button" onClick={() => setSelectedIds([])} style={{ width: 'auto', padding: '0.4rem 0.8rem' }}>Clear All</button>
        </div>
        
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer', userSelect: 'none', marginLeft: 8 }}>
            <input 
                type="checkbox" 
                checked={showPickRanges} 
                onChange={e => setShowPickRanges(e.target.checked)} 
            />
            Show My Pick Ranges
        </label>

        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>
            Showing {filteredAndSortedList.length} players ({selectedIds.length} selected)
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', height: 500 }}>
        
        {/* --- Left Pane: Data Table --- */}
        <div className="card" style={{ width: 480, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
            
            {/* Header */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: gridTemplate, 
                padding: '8px 12px', 
                background: 'rgba(255,255,255,0.03)', 
                borderBottom: '1px solid var(--border)', 
                fontWeight: 600, 
                fontSize: 12 
            }}>
                <div></div>
                <div style={{ cursor: 'pointer' }} onClick={() => handleSort('name')}>Player <SortIcon col="name"/></div>
                <div style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('exposure')}>Exp <SortIcon col="exposure"/></div>
                <div style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('lastAdp')}>ADP <SortIcon col="lastAdp"/></div>
                {/* NEW COLUMN: Value (ADP - my average) */}
                <div style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('value')}>Value <SortIcon col="value"/></div>
                <div style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('change')}>Trend <SortIcon col="change"/></div>
            </div>

            {/* Body */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {filteredAndSortedList.map((p) => {
                    const checked = selectedIds.includes(p.id);
                    const colorIndex = selectedIds.indexOf(p.id);
                    const strokeColor = colorIndex >= 0 ? colorPalette[colorIndex % colorPalette.length] : 'transparent';
                    const trendColor = p.change < 0 ? '#10b981' : p.change > 0 ? '#ef4444' : '#6b7280';
                    const trendIcon = p.change < 0 ? '▲' : p.change > 0 ? '▼' : '-';
                    
                    // Formatting My Pick Stats
                    const stats = p.pickStats;
                    const hasPicks = stats && stats.count > 0;
                    
                    // NEW: Value = ADP - myAvg (positive = value, negative = reach)
                    const value = p.value;
                    const valueColor = value === null ? 'inherit' : (value > 0 ? '#10b981' : value < 0 ? '#ef4444' : 'inherit');
                    const valueDisplay = value !== null ? `${value > 0 ? '+' : ''}${value.toFixed(1)}` : '-';
                    const myAvgDisplay = p.myAvg !== null ? p.myAvg.toFixed(1) : '-';
                    const adpDisplayRaw = p.lastAdp !== null ? p.lastAdp.toFixed(1) : '-';
                    
                    return (
                        <div key={p.id} onClick={() => toggleSelect(p.id)}
                            style={{ 
                                display: 'grid', 
                                gridTemplateColumns: gridTemplate, // Use the shared template
                                padding: '6px 12px', 
                                borderBottom: '1px solid var(--border)',
                                alignItems: 'center', 
                                fontSize: 13, 
                                cursor: 'pointer',
                                background: checked ? 'rgba(255,255,255,0.04)' : 'transparent',
                                borderLeft: checked ? `4px solid ${strokeColor}` : '4px solid transparent'
                            }} className="hover-row">
                            
                            <input type="checkbox" checked={checked} readOnly style={{ cursor: 'pointer' }} />
                            
                            {/* Name */}
                            <div style={{ overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis', paddingRight:8 }}>
                                <div style={{ fontWeight: 500 }}>{p.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{p.team} • {p.position}</div>
                            </div>

                            {/* Exposure */}
                            <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>{p.exposure > 0 ? `${p.exposure}%` : '-'}</div>

                            {/* ADP */}
                            <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>{p.displayAdp}</div>

                            {/* NEW: Value column (ADP - myAvg) with small avg/ADP text */}
                            <div style={{ textAlign: 'right', fontFamily: 'monospace', lineHeight: 1.1 }}>
                                {hasPicks ? (
                                    <>
                                        <div style={{ fontWeight: 600, color: valueColor }}>
                                            {valueDisplay}
                                        </div>
                                        <div style={{ fontSize: 10, color: '#888' }}>
                                            {myAvgDisplay} avg • {adpDisplayRaw}
                                        </div>
                                    </>
                                ) : (
                                    <span style={{color:'#444'}}>-</span>
                                )}
                            </div>

                            {/* Trend */}
                            <div style={{ textAlign: 'right', color: trendColor, fontWeight: 600, fontSize: 12 }}>
                                {p.change !== 0 && trendIcon} {Math.abs(p.change).toFixed(1)}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* --- Right Pane: Chart (Unchanged) --- */}
        <div className="card" style={{ flex: 1, height: '100%', padding: '1rem' }}>
            {selectedIds.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
                    Select players from the list to view ADP history
                </div>
            ) : (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#9ca3af' }} stroke="#4b5563" />
                        <YAxis reversed domain={chartDomain} tick={{ fontSize: 11, fill: '#9ca3af' }} stroke="#4b5563" width={40} />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2 }}/>
                        <Legend wrapperStyle={{ paddingTop: 10 }} />
                        
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
