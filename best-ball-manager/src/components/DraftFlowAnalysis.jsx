import React, { useMemo, useState } from 'react';
import { Target, Zap, Users, Activity, GitBranch } from 'lucide-react';
import { PROTOCOL_TREE, ARCHETYPE_METADATA, classifyRosterPath } from '../utils/rosterArchetypes';

// --- SHARED CONSTANTS ---
const COLORS = {
  QB: '#bf44ef', RB: '#10b981', WR: '#f59e0b', TE: '#3b82f6', default: '#6b7280'
};

const getPosColor = (pos) => COLORS[pos] || COLORS.default;

export default function DraftFlowAnalysis({ rosterData, draftSlot = 1 }) {
  const [currentPicks, setCurrentPicks] = useState([]);
  
  // --- 0. DATA TRANSFORMATION (The Fix) ---
  // Convert flat list of picks into Array of Arrays (grouped by entry_id)
  const allRosters = useMemo(() => {
    // If it's already an array of arrays, return as is
    if (rosterData.length > 0 && Array.isArray(rosterData[0])) return rosterData;

    const tMap = new Map();
    rosterData.forEach(p => {
      const id = p.entry_id || p.entryId || 'unknown';
      if (!tMap.has(id)) tMap.set(id, []);
      tMap.get(id).push(p);
    });
    return Array.from(tMap.values());
  }, [rosterData]);

  // --- 1. Current Context ---
  const currentRound = currentPicks.length + 1;

  // --- 2. Filter Matching Rosters ---
  // Now we filter 'allRosters' (arrays), not 'rosterData' (picks)
  const matchingRosters = useMemo(() => {
    if (currentPicks.length === 0) return allRosters;

    return allRosters.filter(roster => {
      // Check if roster contains every player currently selected in the correct round
      return currentPicks.every(pick => 
        roster.some(p => p.name === pick.name && parseInt(p.round) === pick.round)
      );
    });
  }, [allRosters, currentPicks]);

  // --- 3. Strategy Projection ---
  const strategyProjection = useMemo(() => {
    const counts = {};
    let totalMatches = 0;

    matchingRosters.forEach(roster => {
      const path = classifyRosterPath(roster); // Now 'roster' is an array, so .filter works!
      const stratKey = path.rb;
      
      if (!counts[stratKey]) counts[stratKey] = 0;
      counts[stratKey]++;
      totalMatches++;
    });

    return Object.entries(counts)
      .map(([key, count]) => ({
        key,
        name: ARCHETYPE_METADATA[key]?.name || key,
        count,
        percent: totalMatches > 0 ? (count / totalMatches) * 100 : 0,
        meta: PROTOCOL_TREE[key] || {}
      }))
      .sort((a, b) => b.count - a.count);
  }, [matchingRosters]);

  // --- 4. Portfolio Health ---
  const portfolioHealth = useMemo(() => {
    const totalEntries = allRosters.length;
    const currentCounts = {};

    allRosters.forEach(roster => {
      const path = classifyRosterPath(roster);
      if (!currentCounts[path.rb]) currentCounts[path.rb] = 0;
      currentCounts[path.rb]++;
    });

    return Object.keys(PROTOCOL_TREE).map(key => ({
      key,
      name: ARCHETYPE_METADATA[key]?.name || key,
      target: PROTOCOL_TREE[key].target,
      actual: totalEntries > 0 ? ((currentCounts[key] || 0) / totalEntries) * 100 : 0,
      color: PROTOCOL_TREE[key].color
    }));
  }, [allRosters]);

  // --- 5. Candidate Players ---
  const candidatePlayers = useMemo(() => {
    const candidates = {};

    // Scan ALL rosters to find players taken in the current round
    allRosters.forEach(roster => {
      const player = roster.find(p => parseInt(p.round) === currentRound);
      if (!player) return;

      if (!candidates[player.name]) {
        candidates[player.name] = {
            ...player,
            rawCount: 0,
            matchCount: 0
        };
      }
      candidates[player.name].rawCount++;
    });

    // Scan ONLY matching rosters to find correlation/path frequency
    matchingRosters.forEach(roster => {
      const player = roster.find(p => parseInt(p.round) === currentRound);
      if (player && candidates[player.name]) {
        candidates[player.name].matchCount++;
      }
    });

    return Object.values(candidates)
      .sort((a, b) => b.rawCount - a.rawCount)
      .slice(0, 50);
  }, [allRosters, matchingRosters, currentRound]);

  // --- Actions ---
  const handleSelect = (player) => {
    setCurrentPicks([...currentPicks, { ...player, round: currentRound }]);
  };

  const handleUndo = () => {
    setCurrentPicks(prev => prev.slice(0, -1));
  };

  const primaryStrategy = strategyProjection[0] || { name: 'Undetermined', percent: 0, meta: { color: '#666' } };
  const isLockedIn = primaryStrategy.percent > 85;

  return (
    <div style={{ display: 'flex', gap: 20, height: '700px', fontFamily: 'sans-serif', color: '#e5e7eb' }}>
      {/* LEFT COLUMN */}
      <div style={{ width: '320px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        
        {/* Draft Status */}
        <div style={{ background: '#1f2937', padding: 20, borderRadius: 12, border: '1px solid #374151' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#fff' }}>Draft Assistant</h2>
            <span style={{ fontSize: 12, background: '#374151', padding: '4px 8px', borderRadius: 4 }}>
              Rd {currentRound} • Slot {draftSlot}
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {currentPicks.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13 }}>
                <span style={{ color: getPosColor(p.position), fontWeight: 800, width: 24 }}>{p.position}</span>
                <span style={{ color: '#9ca3af' }}>{p.round}.</span>
                <span style={{ fontWeight: 600 }}>{p.name}</span>
              </div>
            ))}
            {currentPicks.length === 0 && <div style={{ color: '#6b7280', fontSize: 13, fontStyle: 'italic' }}>Draft has not started...</div>}
          </div>
          {currentPicks.length > 0 && (
             <button onClick={handleUndo} style={{ marginTop: 15, width: '100%', padding: 8, background: '#374151', color: '#ccc', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}>
               Undo Last Pick
             </button>
          )}
        </div>

        {/* Strategy Projection */}
        <div style={{ background: '#1f2937', padding: 20, borderRadius: 12, border: '1px solid #374151', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 15 }}>
            <GitBranch size={18} color="#f59e0b" />
            <h3 style={{ fontSize: 14, textTransform: 'uppercase', margin: 0, color: '#f59e0b' }}>
              {isLockedIn ? 'Locked Strategy' : 'Projected Paths'}
            </h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {strategyProjection.slice(0, 4).map((strat) => (
              <div key={strat.key}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
                  <span style={{ color: strat.meta.color || '#ccc', fontWeight: 700 }}>{strat.name}</span>
                  <span>{Math.round(strat.percent)}%</span>
                </div>
                <div style={{ height: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ 
                    width: `${strat.percent}%`, 
                    height: '100%', 
                    background: strat.meta.color || '#888',
                    transition: 'width 0.5s'
                  }} />
                </div>
                <div style={{ fontSize: 10, color: '#6b7280', marginTop: 2 }}>
                  {strat.count} matching teams
                </div>
              </div>
            ))}
            {strategyProjection.length === 0 && <div style={{ color: '#666', fontSize: 12 }}>No historical data matches.</div>}
          </div>
        </div>

        {/* Portfolio Targets */}
        <div style={{ background: '#1f2937', padding: 20, borderRadius: 12, border: '1px solid #374151' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 15 }}>
            <Target size={18} color="#3b82f6" />
            <h3 style={{ fontSize: 14, textTransform: 'uppercase', margin: 0, color: '#3b82f6' }}>Portfolio Targets</h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {portfolioHealth.map((strat) => {
              const diff = strat.actual - strat.target;
              const isOver = diff > 5;
              const isUnder = diff < -5;
              return (
                <div key={strat.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: strat.color || '#666' }} />
                    <span style={{ color: '#d1d5db' }}>{strat.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, color: '#9ca3af' }}>
                    <span>{strat.actual.toFixed(1)}%</span>
                    <span style={{ color: isOver ? '#ef4444' : isUnder ? '#10b981' : '#6b7280', fontWeight: 700 }}>
                      / {strat.target}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#111827', borderRadius: 12, border: '1px solid #374151', overflow: 'hidden' }}>
        <div style={{ padding: '15px 20px', borderBottom: '1px solid #374151', background: '#1f2937' }}>
           <h2 style={{ fontSize: 16, margin: 0, fontWeight: 700 }}>Available Players (Round {currentRound})</h2>
           <div style={{ fontSize: 12, color: '#9ca3af' }}>Sorted by Frequency • Uniqueness • Correlation</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {candidatePlayers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>No player data found for this round.</div>
          ) : (
            candidatePlayers.map(player => (
              <PlayerCard 
                key={player.name}
                player={player}
                currentPicks={currentPicks}
                matchingRostersCount={matchingRosters.length}
                totalEntries={allRosters.length}
                onSelect={() => handleSelect(player)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// --- SUB-COMPONENT ---
function PlayerCard({ player, currentPicks, matchingRostersCount, totalEntries, onSelect }) {
  const color = getPosColor(player.position);
  
  // 1. Correlation Check
  const stackMatch = currentPicks.find(p => p.team === player.team && p.team !== 'FA');
  
  // 2. Uniqueness Check (How many matching rosters took this player?)
  const portfolioExposure = matchingRostersCount > 0 
    ? (player.matchCount / matchingRostersCount) * 100 
    : 0;

  // 3. Global Exposure
  const globalOwn = totalEntries > 0 ? (player.rawCount / totalEntries) * 100 : 0;

  return (
    <div 
      onClick={onSelect}
      style={{ 
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        background: '#1f2937', marginBottom: 8, padding: '10px 14px', borderRadius: 8,
        borderLeft: `4px solid ${color}`, cursor: 'pointer', transition: 'background 0.2s'
      }}
      onMouseEnter={e => e.currentTarget.style.background = '#374151'}
      onMouseLeave={e => e.currentTarget.style.background = '#1f2937'}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 2 }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#111827', background: color, padding: '2px 6px', borderRadius: 4, minWidth: 24, textAlign: 'center' }}>
          {player.position}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 14, color: '#fff' }}>{player.name}</span>
            {stackMatch && (
              <span style={{ fontSize: 10, background: 'rgba(59, 130, 246, 0.2)', color: '#60a5fa', padding: '1px 5px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 3 }}>
                <Zap size={10} /> Stack ({stackMatch.position})
              </span>
            )}
          </div>
          <div style={{ fontSize: 11, color: '#9ca3af' }}>{player.team}</div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 24, flex: 2, justifyContent: 'flex-end' }}>
        <div style={{ textAlign: 'right' }}>
           <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', marginBottom: 2 }}>Path Freq</div>
           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
             <Users size={14} color={portfolioExposure > 25 ? '#10b981' : '#f59e0b'} />
             <span style={{ fontSize: 13, fontWeight: 700, color: portfolioExposure > 25 ? '#10b981' : '#f59e0b' }}>
               {Math.round(portfolioExposure)}%
             </span>
           </div>
        </div>
        <div style={{ textAlign: 'right', minWidth: 60 }}>
           <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', marginBottom: 2 }}>Global Own</div>
           <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
             <Activity size={14} color="#6b7280" />
             <span style={{ fontSize: 13, fontWeight: 600, color: '#d1d5db' }}>
               {Math.round(globalOwn)}%
             </span>
           </div>
        </div>
      </div>
    </div>
  );
}