import React, { useMemo, useState } from 'react';

/**
 * ComboAnalysis Component
 * Analyzes roster structure:
 * 1. Early Round Starts (R1+R2, R1+R2+R3)
 * 2. QB Stacks (QB + Teammate)
 * 3. QB Rooms (QB + QB)
 */
export default function ComboAnalysis({ rosterData = [] }) {
  const [activeTab, setActiveTab] = useState('starts'); // 'starts' | 'stacks' | 'qbqb'
  const [includeR3, setIncludeR3] = useState(false);
  const [minCount, setMinCount] = useState(1);

  // 1. Group flat roster rows into "Teams" (Arrays of players)
  const teams = useMemo(() => {
    const map = new Map();
    rosterData.forEach(p => {
      // Normalize entry id
      const id = p.entry_id || p.draft_id || 'unknown';
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(p);
    });
    return Array.from(map.values());
  }, [rosterData]);

  const totalTeams = teams.length;

  // 2. Process Data based on Active Tab
  const processedCombos = useMemo(() => {
    const comboMap = new Map();

    teams.forEach(roster => {
      // -------------------------
      // A) EARLY STARTS (R1-R2 / R1-R2-R3)
      // -------------------------
      if (activeTab === 'starts') {
        // Find R1, R2, (R3) players
        const r1 = roster.find(p => parseInt(p.round) === 1);
        const r2 = roster.find(p => parseInt(p.round) === 2);
        const r3 = roster.find(p => parseInt(p.round) === 3);

        if (r1 && r2) {
          let players = [r1, r2];
          if (includeR3 && r3) players.push(r3);
          
          // Sort by pick order to keep combo key consistent
          players.sort((a, b) => parseInt(a.pick) - parseInt(b.pick));
          
          const key = players.map(p => p.name).join(' | ');
          
          if (!comboMap.has(key)) {
            comboMap.set(key, {
              key,
              players,
              count: 0,
              type: 'start'
            });
          }
          comboMap.get(key).count += 1;
        }
      }

      // -------------------------
      // B) QB STACKS (QB + Same Team Skill)
      // -------------------------
      if (activeTab === 'stacks') {
        const qbs = roster.filter(p => p.position?.trim().toUpperCase() === 'QB');
        
        qbs.forEach(qb => {
            const qbTeam = qb.team?.trim().toUpperCase();
            
            // Find teammates on this specific roster
            const stacks = roster.filter(p => {
            const pTeam = p.team?.trim().toUpperCase();
            const pPos = p.position?.trim().toUpperCase();
            
            return (
                pTeam === qbTeam &&            // Same team
                p.name !== qb.name &&          // Not the same player
                ['WR', 'TE', 'RB'].includes(pPos) // Is a skill player
            );
            });

            stacks.forEach(skill => {
            // Create a unique key for this specific pair
            const key = `${qb.name} + ${skill.name}`;
            if (!comboMap.has(key)) {
                comboMap.set(key, {
                key,
                players: [qb, skill],
                count: 0,
                type: 'stack'
                });
            }
            comboMap.get(key).count += 1;
            });
        });
        }
      // -------------------------
      // C) QB ROOMS (QB + QB)
      // -------------------------
      if (activeTab === 'qbqb') {
        const qbs = roster.filter(p => p.position === 'QB');
        // Get all unique pairs of QBs
        if (qbs.length >= 2) {
            // Sort by name to avoid duplicates like "Allen+Tua" vs "Tua+Allen"
            qbs.sort((a,b) => a.name.localeCompare(b.name));
            
            // Generate pairs
            for (let i = 0; i < qbs.length; i++) {
                for (let j = i + 1; j < qbs.length; j++) {
                    const p1 = qbs[i];
                    const p2 = qbs[j];
                    const key = `${p1.name} + ${p2.name}`;
                    
                    if (!comboMap.has(key)) {
                        comboMap.set(key, {
                            key,
                            players: [p1, p2],
                            count: 0,
                            type: 'qbqb'
                        });
                    }
                    comboMap.get(key).count += 1;
                }
            }
        }
      }
    });

    // Convert to array and sort by count desc
    return Array.from(comboMap.values())
        .sort((a, b) => b.count - a.count);

  }, [teams, activeTab, includeR3]);


  // Helper to color code positions
  const getPosColor = (pos) => {
    switch (pos) {
      case 'QB': return '#ef4444';
      case 'RB': return '#10b981';
      case 'WR': return '#3b82f6';
      case 'TE': return '#f59e0b';
      default: return '#9ca3af';
    }
  };

  const Badge = ({ p }) => (
    <span style={{ 
        display: 'inline-flex', 
        alignItems: 'center', 
        gap: 4, 
        background: 'rgba(255,255,255,0.05)', 
        padding: '2px 8px', 
        borderRadius: 4, 
        fontSize: 13,
        border: '1px solid rgba(255,255,255,0.1)'
    }}>
        <span style={{ color: getPosColor(p.position), fontWeight: 700, fontSize: 11 }}>{p.position}</span>
        <span>{p.name}</span>
        {p.team && p.team !== 'N/A' && <span style={{ fontSize: 10, color: '#6b7280', marginLeft: 2 }}>({p.team})</span>}
    </span>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        
        {/* --- Controls --- */}
        <div className="card" style={{ display: 'flex', gap: 24, alignItems: 'center', padding: '12px 20px' }}>
            <div style={{ display: 'flex', gap: 8 }}>
                <button 
                    className={`tab-button ${activeTab === 'starts' ? 'active' : ''}`} 
                    onClick={() => setActiveTab('starts')}
                >
                    Early Starts (R1-R2)
                </button>
                <button 
                    className={`tab-button ${activeTab === 'stacks' ? 'active' : ''}`} 
                    onClick={() => setActiveTab('stacks')}
                >
                    QB Stacks
                </button>
                <button 
                    className={`tab-button ${activeTab === 'qbqb' ? 'active' : ''}`} 
                    onClick={() => setActiveTab('qbqb')}
                >
                    QB Rooms
                </button>
            </div>

            <div style={{ width: 1, height: 24, background: 'var(--border)' }} />

            {activeTab === 'starts' && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 14 }}>
                    <input 
                        type="checkbox" 
                        checked={includeR3} 
                        onChange={e => setIncludeR3(e.target.checked)} 
                    />
                    Include Round 3
                </label>
            )}

            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Min Count:</span>
                <input 
                    type="number" 
                    value={minCount} 
                    onChange={e => setMinCount(Number(e.target.value))}
                    style={{ width: 60, padding: 4 }}
                    min="1"
                />
            </div>
        </div>

        {/* --- Results --- */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div className="table-container" style={{ maxHeight: '600px', overflowY: 'auto' }}>
                <table className="exposure-fixed-table">
                    <thead>
                        <tr>
                            <th style={{ textAlign: 'left', paddingLeft: 20 }}>Combo Composition</th>
                            <th style={{ width: 100, textAlign: 'center' }}>Count</th>
                            <th style={{ width: 100, textAlign: 'center' }}>Exposure</th>
                        </tr>
                    </thead>
                    <tbody>
                        {processedCombos.length === 0 && (
                            <tr><td colSpan={3} style={{ padding: 20, textAlign: 'center' }}>No combos found.</td></tr>
                        )}
                        {processedCombos
                            .filter(c => c.count >= minCount)
                            .map((combo) => (
                            <tr key={combo.key}>
                                <td style={{ paddingLeft: 20 }}>
                                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                        {combo.players.map((p, i) => (
                                            <React.Fragment key={i}>
                                                <Badge p={p} />
                                                {i < combo.players.length - 1 && <span style={{ color: '#6b7280', alignSelf:'center' }}>+</span>}
                                            </React.Fragment>
                                        ))}
                                    </div>
                                </td>
                                <td style={{ textAlign: 'center', fontWeight: 600 }}>
                                    {combo.count}
                                </td>
                                <td style={{ textAlign: 'center', fontFamily: 'monospace' }}>
                                    {((combo.count / totalTeams) * 100).toFixed(1)}%
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>

        <div style={{ textAlign: 'right', fontSize: 12, color: 'var(--text-muted)' }}>
            Based on {totalTeams} total entries loaded.
        </div>
    </div>
  );
}