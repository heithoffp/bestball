import React, { useMemo, useState } from 'react';
import { Target, Zap, Users, Activity, GitBranch, Link as LinkIcon } from 'lucide-react';
import { PROTOCOL_TREE, ARCHETYPE_METADATA, classifyRosterPath } from '../utils/rosterArchetypes';

// --- SHARED CONSTANTS ---
const COLORS = {
  QB: '#bf44ef', RB: '#10b981', WR: '#f59e0b', TE: '#3b82f6', default: '#6b7280'
};

const getPosColor = (pos) => COLORS[pos] || COLORS.default;

export default function DraftFlowAnalysis({ rosterData = [], masterPlayers = []}) {
  const [currentPicks, setCurrentPicks] = useState([]);
  const [draftSlot, setDraftSlot] = useState(1);
  const [debugPlayer, setDebugPlayer] = useState(null);

  // --- 0. DATA TRANSFORMATION ---
  // Create a structured list of rosters
  const allRosters = useMemo(() => {
    if (rosterData.length > 0 && Array.isArray(rosterData[0])) return rosterData;

    const tMap = new Map();
    rosterData.forEach(p => {
      const id = p.entry_id || p.entryId || p['Entry ID'] || 'unknown';
      if (!tMap.has(id)) tMap.set(id, []);
      tMap.get(id).push(p);
    });
    return Array.from(tMap.values());
  }, [rosterData]);

  // --- 0b. PRE-COMPUTE PLAYER INDICES (For Correlation) ---
  // Map<PlayerName, Set<RosterIndex>>
  // This allows us to instantly find all rosters a specific player is in.
  const playerIndexMap = useMemo(() => {
    const map = new Map();
    allRosters.forEach((roster, rIndex) => {
      roster.forEach(p => {
        if (!p.name) return;
        if (!map.has(p.name)) map.set(p.name, new Set());
        map.get(p.name).add(rIndex); // Store index of the roster
      });
    });
    return map;
  }, [allRosters]);

  // --- 1. Current Context ---
  const currentRound = currentPicks.length + 1;

  // --- 2. Filter Matching Rosters (Exact Path) ---
  const matchingRosters = useMemo(() => {
    if (currentPicks.length === 0) return allRosters;

    return allRosters.filter(roster => {
      return currentPicks.every(pick => 
        roster.some(p => {
           const rRound = parseInt(p.round || p.Round);
           return p.name === pick.name && rRound === pick.round;
        })
      );
    });
  }, [allRosters, currentPicks]);

  // --- 3. Strategy Projection ---
  const strategyProjection = useMemo(() => {
    const counts = {};
    let totalMatches = 0;

    matchingRosters.forEach(roster => {
      const path = classifyRosterPath(roster);
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

  // --- 5. Candidate Players Logic ---
  const parseRoundNum = (r) => {
    if (r == null) return NaN;
    if (typeof r === 'number') return r;
    const cleaned = String(r).replace(/[^\d\-]+/g, ''); 
    const n = parseInt(cleaned, 10);
    return Number.isFinite(n) ? n : NaN;
  };

  const getSnakePickPosition = (round, slot, teams = 12) => {
    if (!Number.isFinite(round) || !Number.isFinite(slot)) return null;
    return (round % 2 === 1) ? slot : (teams + 1 - slot);
  };

  const normalizeAdp = (p) => {
    if (Number.isFinite(p?.adpPick)) return p.adpPick;
    if (Number.isFinite(p?.overallPick)) return p.overallPick;
    if (Number.isFinite(p?.adp)) return p.adp;
    if (p?.adpDisplay && !isNaN(p.adpDisplay)) return parseFloat(p.adpDisplay);
    return Infinity;
  };

  const candidatePlayers = useMemo(() => {
    // A. Global Ownership Counts
    const globalPlayerCounts = new Map();
    allRosters.forEach(roster => {
        roster.forEach(p => {
            if (p.name) {
                globalPlayerCounts.set(p.name, (globalPlayerCounts.get(p.name) || 0) + 1);
            }
        });
    });

    const roundCounts = new Map(); // Times taken in THIS specific round globally
    const matchCounts = new Map(); // Times taken in THIS specific round by matching rosters
    const historicalInfo = new Map(); 

    allRosters.forEach(roster => {
      const player = roster.find(p => parseRoundNum(p.round) === currentRound);
      if (!player || !player.name) return;

      const name = player.name;
      roundCounts.set(name, (roundCounts.get(name) || 0) + 1);

      if (!historicalInfo.has(name)) {
        historicalInfo.set(name, { position: player.position, team: player.team });
      }
    });

    matchingRosters.forEach(roster => {
      const player = roster.find(p => parseRoundNum(p.round) === currentRound);
      if (!player || !player.name) return;
      matchCounts.set(player.name, (matchCounts.get(player.name) || 0) + 1);
    });

    // B. Build Base List
    let baseList = [];

    if (masterPlayers && masterPlayers.length > 0) {
      baseList = masterPlayers.map(mp => ({
        ...mp,
        rawCount: roundCounts.get(mp.name) || 0,
        matchCount: matchCounts.get(mp.name) || 0,
        totalGlobalCount: globalPlayerCounts.get(mp.name) || 0,
        _sortAdp: normalizeAdp(mp)
      }));
    } else {
      baseList = Array.from(historicalInfo.keys()).map(name => ({
        name,
        ...historicalInfo.get(name),
        rawCount: roundCounts.get(name) || 0,
        matchCount: matchCounts.get(name) || 0,
        totalGlobalCount: globalPlayerCounts.get(name) || 0,
        _sortAdp: Infinity
      }));
    }

    // C. Filter out players already picked
    const availablePlayers = baseList.filter(p =>
      !currentPicks.some(cp => cp.name === p.name)
    );

    // D. Determine Window (Dynamic based on round)
    // Round 1-2: Window ~14 (+/- 7 players)
    // Round 8: Window ~32 (+/- 16 players)
    // Round 18: Window ~60
    const dynamicWindow = 10 + (currentRound * 3); 

    const TEAMS = 12;
    const pickPos = getSnakePickPosition(currentRound, draftSlot, TEAMS) || 1;
    const currentOverallPick = (currentRound - 1) * TEAMS + pickPos;

    availablePlayers.sort((a, b) => a._sortAdp - b._sortAdp);

    // Find the index of the player closest to our current pick
    let idx = availablePlayers.findIndex(p => p._sortAdp >= currentOverallPick);
    if (idx === -1) idx = availablePlayers.length > 0 ? availablePlayers.length - 1 : 0;

    const half = Math.floor(dynamicWindow / 2);
    let start = Math.max(0, idx - half);
    let end = Math.min(availablePlayers.length, start + dynamicWindow);

    // Adjust start if we hit the end of the list to keep window size consistent
    if (end - start < dynamicWindow) start = Math.max(0, end - dynamicWindow);

    const slice = availablePlayers.slice(start, end);

    // E. Finalize Candidates with CORRELATION logic
    const matchingRosterTotal = matchingRosters.length;

    const finalCandidates = slice.map(candidate => {
      // 1. Portfolio Exposure (Current Path)
      const pathPercent = matchingRosterTotal > 0 
        ? (candidate.matchCount / matchingRosterTotal) * 100 
        : 0;

      // 2. Correlation Score (The "Unique Combo" metric)
      // Logic: Average Conditional Probability
      // For every picked player P: What % of rosters with P also have Candidate C?
      let sumProb = 0;
      let comparisons = 0;
      
      // Get the set of rosters this candidate is in
      const candidateRosters = playerIndexMap.get(candidate.name) || new Set();

      if (currentPicks.length > 0) {
        currentPicks.forEach(pick => {
          const pickRosters = playerIndexMap.get(pick.name) || new Set();
          
          if (pickRosters.size > 0) {
            // Find Intersection count
            let intersection = 0;
            // Iterate over the smaller set for performance
            if (pickRosters.size < candidateRosters.size) {
                pickRosters.forEach(rid => { if(candidateRosters.has(rid)) intersection++; });
            } else {
                candidateRosters.forEach(rid => { if(pickRosters.has(rid)) intersection++; });
            }

            // Probability: P(Candidate | Pick)
            const prob = intersection / pickRosters.size;
            sumProb += prob;
            comparisons++;
          }
        });
      }

      // If we have picks, average the probabilities. If not (Round 1), it's 0.
      const avgCorrelation = comparisons > 0 ? (sumProb / comparisons) * 100 : 0;

      return {
        ...candidate,
        portfolioExposure: pathPercent, // "Current Path"
        correlationScore: avgCorrelation, // "Roster Correlation"
        _sortAdp: candidate._sortAdp
      };
    });

    // F. Final Sort
    finalCandidates.sort((a, b) => {
      if (a._sortAdp !== b._sortAdp) return a._sortAdp - b._sortAdp;
      return a.name.localeCompare(b.name);
    });

    return finalCandidates;
  }, [masterPlayers, allRosters, matchingRosters, currentRound, draftSlot, currentPicks, playerIndexMap]);


  // --- Actions ---
  const handleSelect = (player) => {
    setCurrentPicks([...currentPicks, { ...player, round: currentRound }]);
  };

  const handleUndo = () => {
    setCurrentPicks(prev => prev.slice(0, -1));
  };

  const slotNum = Number(draftSlot) || 1;
  const overallPick = (currentRound - 1) * 12 + slotNum;
  const primaryStrategy = strategyProjection[0] || { name: 'Undetermined', percent: 0, meta: { color: '#666' } };
  const isLockedIn = primaryStrategy.percent > 85;

  return (
    <div style={{ display: 'flex', gap: 20, height: '700px', fontFamily: 'sans-serif', color: '#e5e7eb' }}>
      
      {/* LEFT COLUMN */}
      <div style={{ width: '320px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        
        {/* Draft Status */}
        <div style={{ display: 'flex', gap: 10 }}>
           <select
            value={draftSlot}
            onChange={e => setDraftSlot(Number(e.target.value))}
            style={{ flex: 1, background: '#374151', color: '#e5e7eb', border: '1px solid #4b5563', borderRadius: 6, padding: '4px 6px' }}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
              <option key={n} value={n}>Slot {n}</option>
            ))}
          </select>
        </div>

        <div style={{ background: '#1f2937', padding: 20, borderRadius: 12, border: '1px solid #374151' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 15 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0, color: '#fff' }}>Draft Board</h2>
            <span style={{ fontSize: 12, background: '#374151', padding: '4px 8px', borderRadius: 4 }}>
              Rd {currentRound} • Pick {overallPick}
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
                  <div style={{ width: `${strat.percent}%`, height: '100%', background: strat.meta.color || '#888', transition: 'width 0.5s' }} />
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
           <div style={{ fontSize: 12, color: '#9ca3af' }}>Sorted by ADP (Window of ~20)</div>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {candidatePlayers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 40, color: '#666' }}>
              No player data found for this round. <br/>
              (Check if Master Players loaded correctly or ADP data exists)
            </div>
          ) : (
            candidatePlayers.map(player => (
              <PlayerCard 
                key={player.name}
                player={player}
                currentPicks={currentPicks}
                matchingRostersCount={matchingRosters.length}
                totalEntries={allRosters.length}
                onSelect={() => handleSelect(player)}
                debugOpen={debugPlayer === player.name}
                setDebugOpen={(isOpen) => setDebugPlayer(isOpen ? player.name : null)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function PlayerCard({ player = {}, currentPicks = [], matchingRostersCount = 0, totalEntries = 0, onSelect = () => {}, debugOpen, setDebugOpen }) {
  const color = getPosColor(player.position);

  // 1. Correlation Check
  const stackMatch = currentPicks.find(p => p.team === player.team && p.team !== 'FA' && p.team !== 'N/A');

  // 2. Uniqueness Check (How often do matching rosters take this player IN THIS ROUND)
  const portfolioExposure = player.portfolioExposure || 0;

  // 3. Global Exposure 
  const globalOwn = totalEntries > 0 ? (player.totalGlobalCount || 0) / totalEntries * 100 : 0;

  // 4. ADP Display
  const displayAdp = player.adpDisplay || (Number.isFinite(player.adpPick) ? player.adpPick.toFixed(1) : '—');

  // 5. Correlation Score Logic
  // If > 0, it means there is overlap. If 0, it is a very unique combo (or just no data).
  // We color code: High Correlation (Red) = Chalky. Low Correlation (Green) = Unique.
  const corr = player.correlationScore || 0;
  let corrColor = '#6b7280'; // Gray
  if (currentPicks.length > 0) {
    if (corr > 25) corrColor = '#ef4444'; // Red (Very correlated, chalky)
    else if (corr > 15) corrColor = '#f59e0b'; // Orange
    else if (corr > 0) corrColor = '#10b981'; // Green (Unique but exists)
  }

  // helper render small key/value
  const Row = ({ k, v }) => (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12, color: '#d1d5db' }}>
      <div style={{ color: '#9ca3af' }}>{k}</div>
      <div style={{ fontFamily: 'monospace' }}>{v ?? '—'}</div>
    </div>
  );

  return (
    <div style={{ marginBottom: 8 }}>
      <div
        onClick={onSelect}
        style={{
          display: 'grid',
          gridTemplateColumns: '280px 1fr auto',
          gap: 24,
          alignItems: 'center',
          background: '#1f2937',
          padding: '12px 16px',
          borderRadius: 8,
          borderLeft: `4px solid ${color}`,
          cursor: 'pointer',
          transition: 'background 0.15s'
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#374151'}
        onMouseLeave={e => e.currentTarget.style.background = '#1f2937'}
      >
        {/* Player Info Section */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: '#111827', background: color, padding: '2px 6px', borderRadius: 4, minWidth: 24, textAlign: 'center' }}>
            {player.position || '??'}
          </div>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 14, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {player.name || 'Unknown Player'}
              </span>

              {stackMatch && (
                <span style={{ fontSize: 10, background: 'rgba(59, 130, 246, 0.12)', color: '#60a5fa', padding: '2px 6px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Zap size={12} /> Stack ({stackMatch.position})
                </span>
              )}
            </div>

            <div style={{ fontSize: 11, color: '#9ca3af' }}>{player.team || 'FA'}</div>
          </div>
        </div>

        {/* Stats Grid - Spread Out */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {/* Portfolio Frequency (In this specific round) */}
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Current Path</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 4 }}>
              <Users size={14} color={portfolioExposure > 25 ? '#10b981' : '#f59e0b'} />
              <span style={{ fontSize: 15, fontWeight: 700, color: portfolioExposure > 25 ? '#10b981' : '#f59e0b' }}>
                {Math.round(portfolioExposure)}%
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{(player.matchCount || 0)} here</div>
          </div>

          {/* Total Exposure */}
          <div style={{ textAlign: 'center', borderLeft: '1px solid #374151', paddingLeft: 12 }}>
            <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Total Exposure</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e5e7eb', marginBottom: 4 }}>
              {Math.round(globalOwn)}%
            </div>
            <div style={{ fontSize: 11, color: '#6b7280' }}>{(player.totalGlobalCount || 0)} total</div>
          </div>

          {/* Correlation Score (NEW) */}
          <div style={{ textAlign: 'center', borderLeft: '1px solid #374151', paddingLeft: 12 }}>
            <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>Roster Corr</div>
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 4 }}>
               <LinkIcon size={14} color={corrColor} />
               <div style={{ fontSize: 15, fontWeight: 700, color: corrColor }}>
                  {currentPicks.length > 0 ? Math.round(corr) + '%' : '—'}
               </div>
            </div>
             <div style={{ fontSize: 11, color: '#6b7280' }}>
               {corr < 5 && currentPicks.length > 0 ? 'Unique' : 'Common'}
             </div>
          </div>

          {/* ADP */}
          <div style={{ textAlign: 'center', borderLeft: '1px solid #374151', paddingLeft: 12 }}>
            <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', marginBottom: 6 }}>ADP</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: '#e5e7eb' }}>{displayAdp}</div>
          </div>
        </div>

        {/* Debug Button */}
        <div>
          <button
            onClick={(e) => { e.stopPropagation(); setDebugOpen(!debugOpen); }}
            style={{ background: '#111827', color: '#9ca3af', border: '1px solid #374151', padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
          >
            ?
          </button>
        </div>
      </div>

      {debugOpen && (
        <div style={{ background: '#0b1220', borderRadius: 8, padding: 10, marginTop: 6, border: '1px solid #243042', fontSize: 13, color: '#d1d5db' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <Row k="Name" v={player.name} />
            <Row k="Path Freq" v={portfolioExposure.toFixed(1) + '%'} />
            <Row k="Global Freq" v={globalOwn.toFixed(1) + '%'} />
            <Row k="Correlation" v={corr.toFixed(1) + '%'} />
            <Row k="ADP" v={player.adpPick} />
          </div>
        </div>
      )}
    </div>
  );
}