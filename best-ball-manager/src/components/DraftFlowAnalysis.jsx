import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Target, Zap, Users, GitBranch, Link as LinkIcon, Lock, AlertTriangle, TrendingUp, Shield, Anchor, Activity, Search, X } from 'lucide-react';
import { PROTOCOL_TREE, ARCHETYPE_METADATA, classifyRosterPath } from '../utils/rosterArchetypes';
import { analyzeStack } from '../utils/stackAnalysis';

// ADP delta: positive = I drafted later than current ADP (got value), negative = I drafted earlier (overpaid)
const getAdpDeltaColor = (delta) => {
  if (delta == null) return '#64748b';
  const t = Math.min(1, Math.abs(delta) / 12); // fully saturated at ±12 picks (~1 round)
  if (delta >= 0) {
    // neutral → green
    const r = Math.round(100 - t * 84);   // 100→16
    const g = Math.round(116 + t * 69);   // 116→185
    const b = Math.round(139 - t * 10);   // 139→129
    return `rgb(${r},${g},${b})`;
  } else {
    // neutral → red
    const r = Math.round(100 + t * 139);  // 100→239
    const g = Math.round(116 - t * 48);   // 116→68
    const b = Math.round(139 - t * 71);   // 139→68
    return `rgb(${r},${g},${b})`;
  }
};

// --- EXTENDED CONFIGURATION: QB & TE ARCHETYPES (from V2) ---
const QB_META = {
  QB_ELITE: { name: 'Elite QB', target: 15, color: '#a855f7', rounds: [1, 4] },
  QB_CORE:  { name: 'Core QB', target: 25, color: '#d8b4fe', rounds: [5, 8] },
  QB_LATE:  { name: 'Late Round QB', target: 60, color: '#e9d5ff', rounds: [9, 18] }
};

const TE_META = {
  TE_ELITE: { name: 'Elite TE', target: 20, color: '#3b82f6', rounds: [1, 4] },
  TE_ANCHOR: { name: 'Anchor TE', target: 30, color: '#60a5fa', rounds: [5, 8] },
  TE_LATE:  { name: 'Late Round TE', target: 50, color: '#bfdbfe', rounds: [9, 18] }
};

