import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Target, Zap, Users, GitBranch, Link as LinkIcon, Lock, AlertTriangle, TrendingUp, Shield, Anchor, Activity, Search, X, ChevronDown, ChevronUp } from 'lucide-react';
import { PROTOCOL_TREE, ARCHETYPE_METADATA, classifyRosterPath } from '../utils/rosterArchetypes';
import { analyzeStack } from '../utils/stackAnalysis';
import useMediaQuery from '../hooks/useMediaQuery';
import styles from './DraftFlowAnalysis.module.css';
import { trackEvent } from '../utils/analytics';

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
    if (countPos('RB', 1, 18) > 4) return false;
    if (currentRound > 4) return rb1to4 >= 3;
    return (rb1to4 + (4 - (currentRound - 1))) >= 3;
  }

  if (strategyKey === 'RB_ZERO') {
    return countPos('RB', 1, 5) === 0;
  }

  if (strategyKey === 'RB_HERO') {
    const rb1to3 = countPos('RB', 1, 3);
    if (rb1to3 > 1) return false;
    if (countPos('RB', 3, 6) > 0) return false;
    if (currentRound > 3 && rb1to3 === 0) return false;
    return true;
  }

  if (strategyKey === 'RB_BALANCED') return true;

  // --- QB LOGIC (Elite: 1-4, Core: 5-8, Late: 9+) ---
  if (strategyKey === 'QB_ELITE') {
    return countPos('QB', 1, 4) >= 1 || currentRound <= 4;
  }
  if (strategyKey === 'QB_CORE') {
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
  useEffect(() => { trackEvent('draft_session_started'); }, []);

  const [currentPicks, setCurrentPicks] = useState([]);
  const [draftSlot, setDraftSlot] = useState(1);
  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [rbReminderOpen, setRbReminderOpen] = useState(false);
  const playerListRef = useRef(null);
  const adpDividerRef = useRef(null);

  // Mobile state
  const { isMobile, isTablet } = useMediaQuery();
  const [mobileSubView, setMobileSubView] = useState('players');
  const [expandedBreakdowns, setExpandedBreakdowns] = useState(new Set());
  const [draftToast, setDraftToast] = useState(null);

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

  // Toast auto-dismiss
  useEffect(() => {
    if (!draftToast) return;
    const timer = setTimeout(() => setDraftToast(null), 2000);
    return () => clearTimeout(timer);
  }, [draftToast]);

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

    // QB Level - Use conditional targets if RB is locked
    let qbMetrics;
    let activePath = null;

    if (rbLocked && PROTOCOL_TREE[rbLocked.key]?.children) {
      activePath = rbLocked.key;
      const children = PROTOCOL_TREE[rbLocked.key].children;
      qbMetrics = Object.keys(QB_META).map(qbKey => {
        const target = children[qbKey]?.target ?? QB_META[qbKey].target;
        return calcMetric(qbKey, QB_META[qbKey].name, target, counts.qb[qbKey], QB_META[qbKey].color);
      });
    } else {
      qbMetrics = Object.keys(QB_META).map(k =>
        calcMetric(k, QB_META[k].name, QB_META[k].target, counts.qb[k], QB_META[k].color)
      );
    }

    // TE Level - Use conditional targets if both RB and QB are locked
    let teMetrics;
    if (rbLocked && qbLocked && PROTOCOL_TREE[rbLocked.key]?.children?.[qbLocked.key]?.children) {
      const teChildren = PROTOCOL_TREE[rbLocked.key].children[qbLocked.key].children;
      teMetrics = Object.keys(TE_META).map(teKey => {
        const target = teChildren[teKey] ?? TE_META[teKey].target;
        return calcMetric(teKey, TE_META[teKey].name, target, counts.te[teKey], TE_META[teKey].color);
      });
    } else if (rbLocked && PROTOCOL_TREE[rbLocked.key]?.children) {
      // RB locked but QB not - average TE targets across QB paths
      const teAggregates = { TE_ELITE: [], TE_ANCHOR: [], TE_LATE: [] };
      const qbChildren = PROTOCOL_TREE[rbLocked.key].children;

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
    const dynamicWindow = 14 + (currentRound * 3);
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

  // --- SUB-COMPONENTS ---

  const StrategyCard = ({ title, statusObj, icon: Icon }) => {
    const locked = statusObj.locked;
    const isLocked = !!locked;

    return (
      <div className={styles.strategyCard} style={{ border: `1px solid ${isLocked ? locked.meta.color : '#334155'}` }}>
        <div className={styles.strategyCardHeader}>
          <div className={styles.strategyCardTitle}>
            <Icon size={14} color={isLocked ? locked.meta.color : '#94a3b8'} />
            <span className={styles.strategyCardLabel}>{title}</span>
          </div>
          {isLocked ? (
             <span className={styles.strategyLockedBadge} style={{ background: locked.meta.color }}>
               {locked.name}
             </span>
          ) : (
            <span className={styles.strategyPathCount}>{statusObj.items.filter(i=>i.viable).length} paths</span>
          )}
        </div>

        <div className={styles.strategyItems}>
          {statusObj.items.map(s => (
             <div key={s.key} className={styles.strategyItem} style={{ opacity: s.viable ? 1 : 0.2 }}>
               <div className={styles.strategyItemBar}>
                 <div className={styles.strategyItemFill} style={{
                   width: s.viable ? '100%' : '0%',
                   background: s.meta.color
                 }} />
               </div>
               <span className={styles.strategyItemName} style={{ color: s.viable ? '#cbd5e1' : '#475569' }}>
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
      <div className={styles.portfolioRow}>
        <div className={styles.portfolioRowLeft}>
           <div className={styles.portfolioDot} style={{ background: item.color }} />
           <span className={styles.portfolioName}>{item.name}</span>
        </div>
        <div style={{ textAlign: 'right' }}>
           <span style={{ fontWeight: 700, color: isHigh ? '#ef4444' : isLow ? '#3b82f6' : '#94a3b8' }}>{item.actual.toFixed(1)}%</span>
           <span className={styles.portfolioTarget}>/ {item.target}%</span>
        </div>
      </div>
    );
  };

  // --- ACTIONS ---
  const handleSelect = (player) => {
    setCurrentPicks([...currentPicks, { ...player, round: currentRound }]);
    if (isMobile) {
      setDraftToast({ name: player.name, position: player.position, round: currentRound });
    }
  };

  const handleUndo = () => {
    setCurrentPicks(prev => prev.slice(0, -1));
  };

  const toggleBreakdown = (playerName) => {
    setExpandedBreakdowns(prev => {
      const next = new Set(prev);
      if (next.has(playerName)) next.delete(playerName);
      else next.add(playerName);
      return next;
    });
  };

  const slotNum = Number(draftSlot) || 1;
  const overallPick = (currentRound - 1) * 12 + slotNum;
  const snakePickPos = getSnakePickPosition(currentRound, slotNum, 12) || 1;
  const snakeOverallPick = (currentRound - 1) * 12 + snakePickPos;
  const { referenceStrategyName } = strategyStatus;

  // --- RENDER FUNCTIONS ---

  const renderSegmentedControl = () => (
    <div className={styles.segmentedControl}>
      <button
        className={`${styles.segmentBtn} ${mobileSubView === 'board' ? styles.segmentActive : ''}`}
        onClick={() => setMobileSubView('board')}
      >
        Draft Board ({currentPicks.length})
      </button>
      <button
        className={`${styles.segmentBtn} ${mobileSubView === 'players' ? styles.segmentActive : ''}`}
        onClick={() => setMobileSubView('players')}
      >
        Available Players
      </button>
    </div>
  );

  const renderContextBar = () => (
    <div className={styles.contextBar}>
      <span>Round <strong style={{ color: '#e2e8f0' }}>{currentRound}</strong></span>
      <span>Pick <strong style={{ color: '#e2e8f0' }}>{currentRound}.{snakeOverallPick}</strong></span>
      <label className={styles.contextBarSlot}>
        Slot
        <select
          value={draftSlot}
          onChange={e => setDraftSlot(Number(e.target.value))}
          className={styles.contextBarSelect}
        >
          {Array.from({length:12},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}
        </select>
      </label>
      <span style={{ color: '#475569' }}>~{displayPlayers.length} players</span>
    </div>
  );

  const renderDraftControls = () => (
    <div style={{ flexShrink: 0 }}>
      <div className={styles.controlsRow}>
        <div className={styles.controlCard}>
          <span className={styles.controlLabel}>Draft Slot</span>
          <select
            value={draftSlot}
            onChange={e => setDraftSlot(Number(e.target.value))}
            className={styles.slotSelect}
          >
            {Array.from({length:12},(_,i)=>i+1).map(n=><option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className={styles.pickDisplay}>
          <div className={styles.controlLabel}>Current Pick</div>
          <div className={styles.pickNumber}>
            {currentRound}.{snakeOverallPick}
          </div>
        </div>
      </div>
    </div>
  );

  const renderDraftBoard = () => (
    <div className={styles.boardPanel}>
      <div className={styles.boardHeader}>
        <h2 className={styles.boardTitle}>Draft Board</h2>
        {currentPicks.length > 0 && (
          <div className={styles.buttonRow}>
            <button onClick={handleUndo} className={styles.actionButton}>
              Undo Last
            </button>
            <button onClick={() => setCurrentPicks([])} className={styles.actionButton}>
              Clear Draft
            </button>
          </div>
        )}
      </div>

      <div className={`${styles.rosterList} ${styles.scrollArea}`}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {currentPicks.map((p, i) => (
            <div key={i} className={`${styles.rosterItem} ${i < currentPicks.length - 1 ? styles.rosterItemBorder : ''}`}>
              <span className={styles.rosterPos} style={{ color: getPosColor(p.position) }}>{p.position}</span>
              <span className={styles.rosterRound}>{p.round}.</span>
              <span className={styles.rosterName}>{p.name}</span>
            </div>
          ))}
          {currentPicks.length === 0 && (
            <div className={styles.emptyState}>
              No picks yet...
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const renderPlayerListHeader = () => (
    <div className={styles.playerListHeader}>
      <div className={styles.headerTopRow}>
        <div>
          <h2 className={styles.headerTitle}>Available Players</h2>
        </div>
        {!isMobile && (
          <div className={styles.headerMeta}>
            <div>Round {currentRound}</div>
            <div className={styles.headerMetaSub}>~{displayPlayers.length} shown</div>
          </div>
        )}
      </div>
      <div className={styles.searchWrapper}>
        <Search size={16} className={styles.searchIcon} />
        <input
          type="text"
          value={searchInput}
          onChange={e => setSearchInput(e.target.value)}
          placeholder="Search all players..."
          className={styles.searchInput}
        />
        {searchInput && (
          <button
            onClick={() => { setSearchInput(''); setSearchQuery(''); }}
            className={styles.searchClear}
          >
            <X size={14} color="#64748b" />
          </button>
        )}
      </div>
    </div>
  );

  const renderColumnHeaders = () => (
    <div className={styles.columnHeaders}>
      <div className={styles.colPlayer}>
        <span className={styles.colHeader} title="Player name, position, and any relevant badges (stack type, strategy warnings, ADP trend)">Player</span>
      </div>
      <div className={styles.colTeam}>
        <span className={styles.colHeader} title="NFL team abbreviation">Team</span>
      </div>
      <div className={styles.colAdp}>
        <span className={styles.colHeader} title="Average Draft Position — the consensus pick number where this player is currently being drafted">ADP</span>
      </div>
      <div className={styles.colAvg}>
        <span className={styles.colHeader} title="Your average pick position for this player across your drafts. The +/- delta shows how your avg compares to current ADP (positive = value, negative = reach)">Avg</span>
      </div>
      <div className={styles.colDivider} />
      <div className={styles.statsHeaderRow}>
        <div className={`${styles.statHeaderCell} ${styles.colPath}`}>
          <span className={styles.colHeader} title="Path Exposure — percentage of rosters matching your current draft path that include this player. Count shown in parentheses.">Path</span>
        </div>
        <div className={`${styles.statHeaderCell} ${styles.statHeaderCellBorder} ${styles.colLift}`}>
          <span className={styles.colHeader} title="Lift Score — path exposure divided by global exposure. Values above 1.0 mean this player appears more often in rosters matching your strategy than in the general pool.">Lift</span>
        </div>
        <div className={`${styles.statHeaderCell} ${styles.statHeaderCellBorder} ${styles.colCorrelation}`}>
          <span className={styles.colHeader} title="Correlation Score — how often this player co-occurs with your current picks across all rosters. High = commonly paired together, low = unique/diversifying pick.">Correlation</span>
        </div>
        <div className={`${styles.statHeaderCell} ${styles.statHeaderCellBorder} ${styles.colGlobalExp}`}>
          <span className={styles.colHeader} title="Global Exposure — percentage of ALL rosters in your portfolio that include this player, regardless of strategy path. Count shown in parentheses.">Global Exposure</span>
        </div>
      </div>
      <div className={styles.colCorrSpacer} />
    </div>
  );

  const renderPlayerList = () => (
    <div ref={playerListRef} className={`${styles.playerList} ${styles.scrollArea}`}>
      {displayPlayers.length === 0 ? (
        <div className={styles.playerListEmpty}>
          {searchInput.trim() ? (
            <>No players found matching "{searchInput}"<br/>
            <span className={styles.playerListEmptySub}>Try a different name or clear the search.</span></>
          ) : (
            <>No player data available for this round.<br/>
            <span className={styles.playerListEmptySub}>Check if Master Players or ADP data is loaded.</span></>
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
                <div ref={adpDividerRef} className={styles.adpDivider}>
                  <div className={styles.adpDividerLabel}>Before ADP</div>
                  <div className={styles.adpDividerLineLeft} />
                  <div className={styles.adpDividerPick}>Pick {snakeOverallPick}</div>
                  <div className={styles.adpDividerLineRight} />
                  <div className={styles.adpDividerLabel}>After ADP</div>
                </div>
              )}
              <PlayerCard
                player={p}
                currentPicks={currentPicks}
                onSelect={() => handleSelect(p)}
                stratName={referenceStrategyName}
                isMobile={isMobile}
                isExpanded={expandedBreakdowns.has(p.name)}
                onToggleBreakdown={() => toggleBreakdown(p.name)}
              />
            </React.Fragment>
          );
        })
      )}
    </div>
  );

  const renderRbReminder = () => {
    if (!strategyStatus.rb.locked || strategyStatus.rb.locked.key === 'RB_BALANCED' || !RB_BLURBS[strategyStatus.rb.locked.key]) {
      return null;
    }

    const lockedColor = strategyStatus.rb.locked.meta.color;
    const blurb = RB_BLURBS[strategyStatus.rb.locked.key];

    return (
      <div style={{ flexShrink: 0 }}>
        <div
          onClick={() => setRbReminderOpen(!rbReminderOpen)}
          className={styles.reminderBar}
          style={{
            background: `linear-gradient(135deg, ${lockedColor}15, ${lockedColor}08)`,
            borderTop: `1px solid ${lockedColor}44`,
            borderRadius: rbReminderOpen ? '0' : '0 0 10px 10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div className={styles.reminderDot} style={{ background: lockedColor, boxShadow: `0 0 8px ${lockedColor}` }} />
            <span className={styles.reminderTitle} style={{ color: lockedColor }}>
              {blurb.title}
            </span>
          </div>
          <span className={styles.reminderToggle}>
            {rbReminderOpen ? 'Hide' : 'Show'}
          </span>
        </div>

        {rbReminderOpen && (
          <div
            className={`${styles.reminderContent} ${styles.scrollArea}`}
            style={{
              background: `${lockedColor}08`,
              borderTop: `1px solid ${lockedColor}22`,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div>
                <div className={styles.reminderSectionLabel}>Protocol</div>
                <div className={styles.reminderSectionText}>{blurb.protocol}</div>
              </div>
              <div>
                <div className={styles.reminderSectionLabel}>Execution</div>
                <div className={styles.reminderSectionText}>{blurb.execution}</div>
              </div>
              <div className={styles.reminderConstraint}>
                <div className={styles.reminderConstraintLabel}>Key Constraint</div>
                <div className={styles.reminderConstraintText}>{blurb.constraint}</div>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  const renderToast = () => (
    <div className={styles.toast}>
      <div className={styles.posBadge} style={{ background: getPosColor(draftToast.position) }}>
        {draftToast.position}
      </div>
      <span>Drafted <span className={styles.toastName}>{draftToast.name}</span> (R{draftToast.round})</span>
    </div>
  );

  // Mobile-specific view renderers
  const renderBoardView = () => (
    <div className={styles.boardViewMobile}>
      {renderDraftControls()}
      {renderDraftBoard()}
      {renderRbReminder()}
    </div>
  );

  const renderPlayersView = () => (
    <div className={styles.playersViewMobile}>
      {renderPlayerListHeader()}
      {renderPlayerList()}
      {renderRbReminder()}
    </div>
  );

  // --- MAIN RENDER ---
  return (
    <div className={styles.root}>
      {isMobile && renderSegmentedControl()}
      {isMobile && renderContextBar()}

      {isMobile ? (
        mobileSubView === 'board' ? renderBoardView() : renderPlayersView()
      ) : (
        <>
          <div className={styles.leftColumn}>
            {renderDraftControls()}
            {renderDraftBoard()}
          </div>
          <div className={styles.rightColumn}>
            {renderPlayerListHeader()}
            {renderColumnHeaders()}
            {renderPlayerList()}
            {renderRbReminder()}
          </div>
        </>
      )}

      {isMobile && draftToast && renderToast()}
    </div>
  );
}

// --- PLAYER CARD ---
function PlayerCard({ player, currentPicks = [], onSelect, stratName, isMobile = false, isExpanded = false, onToggleBreakdown }) {
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

    // --- MOBILE CARD ---
    if (isMobile) {
      return (
        <div className={styles.mobilePlayerCard} style={{ borderLeft: `3px solid ${color}` }} onClick={onSelect}>
          {/* Line 1: Identity */}
          <div className={styles.mobileCardLine1}>
            <div className={styles.posBadge} style={{ background: color }}>
              {player.position || '??'}
            </div>
            <span className={styles.mobilePlayerName}>
              {player.name || 'Unknown Player'}
            </span>
            {stackInfo && (
              <span className={styles.stackBadge} style={{
                color: stackInfo.color,
                background: stackInfo.priority >= 90
                  ? `linear-gradient(135deg, ${stackInfo.color}22, ${stackInfo.color}33)`
                  : `${stackInfo.color}22`,
                border: stackInfo.priority >= 90 ? `1.5px solid ${stackInfo.color}` : 'none',
                boxShadow: stackInfo.priority >= 90 ? `0 0 12px ${stackInfo.color}44` : 'none',
              }}>
                {stackInfo.type}
              </span>
            )}
            {isFallingKnife && (
              <span className={styles.fallingBadge}>
                <TrendingUp size={11} /> Falling
              </span>
            )}
            {sorted.length > 0 && (
              <button
                className={styles.mobileBreakdownToggle}
                onClick={e => { e.stopPropagation(); onToggleBreakdown(); }}
              >
                {isExpanded ? <ChevronUp size={14} color={corrColor} /> : <ChevronDown size={14} color={corrColor} />}
              </button>
            )}
          </div>

          {/* Line 2: Team + ADP + Avg */}
          <div className={styles.mobileCardLine2}>
            <span>{player.team || 'FA'}</span>
            <span style={{ color: '#e2e8f0' }}>ADP {displayAdp}</span>
            <span>
              {myAvgPick != null ? (
                <>
                  Avg {myAvgPick.toFixed(1)}
                  {adpDelta != null && (
                    <span style={{ color: adpDeltaColor, fontWeight: 600, marginLeft: 2 }}>
                      {adpDelta > 0 ? '+' : ''}{adpDelta.toFixed(1)}
                    </span>
                  )}
                </>
              ) : '—'}
            </span>
          </div>

          {/* Line 3: Stats grid */}
          <div className={styles.mobileCardLine3}>
            <div>
              <div className={styles.mobileStatLabel}>Path</div>
              <div className={styles.mobileStatValue} style={{ color: pathExp > 25 ? '#10b981' : pathExp > 10 ? '#f59e0b' : '#94a3b8' }}>
                {Math.round(pathExp)}%
              </div>
            </div>
            <div>
              <div className={styles.mobileStatLabel}>Lift</div>
              <div className={styles.mobileStatValue} style={{ color: '#e2e8f0' }}>
                {liftScore.toFixed(2)}
              </div>
            </div>
            <div>
              <div className={styles.mobileStatLabel}>Corr</div>
              <div className={styles.mobileStatValue} style={{ color: corrColor }}>
                {currentPicks.length > 0 ? Math.round(corr) + '%' : '—'}
              </div>
            </div>
            <div>
              <div className={styles.mobileStatLabel}>Global</div>
              <div className={styles.mobileStatValue} style={{ color: getGlobalExposureColor(globalExp) }}>
                {Math.round(globalExp)}%
              </div>
            </div>
          </div>

          {/* Correlation Breakdown (collapsible) */}
          {isExpanded && sorted.length > 0 && (
            <div className={styles.mobileBreakdown} onClick={e => e.stopPropagation()}>
              <div className={styles.mobileBreakdownTitle}>Roster Overlap</div>
              {sorted.map((entry, i) => {
                const pct = entry.pGivenPick * 100;
                const barColor = getBarColor(pct);
                const posColor = getPosColor(entry.position);
                return (
                  <div key={entry.name + '-' + i} className={styles.corrPopupRow}>
                    <span className={styles.corrPopupPos} style={{ background: posColor }}>
                      {entry.position}
                    </span>
                    <span className={styles.corrPopupName}>
                      {lastName(entry.name)}
                    </span>
                    <div className={styles.corrPopupBar}>
                      <div className={styles.corrPopupBarFill} style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
                    </div>
                    <span className={styles.corrPopupPct} style={{ color: barColor }}>
                      {Math.round(pct)}%
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      );
    }

    // --- DESKTOP CARD ---
    return (
      <div style={{ marginBottom: 4 }}>
        <div
          onClick={onSelect}
          className={styles.playerCard}
          style={{ borderLeft: `3px solid ${color}` }}
        >
          {/* Identity: position + name + stack badge + warning badges */}
          <div className={styles.playerIdentity}>
            <div className={styles.posBadge} style={{ background: color }}>
              {player.position || '??'}
            </div>
            <span className={styles.playerName}>
              {player.name || 'Unknown Player'}
            </span>
            {stackInfo && (
              <span
                className={`${styles.stackBadge} ${stackInfo.priority >= 90 ? styles.stackBadgeElite : ''}`}
                style={{
                  background: stackInfo.priority >= 90
                    ? `linear-gradient(135deg, ${stackInfo.color}22, ${stackInfo.color}33)`
                    : `${stackInfo.color}22`,
                  color: stackInfo.color,
                  borderColor: stackInfo.priority >= 90 ? stackInfo.color : undefined,
                  boxShadow: stackInfo.priority >= 90 ? `0 0 12px ${stackInfo.color}44` : 'none'
                }}
              >
                {stackInfo.type}
              </span>
            )}
            {isFallingKnife && (
              <div className={styles.fallingBadge}>
                <TrendingUp size={11} /> Falling
              </div>
            )}
          </div>

          {/* Team column */}
          <div className={styles.teamCol}>
            {player.team || 'FA'}
          </div>

          {/* ADP column */}
          <div className={styles.adpCol}>
            {displayAdp}
          </div>

          {/* Avg + Delta column */}
          <div className={styles.avgCol}>
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
          <div className={styles.statsDivider} />

          {/* Stats row */}
          <div className={styles.statsRow}>
            <div className={`${styles.statCell} ${styles.colPath}`}>
              <div className={styles.statValueRow}>
                <span className={styles.statValue} style={{ color: pathExp > 25 ? '#10b981' : pathExp > 10 ? '#f59e0b' : '#94a3b8' }}>
                  {Math.round(pathExp)}%
                </span>
                <span className={styles.statSub}>({player.matchCount || 0})</span>
              </div>
            </div>

            <div className={`${styles.statCell} ${styles.statCellBorder} ${styles.colLift}`}>
              <span className={styles.statValue} style={{ color: '#e2e8f0' }}>
                {liftScore.toFixed(2)}
              </span>
            </div>

            <div className={`${styles.statCell} ${styles.statCellBorder} ${styles.colCorrelation}`}>
              <div className={styles.statValueRow}>
                <span className={styles.statValue} style={{ color: corrColor }}>
                  {currentPicks.length > 0 ? Math.round(corr) + '%' : '—'}
                </span>
                <span className={styles.statSub}>
                  {corr < 5 && currentPicks.length > 0 ? 'unq' : currentPicks.length > 0 ? 'com' : ''}
                </span>
              </div>
            </div>

            <div className={`${styles.statCell} ${styles.statCellBorder} ${styles.colGlobalExp}`}>
              <div className={styles.statValueRow}>
                <span className={styles.statValue} style={{ color: getGlobalExposureColor(globalExp) }}>
                  {Math.round(globalExp)}%
                </span>
                <span className={styles.statSub}>({player.totalGlobalCount || 0})</span>
              </div>
            </div>
          </div>

          {/* Correlation Breakdown — hover popout (desktop only) */}
          {sorted.length > 0 && (
            <div className={styles.corrTrigger}>
              <div className={styles.corrTriggerBtn} onClick={e => e.stopPropagation()}>
                <LinkIcon size={12} color={corrColor} />
                <span>{sorted.length} picks</span>
              </div>

              <div className={styles.corrPopup} onClick={e => e.stopPropagation()}>
                <div className={styles.corrPopupTitle}>Roster Overlap</div>
                {sorted.map((entry, i) => {
                  const pct = entry.pGivenPick * 100;
                  const barColor = getBarColor(pct);
                  const posColor = getPosColor(entry.position);
                  return (
                    <div key={entry.name + '-' + i} className={styles.corrPopupRow}>
                      <span className={styles.corrPopupPos} style={{ background: posColor }}>
                        {entry.position}
                      </span>
                      <span className={styles.corrPopupName}>
                        {lastName(entry.name)}
                      </span>
                      <div className={styles.corrPopupBar}>
                        <div className={styles.corrPopupBarFill} style={{ width: `${Math.min(pct, 100)}%`, background: barColor }} />
                      </div>
                      <span className={styles.corrPopupPct} style={{ color: barColor }}>
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
