import React, { useMemo, useState } from 'react';

// --- Shared Utilities ---
const COLORS = {
  QB: '#ef4444',
  RB: '#10b981',
  WR: '#3b82f6',
  TE: '#f59e0b',
  default: '#6b7280'
};

const getPosColor = (pos) => COLORS[pos] || COLORS.default;

// --- NEW COMPONENT: Draft Flow (Miller Columns) ---
function DraftFlowAnalysis({ rosterData }) {
  const [selectedR1, setSelectedR1] = useState(null);
  const [selectedR2, setSelectedR2] = useState(null);

  // Process Data into a Tree Structure (R1 -> R2 -> R3)
  const { r1Data, r2Data, r3Data } = useMemo(() => {
    // 1. Group by Team
    const teamsMap = new Map();
    rosterData.forEach(p => {
      const id = p.entry_id || 'unknown';
      if (!teamsMap.has(id)) teamsMap.set(id, []);
      teamsMap.get(id).push(p);
    });

    const teams = Array.from(teamsMap.values());
    const totalCount = teams.length;
    const tree = {};

    // 2. Build Tree
    teams.forEach(roster => {
      const p1 = roster.find(p => parseInt(p.round) === 1);
      const p2 = roster.find(p => parseInt(p.round) === 2);
      const p3 = roster.find(p => parseInt(p.round) === 3);

      if (!p1) return;

      // Level 1
      if (!tree[p1.name]) tree[p1.name] = { player: p1, count: 0, r2s: {} };
      tree[p1.name].count++;

      // Level 2
      if (p2) {
        if (!tree[p1.name].r2s[p2.name]) {
          tree[p1.name].r2s[p2.name] = { player: p2, count: 0, r3s: {} };
        }
        tree[p1.name].r2s[p2.name].count++;

        // Level 3
        if (p3) {
          if (!tree[p1.name].r2s[p2.name].r3s[p3.name]) {
            tree[p1.name].r2s[p2.name].r3s[p3.name] = { player: p3, count: 0 };
          }
          tree[p1.name].r2s[p2.name].r3s[p3.name].count++;
        }
      }
    });

    // 3. Flatten for Columns based on selection
    const flatten = (obj, parentCount) =>
      Object.values(obj)
        .sort((a, b) => b.count - a.count)
        .map(item => ({
          ...item.player,
          count: item.count,
          // If parentCount is null, it's R1 (share of total drafts). 
          // Otherwise it's Conditional Probability (share of previous pick).
          percent: (item.count / (parentCount || totalCount)) * 100
        }));

    // Column 1: Always all R1s
    const r1List = flatten(tree, null);

    // Column 2: R2s connected to selected R1
    let r2List = [];
    if (selectedR1 && tree[selectedR1]) {
      r2List = flatten(tree[selectedR1].r2s, tree[selectedR1].count);
    }

    // Column 3: R3s connected to selected R1 + R2
    let r3List = [];
    if (selectedR1 && selectedR2 && tree[selectedR1]?.r2s[selectedR2]) {
      r3List = flatten(tree[selectedR1].r2s[selectedR2].r3s, tree[selectedR1].r2s[selectedR2].count);
    }

    return { r1Data: r1List, r2Data: r2List, r3Data: r3List };
  }, [rosterData, selectedR1, selectedR2]);

  // Row Renderer
  const PlayerRow = ({ player, count, percent, isActive, onClick, isLeaf }) => {
    const color = getPosColor(player.position);
    return (
      <div
        onClick={onClick}
        style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 12px',
          cursor: onClick ? 'pointer' : 'default',
          backgroundColor: isActive ? 'rgba(255,255,255,0.08)' : 'transparent',
          borderLeft: isActive ? `3px solid ${color}` : '3px solid transparent',
          borderBottom: '1px solid rgba(255,255,255,0.03)',
          transition: 'background 0.2s'
        }}
      >
        {/* Background Exposure Bar */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${percent}%`, backgroundColor: color, opacity: 0.15,
          pointerEvents: 'none', transition: 'width 0.3s ease'
        }} />

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, zIndex: 1, flex: 1 }}>
          <span style={{
            fontSize: 10, fontWeight: 800, color: color,
            background: 'rgba(0,0,0,0.3)', padding: '2px 4px', borderRadius: 4, minWidth: 24, textAlign: 'center'
          }}>
            {player.position}
          </span>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: isActive ? 700 : 500, fontSize: 13 }}>{player.name}</span>
            <span style={{ fontSize: 10, color: 'var(--text-secondary, #888)' }}>{player.team}</span>
          </div>
        </div>

        <div style={{ textAlign: 'right', zIndex: 1, minWidth: 40 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{count}</div>
          <div style={{ fontSize: 10, color: 'var(--text-secondary, #888)' }}>{Math.round(percent)}%</div>
        </div>
      </div>
    );
  };

  const Header = ({ title }) => (
    <div style={{
      padding: '12px', borderBottom: '1px solid rgba(255,255,255,0.1)',
      background: 'rgba(0,0,0,0.2)', fontSize: 11, fontWeight: 700,
      letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--text-secondary, #aaa)'
    }}>
      {title}
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '600px', background: 'rgba(0,0,0,0.2)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', overflow: 'hidden' }}>
      {/* Column 1: Round 1 */}
      <div style={{ flex: 1, borderRight: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <Header title="Round 1 Pick" />
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {r1Data.map(p => (
            <PlayerRow
              key={p.name}
              player={p}
              count={p.count}
              percent={p.percent}
              isActive={selectedR1 === p.name}
              onClick={() => { setSelectedR1(p.name); setSelectedR2(null); }}
            />
          ))}
        </div>
      </div>

      {/* Column 2: Round 2 */}
      <div style={{ flex: 1, borderRight: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', minWidth: 0, background: selectedR1 ? 'transparent' : 'rgba(0,0,0,0.1)' }}>
        <Header title={selectedR1 ? `Round 2 (w/ ${selectedR1.split(' ').pop()})` : "Round 2"} />
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {!selectedR1 ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: '#666', fontStyle: 'italic' }}>Select a Round 1 player</div>
          ) : r2Data.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: '#666' }}>No pairs found</div>
          ) : (
            r2Data.map(p => (
              <PlayerRow
                key={p.name}
                player={p}
                count={p.count}
                percent={p.percent}
                isActive={selectedR2 === p.name}
                onClick={() => setSelectedR2(p.name)}
              />
            ))
          )}
        </div>
      </div>

      {/* Column 3: Round 3 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: selectedR2 ? 'transparent' : 'rgba(0,0,0,0.1)' }}>
        <Header title="Round 3 Extension" />
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {!selectedR2 ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: '#666', fontStyle: 'italic' }}>Select Round 2 to see extensions</div>
          ) : r3Data.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', fontSize: 13, color: '#666' }}>No Round 3 data</div>
          ) : (
            r3Data.map(p => (
              <PlayerRow
                key={p.name}
                player={p}
                count={p.count}
                percent={p.percent}
                isLeaf={true}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}


// --- MAIN COMPONENT ---
export default function ComboAnalysis({ rosterData = [] }) {
  const [activeTab, setActiveTab] = useState('flow'); // Default to new view
  const [onlyWithR3, setOnlyWithR3] = useState(false);
  const [minCount, setMinCount] = useState(1);
  const [topN, setTopN] = useState(30);
  const [qbFilter, setQbFilter] = useState('');
  const [startSearch, setStartSearch] = useState('');
  const [hoveredQB, setHoveredQB] = useState(null);
  const [hoveredCell, setHoveredCell] = useState(null);
  const [selectedQB, setSelectedQB] = useState(null);
  const [expandedCombo, setExpandedCombo] = useState(new Set());

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

  // EXISTING DATA PROCESSING (Preserved)
  const processedData = useMemo(() => {
    if (activeTab === 'stacks') {
      const qbGroups = new Map();
      teams.forEach(roster => {
        const qbs = roster.filter(p => p.position === 'QB');
        qbs.forEach(qb => {
          if (!qbGroups.has(qb.name)) {
            qbGroups.set(qb.name, { qb, totalDrafts: 0, nakedCount: 0, combos: new Map() });
          }
          const group = qbGroups.get(qb.name);
          group.totalDrafts += 1;
          const teammates = roster.filter(p =>
            p.team === qb.team && p.name !== qb.name && ['WR', 'TE', 'RB'].includes(p.position)
          ).sort((a, b) => a.name.localeCompare(b.name));

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
        sortedCombos: Array.from(group.combos.values()).sort((a, b) => b.count - a.count)
      }));
      result.sort((a, b) => b.totalDrafts - a.totalDrafts);
      if (qbFilter) {
        result = result.filter(g => g.qb.name.toLowerCase().includes(qbFilter.toLowerCase()));
      }
      return result;
    }

    if (activeTab === 'qbqb') {
      const pairCounts = new Map();
      const individualCounts = new Map();
      const adpLookup = new Map(); // Store ADP for sorting later

      teams.forEach(roster => {
        // Sort QBs by ADP (ascending) so pairs are always stored in a consistent order
        const qbs = roster
          .filter(p => p.position === 'QB')
          .sort((a, b) => (a.latestADP || 999) - (b.latestADP || 999));

        qbs.forEach(qb => {
          individualCounts.set(qb.name, (individualCounts.get(qb.name) || 0) + 1);

          // Store the ADP if we haven't yet
          if (!adpLookup.has(qb.name)) {
            adpLookup.set(qb.name, qb.latestADP || 999);
          }
        });

        if (qbs.length >= 2) {
          for (let i = 0; i < qbs.length; i++) {
            for (let j = i + 1; j < qbs.length; j++) {
              // Because qbs is already sorted by ADP, names[0] is higher ADP than names[1]
              const names = [qbs[i].name, qbs[j].name];
              const key = names.join('||');
              pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
            }
          }
        }
      });

      const sortedQBs = Array.from(individualCounts.entries())
        .sort((a, b) => {
          const adpA = adpLookup.get(a[0]);
          const adpB = adpLookup.get(b[0]);
          // Sort by ADP ascending (1, 2, 3...)
          return adpA - adpB;
        })
        .slice(0, 30)
        .map(entry => entry[0]);

      return { sortedQBs, pairCounts, individualCounts, adpLookup };
    }

    if (activeTab === 'starts') {
      const startsMap = new Map();
      teams.forEach(roster => {
        const r1 = roster.find(p => parseInt(p.round) === 1);
        const r2 = roster.find(p => parseInt(p.round) === 2);
        const r3 = roster.find(p => parseInt(p.round) === 3);
        if (r1 && r2) {
          const players2 = [r1, r2].sort((a, b) => parseInt(a.pick) - parseInt(b.pick));
          const key2 = players2.map(p => p.name).join(' | ');
          if (!startsMap.has(key2)) {
            startsMap.set(key2, {
              key: key2,
              players2,
              count: 0,
              r3Map: new Map(),
              r3Total: 0
            });
          }
          const entry = startsMap.get(key2);
          entry.count += 1;
          if (r3) {
            const name = r3.name;
            const existing = entry.r3Map.get(name);
            if (!existing) entry.r3Map.set(name, { player: r3, count: 1 });
            else existing.count += 1;
            entry.r3Total += 1;
          }
        }
      });
      let arr = Array.from(startsMap.values()).sort((a, b) => b.count - a.count);
      if (onlyWithR3) {
        arr = arr.filter(e => e.r3Total > 0);
      }
      return arr;
    }

    // Default return for 'flow' tab (handled internally by DraftFlowAnalysis)
    return [];
  }, [teams, activeTab, onlyWithR3, qbFilter]);



  const getBlendedColor = (adp1, adp2, intensity) => {
    const t1 = getTierInfo(adp1);
    const t2 = getTierInfo(adp2);

    // Average the RGB values to find the "intersection" color
    const r = Math.floor((t1.r + t2.r) / 2);
    const g = Math.floor((t1.g + t2.g) / 2);
    const b = Math.floor((t1.b + t2.b) / 2);

    // Return rgba with the intensity (count) controlling the opacity
    return `rgba(${r}, ${g}, ${b}, ${0.15 + intensity * 0.8})`;
  };

  // Update getTierInfo to return numeric RGB for math
  const getTierInfo = (adp) => {
    if (adp <= 48) return { label: 'T1', color: '#ef4444', r: 239, g: 68, b: 68 };
    if (adp <= 96) return { label: 'T2', color: '#f59e0b', r: 245, g: 158, b: 11 };
    if (adp <= 144) return { label: 'T3', color: '#10b981', r: 16, g: 185, b: 129 };
    return { label: 'T4', color: '#64748b', r: 100, g: 116, b: 139 };
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

  const toggleExpand = (key) => {
    const next = new Set(expandedCombo);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setExpandedCombo(next);
  };

  const onTabClick = (t) => {
    setActiveTab(t);
    setQbFilter('');
    setStartSearch('');
  };

  // --- RENDER ---
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Controls */}
      <div className="card" style={{ display: 'flex', gap: 20, alignItems: 'center', flexWrap: 'wrap', padding: '12px 20px' }}>
        <div style={{ display: 'flex', background: 'rgba(0,0,0,0.2)', padding: 4, borderRadius: 8 }}>
          {['flow', 'starts', 'stacks', 'qbqb'].map(t => (
            <button
              key={t}
              className={`tab-button ${activeTab === t ? 'active' : ''}`}
              onClick={() => onTabClick(t)}
            >
              {t === 'flow' ? 'Draft Flow' :
                t === 'starts' ? 'Early Starts (Grid)' :
                  t === 'stacks' ? 'QB Stack Groups' : 'QB Rooms'}
            </button>
          ))}
        </div>

        {activeTab === 'stacks' && (
          <input className="path-input" placeholder="Filter QB..." value={qbFilter} onChange={e => setQbFilter(e.target.value)} style={{ width: 140 }} />
        )}

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 12 }}>
          {activeTab === 'starts' && (
            <>
              <input
                className="path-input"
                placeholder="Quick search players..."
                value={startSearch}
                onChange={e => setStartSearch(e.target.value)}
                style={{ width: 200 }}
              />
              <button
                onClick={() => setStartSearch('')}
                title="Clear"
                style={{ padding: '6px 10px', borderRadius: 6, cursor: 'pointer' }}
              >
                Clear
              </button>
              <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Top N:</label>
              <input type="number" value={topN} onChange={e => setTopN(Math.max(1, Number(e.target.value) || 1))} style={{ width: 70 }} />
              <label style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Only with R3:</label>
              <input type="checkbox" checked={onlyWithR3} onChange={e => setOnlyWithR3(e.target.checked)} />
            </>
          )}

          {activeTab !== 'flow' && (
            <>
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Min Count:</span>
              <input type="number" value={minCount} onChange={e => setMinCount(Number(e.target.value))} style={{ width: 50 }} />
            </>
          )}
        </div>
      </div>

      {/* Results Area */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>

        {/* NEW FLOW VIEW */}
        {activeTab === 'flow' && (
          <div style={{ padding: 16 }}>
            <DraftFlowAnalysis rosterData={rosterData} />
          </div>
        )}

        {/* STACKS TABLE */}
        {activeTab === 'stacks' && (
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
        )}

 // 2. Updated Heat Map JSX
        {activeTab === 'qbqb' && (
          <div style={{ padding: '40px 20px', overflowX: 'auto', background: 'rgba(0,0,0,0.2)', borderRadius: '12px' }}>

            {/* RESTORED: Back Button Logic */}
            {selectedQB && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <button
                  onClick={() => setSelectedQB(null)}
                  style={{
                    padding: '8px 16px', background: 'rgba(59, 130, 246, 0.2)', border: '1px solid #3b82f6',
                    borderRadius: 6, color: '#3b82f6', cursor: 'pointer', fontSize: 12, fontWeight: 600
                  }}>
                  ← Back to Full Grid
                </button>
                <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Showing Pairs for: {selectedQB}
                </span>
              </div>
            )}

            <table style={{ borderCollapse: 'separate', borderSpacing: '3px', width: 'auto', margin: '0 auto' }}>
              <thead>
                <tr>
                  <th style={{ background: 'transparent' }}></th>
                  {processedData.sortedQBs.map(name => {
                    const adp = processedData.adpLookup.get(name) || 999;
                    const tier = getTierInfo(adp);
                    const isSelected = selectedQB === name;

                    return (
                      <th
                        key={name}
                        onClick={() => setSelectedQB(isSelected ? null : name)}
                        onMouseEnter={() => setHoveredQB(name)}
                        onMouseLeave={() => setHoveredQB(null)}
                        style={{ position: 'relative', height: '100px', verticalAlign: 'bottom', padding: '0', cursor: 'pointer' }}
                      >
                        <div style={{
                          position: 'absolute', bottom: '0', left: '50%', transform: 'translateX(-50%)',
                          width: '80%', height: '4px', background: tier.color, borderRadius: '2px 2px 0 0'
                        }} />
                        <div style={{
                          transform: 'rotate(-45deg) translate(10px, -5px)',
                          transformOrigin: 'bottom left',
                          whiteSpace: 'nowrap',
                          width: '30px',
                          fontSize: '11px',
                          fontWeight: '800',
                          color: isSelected || hoveredQB === name ? '#3b82f6' : 'var(--text-secondary)',
                          transition: 'all 0.2s'
                        }}>
                          {name.split(' ').pop()}
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {processedData.sortedQBs.filter(qb => !selectedQB || qb === selectedQB).map((rowName) => {
                  const rowAdp = processedData.adpLookup.get(rowName) || 999;
                  const rowTier = getTierInfo(rowAdp);
                  const isRowSelected = selectedQB === rowName;

                  return (
                    <tr key={rowName}>
                      <td
                        onClick={() => setSelectedQB(isRowSelected ? null : rowName)}
                        onMouseEnter={() => setHoveredQB(rowName)}
                        onMouseLeave={() => setHoveredQB(null)}
                        style={{
                          padding: '4px 12px', fontSize: '11px', fontWeight: '700', textAlign: 'right',
                          borderRight: `3px solid ${rowTier.color}`,
                          background: 'rgba(255,255,255,0.03)',
                          whiteSpace: 'nowrap',
                          cursor: 'pointer',
                          color: isRowSelected || hoveredQB === rowName ? '#3b82f6' : 'var(--text-primary)'
                        }}>
                        {rowName} <span style={{ opacity: 0.4, fontSize: '9px' }}>{rowAdp}</span>
                      </td>

                      {processedData.sortedQBs.map((colName) => {
                        const colAdp = processedData.adpLookup.get(colName) || 999;
                        const isDiagonal = rowName === colName;
                        const names = [rowName, colName].sort();
                        const key = names.join('||');
                        const count = isDiagonal ? processedData.individualCounts.get(rowName) : (processedData.pairCounts.get(key) || 0);
                        const maxVal = isDiagonal ? totalTeams : (Math.max(...Array.from(processedData.pairCounts.values())) || 1);
                        const intensity = count / maxVal;

                        // NEW: Using your Blended Color Logic
                        const cellBg = count > 0
                          ? getBlendedColor(rowAdp, colAdp, intensity)
                          : isDiagonal ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.1)';

                        return (
                          <td
                            key={colName}
                            onMouseEnter={() => setHoveredCell(`${rowName}||${colName}`)}
                            onMouseLeave={() => setHoveredCell(null)}
                            style={{
                              width: '38px', height: '38px', textAlign: 'center', fontSize: '12px', fontWeight: '800',
                              borderRadius: '3px',
                              background: cellBg,
                              color: count > 0 ? '#fff' : 'transparent',
                              // Highlighting logic
                              border: (hoveredQB === rowName || hoveredQB === colName || hoveredCell === `${rowName}||${colName}`) && count > 0
                                ? '1px solid #fff'
                                : 'none',
                              boxShadow: count > 0 ? 'inset 0 0 10px rgba(0,0,0,0.1)' : 'none',
                              transition: 'all 0.1s',
                              cursor: count > 0 ? 'pointer' : 'default'
                            }}>
                            {count > 0 ? count : ''}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {/* STARTS GRID (ORIGINAL) */}
        {activeTab === 'starts' && (
          <div style={{ maxHeight: '65vh', overflowY: 'auto', padding: 16 }}>
            {(() => {
              const search = startSearch.trim().toLowerCase();
              const tokens = search ? search.split(/\s+/).filter(Boolean) : [];
              const matchesSearch = (entry) => {
                if (!tokens.length) return true;
                const hay = [
                  entry.players2.map(p => p.name).join(' | '),
                  ...Array.from(entry.r3Map.keys()).join(' | ')
                ].join(' | ').toLowerCase();
                return tokens.every(t => hay.includes(t));
              };

              const filtered = processedData
                .filter(c => c.count >= minCount)
                .filter(matchesSearch);

              const maxCount = Math.max(...filtered.map(f => f.count), 1);
              const top = filtered.slice(0, topN);

              if (top.length === 0) {
                return <div style={{ padding: 20, color: 'var(--text-muted)' }}>No early combos match the filters.</div>;
              }

              return (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
                  {top.map(entry => {
                    const pct = ((entry.count / totalTeams) * 100).toFixed(1);
                    const barPct = Math.max(6, (entry.count / maxCount) * 100);
                    const isExpanded = expandedCombo.has(entry.key);

                    return (
                      <div key={entry.key} style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border)', borderRadius: 8, padding: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ flex: 1 }}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                              {entry.players2.map((p, i) => <Badge key={i} p={p} />)}
                            </div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                              <div style={{ fontSize: 13, fontWeight: 800 }}>{entry.count} teams</div>
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{pct}%</div>
                            </div>
                            <div style={{ height: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginTop: 8 }}>
                              <div style={{ height: '100%', width: `${barPct}%`, background: 'linear-gradient(90deg,#3b82f6,#60a5fa)', borderRadius: 6 }} />
                            </div>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                            <button
                              onClick={() => toggleExpand(entry.key)}
                              style={{
                                padding: '6px 10px', borderRadius: 6, cursor: 'pointer', fontWeight: 700,
                                background: isExpanded ? 'rgba(59,130,246,0.18)' : 'transparent',
                                border: `1px solid ${isExpanded ? '#3b82f6' : 'rgba(255,255,255,0.06)'}`,
                                color: isExpanded ? '#3b82f6' : 'var(--text-primary)',
                              }}>
                              {isExpanded ? 'Collapse' : 'Expand'}
                            </button>
                            {entry.r3Total > 0 ? (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{entry.r3Total} R3 picks</div>
                            ) : (
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>No R3</div>
                            )}
                          </div>
                        </div>

                        {isExpanded && (
                          <div style={{ marginTop: 12, borderTop: '1px dashed rgba(255,255,255,0.03)', paddingTop: 12 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                              <div style={{ fontSize: 13, fontWeight: 700 }}>Round 3 breakdown</div>
                              <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{entry.r3Map.size} unique</div>
                            </div>
                            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                              {Array.from(entry.r3Map.values()).sort((a, b) => b.count - a.count).map((r3Entry, i) => {
                                const name = r3Entry.player.name;
                                const c = r3Entry.count;
                                const pctOfPair = ((c / entry.count) * 100).toFixed(1);
                                const playerObj = r3Entry.player;
                                return (
                                  <div key={name + i} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 130, background: 'rgba(255,255,255,0.01)', padding: 8, borderRadius: 8, border: '1px solid rgba(255,255,255,0.03)' }}>
                                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                                      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flex: 1 }}>
                                        <span style={{ fontSize: 12, fontWeight: 700 }}>{name}</span>
                                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{playerObj.team || ''}</span>
                                      </div>
                                      <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontWeight: 800 }}>{c}</div>
                                        <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{pctOfPair}%</div>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}