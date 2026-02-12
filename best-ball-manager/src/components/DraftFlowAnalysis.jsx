import React, { useMemo, useState } from 'react';
import { Target, Zap, Users, GitBranch, Link as LinkIcon, Lock, AlertTriangle, TrendingUp } from 'lucide-react';
import { PROTOCOL_TREE, ARCHETYPE_METADATA, classifyRosterPath } from '../utils/rosterArchetypes';

// --- SHARED CONSTANTS ---
const COLORS = {
  QB: '#bf44ef', RB: '#10b981', WR: '#f59e0b', TE: '#3b82f6', default: '#6b7280'
};

const getPosColor = (pos) => COLORS[pos] || COLORS.default;

const getGlobalExposureColor = (percent) => {
  if (percent === 0) return '#3b82f6'; // Blue for 0%
  if (percent > 30) return '#ef4444'; // Red for >30%
  if (percent >= 7 && percent <= 10) return '#10b981'; // Green for ~8.333% (balanced)
  if (percent < 8.333) return '#60a5fa'; // Light blue for under-exposed
  return '#f59e0b'; // Orange for over-exposed but not critical
};

// Sophisticated stacking analysis
const analyzeStack = (player, currentPicks) => {
  const team = player.team;
  if (!team || team === 'FA' || team === 'N/A') return null;

  // Find all teammates
  const teammates = currentPicks.filter(p => p.team === team);
  if (teammates.length === 0) return null;

  const playerPos = player.position;
  const qbs = teammates.filter(p => p.position === 'QB');
  const wrs = teammates.filter(p => p.position === 'WR');
  const tes = teammates.filter(p => p.position === 'TE');
  const rbs = teammates.filter(p => p.position === 'RB');

  let stackType = '';
  let priority = 0; // Higher = more important
  let color = '#64748b';
  let icon = '●';

  // ELITE STACKS - QB correlation
  if (playerPos === 'QB' && (wrs.length > 0 || tes.length > 0)) {
    const passTargets = wrs.length + tes.length;
    if (passTargets >= 2) {
      stackType = '🔥 ELITE OVERSTACK';
      priority = 100;
      color = '#a855f7'; // Purple
      icon = '⚡⚡';
    } else {
      stackType = '⚡ ELITE STACK';
      priority = 90;
      color = '#8b5cf6';
      icon = '⚡';
    }
  } else if ((playerPos === 'WR' || playerPos === 'TE') && qbs.length > 0) {
    const passTargets = wrs.length + tes.length;
    if (passTargets >= 1) { // Already have WR/TE, adding another
      stackType = '🔥 ELITE OVERSTACK';
      priority = 100;
      color = '#a855f7';
      icon = '⚡⚡';
    } else {
      stackType = '⚡ ELITE STACK';
      priority = 90;
      color = '#8b5cf6';
      icon = '⚡';
    }
  }
  // OVERSTACKS - Same position teammates
  else if (playerPos === 'WR' && wrs.length >= 1) {
    stackType = `💎 WR OVERSTACK (${wrs.length + 1})`;
    priority = 80;
    color = '#06b6d4'; // Cyan
    icon = '💎';
  } else if (playerPos === 'TE' && tes.length >= 1) {
    stackType = `💎 TE OVERSTACK (${tes.length + 1})`;
    priority = 80;
    color = '#06b6d4';
    icon = '💎';
  } else if (playerPos === 'RB' && rbs.length >= 1) {
    stackType = `🔄 RB STACK (${rbs.length + 1})`;
    priority = 60;
    color = '#f59e0b'; // Orange - risky backfield
    icon = '🔄';
  }
  // CORRELATION STACKS - Weak but notable
  else if (playerPos === 'RB' && (wrs.length > 0 || tes.length > 0)) {
    stackType = '○ Game Stack';
    priority = 40;
    color = '#64748b';
    icon = '○';
  } else if ((playerPos === 'WR' || playerPos === 'TE') && rbs.length > 0) {
    stackType = '○ Game Stack';
    priority = 40;
    color = '#64748b';
    icon = '○';
  }
  // Generic same-team
  else {
    stackType = '● Stack';
    priority = 30;
    color = '#64748b';
    icon = '●';
  }

  return {
    type: stackType,
    priority,
    color,
    icon,
    teammates: teammates.map(t => `${t.position} ${t.name}`).join(', ')
  };
};

