// DraftAssistantView — mobile port of DraftFlowAnalysis.jsx, the app's one
// deliberately opinionated surface. Manual pick entry drives a live model:
// multi-dimensional strategy viability (RB/QB/TE), candidate metrics (path /
// strategy / global exposure, correlation with picks so far), stack + playoff
// stack flags, falling-knife warnings, and the Eliminator bye rainbow.
// A capture session from the on-device OCR engine (mobile-app/modules, ADR-021)
// can drive the same screen through src/draft/draftFeed.js.
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, ScrollView } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Target, Zap, Anchor, TriangleAlert, CalendarDays, Radio } from 'lucide-react-native';
import { PROTOCOL_TREE, ARCHETYPE_METADATA, classifyRosterPath } from '../../shared/utils/rosterArchetypes';
import { analyzeStack } from '../../shared/utils/stackAnalysis';
import { analyzeCandidatePlayoffStack } from '../../shared/utils/playoffStacks';
import { analyzeByeRainbow } from '../../shared/utils/eliminatorModel';
import playoffSchedule from '../../shared/data/playoff-schedule-2026.json';
import { trackEvent } from '../../shared/utils/analytics';
import { canonicalName } from '../../shared/utils/helpers';
import TournamentFilter from '../components/TournamentFilter';
import { SearchBar, Segmented } from '../components/ui';
import { colors, spacing, radii, type } from '../theme';
import { usePortfolio } from '../contexts/PortfolioContext';
import { subscribeDraftFeed, isDraftFeedActive } from '../draft/draftFeed';
import LiveSessionPanel from './LiveSessionPanel';

const ELIMINATOR_MODE_KEY = 'bbe.eliminatorMode';

const getAdpDeltaColor = (delta) => {
  if (delta == null) return '#64748b';
  const t = Math.min(1, Math.abs(delta) / 12);
  if (delta >= 0) {
    const r = Math.round(100 - t * 84);
    const g = Math.round(116 + t * 69);
    const b = Math.round(139 - t * 10);
    return `rgb(${r},${g},${b})`;
  } else {
    const r = Math.round(100 + t * 139);
    const g = Math.round(116 - t * 48);
    const b = Math.round(139 - t * 71);
    return `rgb(${r},${g},${b})`;
  }
};

const QB_META = {
  QB_ELITE: { name: 'Elite QB', color: '#a855f7', rounds: [1, 4] },
  QB_CORE:  { name: 'Core QB', color: '#d8b4fe', rounds: [5, 8] },
  QB_LATE:  { name: 'Late Round QB', color: '#e9d5ff', rounds: [9, 18] },
};

const TE_META = {
  TE_ELITE: { name: 'Elite TE', color: '#3b82f6', rounds: [1, 4] },
  TE_ANCHOR: { name: 'Anchor TE', color: '#60a5fa', rounds: [5, 8] },
  TE_LATE:  { name: 'Late Round TE', color: '#bfdbfe', rounds: [9, 18] },
};

const COLORS = { QB: '#bf44ef', RB: '#10b981', WR: '#f59e0b', TE: '#3b82f6', default: '#6b7280' };
const getPosColor = (pos) => COLORS[pos] || COLORS.default;

const getGlobalExposureColor = (percent) => {
  if (percent === 0) return '#3b82f6';
  if (percent > 30) return '#ef4444';
  if (percent >= 7 && percent <= 10) return '#10b981';
  if (percent < 8.333) return '#60a5fa';
  return '#f59e0b';
};