// RB Archetype Reminder Blurbs
const RB_BLURBS = {
  RB_ZERO: {
    title: 'Zero RB Protocol',
    protocol: 'Absolute moratorium on RBs until Round 7+; your draft must be dominated by WR volume and elite "onesie" positions.',
    execution: 'Draft 5-6 WRs and at least one Elite QB or TE before clicking your first RB. Target 6-7 total RBs.',
    constraint: 'If you take a "Value RB" in Round 5 or 6, you have compromised the structural advantage of the build.'
  },
  RB_HYPER_FRAGILE: {
    title: 'Hyper Fragile Protocol',
    protocol: 'Draft 3 Elite RBs in the first 5 rounds, then enforce a hard stop. You are betting on health and a total RB monopoly.',
    execution: 'Draft exactly 4 RBs. Use the saved roster spots to hammer 10 WRs and elite battery partners (QB/TE).',
    constraint: 'Drafting a 5th RB is a fatal error. If your top 3 fail, the roster is dead; if they hit, a 5th RB adds 0 ceiling.'
  },
  RB_HERO: {
    title: 'Hero RB Protocol',
    protocol: 'Anchor with exactly one "Legendary" RB in Rounds 1-2. No RB2 until the double-digit rounds.',
    execution: 'Spend Rounds 3-9 building a "Super-Room" of WRs. Aim for 5-6 total RBs, focusing on high-contingency upside.',
    constraint: 'Strictly avoid the RB "Dead Zone" (Rounds 3-6). Reaching for a mid-tier RB2 turns this into a failing "Balanced" build.'
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

// Stack analysis imported from ../utils/stackAnalysis.js

// --- MULTI-DIMENSIONAL VIABILITY CHECKER (Strict Top-0.1% Edition) ---
function checkStrategyViability(strategyKey, currentPicks, currentRound) {
  const countPos = (pos, start, end) => currentPicks.filter(p => {
      const r = p.round;
      return p.position === pos && r >= start && r <= end;
  }).length;

  const totalPos = (pos) => currentPicks.filter(p => p.position === pos).length;

  // --- RB LOGIC ---
  if (strategyKey === 'RB_HYPER_FRAGILE') {
    const rb1to4 = countPos('RB', 1, 4);
    // CRITICAL: Hard cap at 4 RBs total. If pick #5 is an RB, the strategy is dead.
    if (countPos('RB', 1, 18) > 4) return false;
    // Must secure 3 RBs by end of Round 5.
    if (currentRound > 4) return rb1to4 >= 3;
    // Check if it's still mathematically possible to get 3 RBs by Round 5.
    return (rb1to4 + (4 - (currentRound - 1))) >= 3;
  }

  if (strategyKey === 'RB_ZERO') {
    // Strict: Absolute moratorium on RBs until Round 6.
    return countPos('RB', 1, 5) === 0;
  }

  if (strategyKey === 'RB_HERO') {
    const rb1to3 = countPos('RB', 1, 3);
    // Must have exactly 1 RB in Rounds 1-2. No "Double Hero" allowed.
    if (rb1to3 > 1) return false;
    // The "Dead Zone" is now expanded: No RB2 until Round 7.
    if (countPos('RB', 3, 6) > 0) return false;
    // If we've finished Round 2 without an RB, we have defaulted to Zero RB.
    if (currentRound > 3 && rb1to3 === 0) return false;
    return true;
  }

  if (strategyKey === 'RB_BALANCED') return true;

  // --- QB LOGIC (Elite: 1-4, Core: 5-8, Late: 9+) ---
  if (strategyKey === 'QB_ELITE') {
    return countPos('QB', 1, 4) >= 1 || currentRound <= 4;
  }
  if (strategyKey === 'QB_CORE') {
    // Core QB strategy assumes you did NOT take an elite one.
    if (countPos('QB', 1, 4) > 0) return false;
    return countPos('QB', 5, 8) >= 1 || currentRound <= 8;
  }
  if (strategyKey === 'QB_LATE') {
    return countPos('QB', 1, 8) === 0;
  }

  // --- TE LOGIC (Elite: 1-4, Anchor: 5-8, Late: 9+) ---
  if (strategyKey === 'TE_ELITE') {
    return countPos('TE', 1, 4) >= 1 || currentRound <= 4;
  }
  if (strategyKey === 'TE_ANCHOR') {
    // Anchor TE strategy assumes you did NOT take an elite one.
    if (countPos('TE', 1, 4) > 0) return false;
    return countPos('TE', 5, 8) >= 1 || currentRound <= 8;
  }
  if (strategyKey === 'TE_LATE') {
    return countPos('TE', 1, 8) === 0;
  }

  return true;
}

// --- LOCAL CLASSIFIER FOR QB/TE (from V2) ---
const classifyStructure = (roster) => {
  let rbPath = 'RB_BALANCED';
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
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [rbReminderOpen, setRbReminderOpen] = useState(false);
  const playerListRef = useRef(null);
  const adpDividerRef = useRef(null);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput), 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  // Scroll player list to center the ADP divider after each pick
  useEffect(() => {
    requestAnimationFrame(() => {
      if (adpDividerRef.current && playerListRef.current) {
        const container = playerListRef.current;
        const divider = adpDividerRef.current;
        const dividerTop = divider.offsetTop - container.offsetTop;
        const scrollTarget = dividerTop - container.clientHeight / 2;
        container.scrollTo({ top: scrollTarget, behavior: 'smooth' });
      }
    });
  }, [currentPicks]);

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

    // RB Strategy - Gray out RB_BALANCED after 3 picks
    const rbStatus = Object.keys(PROTOCOL_TREE).map(key => {
      let viable = checkStrategyViability(key, currentPicks, currentRound);
      
      // Gray out RB_BALANCED after round 3 - archetype should be determined by then
      if (key === 'RB_BALANCED' && currentPicks.length >= 3) {
        viable = false;
      }
      
      return {
        key,
        name: ARCHETYPE_METADATA[key]?.name || key,
        viable,
        meta: PROTOCOL_TREE[key]
      };
    });
    
    const strictRbActive = rbStatus.filter(s => s.viable && s.key !== 'RB_BALANCED');
    const rbLocked = strictRbActive.length === 1 ? strictRbActive[0] : (strictRbActive.length === 0 ? rbStatus.find(s=>s.key === 'RB_BALANCED') : null);

    // QB & TE Strategy
    const qbStatus = checkGroup(QB_META);
    const teStatus = checkGroup(TE_META);

    // Reference Strategy (for player comparison)
    const referenceStrategyKey = rbLocked ? rbLocked.key : 
        (rbStatus.find(s => s.viable && s.key === 'RB_HERO') ? 'RB_HERO' : 'RB_BALANCED');

    // Strategy Pools
    const strategyPools = {
        RB_ZERO: [], RB_HERO: [], RB_HYPER_FRAGILE: [], RB_BALANCED: []
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

  // --- 7. MY AVG PICK MAP ---
  const myAvgPickMap = useMemo(() => {
    const buckets = new Map();
    rosterData.forEach(p => {
      const pick = Number(p.pick);
      if (!p.name || !Number.isFinite(pick)) return;
      if (!buckets.has(p.name)) buckets.set(p.name, []);
      buckets.get(p.name).push(pick);
    });
    const result = new Map();
    buckets.forEach((picks, name) => {
      result.set(name, picks.reduce((a, b) => a + b, 0) / picks.length);
    });
    return result;
  }, [rosterData]);

  // --- 8. CANDIDATE PLAYERS (FULL V1 LOGIC) ---
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

      // 4. Correlation Score (with per-pick breakdown)
      let sumProb = 0;
      let comparisons = 0;
      const correlationBreakdown = [];

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
            correlationBreakdown.push({
              name: pick.name,
              position: pick.position,
              round: pick.round,
              pGivenPick: prob,
              sharedCount: intersection,
              pickRosterCount: pickRosters.size
            });
          }
        });
      }

      const correlationScore = comparisons > 0 ? (sumProb / comparisons) * 100 : 0;
      const liftScore = globalPercent > 0 ? (correlationScore / globalPercent) : 0;
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

      const myAvgPick = myAvgPickMap.get(candidate.name) ?? null;
      const currentAdp = candidate._sortAdp;
      const adpDelta = (myAvgPick != null && Number.isFinite(currentAdp) && currentAdp !== Infinity)
        ? myAvgPick - currentAdp
        : null;

      const hist = (candidate.history || []).filter(h => Number.isFinite(h.adpPick));
      const adpTrend = hist.length >= 2 ? hist[hist.length - 1].adpPick - hist[0].adpPick : null;

      const isFallingKnife = adpDelta != null && adpTrend != null && adpDelta < -5 && adpTrend > 3;

      return {
        ...candidate,
        portfolioExposure: pathPercent,
        strategyExposure: stratPercent,
        globalExposure: globalPercent,
        liftScore,
        correlationScore,
        correlationBreakdown,
        killsStrategy,
        _sortAdp: candidate._sortAdp,
        myAvgPick,
        adpDelta,
        adpTrend,
        isFallingKnife
      };
    });

    // F. Final Sort
    finalCandidates.sort((a, b) => {
      if (a._sortAdp !== b._sortAdp) return a._sortAdp - b._sortAdp;
      return a.name.localeCompare(b.name);
    });

    return finalCandidates;
  }, [masterPlayers, allRosters, matchingPathRosters, currentRound, draftSlot, currentPicks, playerIndexMap, strategyStatus, myAvgPickMap]);

  // --- 8. SEARCH RESULTS (bypass ADP window, search full player list) ---
  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || !masterPlayers?.length) return [];

    const query = searchQuery.trim().toLowerCase();
    const globalPlayerCounts = new Map();
    allRosters.forEach(roster => {
      roster.forEach(p => {
        if (p.name) globalPlayerCounts.set(p.name, (globalPlayerCounts.get(p.name) || 0) + 1);
      });
    });

    const matchingRosterTotal = matchingPathRosters.length;
    const targetStratKey = strategyStatus.referenceStrategyKey;
    const targetStratRosters = strategyStatus.strategyPools[targetStratKey] || [];
    const targetStratTotal = targetStratRosters.length;
    const totalRosters = allRosters.length;

    // Search across all master players, not just the ADP window
    const matches = masterPlayers
      .filter(mp => mp.name?.toLowerCase().includes(query) && !currentPicks.some(cp => cp.name === mp.name))
      .slice(0, 25)
      .map(mp => {
        const adp = normalizeAdp(mp);
        const totalGlobalCount = globalPlayerCounts.get(mp.name) || 0;

        // Match count from path-matching rosters (any round)
        let matchCount = 0;
        matchingPathRosters.forEach(roster => {
          if (roster.some(p => p.name === mp.name)) matchCount++;
        });

        const pathPercent = matchingRosterTotal > 0 ? (matchCount / matchingRosterTotal) * 100 : 0;

        const inStrat = targetStratRosters.filter(r => r.some(x => x.name === mp.name)).length;
        const stratPercent = targetStratTotal > 0 ? (inStrat / targetStratTotal) * 100 : 0;

        const globalPercent = totalRosters > 0 ? (totalGlobalCount / totalRosters) * 100 : 0;

        const candidateRosters = playerIndexMap.get(mp.name) || new Set();
        let sumProb = 0, comparisons = 0;
        const correlationBreakdown = [];
        currentPicks.forEach(pick => {
          const pickRosters = playerIndexMap.get(pick.name) || new Set();
          if (pickRosters.size > 0) {
            let intersection = 0;
            if (pickRosters.size < candidateRosters.size) {
              pickRosters.forEach(rid => { if (candidateRosters.has(rid)) intersection++; });
            } else {
              candidateRosters.forEach(rid => { if (pickRosters.has(rid)) intersection++; });
            }
            const prob = intersection / pickRosters.size;
            sumProb += prob;
            comparisons++;
            correlationBreakdown.push({
              name: pick.name,
              position: pick.position,
              round: pick.round,
              pGivenPick: prob,
              sharedCount: intersection,
              pickRosterCount: pickRosters.size
            });
          }
        });
        const correlationScore = comparisons > 0 ? (sumProb / comparisons) * 100 : 0;
        const liftScore = globalPercent > 0 ? (correlationScore / globalPercent) : 0;

        let killsStrategy = false;
        const nextPicks = [...currentPicks, { ...mp, round: currentRound, position: mp.position }];
        if (strategyStatus.rb.locked && mp.position === 'RB') {
          if (!checkStrategyViability(strategyStatus.rb.locked.key, nextPicks, currentRound)) killsStrategy = true;
        }
        if (strategyStatus.qb.locked && mp.position === 'QB') {
          if (!checkStrategyViability(strategyStatus.qb.locked.key, nextPicks, currentRound)) killsStrategy = true;
        }
        if (strategyStatus.te.locked && mp.position === 'TE') {
          if (!checkStrategyViability(strategyStatus.te.locked.key, nextPicks, currentRound)) killsStrategy = true;
        }

        const myAvgPick = myAvgPickMap.get(mp.name) ?? null;
        const adpDelta = (myAvgPick != null && Number.isFinite(adp) && adp !== Infinity)
          ? myAvgPick - adp
          : null;
        const hist = (mp.history || []).filter(h => Number.isFinite(h.adpPick));
        const adpTrend = hist.length >= 2 ? hist[hist.length - 1].adpPick - hist[0].adpPick : null;
        const isFallingKnife = adpDelta != null && adpTrend != null && adpDelta < -5 && adpTrend > 3;

        return {
          ...mp,
          _sortAdp: adp,
          totalGlobalCount,
          matchCount,
          portfolioExposure: pathPercent,
          strategyExposure: stratPercent,
          globalExposure: globalPercent,
          liftScore,
          correlationScore,
          correlationBreakdown,
          killsStrategy,
          myAvgPick,
          adpDelta,
          adpTrend,
          isFallingKnife,
        };
      });

    matches.sort((a, b) => a._sortAdp - b._sortAdp);
    return matches;
  }, [searchQuery, masterPlayers, allRosters, matchingPathRosters, currentPicks, currentRound, playerIndexMap, strategyStatus, myAvgPickMap]);

  const displayPlayers = searchQuery.trim() ? searchResults : candidatePlayers;

  // --- SUB-COMPONENTS (from V2) ---
  
  const StrategyCard = ({ title, statusObj, icon: Icon }) => {
    const locked = statusObj.locked;
    const isLocked = !!locked;
    
    return (
      <div style={{ background: '#1e293b', borderRadius: 8, padding: '8px', marginBottom: 4, border: `1px solid ${isLocked ? locked.meta.color : '#334155'}` }}>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 14, marginBottom: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
           <div style={{ width: 7, height: 7, borderRadius: '50%', background: item.color }} />
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
  const snakePickPos = getSnakePickPosition(currentRound, slotNum, 12) || 1;
  const snakeOverallPick = (currentRound - 1) * 12 + snakePickPos;
  const { referenceStrategyName } = strategyStatus;

  return (
    <div style={{ display: 'flex', gap: 16, flex: 1, minHeight: 0, fontFamily: 'sans-serif', color: '#e5e7eb', background: '#0f172a', padding: '12px 16px' }}>
      
      {/* LEFT COLUMN */}
      <div style={{ width: '320px', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
        
        {/* Draft Controls + Strategy Status */}
        <div style={{ flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 8 }}>
             <div style={{ flex: 1, background: '#1e293b', padding: '12px', borderRadius: 8, border: '1px solid #334155' }}>
               <span style={{ fontSize: 13, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Draft Slot</span>
               <select
                 value={draftSlot}
                 onChange={e => setDraftSlot(Number(e.target.value))}
                 style={{ display: 'block', width: '100%', background: 'transparent', border: 'none', color: '#fff', fontWeight: 700, fontSize: 20, marginTop: 4, cursor: 'pointer' }}
               >
                 {Array.from({length:12},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}
               </select>
             </div>
             <div style={{ flex: 1, background: '#1e293b', padding: '12px', borderRadius: 8, border: '1px solid #334155', textAlign: 'center' }}>
               <div style={{ fontSize: 13, color: '#94a3b8', textTransform: 'uppercase', fontWeight: 600 }}>Current Pick</div>
               <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginTop: 4 }}>
                 {currentRound}.{snakeOverallPick}
               </div>
             </div>
          </div>

        </div>

        {/* PORTFOLIO TARGETS - commented out, archetypes removed from this component
        <div style={{ flex: 1, minHeight: 0, background: '#1e293b', borderRadius: 10, border: '1px solid #334155', padding: '10px 14px', overflowY: 'auto', display: 'flex', flexDirection: 'column' }} className="thin-scrollbar">
           <div style={{ marginBottom: 10, flexShrink: 0 }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
               <Target size={18} color="#94a3b8" />
               <h3 style={{ margin: 0, fontSize: 16, textTransform: 'uppercase', color: '#e2e8f0', fontWeight: 800 }}>Portfolio Targets</h3>
             </div>
             <div style={{ display: 'flex', gap: 6 }}>
               {[
                 { label: 'RB', statusObj: strategyStatus.rb, color: '#10b981' },
                 { label: 'QB', statusObj: strategyStatus.qb, color: '#bf44ef' },
                 { label: 'TE', statusObj: strategyStatus.te, color: '#3b82f6' }
               ].map(({ label, statusObj, color }) => {
                 const locked = statusObj.locked;
                 return (
                   <div key={label} style={{
                     flex: 1,
                     display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
                     background: locked ? `${color}18` : '#0f172a',
                     border: `1px solid ${locked ? color + '55' : '#334155'}`,
                     borderRadius: 5,
                     padding: '4px 6px',
                     transition: 'all 0.3s'
                   }}>
                     <span style={{ fontSize: 11, fontWeight: 800, color: color, opacity: locked ? 1 : 0.4 }}>{label}</span>
                     {locked ? (
                       <span style={{ fontSize: 11, fontWeight: 700, color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                         {locked.name}
                       </span>
                     ) : (
                       <span style={{ fontSize: 11, color: '#475569', whiteSpace: 'nowrap' }}>
                         {statusObj.items.filter(i => i.viable).length} open
                       </span>
                     )}
                   </div>
                 );
               })}
             </div>
           </div>
           <div style={{ flex: 1, minHeight: 0 }}>
             <div style={{ marginBottom: 10 }}>
               <div style={{ fontSize: 13, fontWeight: 700, color: '#10b981', marginBottom: 4 }}>RB ALLOCATION</div>
               {portfolioHealth.rb?.map(i => <PortfolioRow key={i.key} item={i} />)}
             </div>
             <div style={{ marginBottom: 10 }}>
               <div style={{ fontSize: 13, fontWeight: 700, color: '#bf44ef', marginBottom: 4 }}>
                 QB ALLOCATION
                 {!strategyStatus.rb.locked && <span style={{ color: '#475569', fontWeight: 400, marginLeft: 6 }}>(default)</span>}
               </div>
               {portfolioHealth.qb?.map(i => <PortfolioRow key={i.key} item={i} />)}
             </div>
             <div>
               <div style={{ fontSize: 13, fontWeight: 700, color: '#3b82f6', marginBottom: 4 }}>
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
        </div>
        */}
        {/* Drafted Roster */}
        <div style={{ background: '#1e293b', borderRadius: 10, border: '1px solid #334155', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #334155' }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, margin: '0 0 12px 0', color: '#fff', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Draft Board
            </h2>
            {currentPicks.length > 0 && (
              <div style={{ display: 'flex', gap: 8 }}>
                <button 
                  onClick={handleUndo} 
                  style={{ 
                    flex: 1, padding: '8px', background: '#334155',
                    color: '#cbd5e1', border: 'none', borderRadius: 6, cursor: 'pointer',
                    fontSize: 14, fontWeight: 600, transition: 'background 0.2s'
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
                    fontSize: 14, fontWeight: 600, transition: 'background 0.2s'
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
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 16, paddingBottom: 8, borderBottom: i < currentPicks.length - 1 ? '1px solid #334155' : 'none' }}>
                  <span style={{ color: getPosColor(p.position), fontWeight: 800, width: 32, fontSize: 14 }}>{p.position}</span>
                  <span style={{ color: '#64748b', fontSize: 14, width: 22 }}>{p.round}.</span>
                  <span style={{ fontWeight: 600, color: '#e2e8f0', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                </div>
              ))}
              {currentPicks.length === 0 && (
                <div style={{ color: '#475569', fontSize: 16, fontStyle: 'italic', textAlign: 'center', padding: 30 }}>
                  No picks yet...
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      

      {/* RIGHT COLUMN: PLAYER LIST (Full V1 Logic) */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column', background: '#1e293b', borderRadius: 10, border: '1px solid #334155', overflow: 'hidden' }}>
        <div style={{ padding: '10px 16px', borderBottom: '1px solid #334155', background: '#1e293b', flexShrink: 0 }}>
           <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
             <div>
               <h2 style={{ fontSize: 20, margin: 0, fontWeight: 800, color: '#fff' }}>Available Players</h2>
               {/* Comparing against archetype - commented out
               <div style={{ fontSize: 14, color: '#94a3b8', marginTop: 4 }}>
                 Comparing against: <span style={{ color: '#f59e0b', fontWeight: 700 }}>{referenceStrategyName}</span>
               </div>
               */}
             </div>
             <div style={{ fontSize: 14, color: '#64748b', textAlign: 'right' }}>
               <div>Round {currentRound}</div>
               <div style={{ color: '#475569' }}>~{displayPlayers.length} shown</div>
             </div>
           </div>
           <div style={{ position: 'relative' }}>
             <Search size={16} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#64748b' }} />
             <input
               type="text"
               value={searchInput}
               onChange={e => setSearchInput(e.target.value)}
               placeholder="Search all players..."
               style={{
                 width: '100%',
                 padding: '8px 32px 8px 32px',
                 background: '#0f172a',
                 border: '1px solid #334155',
                 borderRadius: 6,
                 color: '#e2e8f0',
                 fontSize: 16,
                 outline: 'none',
                 boxSizing: 'border-box',
               }}
               onFocus={e => e.currentTarget.style.borderColor = '#3b82f6'}
               onBlur={e => e.currentTarget.style.borderColor = '#334155'}
             />
             {searchInput && (
               <button
                 onClick={() => { setSearchInput(''); setSearchQuery(''); }}
                 style={{
                   position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                   background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex', alignItems: 'center',
                 }}
               >
                 <X size={14} color="#64748b" />
               </button>
             )}
           </div>
        </div>

        {/* Column headers — fixed above scrollable list */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '4px 27px',
          borderBottom: '1px solid #334155', flexShrink: 0, background: '#1e293b'
        }}>
          <div style={{ width: 350, minWidth: 0, flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: '#f1f5f9', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', cursor: 'help' }} title="Player name, position, and any relevant badges (stack type, strategy warnings, ADP trend)">Player</span>
          </div>
          <div style={{ width: 200, textAlign: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: '#f1f5f9', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', cursor: 'help' }} title="NFL team abbreviation">Team</span>
          </div>
          <div style={{ width: 55, textAlign: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: '#f1f5f9', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', cursor: 'help' }} title="Average Draft Position — the consensus pick number where this player is currently being drafted">ADP</span>
          </div>
          <div style={{ width: 90, textAlign: 'center', flexShrink: 0 }}>
            <span style={{ fontSize: 12, color: '#f1f5f9', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', cursor: 'help' }} title="Your average pick position for this player across your drafts. The +/- delta shows how your avg compares to current ADP (positive = value, negative = reach)">Avg</span>
          </div>
          {/* Divider */}
          <div style={{ width: 1, alignSelf: 'stretch', background: '#334155', flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
            <div style={{ textAlign: 'center', padding: '0 10px', minWidth: 70 }}>
              <span style={{ fontSize: 12, color: '#f1f5f9', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', cursor: 'help' }} title="Path Exposure — percentage of rosters matching your current draft path that include this player. Count shown in parentheses.">Path</span>
            </div>
            <div style={{ textAlign: 'center', padding: '0 10px', minWidth: 70, borderLeft: '1px solid #1e293b88' }}>
              <span style={{ fontSize: 12, color: '#f1f5f9', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', cursor: 'help' }} title="Lift Score — path exposure divided by global exposure. Values above 1.0 mean this player appears more often in rosters matching your strategy than in the general pool.">Lift</span>
            </div>
            <div style={{ textAlign: 'center', padding: '0 10px', minWidth: 110, borderLeft: '1px solid #1e293b88' }}>
              <span style={{ fontSize: 12, color: '#f1f5f9', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', cursor: 'help' }} title="Correlation Score — how often this player co-occurs with your current picks across all rosters. High = commonly paired together, low = unique/diversifying pick.">Correlation</span>
            </div>
            <div style={{ textAlign: 'center', padding: '0 10px', minWidth: 120, borderLeft: '1px solid #1e293b88' }}>
              <span style={{ fontSize: 12, color: '#f1f5f9', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.04em', cursor: 'help' }} title="Global Exposure — percentage of ALL rosters in your portfolio that include this player, regardless of strategy path. Count shown in parentheses.">Global Exposure</span>
            </div>
          </div>
          {/* Spacer for the overlap hover trigger area */}
          <div style={{ width: 70, flexShrink: 0 }} />
        </div>

        <div ref={playerListRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 12px' }} className="thin-scrollbar">
            {displayPlayers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 60, color: '#64748b' }}>
                {searchInput.trim() ? (
                  <>No players found matching "{searchInput}"<br/>
                  <span style={{ fontSize: 15, color: '#475569' }}>Try a different name or clear the search.</span></>
                ) : (
                  <>No player data available for this round.<br/>
                  <span style={{ fontSize: 15, color: '#475569' }}>Check if Master Players or ADP data is loaded.</span></>
                )}
              </div>
            ) : (
              displayPlayers.map((p, i) => {
                const prevAdp = i > 0 ? displayPlayers[i - 1]._sortAdp : -Infinity;
                const showDivider = !searchQuery.trim() &&
                  prevAdp < snakeOverallPick && p._sortAdp >= snakeOverallPick;

                return (
                  <React.Fragment key={p.name}>
                    {showDivider && (
                      <div ref={adpDividerRef} style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        margin: '6px 0', padding: '0 4px'
                      }}>
                        <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                          Before ADP
                        </div>
                        <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #3b82f6, #3b82f644)' }} />
                        <div style={{
                          fontSize: 11, fontWeight: 800, color: '#3b82f6',
                          background: '#3b82f618', padding: '3px 10px', borderRadius: 4,
                          border: '1px solid #3b82f644', whiteSpace: 'nowrap'
                        }}>
                          Pick {snakeOverallPick}
                        </div>
                        <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #3b82f644, #3b82f6)' }} />
                        <div style={{ fontSize: 11, color: '#64748b', whiteSpace: 'nowrap', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.5px' }}>
                          After ADP
                        </div>
                      </div>
                    )}
                    <PlayerCard
                        player={p}
                        currentPicks={currentPicks}
                        onSelect={() => handleSelect(p)}
                        stratName={referenceStrategyName}
                    />
                  </React.Fragment>
                );
              })
            )}
        </div>
              {/* RB STRATEGY REMINDER - Collapsible bar */}
        {strategyStatus.rb.locked && strategyStatus.rb.locked.key !== 'RB_BALANCED' && RB_BLURBS[strategyStatus.rb.locked.key] && (
          <div style={{ flexShrink: 0 }}>
            <div
              onClick={() => setRbReminderOpen(!rbReminderOpen)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px',
                background: `linear-gradient(135deg, ${strategyStatus.rb.locked.meta.color}15, ${strategyStatus.rb.locked.meta.color}08)`,
                borderTop: `1px solid ${strategyStatus.rb.locked.meta.color}44`,
                borderRadius: rbReminderOpen ? '0' : '0 0 10px 10px',
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'background 0.2s'
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: strategyStatus.rb.locked.meta.color,
                  boxShadow: `0 0 8px ${strategyStatus.rb.locked.meta.color}`
                }} />
                <span style={{ fontSize: 14, fontWeight: 700, color: strategyStatus.rb.locked.meta.color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {RB_BLURBS[strategyStatus.rb.locked.key].title}
                </span>
              </div>
              <span style={{ fontSize: 13, color: '#64748b', fontWeight: 600 }}>
                {rbReminderOpen ? 'Hide' : 'Show'}
              </span>
            </div>

            {rbReminderOpen && (
              <div style={{
                padding: '12px 14px',
                background: `${strategyStatus.rb.locked.meta.color}08`,
                borderTop: `1px solid ${strategyStatus.rb.locked.meta.color}22`,
                borderRadius: '0 0 10px 10px',
                maxHeight: 220,
                overflowY: 'auto'
              }} className="thin-scrollbar">
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, marginBottom: 3, textTransform: 'uppercase' }}>
                      Protocol
                    </div>
                    <div style={{ fontSize: 14, color: '#e2e8f0', lineHeight: 1.4 }}>
                      {RB_BLURBS[strategyStatus.rb.locked.key].protocol}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, marginBottom: 3, textTransform: 'uppercase' }}>
                      Execution
                    </div>
                    <div style={{ fontSize: 14, color: '#e2e8f0', lineHeight: 1.4 }}>
                      {RB_BLURBS[strategyStatus.rb.locked.key].execution}
                    </div>
                  </div>

                  <div style={{
                    padding: '8px',
                    background: '#0f172a',
                    borderRadius: 6,
                    borderLeft: '3px solid #ef4444'
                  }}>
                    <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 700, marginBottom: 3, textTransform: 'uppercase' }}>
                      Key Constraint
                    </div>
                    <div style={{ fontSize: 14, color: '#fca5a5', lineHeight: 1.4 }}>
                      {RB_BLURBS[strategyStatus.rb.locked.key].constraint}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

// --- PLAYER CARD (Full V1 Component) ---
function PlayerCard({ player, currentPicks = [], onSelect, stratName }) {
    const color = getPosColor(player.position);
    const stackInfo = analyzeStack(player, currentPicks);

    const pathExp = player.portfolioExposure || 0;
    const liftScore = player.liftScore || 0;
    const globalExp = player.globalExposure || 0;
    const corr = player.correlationScore || 0;
    const killsStrategy = player.killsStrategy;
    const breakdown = player.correlationBreakdown || [];
    const myAvgPick = player.myAvgPick ?? null;
    const adpDelta = player.adpDelta ?? null;
    const isFallingKnife = player.isFallingKnife ?? false;

    const adpDeltaColor = getAdpDeltaColor(adpDelta);

    const displayAdp = player.adpDisplay || (Number.isFinite(player.adpPick) ? player.adpPick.toFixed(1) : '—');

    let corrColor = '#64748b';
    if (currentPicks.length > 0) {
      if (corr > 25) corrColor = '#ef4444';
      else if (corr > 15) corrColor = '#f59e0b';
      else if (corr > 5) corrColor = '#fbbf24';
      else corrColor = '#10b981';
    }

    const getBarColor = (pct) => {
      if (pct > 25) return '#ef4444';
      if (pct > 15) return '#f59e0b';
      if (pct > 5) return '#fbbf24';
      return '#10b981';
    };
    const sorted = breakdown.length > 0 ? [...breakdown].sort((a, b) => a.round - b.round) : [];
    const lastName = (name) => {
      const parts = (name || '').split(' ');
      return parts.length > 1 ? parts[parts.length - 1] : name;
    };

    return (
      <div style={{ marginBottom: 4 }}>
        <div
          onClick={onSelect}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            background: '#0f172a',
            padding: '8px 12px',
            borderRadius: 6,
            borderLeft: `3px solid ${color}`,
            cursor: 'pointer',
            transition: 'all 0.15s',
            border: '1px solid #1e293b',
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
          {/* Identity: position + name + stack badge + warning badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 350, minWidth: 0, overflow: 'hidden', flexShrink: 0 }}>
            <div style={{
              fontSize: 12, fontWeight: 900, color: '#0f172a', background: color,
              padding: '2px 6px', borderRadius: 4, minWidth: 30, textAlign: 'center', lineHeight: 1.2, flexShrink: 0
            }}>
              {player.position || '??'}
            </div>
            <span style={{
              fontWeight: 700, fontSize: 15, color: '#f1f5f9',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
            }}>
              {player.name || 'Unknown Player'}
            </span>
            {stackInfo && (
              <span style={{
                fontSize: 11, flexShrink: 0,
                background: stackInfo.priority >= 90
                  ? `linear-gradient(135deg, ${stackInfo.color}22, ${stackInfo.color}33)`
                  : `${stackInfo.color}22`,
                color: stackInfo.color,
                padding: stackInfo.priority >= 90 ? '2px 6px' : '1px 5px',
                borderRadius: 4,
                display: 'inline-flex', alignItems: 'center', gap: 2,
                fontWeight: 700, lineHeight: 1.2, whiteSpace: 'nowrap',
                border: stackInfo.priority >= 90 ? `1.5px solid ${stackInfo.color}` : 'none',
                boxShadow: stackInfo.priority >= 90 ? `0 0 12px ${stackInfo.color}44` : 'none'
              }}>
                {stackInfo.type}
              </span>
            )}
            {/* Limits badge - commented out, archetypes removed
            {killsStrategy && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0,
                color: '#ef4444', fontSize: 11, background: 'rgba(239,68,68,0.1)',
                padding: '1px 5px', borderRadius: 3, fontWeight: 700, lineHeight: 1.2
              }}>
                <AlertTriangle size={11} /> Limits
              </div>
            )}
            */}
            {isFallingKnife && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 2, flexShrink: 0,
                color: '#f97316', fontSize: 11, background: 'rgba(249,115,22,0.1)',
                padding: '1px 5px', borderRadius: 3, fontWeight: 700, lineHeight: 1.2
              }}>
                <TrendingUp size={11} /> Falling
              </div>
            )}
          </div>

          {/* Team column */}
          <div style={{ width: 200, textAlign: 'center', flexShrink: 0, fontSize: 13, color: '#f1f5f9', fontWeight: 600, whiteSpace: 'nowrap' }}>
            {player.team || 'FA'}
          </div>

          {/* ADP column */}
          <div style={{ width: 55, textAlign: 'center', flexShrink: 0, fontSize: 13, color: '#f1f5f9', whiteSpace: 'nowrap' }}>
            {displayAdp}
          </div>

          {/* Avg + Delta column */}
          <div style={{ width: 90, textAlign: 'center', flexShrink: 0, fontSize: 13, color: '#f1f5f9', whiteSpace: 'nowrap' }}>
            {myAvgPick != null ? (
              <span>
                {myAvgPick.toFixed(1)}
                {adpDelta != null && (
                  <span style={{ color: adpDeltaColor, fontWeight: 600, marginLeft: 2 }}>
                    {adpDelta > 0 ? '+' : ''}{adpDelta.toFixed(1)}
                  </span>
                )}
              </span>
            ) : '—'}
          </div>

          {/* Divider */}
          <div style={{ width: 1, alignSelf: 'stretch', background: '#334155', margin: '2px 0', flexShrink: 0 }} />

          {/* Stats row — values only, headers are in the fixed row above */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0 }}>
            <div style={{ textAlign: 'center', padding: '0 10px', minWidth: 70 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 3 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: pathExp > 25 ? '#10b981' : pathExp > 10 ? '#f59e0b' : '#94a3b8' }}>
                  {Math.round(pathExp)}%
                </span>
                <span style={{ fontSize: 11, color: '#475569' }}>({player.matchCount || 0})</span>
              </div>
            </div>

            <div style={{ textAlign: 'center', padding: '0 10px', minWidth: 70, borderLeft: '1px solid #1e293b88' }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: '#e2e8f0' }}>
                {liftScore.toFixed(2)}
              </span>
            </div>

            <div style={{ textAlign: 'center', padding: '0 10px', minWidth: 110, borderLeft: '1px solid #1e293b88' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 3 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: corrColor }}>
                  {currentPicks.length > 0 ? Math.round(corr) + '%' : '—'}
                </span>
                <span style={{ fontSize: 11, color: '#475569' }}>
                  {corr < 5 && currentPicks.length > 0 ? 'unq' : currentPicks.length > 0 ? 'com' : ''}
                </span>
              </div>
            </div>

            <div style={{ textAlign: 'center', padding: '0 10px', minWidth: 120, borderLeft: '1px solid #1e293b88' }}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 3 }}>
                <span style={{ fontSize: 16, fontWeight: 800, color: getGlobalExposureColor(globalExp) }}>
                  {Math.round(globalExp)}%
                </span>
                <span style={{ fontSize: 11, color: '#475569' }}>({player.totalGlobalCount || 0})</span>
              </div>
            </div>
          </div>

          {/* Correlation Breakdown — hover popout */}
          {sorted.length > 0 && (
            <div
              style={{ position: 'relative', flexShrink: 0, marginLeft: 'auto' }}
              onMouseEnter={e => {
                const popup = e.currentTarget.querySelector('[data-popup]');
                if (popup) popup.style.display = 'block';
              }}
              onMouseLeave={e => {
                const popup = e.currentTarget.querySelector('[data-popup]');
                if (popup) popup.style.display = 'none';
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px',
                background: '#1e293b', borderRadius: 4, cursor: 'default',
                fontSize: 12, color: '#94a3b8', fontWeight: 600, whiteSpace: 'nowrap'
              }}
                onClick={e => e.stopPropagation()}
              >
                <LinkIcon size={12} color={corrColor} />
                <span>{sorted.length} picks</span>
              </div>

              <div data-popup style={{
                display: 'none', position: 'absolute', right: 0, top: '100%', marginTop: 4,
                background: '#0f172a', border: '1px solid #334155', borderRadius: 8,
                padding: '8px 0', zIndex: 50, minWidth: 220, maxWidth: 300,
                boxShadow: '0 8px 24px rgba(0,0,0,0.5)'
              }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ padding: '0 12px 6px', fontSize: 10, color: '#64748b', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>
                  Roster Overlap
                </div>
                {sorted.map((entry, i) => {
                  const pct = entry.pGivenPick * 100;
                  const barColor = getBarColor(pct);
                  const posColor = getPosColor(entry.position);
                  return (
                    <div key={entry.name + '-' + i} style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '4px 12px',
                    }}>
                      <span style={{
                        fontSize: 10, fontWeight: 900, color: '#0f172a', background: posColor,
                        padding: '1px 4px', borderRadius: 3, minWidth: 22, textAlign: 'center'
                      }}>
                        {entry.position}
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: '#e2e8f0', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {lastName(entry.name)}
                      </span>
                      <div style={{ width: 40, height: 5, background: '#1e293b', borderRadius: 3, overflow: 'hidden', flexShrink: 0 }}>
                        <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: barColor, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 11, fontWeight: 700, color: barColor, fontFamily: 'monospace', minWidth: 28, textAlign: 'right' }}>
                        {Math.round(pct)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    );
}