// --- STRATEGY VIABILITY CHECKER (from V2) ---
function checkStrategyViability(strategyKey, currentPicks, currentRound) {
  const countPos = (pos, start, end) => currentPicks.filter(p => {
      const r = p.round;
      return p.position === pos && r >= start && r <= end;
  }).length;

  // RB Logic
  if (strategyKey === 'RB_HYPER_FRAGILE') {
    const rb1to3 = countPos('RB', 1, 3);
    if (currentRound > 3) return rb1to3 >= 3;
    return (rb1to3 + (4 - currentRound)) >= 3;
  }
  if (strategyKey === 'RB_ZERO') {
    return countPos('RB', 1, 5) === 0;
  }
  if (strategyKey === 'RB_HERO') {
    const rb1to2 = countPos('RB', 1, 2);
    if (rb1to2 > 1) return false; // Too many early
    if (countPos('RB', 3, 6) > 0) return false; // Dead zone violation
    if (currentRound > 2 && rb1to2 === 0) return false; // Missed window
    return true;
  }
  if (strategyKey === 'RB_VALUE') return true; // Fallback

  // QB Logic (simplified for brevity)
  if (strategyKey === 'QB_ELITE') return countPos('QB', 1, 3) >= 1 || currentRound <= 3;
  if (strategyKey === 'QB_CORE')  return countPos('QB', 5, 9) >= 1 || currentRound <= 9;
  if (strategyKey === 'QB_LATE')  return true;

  return true;
}

