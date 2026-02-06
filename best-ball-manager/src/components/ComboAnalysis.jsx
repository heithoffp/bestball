import React, { useMemo, useState } from 'react';

export default function ComboAnalysis({ rosterData = [] }) {
  const [activeTab, setActiveTab] = useState('starts'); 
  const [includeR3, setIncludeR3] = useState(false);
  const [minCount, setMinCount] = useState(1);
  const [qbFilter, setQbFilter] = useState('');
  const [hoveredQB, setHoveredQB] = useState(null);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [selectedQB, setSelectedQB] = useState(null);

  const teams = useMemo(() => {
    const map = new Map();
    rosterData.forEach(p => {
      const id = p.entry_id || 'unknown';
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(p);
    });
    return Array.from(map.values());
  }, [rosterData]);

  const totalTeams = teams.length;

  const processedData = useMemo(() => {
    // -------------------------
    // STACKS GROUPING LOGIC (The New Logic)
    // -------------------------
    if (activeTab === 'stacks') {
      const qbGroups = new Map(); // Key: QB Name -> { qb, totalDrafts: 0, nakedCount: 0, combos: Map }

      teams.forEach(roster => {
        const qbs = roster.filter(p => p.position === 'QB');
        
        qbs.forEach(qb => {
          if (!qbGroups.has(qb.name)) {
            qbGroups.set(qb.name, { qb, totalDrafts: 0, nakedCount: 0, combos: new Map() });
          }
          const group = qbGroups.get(qb.name);
          group.totalDrafts += 1;

          const teammates = roster.filter(p => 
            p.team === qb.team && 
            p.name !== qb.name && 
            ['WR', 'TE', 'RB'].includes(p.position)
          ).sort((a,b) => a.name.localeCompare(b.name));

          if (teammates.length === 0) {
            group.nakedCount += 1;
          } else {
            const comboKey = teammates.map(t => t.name).join(' | ');
            if (!group.combos.has(comboKey)) {
              group.combos.set(comboKey, { teammates, count: 0 });
            }
            group.combos.get(comboKey).count += 1;
          }
        });
      });

      let result = Array.from(qbGroups.values()).map(group => ({
        ...group,
        nakedPercent: (group.nakedCount / group.totalDrafts) * 100,
        // Sort combos within the group by frequency
        sortedCombos: Array.from(group.combos.values()).sort((a,b) => b.count - a.count)
      }));

      // Sort QB Groups by most drafted QB
      result.sort((a,b) => b.totalDrafts - a.totalDrafts);

      if (qbFilter) {
        result = result.filter(g => g.qb.name.toLowerCase().includes(qbFilter.toLowerCase()));
      }
      return result;
    }

    // -------------------------
    // QB ROOM LOGIC (HEAT MAP)
    // -------------------------
    if (activeTab === 'qbqb') {
      const pairCounts = new Map();
      const individualCounts = new Map();

      teams.forEach(roster => {
        const qbs = roster.filter(p => p.position === 'QB').sort((a,b) => a.name.localeCompare(b.name));
        
        // Track individual QB frequency for the "diagonal"
        qbs.forEach(qb => {
          individualCounts.set(qb.name, (individualCounts.get(qb.name) || 0) + 1);
        });

        // Track pairs
        if (qbs.length >= 2) {
          for (let i = 0; i < qbs.length; i++) {
            for (let j = i + 1; j < qbs.length; j++) {
              const names = [qbs[i].name, qbs[j].name].sort();
              const key = names.join('||');
              pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
            }
          }
        }
      });

      // Get unique QBs sorted alphabetically by last name
      const sortedQBs = Array.from(individualCounts.entries())
        .sort((a, b) => {
          const lastNameA = a[0].split(' ').pop();
          const lastNameB = b[0].split(' ').pop();
          return lastNameA.localeCompare(lastNameB);
        })
        .slice(0, 30) // Show more QBs in the grid
        .map(entry => entry[0]);

      return { sortedQBs, pairCounts, individualCounts };
    }

    // -------------------------
    // STARTS LOGIC (EARLY PICKS)
    // -------------------------
    const comboMap = new Map();
    teams.forEach(roster => {
      const r1 = roster.find(p => parseInt(p.round) === 1);
      const r2 = roster.find(p => parseInt(p.round) === 2);
      const r3 = roster.find(p => parseInt(p.round) === 3);
      if (r1 && r2) {
        let players = [r1, r2];
        if (includeR3 && r3) players.push(r3);
        players.sort((a, b) => parseInt(a.pick) - parseInt(b.pick));
        const key = players.map(p => p.name).join(' | ');
        if (!comboMap.has(key)) comboMap.set(key, { key, players, count: 0 });
        comboMap.get(key).count += 1;
      }
    });
    return Array.from(comboMap.values()).sort((a, b) => b.count - a.count);
  }, [teams, activeTab, includeR3, qbFilter]);

  const getPosColor = (pos) => {
    const colors = { QB: '#ef4444', RB: '#10b981', WR: '#3b82f6', TE: '#f59e0b' };
    return colors[pos] || '#9ca3af';
  };

  const Badge = ({ p }) => (
    <div style={{ 
        display: 'inline-flex', alignItems: 'center', gap: 6, 
        background: 'rgba(255,255,255,0.04)', padding: '2px 8px', 
        borderRadius: 4, border: '1px solid rgba(255,255,255,0.08)', fontSize: 12 
    }}>
      <span style={{ color: getPosColor(p.position), fontWeight: 800, fontSize: 10 }}>{p.position}</span>
      <span style={{ fontWeight: 500 }}>{p.name}</span>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        
        {/* --- Controls --- */}
        <div className="card" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', padding: '12px 20px' }}>
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: 4, borderRadius: 8 }}>
            {['starts', 'stacks', 'qbqb'].map(t => (
            <button key={t} className={`tab-button ${activeTab === t ? 'active' : ''}`} onClick={() => { setActiveTab(t); setQbFilter(''); }}>
                {t === 'starts' ? 'Early Starts' : t === 'stacks' ? 'QB Stack Groups' : 'QB Rooms'}
            </button>
            ))}
        </div>
        {activeTab === 'stacks' && (
            <input className="path-input" placeholder="Filter QB..." value={qbFilter} onChange={e => setQbFilter(e.target.value)} style={{ width: 140 }} />
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Min Count:</span>
            <input type="number" value={minCount} onChange={e => setMinCount(Number(e.target.value))} style={{ width: 50 }} />
        </div>
        </div>

        {/* --- Results --- */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {activeTab === 'stacks' ? (
            /* --- VIEW 1: STACKS TAB --- */
            <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'rgba(255,255,255,0.03)', fontSize: 12, color: 'var(--text-secondary)' }}>
                <tr>
                    <th style={{ padding: '12px 20px', textAlign: 'left', width: '220px' }}>QB / NAKED %</th>
                    <th style={{ padding: '12px 20px', textAlign: 'left' }}>STACK COMBINATIONS</th>
                    <th style={{ padding: '12px 20px', textAlign: 'center', width: '80px' }}>COUNT</th>
                    <th style={{ padding: '12px 20px', textAlign: 'center', width: '100px' }}>EXP %</th>
                </tr>
                </thead>
                <tbody>
                {processedData.map((group) => (
                    <tr key={group.qb.name} style={{ borderBottom: '1px solid var(--border)', background: 'rgba(255,255,255,0.01)' }}>
                    <td style={{ padding: '16px 20px', verticalAlign: 'top', borderRight: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <Badge p={group.qb} />
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: 10, fontWeight: 900, color: 'var(--text-muted)' }}>{group.qb.team}</span>
                            <div style={{ fontSize: 11, color: group.nakedPercent > 25 ? '#ef4444' : '#10b981', fontWeight: 700 }}>
                            {group.nakedPercent.toFixed(1)}% NAKED
                            </div>
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                            {group.totalDrafts} Total Drafts
                        </div>
                        </div>
                    </td>
                    <td colSpan={3} style={{ padding: 0 }}>
                        {group.sortedCombos.filter(c => c.count >= minCount).map((combo, idx) => (
                        <div key={idx} style={{ display: 'flex', alignItems: 'center', padding: '12px 20px', borderBottom: idx === group.sortedCombos.length - 1 ? 'none' : '1px solid rgba(255,255,255,0.03)' }}>
                            <div style={{ flex: 1, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {combo.teammates.map((t, i) => <Badge key={i} p={t} />)}
                            </div>
                            <div style={{ width: 80, textAlign: 'center', fontWeight: 600 }}>{combo.count}</div>
                            <div style={{ width: 100, textAlign: 'center', fontFamily: 'monospace', fontSize: 13, color: 'var(--text-secondary)' }}>
                            {((combo.count / totalTeams) * 100).toFixed(1)}%
                            </div>
                        </div>
                        ))}
                        {group.sortedCombos.filter(c => c.count >= minCount).length === 0 && (
                        <div style={{ padding: '12px 20px', fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>No stacks meeting min count</div>
                        )}
                    </td>
                    </tr>
                ))}
                </tbody>
            </table>
            </div>
        ) : activeTab === 'qbqb' ? (
            /* --- VIEW 2: HEAT MAP (QB ROOMS) --- */
            <div style={{ padding: '40px 20px', overflowX: 'auto', background: 'rgba(0,0,0,0.1)' }}>
            {selectedQB && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <button 
                  onClick={() => setSelectedQB(null)}
                  style={{ 
                    padding: '6px 12px', 
                    background: 'rgba(59, 130, 246, 0.2)', 
                    border: '1px solid #3b82f6', 
                    borderRadius: 6, 
                    color: '#3b82f6', 
                    cursor: 'pointer',
                    fontSize: 12,
                    fontWeight: 600
                  }}>
                  ← Back to Full Grid
                </button>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Showing: {selectedQB}
                </span>
              </div>
            )}
            <table style={{ borderCollapse: 'separate', borderSpacing: '2px', width: 'auto' }}>
                <thead>
                <tr>
                    <th style={{ background: 'transparent' }}></th>
                    {processedData.sortedQBs.map(name => (
                    <th 
                      key={name} 
                      onMouseEnter={() => setHoveredQB(name)}
                      onMouseLeave={() => setHoveredQB(null)}
                      onClick={() => setSelectedQB(selectedQB === name ? null : name)}
                      style={{ 
                        padding: '8px', 
                        fontSize: 10, 
                        fontWeight: 700, 
                        minWidth: 45, 
                        transform: 'rotate(-45deg)', 
                        height: 80, 
                        textAlign: 'left', 
                        verticalAlign: 'bottom', 
                        color: hoveredQB === name || hoveredCell?.includes(name) || selectedQB === name ? '#3b82f6' : 'var(--text-secondary)',
                        cursor: 'pointer',
                        transition: 'color 0.2s'
                      }}>
                        {name.split(' ').pop()}
                    </th>
                    ))}
                </tr>
                </thead>
                <tbody>
                {processedData.sortedQBs.filter(qb => !selectedQB || qb === selectedQB).map((rowName) => (
                    <tr key={rowName}>
                    <td 
                      onMouseEnter={() => setHoveredQB(rowName)}
                      onMouseLeave={() => setHoveredQB(null)}
                      onClick={() => setSelectedQB(selectedQB === rowName ? null : rowName)}
                      style={{ 
                        padding: '4px 12px', 
                        fontSize: 11, 
                        fontWeight: 700, 
                        textAlign: 'right', 
                        borderRight: '1px solid var(--border)', 
                        whiteSpace: 'nowrap', 
                        color: hoveredQB === rowName || hoveredCell?.includes(rowName) || selectedQB === rowName ? '#3b82f6' : 'var(--text-primary)',
                        cursor: 'pointer',
                        transition: 'color 0.2s'
                      }}>
                        {rowName}
                    </td>
                    {processedData.sortedQBs.map((colName) => {
                        const isDiagonal = rowName === colName;
                        const names = [rowName, colName].sort();
                        const key = names.join('||');
                        const count = isDiagonal ? processedData.individualCounts.get(rowName) : (processedData.pairCounts.get(key) || 0);
                        const maxVal = isDiagonal ? totalTeams : (Math.max(...Array.from(processedData.pairCounts.values())) || 1);
                        const intensity = count / maxVal;
                        const isHighlighted = hoveredQB === rowName || hoveredQB === colName;
                        const isCellHovered = hoveredCell === `${rowName}||${colName}`;
                        
                        return (
                        <td 
                          key={colName} 
                          title={`${rowName} + ${colName}: ${count}`}
                          onMouseEnter={() => setHoveredCell(`${rowName}||${colName}`)}
                          onMouseLeave={() => setHoveredCell(null)}
                          style={{
                            width: 35, height: 35, textAlign: 'center', fontSize: 11, fontWeight: 700, borderRadius: 2,
                            background: isDiagonal ? 'rgba(255,255,255,0.03)' : count > 0 ? `rgba(59, 130, 246, ${0.1 + intensity * 0.9})` : 'rgba(255,255,255,0.01)',
                            color: count > 0 ? '#fff' : 'transparent',
                            border: isDiagonal ? '1px dashed rgba(255,255,255,0.1)' : (isHighlighted || isCellHovered) && count > 0 ? '2px solid #3b82f6' : 'none',
                            outline: (isHighlighted || isCellHovered) && count > 0 ? '1px solid rgba(59, 130, 246, 0.5)' : 'none',
                            outlineOffset: '1px',
                            transition: 'all 0.2s',
                            boxShadow: (isHighlighted || isCellHovered) && count > 0 ? '0 0 8px rgba(59, 130, 246, 0.4)' : 'none',
                            cursor: count > 0 ? 'pointer' : 'default'
                        }}>
                            {count > 0 ? count : ''}
                        </td>
                        );
                    })}
                    </tr>
                ))}
                </tbody>
            </table>
            </div>
        ) : (
            /* --- VIEW 3: FLAT TABLE (EARLY STARTS) --- */
            <div style={{ maxHeight: '65vh', overflowY: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: 'rgba(255,255,255,0.03)', fontSize: 12 }}>
                <tr>
                    <th style={{ padding: '12px 20px', textAlign: 'left' }}>COMBO</th>
                    <th style={{ padding: '12px 20px', textAlign: 'center', width: 100 }}>COUNT</th>
                    <th style={{ padding: '12px 20px', textAlign: 'center', width: 100 }}>EXP %</th>
                </tr>
                </thead>
                <tbody>
                {processedData.filter(c => c.count >= minCount).map((combo) => (
                    <tr key={combo.key} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '12px 20px' }}>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            {combo.players.map((p, i) => (
                            <React.Fragment key={i}>
                                <Badge p={p} />
                                {i < combo.players.length - 1 && <span style={{ color: '#4b5563' }}>+</span>}
                            </React.Fragment>
                            ))}
                        </div>
                    </td>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{combo.count}</td>
                    <td style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>
                        {((combo.count / totalTeams) * 100).toFixed(1)}%
                    </td>
                    </tr>
                ))}
                </tbody>
            </table>
            </div>
        )}
        </div>
    </div>
    );
}