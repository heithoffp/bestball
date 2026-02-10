import React, { useMemo, useState } from 'react';
import { PROTOCOL_TREE, ARCHETYPE_METADATA, classifyRosterPath } from '../utils/rosterArchetypes';

// --- Shared Utilities ---
const COLORS = {
  QB: '#bf44ef',
  RB: '#10b981',
  WR: '#f59e0b',
  TE: '#3b82f6',
  default: '#6b7280'
};

const getPosColor = (pos) => COLORS[pos] || COLORS.default;

export default function DraftFlowAnalysis({ rosterData }) {
  const [selectedR1, setSelectedR1] = useState(null);
  const [selectedR2, setSelectedR2] = useState(null);

  // Process Data into a Tree Structure (R1 -> R2 -> R3)
  const { r1Data, r2Data, r3Data, tree, teamsMap } = useMemo(() => {
    // 1. Group by Team
    const tMap = new Map();
    rosterData.forEach(p => {
      const id = p.entry_id || 'unknown';
      if (!tMap.has(id)) tMap.set(id, []);
      tMap.get(id).push(p);
    });

    const teams = Array.from(tMap.values());
    const totalCount = teams.length;
    const treeData = {};

    // 2. Build Tree and track Entry IDs at each node
    teams.forEach(roster => {
      const p1 = roster.find(p => parseInt(p.round) === 1);
      const p2 = roster.find(p => parseInt(p.round) === 2);
      const p3 = roster.find(p => parseInt(p.round) === 3);
      const entryId = roster[0]?.entry_id || 'unknown';

      if (!p1) return;

      // Level 1
      if (!treeData[p1.name]) treeData[p1.name] = { player: p1, count: 0, r2s: {} };
      treeData[p1.name].count++;

      // Level 2
      if (p2) {
        if (!treeData[p1.name].r2s[p2.name]) {
          treeData[p1.name].r2s[p2.name] = { player: p2, count: 0, r3s: {} };
        }
        treeData[p1.name].r2s[p2.name].count++;

        // Level 3
        if (p3) {
          if (!treeData[p1.name].r2s[p2.name].r3s[p3.name]) {
            treeData[p1.name].r2s[p2.name].r3s[p3.name] = { player: p3, count: 0, entryIds: [] };
          }
          treeData[p1.name].r2s[p2.name].r3s[p3.name].count++;
          treeData[p1.name].r2s[p2.name].r3s[p3.name].entryIds.push(entryId);
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
          entryIds: item.entryIds || [],
          percent: (item.count / (parentCount || totalCount)) * 100
        }));

    // Column 1: Always all R1s
    const r1List = flatten(treeData, null);

    // Column 2: R2s connected to selected R1
    let r2List = [];
    if (selectedR1 && treeData[selectedR1]) {
      r2List = flatten(treeData[selectedR1].r2s, treeData[selectedR1].count);
    }

    // Column 3: R3s connected to selected R1 + R2
    let r3List = [];
    if (selectedR1 && selectedR2 && treeData[selectedR1]?.r2s[selectedR2]) {
      r3List = flatten(treeData[selectedR1].r2s[selectedR2].r3s, treeData[selectedR1].r2s[selectedR2].count);
    }

    return { r1Data: r1List, r2Data: r2List, r3Data: r3List, tree: treeData, teamsMap: tMap };
  }, [rosterData, selectedR1, selectedR2]);

  // Calculate Hierarchical Path Breakdown for ALL R3 players
  const r3WithPaths = useMemo(() => {
    if (!selectedR1 || !selectedR2 || !r3Data.length) return [];

    return r3Data.map(r3Player => {
      const node = tree[selectedR1]?.r2s[selectedR2]?.r3s[r3Player.name];
      if (!node || !node.entryIds) return { ...r3Player, paths: [] };

      // Count each unique path (RB → QB → TE)
      const pathCounts = {};
      node.entryIds.forEach(id => {
        const fullRoster = teamsMap.get(id);
        const path = classifyRosterPath(fullRoster);
        const pathKey = `${path.rb}|${path.qb}|${path.te}`;
        
        if (!pathCounts[pathKey]) {
          pathCounts[pathKey] = {
            rb: path.rb,
            qb: path.qb,
            te: path.te,
            count: 0
          };
        }
        pathCounts[pathKey].count++;
      });

      // Convert to sorted array with metadata
      const paths = Object.values(pathCounts)
        .map(pathData => ({
          rb: {
            key: pathData.rb,
            ...ARCHETYPE_METADATA[pathData.rb],
            color: PROTOCOL_TREE[pathData.rb]?.color || '#888'
          },
          qb: {
            key: pathData.qb,
            ...ARCHETYPE_METADATA[pathData.qb]
          },
          te: {
            key: pathData.te,
            ...ARCHETYPE_METADATA[pathData.te]
          },
          count: pathData.count,
          percent: (pathData.count / node.entryIds.length) * 100
        }))
        .sort((a, b) => b.count - a.count);

      return { ...r3Player, paths };
    });
  }, [selectedR1, selectedR2, r3Data, tree, teamsMap]);

  // Row Renderer
  const PlayerRow = ({ player, count, percent, isActive, onClick }) => {
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
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

        {/* Column 3: Round 3 (Preview only) */}
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
                  isActive={false}
                />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Hierarchical Path Breakdown Section */}
      {selectedR2 && r3WithPaths.length > 0 && (
        <div style={{ padding: '20px', background: 'rgba(255,255,255,0.05)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)' }}>
          <h3 style={{ fontSize: 14, marginBottom: 15, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#aaa' }}>
            Strategy Paths for {selectedR1} → {selectedR2}
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {r3WithPaths.map(r3Player => (
              <div key={r3Player.name} style={{ 
                borderLeft: `4px solid ${getPosColor(r3Player.position)}`, 
                background: 'rgba(0,0,0,0.2)', 
                padding: '12px' 
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <div>
                    <span style={{ fontWeight: 700, fontSize: 13 }}>{r3Player.name}</span>
                    <span style={{ fontSize: 11, color: '#888', marginLeft: 8 }}>({r3Player.count} teams)</span>
                  </div>
                </div>
                
                {r3Player.paths.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {r3Player.paths.map((path, idx) => (
                      <div key={idx} style={{ 
                        background: 'rgba(0,0,0,0.3)', 
                        padding: '10px 12px', 
                        borderRadius: 6,
                        borderLeft: `3px solid ${path.rb.color}`
                      }}>
                        {/* Path Header */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ 
                              fontSize: 11, 
                              fontWeight: 700,
                              color: path.rb.color,
                              textTransform: 'uppercase',
                              letterSpacing: '0.05em'
                            }}>
                              {path.rb.name}
                            </span>
                            <span style={{ color: '#666', fontSize: 10 }}>→</span>
                            <span style={{ fontSize: 10, color: '#aaa' }}>{path.qb.name}</span>
                            <span style={{ color: '#666', fontSize: 10 }}>→</span>
                            <span style={{ fontSize: 10, color: '#aaa' }}>{path.te.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ fontSize: 12, fontWeight: 700 }}>{path.count}</span>
                            <span style={{ fontSize: 10, color: '#888' }}>({Math.round(path.percent)}%)</span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 2 }}>
                          <div style={{ 
                            height: '100%', 
                            width: `${path.percent}%`, 
                            background: `linear-gradient(90deg, ${path.rb.color}, ${path.rb.color}aa)`,
                            borderRadius: 2,
                            transition: 'width 0.3s ease'
                          }} />
                        </div>

                        {/* Path Description */}
                        <div style={{ 
                          fontSize: 10, 
                          color: '#777', 
                          marginTop: 6,
                          fontStyle: 'italic'
                        }}>
                          {path.rb.desc} • {path.qb.desc} • {path.te.desc}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ fontSize: 11, color: '#666', fontStyle: 'italic' }}>No strategy data</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}