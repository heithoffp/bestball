import React, { useMemo, useState } from 'react';
import { Target, Zap, Users, Activity, GitBranch } from 'lucide-react';
import { PROTOCOL_TREE, ARCHETYPE_METADATA, classifyRosterPath } from '../utils/rosterArchetypes';

// --- SHARED CONSTANTS ---
const COLORS = {
  QB: '#bf44ef', RB: '#10b981', WR: '#f59e0b', TE: '#3b82f6', default: '#6b7280'
};

const getPosColor = (pos) => COLORS[pos] || COLORS.default;

export default function DraftFlowAnalysis({ rosterData = [], masterPlayers = []}) {
  const [currentPicks, setCurrentPicks] = useState([]);
  const [draftSlot, setDraftSlot] = useState(1);
  const [debugPlayer, setDebugPlayer] = useState(null); // Local state for debug panel

  // --- 0. DATA TRANSFORMATION ---
  const allRosters = useMemo(() => {
    if (rosterData.length > 0 && Array.isArray(rosterData[0])) return rosterData;

    const tMap = new Map();
    rosterData.forEach(p => {
      // Handle both casing styles seen in your snippets
      const id = p.entry_id || p.entryId || p['Entry ID'] || 'unknown';
      if (!tMap.has(id)) tMap.set(id, []);
      tMap.get(id).push(p);
    });
    return Array.from(tMap.values());
  }, [rosterData]);

  // --- 1. Current Context ---
  const currentRound = currentPicks.length + 1;

  // --- 2. Filter Matching Rosters ---
  const matchingRosters = useMemo(() => {
    if (currentPicks.length === 0) return allRosters;

    return allRosters.filter(roster => {
      return currentPicks.every(pick => 
        roster.some(p => {
           // Ensure robust comparison of names and rounds
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
      const stratKey = path.rb; // using RB strategy as the primary archetype key
      
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
  
  // Helper: Extract valid numeric round
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

  // *** CRITICAL FIX: Update normalizeAdp to check `adpPick` (from masterPlayers) ***
  const normalizeAdp = (p) => {
    if (Number.isFinite(p?.adpPick)) return p.adpPick;
    if (Number.isFinite(p?.overallPick)) return p.overallPick;
    if (Number.isFinite(p?.adp)) return p.adp;
    // Fallback: try parsing display string if numeric
    if (p?.adpDisplay && !isNaN(p.adpDisplay)) return parseFloat(p.adpDisplay);
    return Infinity;
  };

  const candidatePlayers = useMemo(() => {
    // A. Calculate stats from Historical Data
    const roundCounts = new Map(); // Times taken in THIS specific round globally
    const matchCounts = new Map(); // Times taken in THIS specific round by matching rosters
    const historicalInfo = new Map(); // Fallback positional data

    allRosters.forEach(roster => {
      const player = roster.find(p => parseRoundNum(p.round) === currentRound);
      if (!player || !player.name) return;
      
      const name = player.name;
      roundCounts.set(name, (roundCounts.get(name) || 0) + 1);
      
      // Store pos/team if we see it, just in case it's missing from master
      if (!historicalInfo.has(name)) {
        historicalInfo.set(name, { position: player.position, team: player.team });
      }
    });

    matchingRosters.forEach(roster => {
      const player = roster.find(p => parseRoundNum(p.round) === currentRound);
      if (!player || !player.name) return;
      matchCounts.set(player.name, (matchCounts.get(player.name) || 0) + 1);
    });

    // B. Build Base List from MasterPlayers (or historical if master is empty)
    let baseList = [];
    
    if (masterPlayers && masterPlayers.length > 0) {
      baseList = masterPlayers.map(mp => ({
        ...mp,
        // Ensure we grab historical counts
        rawCount: roundCounts.get(mp.name) || 0,
        matchCount: matchCounts.get(mp.name) || 0,
        // Ensure ADP is normalized for sorting
        _sortAdp: normalizeAdp(mp)
      }));
    } else {
      // Fallback: Build list purely from what we've seen in rosters
      baseList = Array.from(historicalInfo.keys()).map(name => ({
        name,
        ...historicalInfo.get(name),
        rawCount: roundCounts.get(name) || 0,
        matchCount: matchCounts.get(name) || 0,
        _sortAdp: Infinity // No ADP data available
      }));
    }

    // C. Filter out players already picked in current simulation
    const availablePlayers = baseList.filter(p => 
      !currentPicks.some(cp => cp.name === p.name)
    );

    // D. Determine Window (Who is available around this pick?)
    const TEAMS = 12;
    const pickPos = getSnakePickPosition(currentRound, draftSlot, TEAMS) || 1;
    const currentOverallPick = (currentRound - 1) * TEAMS + pickPos;

    // Sort by ADP to find the "window"
    availablePlayers.sort((a, b) => a._sortAdp - b._sortAdp);

    // Find index of current pick in the ADP list
    // (If everyone is Infinity, this stays at 0, showing top list)
    let idx = availablePlayers.findIndex(p => p._sortAdp >= currentOverallPick);
    
    // Safety: if we are late in draft or ADP is weird, center loosely
    if (idx === -1) idx = availablePlayers.length > 0 ? availablePlayers.length - 1 : 0;

    // Define Window Size
    const WINDOW = 20; 
    const half = Math.floor(WINDOW / 2);
    let start = Math.max(0, idx - half);
    let end = Math.min(availablePlayers.length, start + WINDOW);
    
    // Adjust window to ensure it fills up
    if (end - start < WINDOW) {
      start = Math.max(0, end - WINDOW);
    }

    const slice = availablePlayers.slice(start, end);

    // E. Final Sort for Display (ADP tie-broken by Name)
    // You can change this to sort by 'matchCount' if you want to see most frequent picks first
    return slice.sort((a, b) => {
       if (a._sortAdp !== b._sortAdp) return a._sortAdp - b._sortAdp;
       return a.name.localeCompare(b.name);
    });

  }, [masterPlayers, allRosters, matchingRosters, currentRound, draftSlot, currentPicks]);


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

  // 2. Uniqueness Check
  const portfolioExposure = matchingRostersCount > 0
    ? (player.matchCount || 0) / matchingRostersCount * 100
    : 0;

  // 3. Global Exposure
  const globalOwn = totalEntries > 0 ? (player.rawCount || 0) / totalEntries * 100 : 0;

  // 4. ADP Display - PRIORITIZE adpDisplay or adpPick from processMasterList
  const displayAdp = player.adpDisplay || (Number.isFinite(player.adpPick) ? player.adpPick.toFixed(1) : '—');

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
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: '#1f2937', padding: '10px 14px', borderRadius: 8,
          borderLeft: `4px solid ${color}`, cursor: 'pointer', transition: 'background 0.15s'
        }}
        onMouseEnter={e => e.currentTarget.style.background = '#374151'}
        onMouseLeave={e => e.currentTarget.style.background = '#1f2937'}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 2, minWidth: 0 }}>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flex: 2, justifyContent: 'flex-end' }}>
          {/* Path Frequency */}
          <div style={{ textAlign: 'right', minWidth: 80 }}>
            <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase', marginBottom: 4 }}>Freq</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
              <Users size={14} color={portfolioExposure > 25 ? '#10b981' : '#f59e0b'} />
              <span style={{ fontSize: 13, fontWeight: 700, color: portfolioExposure > 25 ? '#10b981' : '#f59e0b' }}>
                {Math.round(portfolioExposure)}%
              </span>
            </div>
            <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>{(player.matchCount || 0)} hits</div>
          </div>

          {/* ADP */}
          <div style={{ textAlign: 'right', minWidth: 60 }}>
            <div style={{ fontSize: 9, color: '#6b7280', textTransform: 'uppercase' }}>ADP</div>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#e5e7eb' }}>{displayAdp}</div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button
              onClick={(e) => { e.stopPropagation(); setDebugOpen(!debugOpen); }}
              style={{ background: '#111827', color: '#9ca3af', border: '1px solid #374151', padding: '6px 8px', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
            >
              ?
            </button>
          </div>
        </div>
      </div>

      {debugOpen && (
        <div style={{ background: '#0b1220', borderRadius: 8, padding: 10, marginTop: 6, border: '1px solid #243042', fontSize: 13, color: '#d1d5db' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 8 }}>
            <Row k="Name" v={player.name} />
            <Row k="ID" v={player.player_id} />
            <Row k="ADP Pick" v={player.adpPick} />
            <Row k="ADP Disp" v={player.adpDisplay} />
            <Row k="_sortAdp" v={player._sortAdp} />
            <Row k="Matches" v={player.matchCount} />
          </div>
        </div>
      )}
    </div>
  );
}