export default function DraftFlowAnalysis({ rosterData = [], masterPlayers = []}) {
  const [currentPicks, setCurrentPicks] = useState([]);
  const [draftSlot, setDraftSlot] = useState(1);
  const [debugPlayer, setDebugPlayer] = useState(null);

  // Add animation styles
  React.useEffect(() => {
    const styleId = 'stack-animations';
    if (!document.getElementById(styleId)) {
      const style = document.createElement('style');
      style.id = styleId;
      style.textContent = `
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.8; }
        }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // --- 1. DATA TRANSFORMATION ---
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

  // --- 2. PLAYER INDEX MAP (from V1 - for correlation) ---
  const playerIndexMap = useMemo(() => {
    const map = new Map();
    allRosters.forEach((roster, rIndex) => {
      roster.forEach(p => {
        if (!p.name) return;
        if (!map.has(p.name)) map.set(p.name, new Set());
        map.get(p.name).add(rIndex);
      });
    });
    return map;
  }, [allRosters]);

  // --- 3. CONTEXT ---
  const currentRound = currentPicks.length + 1;

  // --- 4. MATCHING ROSTERS (Exact Path) ---
  const matchingPathRosters = useMemo(() => {
    if (currentPicks.length === 0) return allRosters;
    return allRosters.filter(roster => 
      currentPicks.every(pick => 
        roster.some(p => {
          const rRound = parseInt(p.round || p.Round);
          return p.name === pick.name && rRound === pick.round;
        })
      )
    );
  }, [allRosters, currentPicks]);

  // --- 5. STRATEGY STATUS (from V2 - Deterministic + Pools) ---
  const strategyStatus = useMemo(() => {
    // A. Identify Viability (Rules)
    const viableRB = Object.keys(PROTOCOL_TREE).map(key => ({
      key,
      name: ARCHETYPE_METADATA[key]?.name || key,
      viable: checkStrategyViability(key, currentPicks, currentRound),
      meta: PROTOCOL_TREE[key]
    }));

    const activeStructural = viableRB.filter(s => s.viable && s.key !== 'RB_VALUE');
    
    let lockedStrategy = null;
    let lockedLevel = 0; 

    if (activeStructural.length === 1) {
      lockedStrategy = activeStructural[0];
      lockedLevel = 1;
    } else if (activeStructural.length === 0) {
      lockedStrategy = viableRB.find(s => s.key === 'RB_VALUE');
      lockedLevel = 1;
    }

    // B. Strategy Pools
    const strategyPools = {
        RB_ZERO: [], RB_HERO: [], RB_HYPER_FRAGILE: [], RB_VALUE: []
    };
    
    allRosters.forEach(roster => {
        const path = classifyRosterPath(roster);
        if (strategyPools[path.rb]) strategyPools[path.rb].push(roster);
    });

    // Reference Strategy
    const referenceStrategyKey = lockedStrategy ? lockedStrategy.key : 
        (viableRB.find(s => s.viable && s.key === 'RB_HERO') ? 'RB_HERO' : 'RB_VALUE');

    return {
        viableRB,
        lockedStrategy,
        lockedLevel,
        strategyPools,
        referenceStrategyKey,
        referenceStrategyName: ARCHETYPE_METADATA[referenceStrategyKey]?.name
    };
  }, [currentPicks, currentRound, allRosters]);

  // --- 6. PORTFOLIO HEALTH (from V1) ---
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

  // --- 7. CANDIDATE PLAYERS (MERGED LOGIC) ---
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

    const roundCounts = new Map();
    const matchCounts = new Map();
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

    matchingPathRosters.forEach(roster => {
      const player = roster.find(p => parseRoundNum(p.round) === currentRound);
      if (!player || !player.name) return;
      matchCounts.set(player.name, (matchCounts.get(player.name) || 0) + 1);
    });

    // B. Build Base List
    let baseList = [];

    if (masterPlayers && masterPlayers.length > 0) {
      baseList = masterPlayers.map(mp => {
        const historicalData = historicalInfo.get(mp.name) || {};
        return {
          ...mp,
          // Ensure position/team from master takes priority, fallback to historical
          position: mp.position,
          team: mp.team,
          rawCount: roundCounts.get(mp.name) || 0,
          matchCount: matchCounts.get(mp.name) || 0,
          totalGlobalCount: globalPlayerCounts.get(mp.name) || 0,
          _sortAdp: normalizeAdp(mp)
        };
      });
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

    // C. Filter out already picked
    const availablePlayers = baseList.filter(p =>
      !currentPicks.some(cp => cp.name === p.name)
    );

    // D. Dynamic Window (from V1)
    const dynamicWindow = 10 + (currentRound * 3); 
    const TEAMS = 12;
    const pickPos = getSnakePickPosition(currentRound, draftSlot, TEAMS) || 1;
    const currentOverallPick = (currentRound - 1) * TEAMS + pickPos;

    availablePlayers.sort((a, b) => a._sortAdp - b._sortAdp);

    let idx = availablePlayers.findIndex(p => p._sortAdp >= currentOverallPick);
    if (idx === -1) idx = availablePlayers.length > 0 ? availablePlayers.length - 1 : 0;

    const half = Math.floor(dynamicWindow / 2);
    let start = Math.max(0, idx - half);
    let end = Math.min(availablePlayers.length, start + dynamicWindow);

    if (end - start < dynamicWindow) start = Math.max(0, end - dynamicWindow);

    const slice = availablePlayers.slice(start, end);

    // E. Calculate All Metrics
    const matchingRosterTotal = matchingPathRosters.length;
    const targetStratKey = strategyStatus.referenceStrategyKey;
    const targetStratRosters = strategyStatus.strategyPools[targetStratKey] || [];
    const targetStratTotal = targetStratRosters.length;
    const totalRosters = allRosters.length;

    const finalCandidates = slice.map(candidate => {
      // 1. Path Exposure (Current exact path)
      const pathPercent = matchingRosterTotal > 0 
        ? (candidate.matchCount / matchingRosterTotal) * 100 
        : 0;

      // 2. Strategy Exposure (from V2)
      const inStrat = targetStratRosters.filter(r => r.some(x => x.name === candidate.name)).length;
      const stratPercent = targetStratTotal > 0 ? (inStrat / targetStratTotal) * 100 : 0;

      // 3. Global Exposure
      const globalPercent = totalRosters > 0 
        ? (candidate.totalGlobalCount / totalRosters) * 100 
        : 0;

      // 4. Correlation Score (from V1)
      let sumProb = 0;
      let comparisons = 0;
      
      const candidateRosters = playerIndexMap.get(candidate.name) || new Set();

      if (currentPicks.length > 0) {
        currentPicks.forEach(pick => {
          const pickRosters = playerIndexMap.get(pick.name) || new Set();
          
          if (pickRosters.size > 0) {
            let intersection = 0;
            if (pickRosters.size < candidateRosters.size) {
                pickRosters.forEach(rid => { if(candidateRosters.has(rid)) intersection++; });
            } else {
                candidateRosters.forEach(rid => { if(pickRosters.has(rid)) intersection++; });
            }

            const prob = intersection / pickRosters.size;
            sumProb += prob;
            comparisons++;
          }
        });
      }

      const correlationScore = comparisons > 0 ? (sumProb / comparisons) * 100 : 0;

      // 5. Kills Strategy Check (from V2)
      const killsStrategy = strategyStatus.viableRB.filter(s => s.viable && s.key !== 'RB_VALUE').some(s => {
         const nextPicks = [...currentPicks, { ...candidate, round: currentRound, position: candidate.position }];
         return !checkStrategyViability(s.key, nextPicks, currentRound);
      });

      return {
        ...candidate,
        portfolioExposure: pathPercent,
        strategyExposure: stratPercent,
        globalExposure: globalPercent,
        correlationScore,
        killsStrategy,
        _sortAdp: candidate._sortAdp
      };
    });

    // F. Final Sort
    finalCandidates.sort((a, b) => {
      if (a._sortAdp !== b._sortAdp) return a._sortAdp - b._sortAdp;
      return a.name.localeCompare(b.name);
    });

    return finalCandidates;
  }, [masterPlayers, allRosters, matchingPathRosters, currentRound, draftSlot, currentPicks, playerIndexMap, strategyStatus]);

  // --- ACTIONS ---
  const handleSelect = (player) => {
    setCurrentPicks([...currentPicks, { ...player, round: currentRound }]);
  };

  const handleUndo = () => {
    setCurrentPicks(prev => prev.slice(0, -1));
  };

  const slotNum = Number(draftSlot) || 1;
  const overallPick = (currentRound - 1) * 12 + slotNum;
  const { lockedLevel, lockedStrategy, referenceStrategyName } = strategyStatus;

  return (
    <div style={{ display: 'flex', gap: 20, height: '750px', fontFamily: 'sans-serif', color: '#e5e7eb', background: '#0f172a', padding: 20 }}>
      
      {/* LEFT COLUMN */}
      <div style={{ width: '340px', display: 'flex', flexDirection: 'column', gap: 20 }}>
        
        {/* Draft Controls */}
        <div style={{ display: 'flex', gap: 10 }}>
           <div style={{ flex: 1, background: '#1e293b', padding: '12px', borderRadius: 8, border: '1px solid #334155' }}>
             <span style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Draft Slot</span>
             <select 
               value={draftSlot} 
               onChange={e => setDraftSlot(Number(e.target.value))}
               style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', color: '#fff', fontWeight: 700, fontSize: 16, marginTop: 4, cursor: 'pointer' }}
             >
               {Array.from({length:12},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}
             </select>
           </div>
           <div style={{ flex: 1, background: '#1e293b', padding: '12px', borderRadius: 8, border: '1px solid #334155', textAlign: 'center' }}>
             <div style={{ fontSize: 10, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Current Pick</div>
             <div style={{ fontSize: 18, fontWeight: 800, color: '#fff', marginTop: 4 }}>
               {currentRound}.{overallPick}
             </div>
           </div>
        </div>

        {/* Drafted Roster */}
        <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', display: 'flex', flexDirection: 'column', minHeight: 200, maxHeight: 320 }}>
          {/* Header with buttons */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155' }}>
            <h2 style={{ fontSize: 14, fontWeight: 800, margin: '0 0 12px 0', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Draft Board
            </h2>
            {currentPicks.length > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button 
                  onClick={handleUndo} 
                  style={{ 
                    flex: 1, padding: '8px', background: '#334155', 
                    color: '#cbd5e1', border: 'none', borderRadius: 6, cursor: 'pointer', 
                    fontSize: 11, fontWeight: 600, transition: 'background 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#475569'}
                  onMouseLeave={e => e.currentTarget.style.background = '#334155'}
                >
                  Undo Last
                </button>
                <button 
                  onClick={() => setCurrentPicks([])} 
                  style={{ 
                    flex: 1, padding: '8px', background: '#334155', 
                    color: '#cbd5e1', border: 'none', borderRadius: 6, cursor: 'pointer', 
                    fontSize: 11, fontWeight: 600, transition: 'background 0.2s'
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = '#475569'}
                  onMouseLeave={e => e.currentTarget.style.background = '#334155'}
                >
                  Clear Draft
                </button>
              </div>
            )}
          </div>

          {/* Scrollable picks area */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {currentPicks.map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, paddingBottom: 8, borderBottom: i < currentPicks.length - 1 ? '1px solid #334155' : 'none' }}>
                  <span style={{ color: getPosColor(p.position), fontWeight: 800, width: 28, fontSize: 11 }}>{p.position}</span>
                  <span style={{ color: '#64748b', fontSize: 11, width: 20 }}>{p.round}.</span>
                  <span style={{ fontWeight: 600, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                </div>
              ))}
              {currentPicks.length === 0 && (
                <div style={{ color: '#475569', fontSize: 13, fontStyle: 'italic', textAlign: 'center', padding: 30 }}>
                  No picks yet...
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Strategy Status */}
        <div style={{ background: '#1e293b', padding: 20, borderRadius: 12, border: '1px solid #334155', flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 15 }}>
            {lockedLevel > 0 ? <Lock size={16} color="#10b981" /> : <GitBranch size={16} color="#f59e0b" />}
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', margin: 0, color: lockedLevel > 0 ? '#10b981' : '#f59e0b', fontWeight: 800, letterSpacing: '0.5px' }}>
                {lockedLevel > 0 ? 'Strategy Locked' : 'Viable Paths'}
            </h3>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {strategyStatus.viableRB.map((strat) => (
              <div key={strat.key} style={{ opacity: strat.viable ? 1 : 0.35, transition: 'opacity 0.3s' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 6 }}>
                  <span style={{ color: strat.meta.color, fontWeight: 700 }}>{strat.name}</span>
                  {strat.viable && (
                    <span style={{ color: '#10b981', fontSize: 10, fontWeight: 600 }}>
                      {lockedLevel > 0 && lockedStrategy?.key === strat.key ? '● LOCKED' : '✓ Active'}
                    </span>
                  )}
                </div>
                <div style={{ height: 5, background: '#334155', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ 
                    width: strat.viable ? '100%' : '0%', 
                    height: '100%', 
                    background: strat.meta.color,
                    transition: 'width 0.4s ease'
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Portfolio Targets */}
        <div style={{ background: '#1e293b', padding: 20, borderRadius: 12, border: '1px solid #334155' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 15 }}>
            <Target size={16} color="#3b82f6" />
            <h3 style={{ fontSize: 13, textTransform: 'uppercase', margin: 0, color: '#3b82f6', fontWeight: 800, letterSpacing: '0.5px' }}>
              Portfolio Targets
            </h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {portfolioHealth.map((strat) => {
              const diff = strat.actual - strat.target;
              const isOver = diff > 5;
              const isUnder = diff < -5;
              return (
                <div key={strat.key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: strat.color || '#64748b' }} />
                    <span style={{ color: '#cbd5e1', fontSize: 12 }}>{strat.name}</span>
                  </div>
                  <div style={{ display: 'flex', gap: 8, color: '#94a3b8', fontSize: 12 }}>
                    <span style={{ fontWeight: 600 }}>{strat.actual.toFixed(1)}%</span>
                    <span style={{ color: isOver ? '#ef4444' : isUnder ? '#10b981' : '#64748b', fontWeight: 700 }}>
                      / {strat.target}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: PLAYER LIST */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#1e293b', borderRadius: 12, border: '1px solid #334155', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155', background: '#1e293b' }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
             <div>
               <h2 style={{ fontSize: 16, margin: 0, fontWeight: 800, color: '#fff' }}>Available Players</h2>
               <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>
                 Comparing against: <span style={{ color: '#f59e0b', fontWeight: 700 }}>{referenceStrategyName}</span>
               </div>
             </div>
             <div style={{ fontSize: 11, color: '#64748b', textAlign: 'right' }}>
               <div>Round {currentRound}</div>
               <div style={{ color: '#475569' }}>~{candidatePlayers.length} shown</div>
             </div>
           </div>
        </div>
        
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
            {candidatePlayers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
                No player data available for this round.<br/>
                <span style={{ fontSize: 12, color: '#475569' }}>Check if Master Players or ADP data is loaded.</span>
              </div>
            ) : (
              candidatePlayers.map(p => (
                  <PlayerCard 
                      key={p.name} 
                      player={p}
                      currentPicks={currentPicks}
                      onSelect={() => handleSelect(p)} 
                      stratName={referenceStrategyName}
                      debugOpen={debugPlayer === p.name}
                      setDebugOpen={(isOpen) => setDebugPlayer(isOpen ? p.name : null)}
                  />
              ))
            )}
        </div>
      </div>
    </div>
  );
}

// --- PLAYER CARD (MERGED) ---
function PlayerCard({ player, currentPicks = [], onSelect, stratName, debugOpen, setDebugOpen }) {
    const color = getPosColor(player.position);

    // Stack Analysis (upgraded)
    const stackInfo = analyzeStack(player, currentPicks);

    // Metrics
    const pathExp = player.portfolioExposure || 0;
    const stratExp = player.strategyExposure || 0;
    const globalExp = player.globalExposure || 0;
    const corr = player.correlationScore || 0;
    const killsStrategy = player.killsStrategy;

    // ADP Display
    const displayAdp = player.adpDisplay || (Number.isFinite(player.adpPick) ? player.adpPick.toFixed(1) : '—');

    // Correlation Color Coding (from V1)
    let corrColor = '#64748b'; // Gray
    if (currentPicks.length > 0) {
      if (corr > 25) corrColor = '#ef4444'; // Red (Very correlated, chalky)
      else if (corr > 15) corrColor = '#f59e0b'; // Orange
      else if (corr > 5) corrColor = '#fbbf24'; // Yellow
      else corrColor = '#10b981'; // Green (Unique)
    }

    // Helper for Debug
    const Row = ({ k, v }) => (
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 11, color: '#cbd5e1' }}>
        <div style={{ color: '#94a3b8' }}>{k}</div>
        <div style={{ fontFamily: 'monospace', color: '#e2e8f0' }}>{v ?? '—'}</div>
      </div>
    );

    return (
      <div style={{ marginBottom: 10 }}>
        <div
          onClick={onSelect}
          style={{
            display: 'grid',
            gridTemplateColumns: '240px 1fr auto',
            gap: 20,
            alignItems: 'center',
            background: '#0f172a',
            padding: '14px 16px',
            borderRadius: 10,
            borderLeft: `4px solid ${color}`,
            cursor: 'pointer',
            transition: 'all 0.15s',
            border: '1px solid #1e293b'
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#1e293b';
            e.currentTarget.style.borderColor = '#334155';
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = '#0f172a';
            e.currentTarget.style.borderColor = '#1e293b';
          }}
        >
          {/* Player Info */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <div style={{ 
              fontSize: 10, fontWeight: 900, color: '#0f172a', background: color, 
              padding: '3px 7px', borderRadius: 5, minWidth: 28, textAlign: 'center' 
            }}>
              {player.position || '??'}
            </div>

            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                <span style={{ 
                  fontWeight: 700, fontSize: 14, color: '#f1f5f9', 
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' 
                }}>
                  {player.name || 'Unknown Player'}
                </span>

                {stackInfo && (
                  <span style={{ 
                    fontSize: stackInfo.priority >= 90 ? 10 : 9,
                    background: stackInfo.priority >= 90 
                      ? `linear-gradient(135deg, ${stackInfo.color}22, ${stackInfo.color}33)` 
                      : `${stackInfo.color}22`,
                    color: stackInfo.color,
                    padding: stackInfo.priority >= 90 ? '4px 10px' : '3px 8px',
                    borderRadius: 6,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4,
                    fontWeight: stackInfo.priority >= 80 ? 800 : 600,
                    border: stackInfo.priority >= 90 ? `1.5px solid ${stackInfo.color}` : 'none',
                    boxShadow: stackInfo.priority >= 90 ? `0 0 12px ${stackInfo.color}44` : 'none',
                    animation: stackInfo.priority >= 100 ? 'pulse 2s infinite' : 'none'
                  }}>
                    {stackInfo.type}
                  </span>
                )}
              </div>

              <div style={{ fontSize: 11, color: '#64748b', display: 'flex', gap: 8, alignItems: 'center' }}>
                <span>{player.team || 'FA'}</span>
                <span>•</span>
                <span>ADP {displayAdp}</span>
              </div>

              {killsStrategy && (
                <div style={{ 
                  display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 4, 
                  color: '#ef4444', fontSize: 9, background: 'rgba(239,68,68,0.1)', 
                  padding: '3px 7px', borderRadius: 4, fontWeight: 700
                }}>
                  <AlertTriangle size={10} /> Limits Path
                </div>
              )}
            </div>
          </div>

          {/* Stats Grid - All 4 Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            
            {/* 1. Path Exposure */}
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600 }}>
                Path
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginBottom: 3 }}>
                <Users size={13} color={pathExp > 25 ? '#10b981' : pathExp > 10 ? '#f59e0b' : '#64748b'} />
                <span style={{ 
                  fontSize: 15, fontWeight: 800, 
                  color: pathExp > 25 ? '#10b981' : pathExp > 10 ? '#f59e0b' : '#94a3b8' 
                }}>
                  {Math.round(pathExp)}%
                </span>
              </div>
              <div style={{ fontSize: 10, color: '#475569' }}>{(player.matchCount || 0)} here</div>
            </div>

            {/* 2. Strategy Exposure */}
            <div style={{ textAlign: 'center', borderLeft: '1px solid #334155', paddingLeft: 12 }}>
              <div style={{ fontSize: 9, color: '#f59e0b', textTransform: 'uppercase', marginBottom: 6, fontWeight: 700 }}>
                {stratName ? stratName.split(' ')[0] : 'Strat'}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0', marginBottom: 3 }}>
                {Math.round(stratExp)}%
              </div>
              <div style={{ fontSize: 10, color: '#475569' }}>in strategy</div>
            </div>

            {/* 3. Correlation Score */}
            <div style={{ textAlign: 'center', borderLeft: '1px solid #334155', paddingLeft: 12 }}>
              <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600 }}>
                Correlation
              </div>
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <LinkIcon size={13} color={corrColor} />
                <div style={{ fontSize: 15, fontWeight: 800, color: corrColor }}>
                  {currentPicks.length > 0 ? Math.round(corr) + '%' : '—'}
                </div>
              </div>
              <div style={{ fontSize: 10, color: '#475569' }}>
                {corr < 5 && currentPicks.length > 0 ? 'unique' : currentPicks.length > 0 ? 'common' : 'n/a'}
              </div>
            </div>

            {/* 4. Global Exposure */}
            <div style={{ textAlign: 'center', borderLeft: '1px solid #334155', paddingLeft: 12 }}>
              <div style={{ fontSize: 9, color: '#64748b', textTransform: 'uppercase', marginBottom: 6, fontWeight: 600 }}>
                Global
              </div>
              <div style={{ fontSize: 15, fontWeight: 800, color: getGlobalExposureColor(globalExp), marginBottom: 3 }}>
                {Math.round(globalExp)}%
              </div>
              <div style={{ fontSize: 10, color: '#475569' }}>{(player.totalGlobalCount || 0)} total</div>
            </div>
          </div>

          {/* Debug Button */}
          <div>
            <button
              onClick={(e) => { 
                e.stopPropagation(); 
                setDebugOpen(!debugOpen); 
              }}
              style={{ 
                background: '#1e293b', color: '#94a3b8', border: '1px solid #334155', 
                padding: '7px 10px', borderRadius: 6, cursor: 'pointer', fontSize: 11, 
                fontWeight: 600, transition: 'all 0.2s'
              }}
              onMouseEnter={e => {
                e.currentTarget.style.background = '#334155';
                e.currentTarget.style.color = '#cbd5e1';
              }}
              onMouseLeave={e => {
                e.currentTarget.style.background = '#1e293b';
                e.currentTarget.style.color = '#94a3b8';
              }}
            >
              ?
            </button>
          </div>
        </div>

        {/* Debug Panel */}
        {debugOpen && (
          <div style={{ 
            background: '#020617', borderRadius: 8, padding: 14, marginTop: 6, 
            border: '1px solid #1e293b', fontSize: 12, color: '#cbd5e1' 
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
              <Row k="Name" v={player.name} />
              <Row k="Position" v={player.position} />
              <Row k="Team" v={player.team} />
              <Row k="ADP" v={player.adpPick?.toFixed(2)} />
            </div>
            <div style={{ borderTop: '1px solid #1e293b', paddingTop: 10, marginTop: 10 }}>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>Exposure Metrics</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Row k="Path Exposure" v={pathExp.toFixed(1) + '%'} />
                <Row k="Strategy Exposure" v={stratExp.toFixed(1) + '%'} />
                <Row k="Global Exposure" v={globalExp.toFixed(1) + '%'} />
                <Row k="Correlation" v={corr.toFixed(1) + '%'} />
                <Row k="In Matching Path" v={player.matchCount} />
                <Row k="Total Rosters" v={player.totalGlobalCount} />
              </div>
            </div>
            {stackInfo && (
              <div style={{ borderTop: '1px solid #1e293b', paddingTop: 10, marginTop: 10 }}>
                <div style={{ fontSize: 10, color: stackInfo.color, marginBottom: 8, textTransform: 'uppercase', fontWeight: 600 }}>Stack Analysis</div>
                <div style={{ marginBottom: 6 }}>
                  <span style={{ color: '#94a3b8', fontSize: 11 }}>Type: </span>
                  <span style={{ color: stackInfo.color, fontWeight: 700, fontSize: 11 }}>{stackInfo.type}</span>
                </div>
                <div style={{ fontSize: 11, color: '#94a3b8' }}>
                  <span style={{ color: '#64748b' }}>With: </span>
                  {stackInfo.teammates}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
}