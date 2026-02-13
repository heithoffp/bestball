import React, { useMemo, useState } from 'react';
import { Target, Zap, Users, GitBranch, Link as LinkIcon, Lock, AlertTriangle, TrendingUp, Shield, Anchor, Activity } from 'lucide-react';
import { PROTOCOL_TREE, ARCHETYPE_METADATA, classifyRosterPath } from '../utils/rosterArchetypes';

// --- EXTENDED CONFIGURATION: QB & TE ARCHETYPES (from V2) ---
const QB_META = {
  QB_ELITE: { name: 'Elite QB', target: 15, color: '#a855f7', rounds: [1, 4] },
  QB_CORE:  { name: 'Core QB', target: 25, color: '#d8b4fe', rounds: [5, 9] },
  QB_LATE:  { name: 'Late Round QB', target: 60, color: '#e9d5ff', rounds: [10, 18] }
};

const TE_META = {
  TE_ELITE: { name: 'Elite TE', target: 20, color: '#3b82f6', rounds: [1, 4] },
  TE_ANCHOR: { name: 'Anchor TE', target: 30, color: '#60a5fa', rounds: [5, 9] },
  TE_LATE:  { name: 'Late Round TE', target: 50, color: '#bfdbfe', rounds: [10, 18] }
};

// RB Archetype Reminder Blurbs
const RB_BLURBS = {
  RB_ZERO: {
    title: 'Zero RB Protocol',
    protocol: 'Absolute moratorium on RBs until Round 6; use early capital to lock in an Elite QB/TE and a massive WR advantage.',
    execution: 'Hammer "Ambiguous Backfield" RBs in Rounds 7–10 to find breakout starters through sheer volume.',
    constraint: 'If you miss on Elite QB/TE, this build often lacks the ceiling to win.'
  },
  RB_HYPER_FRAGILE: {
    title: 'Hyper Fragile Protocol',
    protocol: 'Draft 3 Elite RBs in the first 4 rounds, then enforce a hard stop on the position until Round 10+.',
    execution: 'Spend Rounds 5–9 exclusively on a high-upside "WR Avalanche" to catch up on pass-catcher depth.',
    constraint: 'Do not draft a "Value" RB in Round 6. You are playing for 3 healthy studs; a 4th RB is a wasted pick.'
  },
  RB_HERO: {
    title: 'Hero RB Protocol',
    protocol: 'Anchor with exactly one "Legendary" RB in Rounds 1–2, then pivot immediately to dominantly drafting WRs.',
    execution: 'Strictly avoid drafting your RB2 in the "Dead Zone" (Rounds 3–6); wait for the "Value Pocket" in Round 7+ to add depth.',
    constraint: 'This is a "Barbell" approach—balance your one elite RB with a deep WR room, not a "balanced" RB room.'
  }
};

// --- SHARED CONSTANTS ---
const COLORS = {
  QB: '#bf44ef', RB: '#10b981', WR: '#f59e0b', TE: '#3b82f6', default: '#6b7280'
};

const getPosColor = (pos) => COLORS[pos] || COLORS.default;

const getGlobalExposureColor = (percent) => {
  if (percent === 0) return '#3b82f6';
  if (percent > 30) return '#ef4444';
  if (percent >= 7 && percent <= 10) return '#10b981';
  if (percent < 8.333) return '#60a5fa';
  return '#f59e0b';
};