// --- Multi-dimensional viability checker (verbatim port) ---
function checkStrategyViability(strategyKey, currentPicks, currentRound) {
  const countPos = (pos, start, end) => currentPicks.filter(p => {
    const r = p.round;
    return p.position === pos && r >= start && r <= end;
  }).length;

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

export default function DraftAssistantView() {
  const { rosterData, masterPlayers } = usePortfolio();
  useEffect(() => { trackEvent('draft_session_started'); }, []);

  const [currentPicks, setCurrentPicks] = useState([]);
  const [draftSlot, setDraftSlot] = useState(1);
  const [feedRound, setFeedRound] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTournaments, setSelectedTournaments] = useState([]);
  const [eliminatorMode, setEliminatorMode] = useState(false);
  const [subView, setSubView] = useState('players');
  const [expandedBreakdowns, setExpandedBreakdowns] = useState(new Set());
  const [showStrategy, setShowStrategy] = useState(true);
  const [draftToast, setDraftToast] = useState(null);
  const [feedActive, setFeedActive] = useState(isDraftFeedActive());

  // Persisted Eliminator toggle (web: localStorage)
  useEffect(() => {
    AsyncStorage.getItem(ELIMINATOR_MODE_KEY).then(v => {
      if (v === '1') setEliminatorMode(true);
    }).catch(() => {});
  }, []);
  useEffect(() => {
    AsyncStorage.setItem(ELIMINATOR_MODE_KEY, eliminatorMode ? '1' : '0').catch(() => {});
  }, [eliminatorMode]);

  // Live capture feed (spike/ADR-021 parse engine) — replaces manual entry
  // whenever a session is publishing DraftState.
  useEffect(() => {
    const nameToMaster = new Map(masterPlayers.map(p => [canonicalName(p.name), p]));
    return subscribeDraftFeed((draftState) => {
      if (!draftState) { setFeedActive(false); setFeedRound(null); return; }
      setFeedActive(true);
      if (Number.isFinite(draftState.draftSlot)) setDraftSlot(draftState.draftSlot);
      setFeedRound(Number.isFinite(draftState.currentRound) ? draftState.currentRound : null);
      if (Array.isArray(draftState.myPicks)) {
        setCurrentPicks(draftState.myPicks.map((pick, i) => {
          const mp = nameToMaster.get(canonicalName(pick.name || ''));
          return {
            ...(mp ?? { name: pick.name, position: pick.position || 'N/A', team: pick.team || 'N/A' }),
            round: pick.round ?? i + 1,
          };
        }));
      }
    });
  }, [masterPlayers]);

  useEffect(() => {
    if (!draftToast) return;
    const timer = setTimeout(() => setDraftToast(null), 2000);
    return () => clearTimeout(timer);
  }, [draftToast]);

  // --- Tournament filter ---
  const slateGroups = useMemo(() => {
    const map = new Map();
    (Array.isArray(rosterData) ? rosterData : []).forEach(p => {
      if (!p || !p.tournamentTitle) return;
      const slate = p.slateTitle || 'Other';
      if (!map.has(slate)) map.set(slate, new Set());
      map.get(slate).add(p.tournamentTitle);
    });
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([slate, tourns]) => ({ slate, tournaments: [...tourns].sort() }));
  }, [rosterData]);

  const filteredRosterData = useMemo(() => {
    if (selectedTournaments.length === 0) return rosterData;
    const set = new Set(selectedTournaments);
    return (rosterData || []).filter(p => set.has(p.tournamentTitle));
  }, [rosterData, selectedTournaments]);

  const allRosters = useMemo(() => {
    const tMap = new Map();
    filteredRosterData.forEach(p => {
      const id = p.entry_id || p.entryId || 'unknown';
      if (!tMap.has(id)) tMap.set(id, []);
      tMap.get(id).push(p);
    });
    return Array.from(tMap.values());
  }, [filteredRosterData]);

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

  // Live feed: the engine's round is the truth — the ledger can lag the
  // draft (mid-draft resume, missed confirmation cards), so "picks made + 1"
  // under-counts. Manual entry keeps the picks-based derivation.
  const currentRound = feedRound ?? (currentPicks.length + 1);

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

  // --- Strategy status ---
  const strategyStatus = useMemo(() => {
    const checkGroup = (metaObj) => {
      const items = Object.keys(metaObj).map(key => ({
        key,
        name: metaObj[key].name,
        viable: checkStrategyViability(key, currentPicks, currentRound),
        meta: metaObj[key],
      }));
      const active = items.filter(i => i.viable);
      const locked = active.length === 1 ? active[0] : null;
      return { items, locked };
    };

    const rbStatus = Object.keys(PROTOCOL_TREE).map(key => {
      let viable = checkStrategyViability(key, currentPicks, currentRound);
      if (key === 'RB_BALANCED' && currentPicks.length >= 3) {
        viable = false;
      }
      return {
        key,
        name: ARCHETYPE_METADATA[key]?.name || key,
        viable,
        meta: PROTOCOL_TREE[key],
      };
    });

    const strictRbActive = rbStatus.filter(s => s.viable && s.key !== 'RB_BALANCED');
    const rbLocked = strictRbActive.length === 1 ? strictRbActive[0] : (strictRbActive.length === 0 ? rbStatus.find(s => s.key === 'RB_BALANCED') : null);

    const qbStatus = checkGroup(QB_META);
    const teStatus = checkGroup(TE_META);

    const referenceStrategyKey = rbLocked ? rbLocked.key :
      (rbStatus.find(s => s.viable && s.key === 'RB_HERO') ? 'RB_HERO' : 'RB_BALANCED');

    const strategyPools = { RB_ZERO: [], RB_HERO: [], RB_HYPER_FRAGILE: [], RB_BALANCED: [] };
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
      strategyPools,
    };
  }, [currentPicks, currentRound, allRosters]);

  const myAvgPickMap = useMemo(() => {
    const buckets = new Map();
    (filteredRosterData || []).forEach(p => {
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
  }, [filteredRosterData]);

  // --- Candidate players ---
  const parseRoundNum = (r) => {
    if (r == null) return NaN;
    if (typeof r === 'number') return r;
    const cleaned = String(r).replace(/[^\d-]+/g, '');
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

  // Shared metric computation for a candidate (window and search paths).
  const computeMetrics = (candidate, ctx) => {
    const { matchingRosterTotal, targetStratRosters, targetStratTotal, totalRosters } = ctx;

    const pathPercent = matchingRosterTotal > 0
      ? ((candidate.matchCount || 0) / matchingRosterTotal) * 100
      : 0;

    const inStrat = targetStratRosters.filter(r => r.some(x => x.name === candidate.name)).length;
    const stratPercent = targetStratTotal > 0 ? (inStrat / targetStratTotal) * 100 : 0;

    const globalPercent = totalRosters > 0
      ? ((candidate.totalGlobalCount || 0) / totalRosters) * 100
      : 0;

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
            pickRosterCount: pickRosters.size,
          });
        }
      });
    }

    const correlationScore = comparisons > 0 ? (sumProb / comparisons) * 100 : 0;

    let killsStrategy = false;
    const nextPicks = [...currentPicks, { ...candidate, round: currentRound, position: candidate.position }];
    if (strategyStatus.rb.locked && candidate.position === 'RB') {
      if (!checkStrategyViability(strategyStatus.rb.locked.key, nextPicks, currentRound)) killsStrategy = true;
    }
    if (strategyStatus.qb.locked && candidate.position === 'QB') {
      if (!checkStrategyViability(strategyStatus.qb.locked.key, nextPicks, currentRound)) killsStrategy = true;
    }
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

    const playoffStack = analyzeCandidatePlayoffStack({
      candidateTeam: candidate.team,
      candidatePos: candidate.position,
      currentPicks,
      schedule: playoffSchedule,
    });

    return {
      ...candidate,
      portfolioExposure: pathPercent,
      strategyExposure: stratPercent,
      globalExposure: globalPercent,
      correlationScore,
      correlationBreakdown,
      killsStrategy,
      myAvgPick,
      adpDelta,
      adpTrend,
      isFallingKnife,
      playoffStack,
    };
  };

  const metricsCtx = useMemo(() => ({
    matchingRosterTotal: matchingPathRosters.length,
    targetStratRosters: strategyStatus.strategyPools[strategyStatus.referenceStrategyKey] || [],
    targetStratTotal: (strategyStatus.strategyPools[strategyStatus.referenceStrategyKey] || []).length,
    totalRosters: allRosters.length,
  }), [matchingPathRosters, strategyStatus, allRosters]);

  const candidatePlayers = useMemo(() => {
    const globalPlayerCounts = new Map();
    allRosters.forEach(roster => {
      roster.forEach(p => {
        if (p.name) globalPlayerCounts.set(p.name, (globalPlayerCounts.get(p.name) || 0) + 1);
      });
    });

    const matchCounts = new Map();
    matchingPathRosters.forEach(roster => {
      const player = roster.find(p => parseRoundNum(p.round) === currentRound);
      if (!player || !player.name) return;
      matchCounts.set(player.name, (matchCounts.get(player.name) || 0) + 1);
    });

    let baseList = (masterPlayers || []).map(mp => ({
      ...mp,
      rawCount: 0,
      matchCount: matchCounts.get(mp.name) || 0,
      totalGlobalCount: globalPlayerCounts.get(mp.name) || 0,
      _sortAdp: normalizeAdp(mp),
    }));

    const availablePlayers = baseList.filter(p =>
      !currentPicks.some(cp => cp.name === p.name)
    );

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
    const finalCandidates = slice.map(c => computeMetrics(c, metricsCtx));
    finalCandidates.sort((a, b) => {
      if (a._sortAdp !== b._sortAdp) return a._sortAdp - b._sortAdp;
      return a.name.localeCompare(b.name);
    });
    return finalCandidates;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [masterPlayers, allRosters, matchingPathRosters, currentRound, draftSlot, currentPicks, playerIndexMap, strategyStatus, myAvgPickMap, metricsCtx]);

  const searchResults = useMemo(() => {
    if (!searchQuery.trim() || !masterPlayers?.length) return [];
    const query = searchQuery.trim().toLowerCase();
    const globalPlayerCounts = new Map();
    allRosters.forEach(roster => {
      roster.forEach(p => {
        if (p.name) globalPlayerCounts.set(p.name, (globalPlayerCounts.get(p.name) || 0) + 1);
      });
    });

    const matches = masterPlayers
      .filter(mp => mp.name?.toLowerCase().includes(query) && !currentPicks.some(cp => cp.name === mp.name))
      .slice(0, 25)
      .map(mp => {
        let matchCount = 0;
        matchingPathRosters.forEach(roster => {
          if (roster.some(p => p.name === mp.name)) matchCount++;
        });
        return computeMetrics({
          ...mp,
          _sortAdp: normalizeAdp(mp),
          totalGlobalCount: globalPlayerCounts.get(mp.name) || 0,
          matchCount,
        }, metricsCtx);
      });

    matches.sort((a, b) => a._sortAdp - b._sortAdp);
    return matches;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, masterPlayers, allRosters, matchingPathRosters, currentPicks, currentRound, playerIndexMap, strategyStatus, myAvgPickMap, metricsCtx]);

  const displayPlayers = searchQuery.trim() ? searchResults : candidatePlayers;

  // --- Actions ---
  const handleSelect = (player) => {
    setCurrentPicks([...currentPicks, { ...player, round: currentRound }]);
    setDraftToast({ name: player.name, position: player.position, round: currentRound });
    setSearchQuery('');
  };
  const handleUndo = () => setCurrentPicks(prev => prev.slice(0, -1));

  const toggleBreakdown = (playerName) => {
    setExpandedBreakdowns(prev => {
      const next = new Set(prev);
      if (next.has(playerName)) next.delete(playerName);
      else next.add(playerName);
      return next;
    });
  };

  const slotNum = Number(draftSlot) || 1;
  const snakePickPos = getSnakePickPosition(currentRound, slotNum, 12) || 1;
  const snakeOverallPick = (currentRound - 1) * 12 + snakePickPos;

  const byeRainbow = useMemo(
    () => (eliminatorMode ? analyzeByeRainbow(currentPicks) : null),
    [eliminatorMode, currentPicks]
  );

  // --- Renderers ---
  const StrategyCard = ({ title, statusObj }) => {
    const locked = statusObj.locked;
    return (
      <View style={[styles.stratCard, locked && { borderColor: locked.meta.color }]}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={styles.stratTitle}>{title}</Text>
          {locked ? (
            <View style={[styles.lockedBadge, { backgroundColor: locked.meta.color }]}>
              <Text style={{ color: '#0b0b16', fontSize: 10, fontWeight: '800' }}>{locked.name}</Text>
            </View>
          ) : (
            <Text style={type.muted}>{statusObj.items.filter(i => i.viable).length} paths</Text>
          )}
        </View>
        <View style={{ marginTop: 6, gap: 4 }}>
          {statusObj.items.map(s => (
            <View key={s.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, opacity: s.viable ? 1 : 0.25 }}>
              <View style={{ width: 26, height: 4, borderRadius: 2, backgroundColor: s.viable ? s.meta.color : colors.surface3 }} />
              <Text style={{ fontSize: 11, color: s.viable ? colors.textSecondary : colors.textMuted }}>
                {s.name.replace('Round', '').replace('Strategy', '')}
              </Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderPlayerRow = ({ item: player }) => {
    const stackInfo = analyzeStack(player, currentPicks);
    const playoffStack = player.playoffStack || null;
    const expanded = expandedBreakdowns.has(player.name);
    const adpText = Number.isFinite(player._sortAdp) && player._sortAdp !== Infinity ? player._sortAdp.toFixed(1) : '—';
    return (
      <View style={[styles.playerCard, { borderLeftColor: getPosColor(player.position) }, player.killsStrategy && { opacity: 0.55 }]}>
        <Pressable onPress={() => handleSelect(player)}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
            <View style={[styles.posPill, { backgroundColor: `${getPosColor(player.position)}22` }]}>
              <Text style={{ color: getPosColor(player.position), fontSize: 10, fontWeight: '800' }}>{player.position}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontWeight: '700' }]} numberOfLines={1}>{player.name}</Text>
              <Text style={type.muted}>{player.team}</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={type.mono}>ADP {adpText}</Text>
              <Text style={[type.muted, { fontSize: 10.5 }]}>
                Avg {player.myAvgPick != null ? player.myAvgPick.toFixed(1) : '—'}
                {player.adpDelta != null && (
                  <Text style={{ color: getAdpDeltaColor(player.adpDelta) }}>
                    {'  '}{player.adpDelta > 0 ? '+' : ''}{player.adpDelta.toFixed(1)}
                  </Text>
                )}
              </Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: 6, flexWrap: 'wrap' }}>
            <Text style={styles.metric}>Path <Text style={{ color: colors.textPrimary }}>{player.portfolioExposure.toFixed(0)}%</Text></Text>
            <Pressable onPress={() => toggleBreakdown(player.name)} hitSlop={6}>
              <Text style={styles.metric}>Corr <Text style={{ color: colors.textPrimary }}>{player.correlationScore.toFixed(0)}%</Text>{currentPicks.length > 0 ? ' ▾' : ''}</Text>
            </Pressable>
            <Text style={styles.metric}>
              Global <Text style={{ color: getGlobalExposureColor(player.globalExposure) }}>{player.globalExposure.toFixed(1)}%</Text>
            </Text>
            {stackInfo && (
              <View style={[styles.badge, { borderColor: stackInfo.color, backgroundColor: `${stackInfo.color}1A` }]}>
                <Text style={{ color: stackInfo.color, fontSize: 9.5, fontWeight: '800' }}>{stackInfo.type}</Text>
              </View>
            )}
            {playoffStack && (
              <View style={[styles.badge, { borderColor: '#E8BF4A', backgroundColor: 'rgba(232,191,74,0.12)' }]}>
                <Text style={{ color: '#E8BF4A', fontSize: 9.5, fontWeight: '800' }}>W{playoffStack.weeks[0]?.week ?? '15'} STACK</Text>
              </View>
            )}
            {player.isFallingKnife && (
              <View style={[styles.badge, { borderColor: colors.negative, backgroundColor: 'rgba(231,76,60,0.12)', flexDirection: 'row', gap: 3 }]}>
                <TriangleAlert size={9} color={colors.negative} />
                <Text style={{ color: colors.negative, fontSize: 9.5, fontWeight: '800' }}>FALLING</Text>
              </View>
            )}
            {player.killsStrategy && (
              <View style={[styles.badge, { borderColor: colors.negative }]}>
                <Text style={{ color: colors.negative, fontSize: 9.5, fontWeight: '800' }}>BREAKS PLAN</Text>
              </View>
            )}
          </View>
        </Pressable>
        {expanded && player.correlationBreakdown.length > 0 && (
          <View style={styles.breakdown}>
            {player.correlationBreakdown.map(b => (
              <Text key={b.name} style={type.muted}>
                with {b.name} (R{b.round}): {(b.pGivenPick * 100).toFixed(0)}% · {b.sharedCount}/{b.pickRosterCount} rosters
              </Text>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: spacing.lg }}>
        {/* Live capture session (screenshot -> OCR -> Live Activity) */}
        <LiveSessionPanel />
        {/* Context bar */}
        <View style={styles.contextBar}>
          <Text style={type.secondary}>R<Text style={{ color: colors.textPrimary, fontWeight: '800' }}>{currentRound}</Text></Text>
          <Text style={type.secondary}>Pick <Text style={{ color: colors.textPrimary, fontWeight: '800' }}>{snakeOverallPick}</Text></Text>
          {feedActive && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Radio size={11} color={colors.positive} />
              <Text style={{ color: colors.positive, fontSize: 11, fontWeight: '700' }}>LIVE</Text>
            </View>
          )}
          <View style={{ flex: 1 }} />
          <Text style={type.muted}>Slot</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ maxWidth: 168 }} contentContainerStyle={{ gap: 3 }}>
            {Array.from({ length: 12 }, (_, i) => i + 1).map(n => (
              <Pressable
                key={n}
                onPress={() => setDraftSlot(n)}
                style={[styles.slotBtn, draftSlot === n && { borderColor: colors.accent, backgroundColor: colors.accentMuted }]}
              >
                <Text style={{ fontSize: 11.5, fontWeight: '700', color: draftSlot === n ? colors.accent : colors.textSecondary }}>{n}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>

        <Segmented
          options={[
            { key: 'players', label: 'Available Players' },
            { key: 'board', label: `Draft Board (${currentPicks.length})` },
          ]}
          value={subView}
          onChange={setSubView}
          style={{ marginBottom: spacing.sm }}
        />
      </View>

      {subView === 'players' ? (
        <FlatList
          data={displayPlayers}
          keyExtractor={(p) => p.player_id || p.name}
          renderItem={renderPlayerRow}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          initialNumToRender={12}
          windowSize={7}
          ListHeaderComponent={
            <View>
              <SearchBar value={searchQuery} onChange={setSearchQuery} placeholder="Search any player..." style={{ marginBottom: spacing.sm }} />
              <TournamentFilter slateGroups={slateGroups} selected={selectedTournaments} onChange={setSelectedTournaments} />
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
                <Pressable
                  onPress={() => setShowStrategy(v => !v)}
                  style={[styles.chip, showStrategy && { borderColor: colors.accent, backgroundColor: colors.accentMuted }]}
                >
                  <Target size={12} color={showStrategy ? colors.accent : colors.textSecondary} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: showStrategy ? colors.accent : colors.textSecondary }}>Strategy</Text>
                </Pressable>
                <Pressable
                  onPress={() => setEliminatorMode(v => !v)}
                  style={[styles.chip, eliminatorMode && { borderColor: '#34d399', backgroundColor: 'rgba(52,211,153,0.12)' }]}
                >
                  <Anchor size={12} color={eliminatorMode ? '#34d399' : colors.textSecondary} />
                  <Text style={{ fontSize: 12, fontWeight: '600', color: eliminatorMode ? '#34d399' : colors.textSecondary }}>Eliminator</Text>
                </Pressable>
              </View>

              {showStrategy && !eliminatorMode && (
                <View style={{ gap: spacing.sm, marginBottom: spacing.sm }}>
                  <StrategyCard title="RB Strategy" statusObj={strategyStatus.rb} />
                  <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                    <View style={{ flex: 1 }}><StrategyCard title="QB" statusObj={strategyStatus.qb} /></View>
                    <View style={{ flex: 1 }}><StrategyCard title="TE" statusObj={strategyStatus.te} /></View>
                  </View>
                </View>
              )}

              {eliminatorMode && (
                <View style={styles.elimPanel}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <CalendarDays size={12} color="#34d399" />
                    <Text style={{ color: '#34d399', fontSize: 12, fontWeight: '800' }}>Eliminator · Bye Rainbow</Text>
                  </View>
                  {!byeRainbow || byeRainbow.summary.length === 0 ? (
                    <Text style={type.muted}>Stagger byes — no two players in a position room should share one.</Text>
                  ) : (
                    byeRainbow.summary.map(row => (
                      <View key={row.position} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                        <View style={[styles.posPill, { backgroundColor: getPosColor(row.position) }]}>
                          <Text style={{ color: '#0b0b16', fontSize: 10, fontWeight: '800' }}>{row.position}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, flex: 1 }}>
                          {row.weeks.map(w => {
                            const clash = w.players.length >= 2;
                            return (
                              <View key={`${row.position}-${w.week}`} style={[styles.badge, { borderColor: clash ? '#ef4444' : '#34d399' }]}>
                                <Text style={{ color: clash ? '#fca5a5' : '#34d399', fontSize: 10, fontWeight: '700' }}>
                                  wk{w.week}{w.players.length > 1 ? ` ×${w.players.length}` : ''}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    ))
                  )}
                </View>
              )}

              <Text style={[type.muted, { marginBottom: spacing.sm }]}>
                {searchQuery.trim() ? `${displayPlayers.length} search results` : `~${displayPlayers.length} players in the R${currentRound} window`} · tap a player to draft them
                {allRosters.length > 0 ? ` · ${matchingPathRosters.length} of your rosters match this path` : ''}
              </Text>
            </View>
          }
          ListEmptyComponent={<Text style={[type.secondary, { textAlign: 'center', padding: spacing.xl }]}>No players found.</Text>}
        />
      ) : (
        <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}>
          {currentPicks.length === 0 ? (
            <View style={{ alignItems: 'center', padding: spacing.xl }}>
              <Zap size={30} color={colors.accent} />
              <Text style={[type.h3, { marginTop: spacing.sm }]}>No picks yet</Text>
              <Text style={[type.secondary, { textAlign: 'center', marginTop: 4 }]}>
                Draft players from the Available Players view as your live draft unfolds.
              </Text>
            </View>
          ) : (
            <>
              {currentPicks.map((pick, i) => {
                const stackInfo = analyzeStack(pick, currentPicks.filter((_, j) => j !== i));
                return (
                  <View key={`${pick.name}-${i}`} style={[styles.playerCard, { borderLeftColor: getPosColor(pick.position) }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                      <Text style={[type.mono, { width: 28, color: colors.textMuted }]}>R{pick.round}</Text>
                      <View style={[styles.posPill, { backgroundColor: `${getPosColor(pick.position)}22` }]}>
                        <Text style={{ color: getPosColor(pick.position), fontSize: 10, fontWeight: '800' }}>{pick.position}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[type.body, { fontWeight: '700' }]}>{pick.name}</Text>
                        <Text style={type.muted}>{pick.team}</Text>
                      </View>
                      {stackInfo && (
                        <View style={[styles.badge, { borderColor: stackInfo.color }]}>
                          <Text style={{ color: stackInfo.color, fontSize: 9.5, fontWeight: '800' }}>{stackInfo.type}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                );
              })}
              <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
                <Pressable style={[styles.chip, { flex: 1, justifyContent: 'center' }]} onPress={handleUndo}>
                  <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: '600' }}>Undo last pick</Text>
                </Pressable>
                <Pressable style={[styles.chip, { flex: 1, justifyContent: 'center', borderColor: colors.negative + '66' }]} onPress={() => setCurrentPicks([])}>
                  <Text style={{ color: colors.negative, fontSize: 13, fontWeight: '600' }}>Clear board</Text>
                </Pressable>
              </View>
            </>
          )}
        </ScrollView>
      )}

      {/* Draft toast */}
      {draftToast && (
        <View style={styles.toast}>
          <Text style={{ color: colors.textInverse, fontWeight: '700', fontSize: 13 }}>
            R{draftToast.round} · {draftToast.name} drafted
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  contextBar: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginBottom: spacing.sm,
  },
  slotBtn: {
    width: 26, height: 26, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.surface1,
    alignItems: 'center', justifyContent: 'center',
  },
  chip: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.surface1,
  },
  stratCard: {
    backgroundColor: colors.surface1, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.borderDefault,
    padding: spacing.md,
  },
  stratTitle: { fontSize: 12, fontWeight: '800', color: colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.4 },
  lockedBadge: { borderRadius: radii.sm, paddingHorizontal: 7, paddingVertical: 2 },
  playerCard: {
    backgroundColor: colors.surface1, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.borderSubtle, borderLeftWidth: 4,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  posPill: { borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2, minWidth: 32, alignItems: 'center' },
  metric: { fontSize: 11.5, color: colors.textMuted, fontWeight: '600' },
  badge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, alignItems: 'center' },
  breakdown: {
    marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.borderSubtle, gap: 2,
  },
  elimPanel: {
    backgroundColor: colors.surface1, borderRadius: radii.md,
    borderWidth: 1, borderColor: 'rgba(52,211,153,0.35)',
    padding: spacing.md, marginBottom: spacing.sm,
  },
  toast: {
    position: 'absolute', bottom: 18, alignSelf: 'center',
    backgroundColor: colors.accent, borderRadius: radii.pill,
    paddingHorizontal: 18, paddingVertical: 10,
  },
});
