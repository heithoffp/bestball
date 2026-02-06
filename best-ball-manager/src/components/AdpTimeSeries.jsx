import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  Tooltip, Legend, Brush, CartesianGrid
} from 'recharts';
import { parseAdpString } from '../utils/helpers';

export default function AdpTimeSeries({ adpSnapshots = [], masterPlayers = [], teams = 12 }) {
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => {
    // Default to top 5 by exposure
    return [...masterPlayers]
      .sort((a, b) => parseFloat(b.exposure || 0) - parseFloat(a.exposure || 0))
      .slice(0, 5)
      .map(p => p.player_id);
  });
  
  // Sorting State
  const [sortConfig, setSortConfig] = useState({ key: 'exposure', direction: 'desc' });

  const colorPalette = [
    '#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6',
    '#ec4899', '#6366f1', '#14b8a6', '#f97316', '#84cc16'
  ];

  // 1. Build a comprehensive list of all players + their stats
  const richPlayerList = useMemo(() => {
    const playerMap = new Map();

    // A) Initialize from Master List (for Exposure, Name, Team)
    masterPlayers.forEach(p => {
      playerMap.set(p.player_id, {
        id: p.player_id,
        name: p.name,
        team: p.team || 'FA',
        position: p.position || '?',
        exposure: parseFloat(p.exposure || 0),
        firstAdp: null,
        lastAdp: null,
        adpHistory: [] // sparse array matching snapshots
      });
    });

    // B) Iterate Snapshots to fill ADP data and catch missing players
    adpSnapshots.forEach((snapshot, snapIdx) => {
      snapshot.rows.forEach(row => {
        // Normalize Name
        const firstName = row.firstName || row.first_name || row['First Name'] || '';
        const lastName = row.lastName || row.last_name || row['Last Name'] || '';
        const rawName = (firstName + ' ' + lastName).trim() || row['Player Name'] || row.player_name || row.Player || '';
        
        if (!rawName) return;
        
        const normalizedName = rawName.trim().replace(/\s+/g, ' ');
        
        // Find existing ID or create synthetic
        // Try to match by name in existing map
        let matchedId = null;
        for (const [pid, pData] of playerMap.entries()) {
            if (pData.name === normalizedName) {
                matchedId = pid;
                break;
            }
        }

        if (!matchedId) {
            // Create synthetic if not in master list
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
                    adpHistory: []
                });
            }
        }

        // Parse ADP
        const rawAdpVal = row.adp ?? row.ADP ?? row['ADP'] ?? row['Round.Pick'] ?? row['Adp'] ?? '';
        const parsed = parseAdpString(rawAdpVal, teams);
        const pick = parsed && !Number.isNaN(parsed.pick) ? parsed.pick : null;

        if (pick !== null) {
            const entry = playerMap.get(matchedId);
            
            // Track history
            entry.adpHistory[snapIdx] = pick;

            // Update Start/End stats
            if (entry.firstAdp === null) entry.firstAdp = pick;
            entry.lastAdp = pick;
        }
      });
    });

    // C) Convert to Array and Calculate Trend
    return Array.from(playerMap.values()).map(p => {
        // Trend: (Last - First). 
        // Negative result = ADP went down (e.g. 100 -> 90) = RISING value (Green)
        // Positive result = ADP went up (e.g. 90 -> 100) = FALLING value (Red)
        const change = (p.firstAdp !== null && p.lastAdp !== null) 
            ? p.lastAdp - p.firstAdp 
            : 0;

        return {
            ...p,
            change,
            displayAdp: p.lastAdp ? p.lastAdp.toFixed(1) : '-'
        };
    });
  }, [masterPlayers, adpSnapshots, teams]);

  // 2. Filter and Sort
  const filteredAndSortedList = useMemo(() => {
    let list = richPlayerList;

    // Filter
    const q = (query || '').toLowerCase().trim();
    if (q) {
        list = list.filter(p => (`${p.name} ${p.team} ${p.position}`).toLowerCase().includes(q));
    }

    // Sort
    return list.sort((a, b) => {
        let valA = a[sortConfig.key];
        let valB = b[sortConfig.key];

        // Handle nulls/strings for numeric sort
        if (sortConfig.key === 'name') {
             valA = valA.toLowerCase(); 
             valB = valB.toLowerCase();
        } else if (sortConfig.key === 'lastAdp') {
             valA = valA === null ? 9999 : valA;
             valB = valB === null ? 9999 : valB;
        }

        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
    });
  }, [richPlayerList, query, sortConfig]);

  // 3. Prepare Chart Data (Pivot)
  const chartData = useMemo(() => {
    return adpSnapshots.map((snap, snapIdx) => {
        const row = { date: snap.date };
        // Only populate data for selected IDs to keep chart fast
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

  // Helper for Sort Icons
  const SortIcon = ({ col }) => {
      if (sortConfig.key !== col) return <span style={{opacity:0.3, fontSize: 10}}>⇅</span>;
      return sortConfig.direction === 'asc' ? '▲' : '▼';
  };

  const CustomTooltip = ({ active, label, payload }) => {
    if (!active || !label) return null;
    return (
      <div className="card" style={{ padding: '8px 12px', minWidth: 180 }}>
        <div style={{ fontSize: 13, marginBottom: 8, borderBottom:'1px solid #333', paddingBottom:4 }}>{label}</div>
        {payload && payload.map((entry, i) => {
            const player = richPlayerList.find(p => p.id === entry.dataKey);
            return (
                <div key={entry.dataKey} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4, color: entry.stroke }}>
                    <span style={{ fontWeight: 600 }}>{player?.name || entry.dataKey}:</span>
                    <span>{entry.value?.toFixed(1)}</span>
                </div>
            );
        })}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', gap: 16 }}>
      
      {/* --- Controls / Legend Area --- */}
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
        <div style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-secondary)' }}>
            Showing {filteredAndSortedList.length} players ({selectedIds.length} selected)
        </div>
      </div>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', height: 500 }}>
        
        {/* --- Left Pane: Data Table --- */}
        <div className="card" style={{ width: 420, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', height: '100%' }}>
            
            {/* Table Header */}
            <div style={{ 
                display: 'grid', 
                gridTemplateColumns: '30px 1fr 60px 60px 60px', 
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
                <div style={{ cursor: 'pointer', textAlign: 'right' }} onClick={() => handleSort('change')}>Trend <SortIcon col="change"/></div>
            </div>

            {/* Table Body */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
                {filteredAndSortedList.map((p) => {
                    const checked = selectedIds.includes(p.id);
                    const colorIndex = selectedIds.indexOf(p.id);
                    const strokeColor = colorIndex >= 0 ? colorPalette[colorIndex % colorPalette.length] : 'transparent';
                    
                    // Trend Color Logic
                    const trendColor = p.change < 0 ? '#10b981' : p.change > 0 ? '#ef4444' : '#6b7280';
                    const trendIcon = p.change < 0 ? '▲' : p.change > 0 ? '▼' : '-';
                    // Note: In ADP, a negative change (-5) means they went from pick 100 to 95. That is "Rising" (Green).

                    return (
                        <div 
                            key={p.id} 
                            onClick={() => toggleSelect(p.id)}
                            style={{ 
                                display: 'grid', 
                                gridTemplateColumns: '30px 1fr 60px 60px 60px',
                                padding: '6px 12px',
                                borderBottom: '1px solid var(--border)',
                                alignItems: 'center',
                                fontSize: 13,
                                cursor: 'pointer',
                                background: checked ? 'rgba(255,255,255,0.04)' : 'transparent',
                                borderLeft: checked ? `4px solid ${strokeColor}` : '4px solid transparent'
                            }}
                            className="hover-row"
                        >
                            <input 
                                type="checkbox" 
                                checked={checked} 
                                readOnly 
                                style={{ cursor: 'pointer' }}
                            />
                            
                            <div style={{ overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis', paddingRight:8 }}>
                                <div style={{ fontWeight: 500 }}>{p.name}</div>
                                <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
                                    {p.team} • {p.position}
                                </div>
                            </div>

                            <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                {p.exposure > 0 ? `${p.exposure}%` : '-'}
                            </div>

                            <div style={{ textAlign: 'right', fontFamily: 'monospace' }}>
                                {p.displayAdp}
                            </div>

                            <div style={{ textAlign: 'right', color: trendColor, fontWeight: 600, fontSize: 12 }}>
                                {p.change !== 0 && trendIcon} {Math.abs(p.change).toFixed(1)}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>

        {/* --- Right Pane: Chart --- */}
        <div className="card" style={{ flex: 1, height: '100%', padding: '1rem' }}>
            {selectedIds.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}>
                    Select players from the list to view ADP history
                </div>
            ) : (
                <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                        <XAxis 
                            dataKey="date" 
                            tick={{ fontSize: 11, fill: '#9ca3af' }} 
                            stroke="#4b5563"
                        />
                        <YAxis 
                            reversed 
                            domain={['auto', 'auto']} 
                            tick={{ fontSize: 11, fill: '#9ca3af' }} 
                            stroke="#4b5563"
                            width={40}
                        />
                        <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2 }}/>
                        <Legend wrapperStyle={{ paddingTop: 10 }} />
                        
                        {selectedIds.map((id, idx) => {
                            const player = richPlayerList.find(p => p.id === id);
                            if (!player) return null;
                            return (
                                <Line
                                    key={id}
                                    type="monotone"
                                    dataKey={id}
                                    name={player.name}
                                    stroke={colorPalette[idx % colorPalette.length]}
                                    strokeWidth={2}
                                    dot={{ r: 3, strokeWidth: 0 }}
                                    activeDot={{ r: 6 }}
                                    connectNulls={true}
                                    animationDuration={500}
                                />
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