// --- STACK ANALYSIS (from V1) ---
const analyzeStack = (player, currentPicks) => {
  const team = player.team;
  if (!team || team === 'FA' || team === 'N/A') return null;

  const teammates = currentPicks.filter(p => p.team === team);
  if (teammates.length === 0) return null;

  const playerPos = player.position;
  const qbs = teammates.filter(p => p.position === 'QB');
  const wrs = teammates.filter(p => p.position === 'WR');
  const tes = teammates.filter(p => p.position === 'TE');
  const rbs = teammates.filter(p => p.position === 'RB');

  let stackType = '';
  let priority = 0;
  let color = '#64748b';
  let icon = '●';

  if (playerPos === 'QB' && (wrs.length > 0 || tes.length > 0)) {
    const passTargets = wrs.length + tes.length;
    if (passTargets >= 2) {
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
  } else if ((playerPos === 'WR' || playerPos === 'TE') && qbs.length > 0) {
    const passTargets = wrs.length + tes.length;
    if (passTargets >= 1) {
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
  } else if (playerPos === 'WR' && wrs.length >= 1) {
    stackType = `💎 WR OVERSTACK (${wrs.length + 1})`;
    priority = 80;
    color = '#06b6d4';
    icon = '💎';
  } else if (playerPos === 'TE' && tes.length >= 1) {
    stackType = `💎 TE OVERSTACK (${tes.length + 1})`;
    priority = 80;
    color = '#06b6d4';
    icon = '💎';
  } else if (playerPos === 'RB' && rbs.length >= 1) {
    stackType = `🔄 RB STACK (${rbs.length + 1})`;
    priority = 60;
    color = '#f59e0b';
    icon = '🔄';
  } else if (playerPos === 'RB' && (wrs.length > 0 || tes.length > 0)) {
    stackType = '○ Game Stack';
    priority = 40;
    color = '#64748b';
    icon = '○';
  } else if ((playerPos === 'WR' || playerPos === 'TE') && rbs.length > 0) {
    stackType = '○ Game Stack';
    priority = 40;
    color = '#64748b';
    icon = '○';
  } else {
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

// --- MULTI-DIMENSIONAL VIABILITY CHECKER (Enhanced from V2) ---
function checkStrategyViability(strategyKey, currentPicks, currentRound) {
  const countPos = (pos, start, end) => currentPicks.filter(p => {
      const r = p.round;
      return p.position === pos && r >= start && r <= end;
  }).length;

  // --- RB LOGIC ---
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
    if (rb1to2 > 1) return false;
    if (countPos('RB', 3, 6) > 0) return false;
    if (currentRound > 2 && rb1to2 === 0) return false;
    return true;
  }
  if (strategyKey === 'RB_VALUE') return true;

  // --- QB LOGIC (from V2) ---
  if (strategyKey === 'QB_ELITE') return countPos('QB', 1, 4) >= 1 || currentRound <= 4;
  if (strategyKey === 'QB_CORE')  return (countPos('QB', 1, 4) === 0 && countPos('QB', 5, 9) >= 1) || (countPos('QB', 1, 4) === 0 && currentRound <= 9);
  if (strategyKey === 'QB_LATE')  return countPos('QB', 1, 9) === 0;

  // --- TE LOGIC (from V2) ---
  if (strategyKey === 'TE_ELITE') return countPos('TE', 1, 4) >= 1 || currentRound <= 4;
  if (strategyKey === 'TE_ANCHOR') return (countPos('TE', 1, 4) === 0 && countPos('TE', 5, 9) >= 1) || (countPos('TE', 1, 4) === 0 && currentRound <= 9);
  if (strategyKey === 'TE_LATE')  return countPos('TE', 1, 9) === 0;

  return true;
}

// --- LOCAL CLASSIFIER FOR QB/TE (from V2) ---
const classifyStructure = (roster) => {
  let rbPath = 'RB_VALUE';
  try {
    rbPath = classifyRosterPath(roster).rb;
  } catch (e) { /* fallback */ }

  const countPos = (pos, start, end) => roster.filter(p => {
    const r = typeof p.round === 'string' ? parseInt(p.round.replace(/\D/g,'')) : p.round;
    return p.position === pos && r >= start && r <= end;
  }).length;

  let qbPath = 'QB_LATE';
  if (countPos('QB', 1, 4) > 0) qbPath = 'QB_ELITE';
  else if (countPos('QB', 5, 9) > 0) qbPath = 'QB_CORE';

  let tePath = 'TE_LATE';
  if (countPos('TE', 1, 4) > 0) tePath = 'TE_ELITE';
  else if (countPos('TE', 5, 9) > 0) tePath = 'TE_ANCHOR';

  return { rb: rbPath, qb: qbPath, te: tePath };
};

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
        .thin-scrollbar::-webkit-scrollbar { width: 6px; }
        .thin-scrollbar::-webkit-scrollbar-track { background: #1e293b; }
        .thin-scrollbar::-webkit-scrollbar-thumb { background: #475569; border-radius: 3px; }
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

  // --- 2. PLAYER INDEX MAP (from V1) ---
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

  // --- 5. STRATEGY STATUS (MULTI-DIMENSIONAL from V2) ---
  const strategyStatus = useMemo(() => {
    const checkGroup = (metaObj) => {
      const items = Object.keys(metaObj).map(key => ({
        key,
        name: metaObj[key].name,
        viable: checkStrategyViability(key, currentPicks, currentRound),
        meta: metaObj[key]
      }));
      const active = items.filter(i => i.viable);
      const locked = active.length === 1 ? active[0] : null;
      return { items, locked };
    };

    // RB Strategy - Gray out RB_VALUE after 3 picks
    const rbStatus = Object.keys(PROTOCOL_TREE).map(key => {
      let viable = checkStrategyViability(key, currentPicks, currentRound);
      
      // Gray out RB_VALUE after round 3 - archetype should be determined by then
      if (key === 'RB_VALUE' && currentPicks.length >= 3) {
        viable = false;
      }
      
      return {
        key,
        name: ARCHETYPE_METADATA[key]?.name || key,
        viable,
        meta: PROTOCOL_TREE[key]
      };
    });
    
    const strictRbActive = rbStatus.filter(s => s.viable && s.key !== 'RB_VALUE');
    const rbLocked = strictRbActive.length === 1 ? strictRbActive[0] : (strictRbActive.length === 0 ? rbStatus.find(s=>s.key === 'RB_VALUE') : null);

    // QB & TE Strategy
    const qbStatus = checkGroup(QB_META);
    const teStatus = checkGroup(TE_META);

    // Reference Strategy (for player comparison)
    const referenceStrategyKey = rbLocked ? rbLocked.key : 
        (rbStatus.find(s => s.viable && s.key === 'RB_HERO') ? 'RB_HERO' : 'RB_VALUE');

    // Strategy Pools
    const strategyPools = {
        RB_ZERO: [], RB_HERO: [], RB_HYPER_FRAGILE: [], RB_VALUE: []
    };
    
    allRosters.forEach(roster => {
        const path = classifyRosterPath(roster);
        if (strategyPools[path.rb]) strategyPools[path.rb].push(roster);
    });

    return {
      rb: { items: rbStatus, locked: rbLocked },
      qb: qbStatus,
      te: teStatus,
      referenceStrategyKey,
      referenceStrategyName: ARCHETYPE_METADATA[referenceStrategyKey]?.name,
      strategyPools
    };
  }, [currentPicks, currentRound, allRosters]);

  // --- 6. PORTFOLIO HEALTH (HIERARCHICAL from PROTOCOL_TREE) ---
  const portfolioHealth = useMemo(() => {
    const totalEntries = allRosters.length;
    if (totalEntries === 0) return { rb: [], qb: [], te: [], activePath: null };

    const counts = { rb: {}, qb: {}, te: {} };

    Object.keys(PROTOCOL_TREE).forEach(k => counts.rb[k] = 0);
    Object.keys(QB_META).forEach(k => counts.qb[k] = 0);
    Object.keys(TE_META).forEach(k => counts.te[k] = 0);

    allRosters.forEach(roster => {
      const struct = classifyStructure(roster);
      if (counts.rb[struct.rb] !== undefined) counts.rb[struct.rb]++;
      if (counts.qb[struct.qb] !== undefined) counts.qb[struct.qb]++;
      if (counts.te[struct.te] !== undefined) counts.te[struct.te]++;
    });

    const calcMetric = (key, name, target, count, color) => ({
      key, name, target, color,
      actual: (count / totalEntries) * 100
    });

    // Determine active path for target calculation
    const rbLocked = strategyStatus.rb.locked;
    const qbLocked = strategyStatus.qb.locked;
    const teLocked = strategyStatus.te.locked;

    // RB Level - Always use top-level PROTOCOL_TREE targets
    const rbMetrics = Object.keys(PROTOCOL_TREE).map(k => 
      calcMetric(k, ARCHETYPE_METADATA[k]?.name, PROTOCOL_TREE[k].target, counts.rb[k], PROTOCOL_TREE[k].color)
    );

    // QB Level - Use hierarchical targets if RB is locked
    let qbMetrics = [];
    let activePath = null;
    
    if (rbLocked) {
      const rbKey = rbLocked.key;
      const qbChildren = PROTOCOL_TREE[rbKey]?.children || {};
      
      qbMetrics = Object.keys(QB_META).map(qbKey => {
        const target = qbChildren[qbKey]?.target ?? 0;
        return calcMetric(qbKey, QB_META[qbKey].name, target, counts.qb[qbKey], QB_META[qbKey].color);
      });
      
      activePath = { rb: rbLocked.name };
      
      if (qbLocked) {
        activePath.qb = qbLocked.name;
      }
    } else {
      // RB not locked - show default QB targets from QB_META
      qbMetrics = Object.keys(QB_META).map(k => 
        calcMetric(k, QB_META[k].name, QB_META[k].target, counts.qb[k], QB_META[k].color)
      );
    }

    // TE Level - Use hierarchical targets if both RB and QB are locked
    let teMetrics = [];
    
    if (rbLocked && qbLocked) {
      const rbKey = rbLocked.key;
      const qbKey = qbLocked.key;
      const teChildren = PROTOCOL_TREE[rbKey]?.children?.[qbKey]?.children || {};
      
      teMetrics = Object.keys(TE_META).map(teKey => {
        const target = teChildren[teKey] ?? 0;
        return calcMetric(teKey, TE_META[teKey].name, target, counts.te[teKey], TE_META[teKey].color);
      });
      
      if (teLocked) {
        activePath.te = teLocked.name;
      }
    } else if (rbLocked) {
      // RB locked but QB not locked - show aggregated TE targets across all QB branches
      const rbKey = rbLocked.key;
      const qbChildren = PROTOCOL_TREE[rbKey]?.children || {};
      
      // Average the TE targets across all possible QB paths
      const teAggregates = {};
      Object.keys(TE_META).forEach(teKey => teAggregates[teKey] = []);
      
      Object.keys(qbChildren).forEach(qbKey => {
        const teChildren = qbChildren[qbKey]?.children || {};
        Object.keys(teChildren).forEach(teKey => {
          if (teAggregates[teKey]) {
            teAggregates[teKey].push(teChildren[teKey]);
          }
        });
      });
      
      teMetrics = Object.keys(TE_META).map(teKey => {
        const values = teAggregates[teKey];
        const avgTarget = values.length > 0 
          ? values.reduce((sum, val) => sum + val, 0) / values.length 
          : TE_META[teKey].target;
        return calcMetric(teKey, TE_META[teKey].name, avgTarget, counts.te[teKey], TE_META[teKey].color);
      });
    } else {
      // Neither RB nor QB locked - show default TE targets
      teMetrics = Object.keys(TE_META).map(k => 
        calcMetric(k, TE_META[k].name, TE_META[k].target, counts.te[k], TE_META[k].color)
      );
    }

    return {
      rb: rbMetrics,
      qb: qbMetrics,
      te: teMetrics,
      activePath
    };
  }, [allRosters, strategyStatus]);

  // --- 7. CANDIDATE PLAYERS (FULL V1 LOGIC) ---
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

    // D. Dynamic Window
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
      // 1. Path Exposure
      const pathPercent = matchingRosterTotal > 0 
        ? (candidate.matchCount / matchingRosterTotal) * 100 
        : 0;

      // 2. Strategy Exposure
      const inStrat = targetStratRosters.filter(r => r.some(x => x.name === candidate.name)).length;
      const stratPercent = targetStratTotal > 0 ? (inStrat / targetStratTotal) * 100 : 0;

      // 3. Global Exposure
      const globalPercent = totalRosters > 0 
        ? (candidate.totalGlobalCount / totalRosters) * 100 
        : 0;

      // 4. Correlation Score
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

      // 5. Kills Strategy Check (Multi-dimensional)
      let killsStrategy = false;
      const nextPicks = [...currentPicks, { ...candidate, round: currentRound, position: candidate.position }];
      
      // Check RB
      if (strategyStatus.rb.locked && candidate.position === 'RB') {
        if (!checkStrategyViability(strategyStatus.rb.locked.key, nextPicks, currentRound)) killsStrategy = true;
      }
      // Check QB
      if (strategyStatus.qb.locked && candidate.position === 'QB') {
        if (!checkStrategyViability(strategyStatus.qb.locked.key, nextPicks, currentRound)) killsStrategy = true;
      }
      // Check TE
      if (strategyStatus.te.locked && candidate.position === 'TE') {
        if (!checkStrategyViability(strategyStatus.te.locked.key, nextPicks, currentRound)) killsStrategy = true;
      }

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

  // --- SUB-COMPONENTS (from V2) ---
  
  const StrategyCard = ({ title, statusObj, icon: Icon }) => {
    const locked = statusObj.locked;
    const isLocked = !!locked;
    
    return (
      <div style={{ background: '#1e293b', borderRadius: 8, padding: '10px', marginBottom: 8, border: `1px solid ${isLocked ? locked.meta.color : '#334155'}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <Icon size={14} color={isLocked ? locked.meta.color : '#94a3b8'} />
            <span style={{ fontSize: 11, fontWeight: 700, color: '#e2e8f0', textTransform: 'uppercase' }}>{title}</span>
          </div>
          {isLocked ? (
             <span style={{ fontSize: 10, background: locked.meta.color, color: '#fff', padding: '2px 6px', borderRadius: 4, fontWeight: 700 }}>
               {locked.name}
             </span>
          ) : (
            <span style={{ fontSize: 10, color: '#64748b' }}>{statusObj.items.filter(i=>i.viable).length} paths</span>
          )}
        </div>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {statusObj.items.map(s => (
             <div key={s.key} style={{ 
               display: 'flex', alignItems: 'center', gap: 6, 
               opacity: s.viable ? 1 : 0.2,
               transition: 'all 0.3s'
             }}>
               <div style={{ flex: 1, height: 4, background: '#334155', borderRadius: 2 }}>
                 <div style={{ 
                   width: s.viable ? '100%' : '0%', 
                   height: '100%', 
                   background: s.meta.color, 
                   borderRadius: 2,
                   transition: 'width 0.3s'
                 }} />
               </div>
               <span style={{ fontSize: 9, width: 60, textAlign: 'right', color: s.viable ? '#cbd5e1' : '#475569' }}>
                 {s.name.replace('Round','').replace('Strategy','')}
               </span>
             </div>
          ))}
        </div>
      </div>
    );
  };

  const PortfolioRow = ({ item }) => {
    const diff = item.actual - item.target;
    const isHigh = diff > 5;
    const isLow = diff < -5;
    
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
           <div style={{ width: 6, height: 6, borderRadius: '50%', background: item.color }} />
           <span style={{ color: '#cbd5e1' }}>{item.name}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
           <span style={{ fontWeight: 700, color: isHigh ? '#ef4444' : isLow ? '#3b82f6' : '#94a3b8' }}>{item.actual.toFixed(1)}%</span>
           <span style={{ color: '#475569', marginLeft: 4 }}>/ {item.target}%</span>
        </div>
      </div>
    );
  };

  // --- ACTIONS ---
  const handleSelect = (player) => {
    setCurrentPicks([...currentPicks, { ...player, round: currentRound }]);
  };

  const handleUndo = () => {
    setCurrentPicks(prev => prev.slice(0, -1));
  };

  const slotNum = Number(draftSlot) || 1;
  const overallPick = (currentRound - 1) * 12 + slotNum;
  const { referenceStrategyName } = strategyStatus;

  return (
    <div style={{ display: 'flex', gap: 20, height: '130vh', fontFamily: 'sans-serif', color: '#e5e7eb', background: '#0f172a', padding: 20 }}>
      
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
        
        {/* CONSTRUCTION BOARD (from V2) */}
        <div style={{ background: '#1e293b22', borderRadius: 12, border: '1px solid #334155', padding: 12 }}>
           <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #334155' }}>
             <Activity size={16} color="#f59e0b" />
             <h3 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', color: '#f59e0b', fontWeight: 800 }}>Construction Board</h3>
           </div>
           
           <StrategyCard title="Rushing Structure" statusObj={strategyStatus.rb} icon={Shield} />
           <StrategyCard title="QB Approach" statusObj={strategyStatus.qb} icon={Zap} />
           <StrategyCard title="TE Approach" statusObj={strategyStatus.te} icon={Anchor} />
        </div>

        {/* PORTFOLIO TARGETS (Hierarchical from PROTOCOL_TREE) */}
        <div style={{ flex: 1, background: '#1e293b', borderRadius: 12, border: '1px solid #334155', padding: 16, overflowY: 'auto', maxHeight: 380 }} className="thin-scrollbar">
           <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
             <Target size={16} color="#3b82f6" />
             <h3 style={{ margin: 0, fontSize: 13, textTransform: 'uppercase', color: '#3b82f6', fontWeight: 800 }}>Portfolio Targets</h3>
           </div>
           
           {/* Active Path Indicator */}
           {portfolioHealth.activePath && (
             <div style={{ 
               fontSize: 10, 
               color: '#94a3b8', 
               marginBottom: 12, 
               padding: '8px 10px', 
               background: '#0f172a', 
               borderRadius: 6,
               borderLeft: '3px solid #3b82f6'
             }}>
               <div style={{ fontWeight: 700, color: '#cbd5e1', marginBottom: 4 }}>ACTIVE PATH:</div>
               <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                 <div>RB: <span style={{ color: '#f59e0b', fontWeight: 600 }}>{portfolioHealth.activePath.rb}</span></div>
                 {portfolioHealth.activePath.qb && (
                   <div>QB: <span style={{ color: '#a855f7', fontWeight: 600 }}>{portfolioHealth.activePath.qb}</span></div>
                 )}
                 {portfolioHealth.activePath.te && (
                   <div>TE: <span style={{ color: '#3b82f6', fontWeight: 600 }}>{portfolioHealth.activePath.te}</span></div>
                 )}
               </div>
             </div>
           )}

           <div style={{ marginBottom: 12 }}>
             <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>RB ALLOCATION</div>
             {portfolioHealth.rb?.map(i => <PortfolioRow key={i.key} item={i} />)}
           </div>
           
           <div style={{ marginBottom: 12 }}>
             <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
               QB ALLOCATION
               {!strategyStatus.rb.locked && <span style={{ color: '#475569', fontWeight: 400, marginLeft: 6 }}>(default)</span>}
             </div>
             {portfolioHealth.qb?.map(i => <PortfolioRow key={i.key} item={i} />)}
           </div>

           <div>
             <div style={{ fontSize: 10, fontWeight: 700, color: '#64748b', marginBottom: 4 }}>
               TE ALLOCATION
               {(!strategyStatus.rb.locked || !strategyStatus.qb.locked) && (
                 <span style={{ color: '#475569', fontWeight: 400, marginLeft: 6 }}>
                   {!strategyStatus.rb.locked && !strategyStatus.qb.locked ? '(default)' : '(avg)'}
                 </span>
               )}
             </div>
             {portfolioHealth.te?.map(i => <PortfolioRow key={i.key} item={i} />)}
           </div>
        </div>
        {/* Drafted Roster */}
        <div style={{ background: '#1e293b', borderRadius: 12, border: '1px solid #334155', display: 'flex', flexDirection: 'column', minHeight: 200, maxHeight: 280 }}>
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

          <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px' }} className="thin-scrollbar">
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
      </div>
      

      {/* RIGHT COLUMN: PLAYER LIST (Full V1 Logic) */}
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
        
        <div style={{ flex: 1, overflowY: 'auto', padding: 16 }} className="thin-scrollbar">
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
              {/* RB STRATEGY REMINDER - Shows when RB archetype is locked */}
        {strategyStatus.rb.locked && strategyStatus.rb.locked.key !== 'RB_VALUE' && RB_BLURBS[strategyStatus.rb.locked.key] && (
          <div style={{ 
            background: `linear-gradient(135deg, ${strategyStatus.rb.locked.meta.color}15, ${strategyStatus.rb.locked.meta.color}05)`,
            borderRadius: 12, 
            border: `2px solid ${strategyStatus.rb.locked.meta.color}`,
            padding: '16px',
            boxShadow: `0 0 20px ${strategyStatus.rb.locked.meta.color}33`
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <div style={{ 
                width: 8, 
                height: 8, 
                borderRadius: '50%', 
                background: strategyStatus.rb.locked.meta.color,
                boxShadow: `0 0 8px ${strategyStatus.rb.locked.meta.color}`
              }} />
              <h3 style={{ 
                margin: 0, 
                fontSize: 12, 
                fontWeight: 800, 
                color: strategyStatus.rb.locked.meta.color,
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                {RB_BLURBS[strategyStatus.rb.locked.key].title}
              </h3>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                  Protocol
                </div>
                <div style={{ fontSize: 11, color: '#e2e8f0', lineHeight: 1.5 }}>
                  {RB_BLURBS[strategyStatus.rb.locked.key].protocol}
                </div>
              </div>
              
              <div>
                <div style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                  Execution
                </div>
                <div style={{ fontSize: 11, color: '#e2e8f0', lineHeight: 1.5 }}>
                  {RB_BLURBS[strategyStatus.rb.locked.key].execution}
                </div>
              </div>
              
              <div style={{ 
                padding: '10px', 
                background: '#0f172a', 
                borderRadius: 8,
                borderLeft: '3px solid #ef4444'
              }}>
                <div style={{ fontSize: 9, color: '#ef4444', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase' }}>
                  ⚠️ Key Constraint
                </div>
                <div style={{ fontSize: 11, color: '#fca5a5', lineHeight: 1.5 }}>
                  {RB_BLURBS[strategyStatus.rb.locked.key].constraint}
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// --- PLAYER CARD (Full V1 Component) ---
function PlayerCard({ player, currentPicks = [], onSelect, stratName, debugOpen, setDebugOpen }) {
    const color = getPosColor(player.position);
    const stackInfo = analyzeStack(player, currentPicks);

    const pathExp = player.portfolioExposure || 0;
    const stratExp = player.strategyExposure || 0;
    const globalExp = player.globalExposure || 0;
    const corr = player.correlationScore || 0;
    const killsStrategy = player.killsStrategy;

    const displayAdp = player.adpDisplay || (Number.isFinite(player.adpPick) ? player.adpPick.toFixed(1) : '—');

    let corrColor = '#64748b';
    if (currentPicks.length > 0) {
      if (corr > 25) corrColor = '#ef4444';
      else if (corr > 15) corrColor = '#f59e0b';
      else if (corr > 5) corrColor = '#fbbf24';
      else corrColor = '#10b981';
    }

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

          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
            
            {/* Path Exposure */}
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

            {/* Strategy Exposure */}
            <div style={{ textAlign: 'center', borderLeft: '1px solid #334155', paddingLeft: 12 }}>
              <div style={{ fontSize: 9, color: '#f59e0b', textTransform: 'uppercase', marginBottom: 6, fontWeight: 700 }}>
                {stratName ? stratName.split(' ')[0] : 'Strat'}
              </div>
              <div style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0', marginBottom: 3 }}>
                {Math.round(stratExp)}%
              </div>
              <div style={{ fontSize: 10, color: '#475569' }}>in strategy</div>
            </div>

            {/* Correlation Score */}
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

            {/* Global Exposure */}
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