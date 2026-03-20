// src/components/RosterViewer.jsx
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { classifyRosterPath, ARCHETYPE_METADATA } from '../utils/rosterArchetypes';
import { analyzeRosterStacks } from '../utils/stackAnalysis';
import { spikeWeekPercentile } from '../utils/spikeWeekProjection';
import { useSpikeWorker } from '../hooks/useSpikeWorker';
import useMediaQuery from '../hooks/useMediaQuery';
import css from './RosterViewer.module.css';

// ── CLV helpers ───────────────────────────────────────────────────────────────

/**
 * Power-law value curve CLV
 * V(pick) = 1 / pick^α  —  CLV% = (vNow - vDraft) / vDraft * 100
 * Positive = ADP moved earlier after draft = you got a bargain.
 */
function calcCLV(pick, latestADP, alpha = 0.5) {
  if (!pick || !latestADP || isNaN(pick) || isNaN(latestADP)) return null;
  const vDraft = 1 / Math.pow(pick, alpha);
  const vNow   = 1 / Math.pow(latestADP, alpha);
  return ((vNow - vDraft) / vDraft) * 100;
}

function clvLabel(pct) {
  if (pct === null) return { text: 'N/A', color: '#d6d6d6' };
  const sign = pct >= 0 ? '+' : '';
  const color = pct > 5 ? '#00f700'
              : pct > 2.5  ? '#bcfc45'
              : pct > 0  ? '#fcff55'
              : pct > -2.5 ? '#ff9f43'
              :             '#ff4d6d';
  return { text: `${sign}${pct.toFixed(2)}%`, color };
}


// ── Uniqueness color scale (rank-normalized) ──────────────────────────────────

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpColor(c1, c2, t) {
  return `rgb(${Math.round(lerp(c1[0], c2[0], t))},
              ${Math.round(lerp(c1[1], c2[1], t))},
              ${Math.round(lerp(c1[2], c2[2], t))})`;
}

/**
 * t ∈ [0,1]
 * 0 = chalk (red), 0.5 = neutral (amber), 1 = unique (green)
 */
function uniquenessColor(t) {
  if (t <= 0.5) {
    return lerpColor([255, 77, 109], [255, 159, 67], t * 2);
  }
  return lerpColor([255, 159, 67], [0, 229, 160], (t - 0.5) * 2);
}

// ── Helpers & priors (unchanged) ──────────

const RB_ARCHETYPE_PREVALENCE = {
  RB_BALANCED:         0.5,
  RB_HERO:          0.25,
  RB_ZERO:          0.17,
  RB_HYPER_FRAGILE: 0.08,
};

const _surprisalValues = Object.values(RB_ARCHETYPE_PREVALENCE).map(p => -Math.log2(p));
const _surprisalMin = Math.min(..._surprisalValues);
const _surprisalMax = Math.max(..._surprisalValues);

function archetypeRarityNorm(rbArchetype) {
  const p = RB_ARCHETYPE_PREVALENCE[rbArchetype];
  if (p == null) return 0.0;
  const raw = -Math.log2(p);
  return (_surprisalMax === _surprisalMin)
    ? 0.5
    : (raw - _surprisalMin) / (_surprisalMax - _surprisalMin);
}

/**
 * Calculates how "irrational" or rare a reach is based on whether the
 * player would have survived to the drafting team's NEXT pick.
 * We use the standard logistic CDF / survival function.
 */
function survivalProbability(reachMagnitude, scale) {
  return 1 - Math.exp(-reachMagnitude / scale);
}

function calculateCompositeRarity(rosterPlayers, rbArchetype, opts = {}) {
  const {
    alphaPhase = 1.2,
    betaPhase = -0.5,
    archetypeWeight = 1.5,
    numTeams = 12,
    reachThreshold = 0,
    aggregation = 'rss',
    topK = 3,
    normalizeBy = 'sqrtN',
    returnDetails = false,
  } = opts;

  const rawReachDevs = [];
  const adjustedReachDevs = [];

  rosterPlayers.forEach(p => {
    const pick   = Number(p.pick || 0) || 0;
    const adpRaw = Number(p.latestADP || p.adp || p.latestADPValue || 0) || (pick || 1000);
    const adp    = Math.max(1, adpRaw);

    const denom = alphaPhase * Math.sqrt(adp) + betaPhase;

    const rawDeviation = Math.abs(adp - pick);
    const deviationScaled = rawDeviation / Math.max(0.5, denom);

    rawReachDevs.push(deviationScaled);

    const uniquenessMultiplier = rawDeviation >= reachThreshold
        ? survivalProbability(rawDeviation, denom * 2)
        : 1.0;

    const adjustedDev = deviationScaled * uniquenessMultiplier;
    adjustedReachDevs.push(adjustedDev);
  });

  let aggregatedAdjusted;
  if (aggregation === 'sum') {
    aggregatedAdjusted = adjustedReachDevs.reduce((s, x) => s + x, 0);
  } else if (aggregation === 'topk') {
    const sorted = adjustedReachDevs.slice().sort((a, b) => b - a);
    const k = Math.max(1, Math.min(topK, sorted.length));
    aggregatedAdjusted = sorted.slice(0, k).reduce((s, x) => s + x, 0);
  } else { // 'rss'
    const sumsq = adjustedReachDevs.reduce((s, x) => s + x * x, 0);
    aggregatedAdjusted = Math.sqrt(sumsq);
  }

  const nPlayers = Math.max(1, rosterPlayers.length);
  let normalizedAdjusted = aggregatedAdjusted;
  if (normalizeBy === 'sqrtN') {
    normalizedAdjusted = aggregatedAdjusted / Math.sqrt(nPlayers);
  }

  const archBoostRaw = archetypeRarityNorm(rbArchetype);
  const archetypeContribution = archetypeWeight * archBoostRaw;
  const composite = normalizedAdjusted + archetypeContribution;

  if (returnDetails) {
    const rawDraftRarity = rawReachDevs.reduce((s, x) => s + x, 0);
    return {
      rawDraftRarity: Number(rawDraftRarity.toFixed(6)),
      adjustedDraftRarityAggregated: Number(aggregatedAdjusted.toFixed(6)),
      adjustedDraftRarityNormalized: Number(normalizedAdjusted.toFixed(6)),
      archBoostRaw: Number(archBoostRaw.toFixed(6)),
      archetypeContribution: Number(archetypeContribution.toFixed(6)),
      composite: Number(composite.toFixed(6)),
      details: {
        perPlayer: rosterPlayers.map((p, i) => ({
          pick: Number(p.pick || 0) || 0,
          adp: Number(p.latestADP || p.adp || p.latestADPValue || 0) || (Number(p.pick || 0) || 1000),
          rawReachDev: Number(rawReachDevs[i].toFixed(6)),
          adjustedReachDev: Number(adjustedReachDevs[i].toFixed(6))
        }))
      }
    };
  }

  return composite;
}

// ── Archetype display helpers ─────────────────────────────────────────────────

const ARCHETYPE_COLORS = {
  RB_ZERO:          '#8b5cf6',
  RB_HYPER_FRAGILE: '#f97316',
  RB_HERO:          '#4bf1db',
  RB_BALANCED:         '#ef4444',

  QB_ELITE:         '#f59e0b',
  QB_CORE:          '#60a5fa',
  QB_LATE:          '#94a3b8',
  TE_ELITE:         '#a855f7',
  TE_ANCHOR:        '#34d399',
  TE_LATE:          '#94a3b8',
};

function archetypeColor(key) { return ARCHETYPE_COLORS[key] || '#6b7280'; }

function ArchetypePill({ archetypeKey }) {
  const meta = ARCHETYPE_METADATA[archetypeKey];
  const color = archetypeColor(archetypeKey);
  if (!meta) return <span style={{ color: '#f3f3f3', fontSize: 14 }}>—</span>;
  return (
    <span title={meta.desc} style={{
      fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
      background: color + '1a', color, border: `1px solid ${color}44`,
      borderRadius: 4, padding: '3px 9px', letterSpacing: 0.3,
      whiteSpace: 'nowrap', cursor: 'default',
    }}>
      {meta.name}
    </span>
  );
}

// ── Position snapshot ─────────────────────────────────────────────────────────

const POS_COLORS = {
  QB: '#f59e0b', RB: '#10b981', WR: '#3b82f6', TE: '#a855f7',
  K: '#6b7280', DEF: '#ef4444', DST: '#ef4444', default: '#eeeeee',
};
function posColor(pos) { return POS_COLORS[pos] || POS_COLORS.default; }

function PositionSnapshot({ snap }) {
  const ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DEF'];
  const entries = ORDER.filter(p => snap[p]).map(p => ({ pos: p, count: snap[p] }));
  Object.keys(snap).forEach(p => { if (!ORDER.includes(p)) entries.push({ pos: p, count: snap[p] }); });
  return (
    <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center' }}>
      {entries.map(({ pos, count }) => (
        <span key={pos} style={{
          fontSize: 13, fontFamily: "'JetBrains Mono', monospace",
          background: posColor(pos) + '22', color: posColor(pos),
          border: `1px solid ${posColor(pos)}55`, borderRadius: 3,
          padding: '2px 6px', letterSpacing: 0.5,
        }}>
          {count}{pos}
        </span>
      ))}
    </div>
  );
}

function shortEntry(id) {
  if (!id) return '???';
  if (id.length <= 10) return id;
  return id.slice(0, 6) + '…' + id.slice(-4);
}

// ── Filter options ────────────────────────────────────────────────────────────

const RB_OPTIONS = ['all', 'RB_ZERO', 'RB_HERO', 'RB_HYPER_FRAGILE', 'RB_BALANCED'];
const QB_OPTIONS = ['all', 'QB_ELITE', 'QB_CORE', 'QB_LATE'];
const TE_OPTIONS = ['all', 'TE_ELITE', 'TE_ANCHOR', 'TE_LATE'];

// All chip groups for mobile
const CHIP_GROUPS = [
  { pos: 'RB', options: RB_OPTIONS.filter(o => o !== 'all') },
  { pos: 'QB', options: QB_OPTIONS.filter(o => o !== 'all') },
  { pos: 'TE', options: TE_OPTIONS.filter(o => o !== 'all') },
];

const SORT_OPTIONS = [
  { value: 'grade', label: 'Grade' },
  { value: 'draftDate', label: 'Draft Date' },
  { value: 'avgCLV', label: 'Avg CLV' },
  { value: 'spikeRaw', label: 'Spike Pts' },
  { value: 'rarityPercentile', label: 'Uniq Lift' },
];

// ── Percentile rank ───────────────────────────────────────────────────────────

function percentileRank(value, arr) {
  if (!arr || arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  let count = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (sorted[i] <= value) count++;
    else break;
  }
  return (count / sorted.length) * 100;
}

// ── Min-max normalizer ────────────────────────────────────────────────────────

function normalize(list, key, outKey) {
  const vals = list.map(r => r[key]).filter(v => v !== null && v !== undefined);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  return list.map(r => ({
    ...r,
    [outKey]:
      r[key] === null || r[key] === undefined || max === min
        ? 0.5
        : (r[key] - min) / (max - min),
  }));
}

// ── Composite Grade helpers ──────────────────────────────────────────────────

function computeLetterGrade(score) {
  if (score >= 95) return { letter: 'A+', color: '#00f700' };
  if (score >= 88) return { letter: 'A',  color: '#00e060' };
  if (score >= 82) return { letter: 'A-', color: '#4dd88a' };
  if (score >= 75) return { letter: 'B+', color: '#7dcc80' };
  if (score >= 68) return { letter: 'B',  color: '#bcfc45' };
  if (score >= 60) return { letter: 'B-', color: '#d4e040' };
  if (score >= 50) return { letter: 'C+', color: '#fcff55' };
  if (score >= 40) return { letter: 'C',  color: '#ff9f43' };
  if (score >= 25) return { letter: 'D',  color: '#ff6b6b' };
  return { letter: 'F', color: '#ff4d6d' };
}

function percentileRankArray(value, arr) {
  if (!arr || arr.length === 0) return 0;
  const count = arr.filter(v => v <= value).length;
  return (count / arr.length) * 100;
}

function HighlightedName({ name, query }) {
  if (!query) return <span className={css.playerName}>{name}</span>;
  const idx = name.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span className={css.playerName}>{name}</span>;
  return (
    <span className={css.playerName}>
      {name.slice(0, idx)}
      <mark className={css.searchHighlight}>{name.slice(idx, idx + query.length)}</mark>
      {name.slice(idx + query.length)}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RosterViewer({ rosterData = [] }) {
  const { isMobile } = useMediaQuery();
  const [expandedEntry, setExpandedEntry]   = useState(null);
  const [filtersOpen, setFiltersOpen]       = useState(false);
  const [sortKey, setSortKey]               = useState('avgCLV');
  const [sortDir, setSortDir]               = useState('desc');
  const alpha = 0.5; // Balanced CLV curve
  const [clvFilter, setClvFilter]           = useState('all');
  const [rbFilter,  setRbFilter]            = useState('all');
  const [qbFilter,  setQbFilter]            = useState('all');
  const [teFilter,  setTeFilter]            = useState('all');
  const [tournamentFilter, setTournamentFilter] = useState('all');
  const [playerSearch, setPlayerSearch] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [showTeamDropdown, setShowTeamDropdown] = useState(false);
  const [teamSearch, setTeamSearch] = useState('');
  const [highlightIdx, setHighlightIdx] = useState(0);
  const [teamHighlightIdx, setTeamHighlightIdx] = useState(0);
  const searchRef = useRef(null);
  const teamSearchRef = useRef(null);
  const blurTimeout = useRef(null);
  const teamBlurTimeout = useRef(null);
  const scrollRef = useRef(null);

  // Unique player names for autocomplete
  const allPlayerNames = useMemo(() => {
    const names = new Set();
    rosterData.forEach(p => { if (p.name) names.add(p.name); });
    return [...names].sort();
  }, [rosterData]);

  const searchQuery = playerSearch.trim();
  const autocompleteSuggestions = useMemo(() => {
    if (!searchQuery) return [];
    const q = searchQuery.toLowerCase();
    return allPlayerNames
      .filter(n => n.toLowerCase().includes(q) && !selectedPlayers.includes(n))
      .slice(0, 8);
  }, [searchQuery, allPlayerNames, selectedPlayers]);

  // Unique team names for autocomplete
  const allTeamNames = useMemo(() => {
    const teams = new Set();
    rosterData.forEach(p => { if (p.team) teams.add(p.team); });
    return [...teams].sort();
  }, [rosterData]);

  const teamSearchQuery = teamSearch.trim();
  const teamAutocompleteSuggestions = useMemo(() => {
    if (!teamSearchQuery) return allTeamNames.filter(t => !selectedTeams.includes(t));
    const q = teamSearchQuery.toLowerCase();
    return allTeamNames
      .filter(t => t.toLowerCase().includes(q) && !selectedTeams.includes(t))
      .slice(0, 8);
  }, [teamSearchQuery, allTeamNames, selectedTeams]);

  const addTeam = useCallback((team) => {
    if (team && !selectedTeams.includes(team)) {
      setSelectedTeams(prev => [...prev, team]);
    }
    setTeamSearch('');
    setShowTeamDropdown(false);
    setTeamHighlightIdx(0);
  }, [selectedTeams]);

  const removeTeam = useCallback((team) => {
    setSelectedTeams(prev => prev.filter(t => t !== team));
  }, []);

  const handleTeamKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (teamAutocompleteSuggestions.length > 0) {
        addTeam(teamAutocompleteSuggestions[teamHighlightIdx] || teamAutocompleteSuggestions[0]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setTeamHighlightIdx(i => Math.min(i + 1, teamAutocompleteSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setTeamHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Escape') {
      setShowTeamDropdown(false);
    } else if (e.key === 'Backspace' && !teamSearch && selectedTeams.length > 0) {
      setSelectedTeams(prev => prev.slice(0, -1));
    }
  }, [teamAutocompleteSuggestions, teamHighlightIdx, addTeam, teamSearch, selectedTeams]);

  const addPlayer = useCallback((name) => {
    if (name && !selectedPlayers.includes(name)) {
      setSelectedPlayers(prev => [...prev, name]);
    }
    setPlayerSearch('');
    setShowDropdown(false);
    setHighlightIdx(0);
  }, [selectedPlayers]);

  const removePlayer = useCallback((name) => {
    setSelectedPlayers(prev => prev.filter(n => n !== name));
  }, []);

  const handleSearchKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (autocompleteSuggestions.length > 0) {
        addPlayer(autocompleteSuggestions[highlightIdx] || autocompleteSuggestions[0]);
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(i => Math.min(i + 1, autocompleteSuggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    } else if (e.key === 'Backspace' && !playerSearch && selectedPlayers.length > 0) {
      setSelectedPlayers(prev => prev.slice(0, -1));
    }
  }, [autocompleteSuggestions, highlightIdx, addPlayer, playerSearch, selectedPlayers]);

  // Rarity model tunables
  const [alphaPhase]       = useState(1.2);
  const [betaPhase]        = useState(-0.5);
  const [archetypeBoostMax] = useState(0.5);

  // Group + classify each entry
  const rosters = useMemo(() => {
    const map = {};
    rosterData.forEach(p => {
      const id = p.entry_id || 'Unknown';
      if (!map[id]) map[id] = [];
      map[id].push(p);
    });

    return Object.entries(map).map(([entry_id, players]) => {
      const clvValues = players
        .map(p => calcCLV(p.pick, p.latestADP, alpha))
        .filter(v => v !== null);
      const avgCLV = clvValues.length
        ? clvValues.reduce((a, b) => a + b, 0) / clvValues.length
        : null;

      const posSnap = players.reduce((acc, p) => {
        const pos = p.position || 'N/A';
        acc[pos] = (acc[pos] || 0) + 1;
        return acc;
      }, {});

      const path = classifyRosterPath(players);

      const timestamps = players
        .map(p => p.pickedAt ? new Date(p.pickedAt) : null)
        .filter(d => d && !isNaN(d));
      const draftDate = timestamps.length > 0
        ? new Date(Math.min(...timestamps))
        : null;

      const tournamentTitle = players[0]?.tournamentTitle || null;

      const projectedPoints = players.reduce((sum, p) => sum + (p.projectedPoints || 0), 0);

      return { entry_id, players, avgCLV, posSnap, count: players.length, path, draftDate, tournamentTitle, projectedPoints };
    });
  }, [rosterData, alpha]);

  // Compute per-roster composite rarity, percentile-rank + normalize for color
  const rosterScores = useMemo(() => {
    if (!rosters || rosters.length === 0) return {};

    const rawRarity = [];

    const tmp = rosters.map(r => {
      const rarity = calculateCompositeRarity(r.players, r.path.rb, {
        alphaPhase,
        betaPhase,
        archetypeWeight: 0.3,
        aggregation: 'rss',
        reachThreshold: 2,
        normalizeBy: 'sqrtN',
      });

      rawRarity.push(rarity);

      return {
        entry_id: r.entry_id,
        rarity,
        rbArchetype: r.path.rb,
      };
    });

    const rarityPercentiles = {};
    tmp.forEach(t => {
      rarityPercentiles[t.entry_id] = percentileRank(t.rarity, rawRarity);
    });

    let withNorm = tmp.map(t => ({ ...t, uniqLift: t.rarity }));
    withNorm = normalize(withNorm, 'uniqLift', 'uniqLiftNorm');

    const byId = {};
    withNorm.forEach(t => {
      byId[t.entry_id] = {
        rarity:           Number(t.rarity.toFixed(4)),
        rarityPercentile: Math.round(rarityPercentiles[t.entry_id]),
        uniqLiftNorm:     t.uniqLiftNorm ?? 0.5,
        archBoost:        Number((1 + archetypeBoostMax * archetypeRarityNorm(t.rbArchetype)).toFixed(3)),
      };
    });
    return byId;
  }, [rosters, alphaPhase, betaPhase, archetypeBoostMax]);

  // Per-roster stack analysis
  const rosterStacks = useMemo(() => {
    const byId = {};
    rosters.forEach(r => {
      byId[r.entry_id] = analyzeRosterStacks(r.players);
    });
    return byId;
  }, [rosters]);

  // Spike week projections — computed in a Web Worker for non-blocking UI
  const { spikeData: rawSpikeData, isComplete: spikeComplete } = useSpikeWorker(rosters);

  const rosterSpikeData = useMemo(() => {
    if (!spikeComplete) {
      const result = {};
      for (const [id, data] of Object.entries(rawSpikeData)) {
        result[id] = { ...data, percentile: null };
      }
      return result;
    }
    const allScores = Object.values(rawSpikeData).map(d => d.spikeScore);
    const result = {};
    for (const [id, data] of Object.entries(rawSpikeData)) {
      result[id] = {
        ...data,
        percentile: spikeWeekPercentile(data.spikeScore, allScores),
      };
    }
    return result;
  }, [rawSpikeData, spikeComplete]);

  // Composite roster grades
  const rosterGrades = useMemo(() => {
    if (!rosters || rosters.length === 0) return {};

    const projTotals = [];
    const clvValues = [];
    const rarityValues = [];

    const rawData = rosters.map(r => {
      const projTotal = r.players.reduce((sum, p) => sum + (p.projectedPoints || 0), 0);
      projTotals.push(projTotal);

      const avgCLV = r.avgCLV ?? 0;
      clvValues.push(avgCLV);

      const rarityPct = rosterScores[r.entry_id]?.rarityPercentile ?? 50;
      rarityValues.push(rarityPct);

      const spikeData = rosterSpikeData[r.entry_id];
      const spikePercentile = spikeData?.percentile ?? 0;
      const spikeRaw = spikeData?.spikeScore ?? 0;

      return { entry_id: r.entry_id, projTotal, avgCLV, rarityPct, spikePercentile, spikeRaw };
    });

    const byId = {};
    rawData.forEach(d => {
      const projScore = percentileRankArray(d.projTotal, projTotals);
      const clvScore = percentileRankArray(d.avgCLV, clvValues);
      const rarityScore = d.rarityPct;
      const spikeScore = d.spikePercentile;

      const composite = 0.30 * projScore + 0.25 * clvScore + 0.20 * rarityScore + 0.25 * spikeScore;
      const grade = computeLetterGrade(composite);

      byId[d.entry_id] = {
        composite: Math.round(composite),
        grade,
        projScore: Math.round(projScore),
        clvScore: Math.round(clvScore),
        rarityScore: Math.round(rarityScore),
        spikeScore: Math.round(spikeScore),
        spikeRaw: d.spikeRaw,
      };
    });
    return byId;
  }, [rosters, rosterScores, rosterSpikeData]);

  const rosterSearchMatches = useMemo(() => {
    if (selectedPlayers.length === 0) return {};
    const out = {};
    rosters.forEach(r => {
      const playerNames = r.players.map(p => p.name);
      const allMatch = selectedPlayers.every(sp =>
        playerNames.some(pn => pn === sp)
      );
      if (allMatch) out[r.entry_id] = selectedPlayers;
    });
    return out;
  }, [rosters, selectedPlayers]);

  // Filter + sort
  const displayed = useMemo(() => {
    let list = [...rosters];
    if (selectedPlayers.length > 0) list = list.filter(r => r.entry_id in rosterSearchMatches);
    if (selectedTeams.length > 0) {
      list = list.filter(r =>
        selectedTeams.every(team =>
          r.players.some(p => p.team === team && !selectedPlayers.includes(p.name))
        )
      );
    }
    if (clvFilter === 'positive') list = list.filter(r => r.avgCLV !== null && r.avgCLV >= 0);
    if (clvFilter === 'negative') list = list.filter(r => r.avgCLV !== null && r.avgCLV < 0);
    if (rbFilter !== 'all') list = list.filter(r => r.path.rb === rbFilter);
    if (qbFilter !== 'all') list = list.filter(r => r.path.qb === qbFilter);
    if (teFilter !== 'all') list = list.filter(r => r.path.te === teFilter);
    if (tournamentFilter !== 'all') list = list.filter(r => r.tournamentTitle === tournamentFilter);

    list.sort((a, b) => {
      if (['path.rb', 'path.qb', 'path.te'].includes(sortKey)) {
        const seg = sortKey.split('.')[1];
        const av = a.path[seg]; const bv = b.path[seg];
        return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      let av = a[sortKey] ?? -Infinity;
      let bv = b[sortKey] ?? -Infinity;
      if (sortKey === 'entry_id') { av = a.entry_id; bv = b.entry_id; }
      if (sortKey === 'draftDate') {
        const at = a.draftDate ? a.draftDate.getTime() : -Infinity;
        const bt = b.draftDate ? b.draftDate.getTime() : -Infinity;
        return sortDir === 'asc' ? at - bt : bt - at;
      }
      if (sortKey === 'rarityPercentile') {
        const aid = rosterScores[a.entry_id]?.rarityPercentile ?? -Infinity;
        const bid = rosterScores[b.entry_id]?.rarityPercentile ?? -Infinity;
        return sortDir === 'asc' ? aid - bid : bid - aid;
      }
      if (sortKey === 'grade') {
        const aid = rosterGrades[a.entry_id]?.composite ?? -Infinity;
        const bid = rosterGrades[b.entry_id]?.composite ?? -Infinity;
        return sortDir === 'asc' ? aid - bid : bid - aid;
      }
      if (sortKey === 'spikeRaw') {
        const aid = rosterSpikeData[a.entry_id]?.spikeScore ?? -Infinity;
        const bid = rosterSpikeData[b.entry_id]?.spikeScore ?? -Infinity;
        return sortDir === 'asc' ? aid - bid : bid - aid;
      }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return list;
  }, [rosters, sortKey, sortDir, clvFilter, rbFilter, qbFilter, teFilter, tournamentFilter, rosterScores, rosterGrades, rosterSpikeData, selectedPlayers, selectedTeams, rosterSearchMatches]);

  const allTournaments = useMemo(() => {
    const titles = new Set();
    rosters.forEach(r => { if (r.tournamentTitle) titles.add(r.tournamentTitle); });
    return ['all', ...[...titles].sort()];
  }, [rosters]);

  // Base list with all non-archetype filters applied
  const baseFiltered = useMemo(() => {
    let list = [...rosters];
    if (selectedPlayers.length > 0) list = list.filter(r => r.entry_id in rosterSearchMatches);
    if (selectedTeams.length > 0) list = list.filter(r => selectedTeams.every(team => r.players.some(p => p.team === team && !selectedPlayers.includes(p.name))));
    if (clvFilter === 'positive') list = list.filter(r => r.avgCLV !== null && r.avgCLV >= 0);
    if (clvFilter === 'negative') list = list.filter(r => r.avgCLV !== null && r.avgCLV < 0);
    if (tournamentFilter !== 'all') list = list.filter(r => r.tournamentTitle === tournamentFilter);
    return list;
  }, [rosters, clvFilter, tournamentFilter, selectedPlayers, selectedTeams, rosterSearchMatches]);

  const rbCounts = useMemo(() => {
    let list = baseFiltered;
    if (qbFilter !== 'all') list = list.filter(r => r.path.qb === qbFilter);
    if (teFilter !== 'all') list = list.filter(r => r.path.te === teFilter);
    return list.reduce((acc, r) => { acc[r.path.rb] = (acc[r.path.rb] || 0) + 1; return acc; }, {});
  }, [baseFiltered, qbFilter, teFilter]);

  const qbCounts = useMemo(() => {
    let list = baseFiltered;
    if (rbFilter !== 'all') list = list.filter(r => r.path.rb === rbFilter);
    if (teFilter !== 'all') list = list.filter(r => r.path.te === teFilter);
    return list.reduce((acc, r) => { acc[r.path.qb] = (acc[r.path.qb] || 0) + 1; return acc; }, {});
  }, [baseFiltered, rbFilter, teFilter]);

  const teCounts = useMemo(() => {
    let list = baseFiltered;
    if (rbFilter !== 'all') list = list.filter(r => r.path.rb === rbFilter);
    if (qbFilter !== 'all') list = list.filter(r => r.path.qb === qbFilter);
    return list.reduce((acc, r) => { acc[r.path.te] = (acc[r.path.te] || 0) + 1; return acc; }, {});
  }, [baseFiltered, rbFilter, qbFilter]);

  // Virtualizer for mobile card list
  const virtualizer = useVirtualizer({
    count: displayed.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => isMobile ? 140 : 55,
    overscan: 10,
  });

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'avgCLV' ? 'desc' : 'asc'); }
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <span style={{ opacity: 0.25, marginLeft: 5 }}>↕</span>;
    return <span style={{ marginLeft: 5 }}>{sortDir === 'desc' ? '↓' : '↑'}</span>;
  }

  // Chip filter toggle for mobile
  const toggleChip = (optionKey) => {
    if (RB_OPTIONS.includes(optionKey)) {
      setRbFilter(prev => prev === optionKey ? 'all' : optionKey);
    } else if (QB_OPTIONS.includes(optionKey)) {
      setQbFilter(prev => prev === optionKey ? 'all' : optionKey);
    } else if (TE_OPTIONS.includes(optionKey)) {
      setTeFilter(prev => prev === optionKey ? 'all' : optionKey);
    }
  };

  const isChipActive = (optionKey) => {
    return rbFilter === optionKey || qbFilter === optionKey || teFilter === optionKey;
  };

  if (!rosterData.length) {
    return (
      <div className={css.empty}>
        <span style={{ fontSize: 50 }}>📋</span>
        <p>No roster data loaded. Go to the Exposures tab and use the Upload button to import your Underdog Exposure CSV.</p>
      </div>
    );
  }

  // ── Render: Mobile Card ─────────────────────────────────────────────────────

  const renderRosterCard = (roster, virtualRow) => {
    const clv    = clvLabel(roster.avgCLV);
    const isOpen = expandedEntry === roster.entry_id;
    const scores = rosterScores[roster.entry_id] || {};
    const grade  = rosterGrades[roster.entry_id] || {};
    const stacks = rosterStacks[roster.entry_id] || [];
    const spike  = rosterSpikeData[roster.entry_id];

    return (
      <div
        key={virtualRow.key}
        data-index={virtualRow.index}
        ref={virtualizer.measureElement}
        className={css.rosterCard}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          transform: `translateY(${virtualRow.start}px)`,
        }}
        onClick={() => setExpandedEntry(isOpen ? null : roster.entry_id)}
      >
        {/* Header: Grade + Entry + Chevron */}
        <div className={css.rosterCardHeader}>
          {grade.grade ? (
            <span className={css.rosterGradeLetter} style={{ color: grade.grade.color }}>
              {grade.grade.letter}
            </span>
          ) : <span className={css.rosterGradeLetter} style={{ color: '#555' }}>—</span>}
          <div className={css.rosterCardMeta}>
            <span className={css.rosterEntryId}>{shortEntry(roster.entry_id)}</span>
            <span className={css.rosterDraftDate}>
              {roster.draftDate
                ? roster.draftDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                : '—'}
            </span>
          </div>
          <span className={css.rosterChevron}>{isOpen ? '▲' : '▼'}</span>
        </div>

        {/* Body: Position snapshot + Archetype pills */}
        <div className={css.rosterCardBody}>
          <PositionSnapshot snap={roster.posSnap} />
          <div className={css.rosterArchPills}>
            <ArchetypePill archetypeKey={roster.path.rb} />
            <ArchetypePill archetypeKey={roster.path.qb} />
            <ArchetypePill archetypeKey={roster.path.te} />
          </div>
        </div>

        {/* Footer: 3-col stats */}
        <div className={css.rosterCardFooter}>
          <div className={css.cardStat}>
            <span className={css.cardStatLabel}>CLV</span>
            <span className={css.cardStatValue} style={{ color: clv.color }}>{clv.text}</span>
          </div>
          <div className={css.cardStat}>
            <span className={css.cardStatLabel}>Spike</span>
            <span className={css.cardStatValue} style={{ color: spike ? uniquenessColor((spike.percentile ?? 0) / 100) : '#555' }}>
              {spike?.spikeScore > 0 ? spike.spikeScore.toFixed(1) : '—'}
            </span>
          </div>
          <div className={css.cardStat}>
            <span className={css.cardStatLabel}>Uniq</span>
            <span className={css.cardStatValue} style={{ color: uniquenessColor(scores.uniqLiftNorm ?? 0.5) }}>
              {scores.rarity?.toFixed(2) ?? '—'}
            </span>
          </div>
        </div>

        {/* Expanded detail */}
        {isOpen && (
          <div className={css.rosterCardExpanded}>
            <GradeCard grade={grade} />
            <DraftCapitalMap players={roster.players} isMobile={true} />
            <StackSummaryBar stacks={stacks} />
            <PlayerDetail players={roster.players} alpha={alpha} stacks={stacks} grade={grade} spikeData={rosterSpikeData[roster.entry_id]} isMobile={true} />
          </div>
        )}
      </div>
    );
  };

  // ── Render: Mobile Sort Bar ─────────────────────────────────────────────────

  const renderMobileSortBar = () => (
    <div className={css.sortBar}>
      <select
        className={css.sortSelect}
        value={sortKey}
        onChange={e => {
          const key = e.target.value;
          setSortKey(key);
          setSortDir(key === 'avgCLV' ? 'desc' : 'desc');
        }}
      >
        {SORT_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
      <button
        className={css.sortDirButton}
        onClick={() => setSortDir(prev => prev === 'asc' ? 'desc' : 'asc')}
        aria-label={`Sort ${sortDir === 'asc' ? 'ascending' : 'descending'}`}
      >
        {sortDir === 'asc' ? '▲' : '▼'}
      </button>
    </div>
  );

  // ── Render: Mobile Chip Filters ─────────────────────────────────────────────

  const renderMobileChipFilters = () => (
    <div className={css.chipStrip}>
      {CHIP_GROUPS.map((group, gi) => (
        <React.Fragment key={group.pos}>
          {gi > 0 && <div className={css.chipSeparator} />}
          {group.options.map(opt => {
            const active = isChipActive(opt);
            const color = archetypeColor(opt);
            return (
              <button
                key={opt}
                className={`${css.chip} ${active ? css.chipActive : ''}`}
                style={active ? {
                  background: `${color}25`,
                  borderColor: color,
                  color: color
                } : undefined}
                onClick={() => toggleChip(opt)}
              >
                {ARCHETYPE_METADATA[opt]?.name || opt}
              </button>
            );
          })}
        </React.Fragment>
      ))}
    </div>
  );

  // ── Render: Mobile Card List ────────────────────────────────────────────────

  const renderCardList = () => (
    <div
      ref={scrollRef}
      style={{ overflowY: 'auto', flex: 1, minHeight: 0, borderRadius: 8, border: '1px solid var(--border)' }}
    >
      {displayed.length === 0 ? (
        <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-secondary)' }}>
          No rosters match current filters.
        </div>
      ) : (
        <div
          className={css.cardList}
          style={{ height: virtualizer.getTotalSize(), position: 'relative' }}
        >
          {virtualizer.getVirtualItems().map(virtualRow => {
            const roster = displayed[virtualRow.index];
            return renderRosterCard(roster, virtualRow);
          })}
        </div>
      )}
    </div>
  );

  // ── Render: Control Panel ───────────────────────────────────────────────────

  // Build active filter summary pills for collapsed state
  const activeFilterPills = useMemo(() => {
    const pills = [];
    if (selectedPlayers.length > 0) pills.push(...selectedPlayers.map(n => ({ label: n, color: '#00e5a0' })));
    if (selectedTeams.length > 0) pills.push(...selectedTeams.map(t => ({ label: t, color: '#60a5fa' })));
    if (rbFilter !== 'all') pills.push({ label: ARCHETYPE_METADATA[rbFilter]?.name || rbFilter, color: archetypeColor(rbFilter) });
    if (qbFilter !== 'all') pills.push({ label: ARCHETYPE_METADATA[qbFilter]?.name || qbFilter, color: archetypeColor(qbFilter) });
    if (teFilter !== 'all') pills.push({ label: ARCHETYPE_METADATA[teFilter]?.name || teFilter, color: archetypeColor(teFilter) });
    if (clvFilter !== 'all') pills.push({ label: clvFilter === 'positive' ? '+CLV' : '-CLV', color: '#00e5a0' });
    if (tournamentFilter !== 'all') pills.push({ label: tournamentFilter, color: '#f59e0b' });
    return pills;
  }, [selectedPlayers, selectedTeams, rbFilter, qbFilter, teFilter, clvFilter, tournamentFilter]);

  const renderFilterToggleHeader = () => (
    <div
      className={css.filterToggle}
      onClick={() => setFiltersOpen(prev => !prev)}
    >
      <div className={css.filterToggleLeft}>
        <span className={css.sectionLabel}>Filters & Search</span>
        {!filtersOpen && activeFilterPills.length > 0 && (
          <div className={css.filterPillRow}>
            {activeFilterPills.map((p, i) => (
              <span key={i} style={{ background: p.color + '18', color: p.color, border: `1px solid ${p.color}40` }} className={css.filterPillTag}>
                {p.label}
              </span>
            ))}
          </div>
        )}
      </div>
      <span className={css.filterToggleChevron}>{filtersOpen ? '▲' : '▼'}</span>
    </div>
  );

  const renderFilterBody = () => {
    if (!filtersOpen) return null;

    if (isMobile) {
      return (
        <>
          {/* Search */}
          <div>
            <span className={css.sectionLabel}>Search</span>
            <div className={css.searchRow}>
              {/* Player Search */}
              <div className={css.searchWrap} style={{ width: '100%' }}>
                <label className={css.sectionLabel} style={{ fontSize: 11, display: 'block', marginBottom: 5 }}>Player Search</label>
                <div className={css.searchInputBox}>
                  {selectedPlayers.map(name => (
                    <span key={name} className={css.selectedChip} style={{ background: '#00e5a015', color: '#00e5a0', border: '1px solid #00e5a035' }}>
                      {name}
                      <button onClick={(e) => { e.stopPropagation(); removePlayer(name); }} className={css.chipRemove} style={{ color: '#00e5a066' }}>✕</button>
                    </span>
                  ))}
                  <input
                    ref={searchRef}
                    type="text"
                    placeholder={selectedPlayers.length === 0 ? 'Search players…' : 'Add player…'}
                    value={playerSearch}
                    onChange={e => { setPlayerSearch(e.target.value); setShowDropdown(true); setHighlightIdx(0); }}
                    onFocus={() => setShowDropdown(true)}
                    onBlur={() => { blurTimeout.current = setTimeout(() => setShowDropdown(false), 150); }}
                    onKeyDown={handleSearchKeyDown}
                    style={{
                      flex: 1, minWidth: 100, background: 'transparent', border: 'none', outline: 'none',
                      color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace", fontSize: 14,
                      padding: '4px 0',
                    }}
                  />
                  {(selectedPlayers.length > 0 || playerSearch) && (
                    <button onClick={() => { setSelectedPlayers([]); setPlayerSearch(''); }} className={css.clearBtn}>✕</button>
                  )}
                </div>
                {showDropdown && autocompleteSuggestions.length > 0 && (
                  <div className={css.autocompleteDropdown}>
                    {autocompleteSuggestions.map((name, i) => (
                      <div
                        key={name}
                        onMouseDown={(e) => { e.preventDefault(); clearTimeout(blurTimeout.current); addPlayer(name); }}
                        onMouseEnter={() => setHighlightIdx(i)}
                        className={css.autocompleteItem}
                        style={{ background: i === highlightIdx ? '#00e5a015' : 'transparent', borderBottom: i < autocompleteSuggestions.length - 1 ? '1px solid var(--border)' : 'none' }}
                      >{name}</div>
                    ))}
                  </div>
                )}
              </div>
              {/* Team Search */}
              <div className={css.searchWrap} style={{ width: '100%' }}>
                <label className={css.sectionLabel} style={{ fontSize: 11, display: 'block', marginBottom: 5 }}>Team Stack</label>
                <div className={css.searchInputBox}>
                  {selectedTeams.map(team => (
                    <span key={team} className={css.selectedChip} style={{ background: '#3b82f615', color: '#60a5fa', border: '1px solid #3b82f635' }}>
                      {team}
                      <button onClick={(e) => { e.stopPropagation(); removeTeam(team); }} className={css.chipRemove} style={{ color: '#60a5fa66' }}>✕</button>
                    </span>
                  ))}
                  <input
                    ref={teamSearchRef}
                    type="text"
                    placeholder={selectedTeams.length === 0 ? 'Stack team…' : 'Add team…'}
                    value={teamSearch}
                    onChange={e => { setTeamSearch(e.target.value); setShowTeamDropdown(true); setTeamHighlightIdx(0); }}
                    onFocus={() => setShowTeamDropdown(true)}
                    onBlur={() => { teamBlurTimeout.current = setTimeout(() => setShowTeamDropdown(false), 150); }}
                    onKeyDown={handleTeamKeyDown}
                    style={{
                      flex: 1, minWidth: 75, background: 'transparent', border: 'none', outline: 'none',
                      color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace", fontSize: 14,
                      padding: '4px 0',
                    }}
                  />
                  {(selectedTeams.length > 0 || teamSearch) && (
                    <button onClick={() => { setSelectedTeams([]); setTeamSearch(''); }} className={css.clearBtn}>✕</button>
                  )}
                </div>
                {showTeamDropdown && teamAutocompleteSuggestions.length > 0 && (
                  <div className={css.autocompleteDropdown}>
                    {teamAutocompleteSuggestions.map((team, i) => (
                      <div
                        key={team}
                        onMouseDown={(e) => { e.preventDefault(); clearTimeout(teamBlurTimeout.current); addTeam(team); }}
                        onMouseEnter={() => setTeamHighlightIdx(i)}
                        className={css.autocompleteItem}
                        style={{ background: i === teamHighlightIdx ? '#3b82f615' : 'transparent', borderBottom: i < teamAutocompleteSuggestions.length - 1 ? '1px solid var(--border)' : 'none' }}
                      >{team}</div>
                    ))}
                  </div>
                )}
              </div>
              {(selectedPlayers.length > 0 || selectedTeams.length > 0) && (
                <span className={css.matchCount}>
                  <span style={{ color: '#00e5a0', fontWeight: 700 }}>{displayed.length}</span>
                  {' '}roster{displayed.length !== 1 ? 's' : ''} match
                </span>
              )}
            </div>
          </div>

          {/* Archetype Filters: Chip strip on mobile */}
          <div className={css.sectionDivider}>
            <span className={css.sectionLabel}>Archetype Filters</span>
            <div style={{ marginTop: 10 }}>
              {renderMobileChipFilters()}
            </div>
          </div>

          {/* Additional Filters */}
          <div className={css.sectionDivider}>
            <span className={css.sectionLabel}>Additional Filters</span>
            <div className={css.additionalFilters}>
              <div style={{ width: '100%' }}>
                <label className={css.sectionLabel} style={{ fontSize: 11, display: 'block', marginBottom: 5 }}>Tournament</label>
                <select
                  value={tournamentFilter}
                  onChange={e => setTournamentFilter(e.target.value)}
                  className={css.filterSelect}
                >
                  {allTournaments.map(t => (
                    <option key={t} value={t}>{t === 'all' ? 'All Tournaments' : t}</option>
                  ))}
                </select>
              </div>
              <div style={{ width: '100%' }}>
                <label className={css.sectionLabel} style={{ fontSize: 11, display: 'block', marginBottom: 5 }}>CLV Filter</label>
                <div style={{ display: 'flex', gap: 5 }}>
                  {[['all', 'All'], ['positive', '+CLV'], ['negative', '-CLV']].map(([v, lbl]) => (
                    <button key={v} className={css.filterBtn} style={clvFilter === v ? { background: '#00e5a01a', borderColor: '#00e5a0', color: '#00e5a0' } : {}} onClick={() => setClvFilter(v)}>
                      {lbl}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </>
      );
    }

    // Desktop/Tablet filter body
    return (
      <>
        {/* Section A: Search */}
        <div>
          <span className={css.sectionLabel}>Search</span>
          <div className={css.searchRow}>
            <div className={css.searchWrap} style={{ flex: '1 1 55%', minWidth: 250 }}>
              <label className={css.sectionLabel} style={{ fontSize: 11, display: 'block', marginBottom: 5 }}>Player Search</label>
              <div className={css.searchInputBox}>
                {selectedPlayers.map(name => (
                  <span key={name} className={css.selectedChip} style={{ background: '#00e5a015', color: '#00e5a0', border: '1px solid #00e5a035' }}>
                    {name}
                    <button onClick={(e) => { e.stopPropagation(); removePlayer(name); }} className={css.chipRemove} style={{ color: '#00e5a066' }}>✕</button>
                  </span>
                ))}
                <input
                  ref={searchRef}
                  type="text"
                  placeholder={selectedPlayers.length === 0 ? 'Search players to filter…' : 'Add player…'}
                  value={playerSearch}
                  onChange={e => { setPlayerSearch(e.target.value); setShowDropdown(true); setHighlightIdx(0); }}
                  onFocus={() => setShowDropdown(true)}
                  onBlur={() => { blurTimeout.current = setTimeout(() => setShowDropdown(false), 150); }}
                  onKeyDown={handleSearchKeyDown}
                  style={{
                    flex: 1, minWidth: 125, background: 'transparent', border: 'none', outline: 'none',
                    color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace", fontSize: 14,
                    padding: '4px 0',
                  }}
                />
                {(selectedPlayers.length > 0 || playerSearch) && (
                  <button onClick={() => { setSelectedPlayers([]); setPlayerSearch(''); }} className={css.clearBtn}>✕</button>
                )}
              </div>
              {showDropdown && autocompleteSuggestions.length > 0 && (
                <div className={css.autocompleteDropdown}>
                  {autocompleteSuggestions.map((name, i) => (
                    <div
                      key={name}
                      onMouseDown={(e) => { e.preventDefault(); clearTimeout(blurTimeout.current); addPlayer(name); }}
                      onMouseEnter={() => setHighlightIdx(i)}
                      className={css.autocompleteItem}
                      style={{ background: i === highlightIdx ? '#00e5a015' : 'transparent', borderBottom: i < autocompleteSuggestions.length - 1 ? '1px solid var(--border)' : 'none' }}
                    >{name}</div>
                  ))}
                </div>
              )}
            </div>
            <div className={css.searchWrap} style={{ flex: '1 1 35%', minWidth: 180 }}>
              <label className={css.sectionLabel} style={{ fontSize: 11, display: 'block', marginBottom: 5 }}>Team Stack</label>
              <div className={css.searchInputBox}>
                {selectedTeams.map(team => (
                  <span key={team} className={css.selectedChip} style={{ background: '#3b82f615', color: '#60a5fa', border: '1px solid #3b82f635' }}>
                    {team}
                    <button onClick={(e) => { e.stopPropagation(); removeTeam(team); }} className={css.chipRemove} style={{ color: '#60a5fa66' }}>✕</button>
                  </span>
                ))}
                <input
                  ref={teamSearchRef}
                  type="text"
                  placeholder={selectedTeams.length === 0 ? 'Stack team…' : 'Add team…'}
                  value={teamSearch}
                  onChange={e => { setTeamSearch(e.target.value); setShowTeamDropdown(true); setTeamHighlightIdx(0); }}
                  onFocus={() => setShowTeamDropdown(true)}
                  onBlur={() => { teamBlurTimeout.current = setTimeout(() => setShowTeamDropdown(false), 150); }}
                  onKeyDown={handleTeamKeyDown}
                  style={{
                    flex: 1, minWidth: 75, background: 'transparent', border: 'none', outline: 'none',
                    color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace", fontSize: 14,
                    padding: '4px 0',
                  }}
                />
                {(selectedTeams.length > 0 || teamSearch) && (
                  <button onClick={() => { setSelectedTeams([]); setTeamSearch(''); }} className={css.clearBtn}>✕</button>
                )}
              </div>
              {showTeamDropdown && teamAutocompleteSuggestions.length > 0 && (
                <div className={css.autocompleteDropdown}>
                  {teamAutocompleteSuggestions.map((team, i) => (
                    <div
                      key={team}
                      onMouseDown={(e) => { e.preventDefault(); clearTimeout(teamBlurTimeout.current); addTeam(team); }}
                      onMouseEnter={() => setTeamHighlightIdx(i)}
                      className={css.autocompleteItem}
                      style={{ background: i === teamHighlightIdx ? '#3b82f615' : 'transparent', borderBottom: i < teamAutocompleteSuggestions.length - 1 ? '1px solid var(--border)' : 'none' }}
                    >{team}</div>
                  ))}
                </div>
              )}
            </div>
            {(selectedPlayers.length > 0 || selectedTeams.length > 0) && (
              <span className={css.matchCount}>
                <span style={{ color: '#00e5a0', fontWeight: 700 }}>{displayed.length}</span>
                {' '}roster{displayed.length !== 1 ? 's' : ''} match
              </span>
            )}
          </div>
        </div>

        {/* Section B: Archetype Filters */}
        <div className={css.sectionDivider}>
          <span className={css.sectionLabel}>Archetype Filters</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            <FilterGroup label="RB" options={RB_OPTIONS} value={rbFilter} onChange={setRbFilter} counts={rbCounts} />
            <FilterGroup label="QB" options={QB_OPTIONS} value={qbFilter} onChange={setQbFilter} counts={qbCounts} />
            <FilterGroup label="TE" options={TE_OPTIONS} value={teFilter} onChange={setTeFilter} counts={teCounts} />
          </div>
        </div>

        {/* Section C: Additional Filters */}
        <div className={css.sectionDivider}>
          <span className={css.sectionLabel}>Additional Filters</span>
          <div className={css.additionalFilters}>
            <div>
              <label className={css.sectionLabel} style={{ fontSize: 11, display: 'block', marginBottom: 5 }}>Tournament</label>
              <select
                value={tournamentFilter}
                onChange={e => setTournamentFilter(e.target.value)}
                className={css.filterSelect}
              >
                {allTournaments.map(t => (
                  <option key={t} value={t}>{t === 'all' ? 'All Tournaments' : t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={css.sectionLabel} style={{ fontSize: 11, display: 'block', marginBottom: 5 }}>CLV Filter</label>
              <div style={{ display: 'flex', gap: 5 }}>
                {[['all', 'All'], ['positive', '+CLV'], ['negative', '-CLV']].map(([v, lbl]) => (
                  <button key={v} className={css.filterBtn} style={clvFilter === v ? { background: '#00e5a01a', borderColor: '#00e5a0', color: '#00e5a0' } : {}} onClick={() => setClvFilter(v)}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </>
    );
  };

  const renderControlPanel = () => (
    <div className={css.controlPanel}>
      {renderFilterToggleHeader()}
      {renderFilterBody()}
    </div>
  );

  // ── Render: Desktop Table ───────────────────────────────────────────────────

  const renderTable = () => (
    <div className={css.tableWrap} ref={scrollRef}>
      <table className={css.table}>
        <thead>
          <tr className={css.thead}>
            <th className={css.th} onClick={() => toggleSort('entry_id')}>Entry <SortIcon col="entry_id" /></th>
            <th className={css.th} style={{ textAlign: 'center', color: '#fbbf24' }} onClick={() => toggleSort('grade')}>Grade <SortIcon col="grade" /></th>
            <th className={css.th} style={{ textAlign: 'center' }} onClick={() => toggleSort('draftDate')}>Draft Date <SortIcon col="draftDate" /></th>
            <th className={css.th} style={{ textAlign: 'center' }}>Snapshot</th>
            <th className={`${css.th} ${css.colProjPts}`} style={{ textAlign: 'center', color: '#60a5fa' }} onClick={() => toggleSort('projectedPoints')}>Proj Pts <SortIcon col="projectedPoints" /></th>
            <th className={css.th} style={{ color: archetypeColor('RB_HERO') }} onClick={() => toggleSort('path.rb')}>RB Arch <SortIcon col="path.rb" /></th>
            <th className={css.th} style={{ color: archetypeColor('QB_CORE') }} onClick={() => toggleSort('path.qb')}>QB Arch <SortIcon col="path.qb" /></th>
            <th className={css.th} style={{ color: archetypeColor('TE_ANCHOR') }} onClick={() => toggleSort('path.te')}>TE Arch <SortIcon col="path.te" /></th>
            <th
              className={`${css.th} ${css.colUniq}`}
              style={{ textAlign: 'center', color: '#7dffcc' }}
              onClick={() => toggleSort('rarityPercentile')}
            >
              Uniq Lift <SortIcon col="rarityPercentile" />
            </th>
            <th className={`${css.th} ${css.colSpike}`} style={{ textAlign: 'center', color: '#f59e0b' }} onClick={() => toggleSort('spikeRaw')}>Spike Pts <SortIcon col="spikeRaw" /></th>
            <th className={css.th} style={{ textAlign: 'center', color: '#00e5a0' }} onClick={() => toggleSort('avgCLV')}>Avg CLV% <SortIcon col="avgCLV" /></th>
            <th className={css.th} style={{ textAlign: 'center', cursor: 'default' }}></th>
          </tr>
        </thead>
        <tbody>
          {displayed.map((roster) => {
            const clv    = clvLabel(roster.avgCLV);
            const isOpen = expandedEntry === roster.entry_id;
            const scores = rosterScores[roster.entry_id] || {};
            const grade  = rosterGrades[roster.entry_id] || {};
            const stacks = rosterStacks[roster.entry_id] || [];
            const archNorm  = archetypeRarityNorm(roster.path.rb);
            const boostPct  = Math.round(archetypeBoostMax * archNorm * 100);
            const tooltipTxt = `Draft rarity × ${scores.archBoost ?? '—'}× arch boost (+${boostPct}% from ${roster.path.rb})`;
            const gradeTooltip = grade.grade ? `Proj: ${grade.projScore} | CLV: ${grade.clvScore} | Rarity: ${grade.rarityScore} | Spike: ${grade.spikeScore} → ${grade.composite}` : '';
            return (
              <React.Fragment key={roster.entry_id}>
                <tr
                  className={`${css.row} ${isOpen ? css.rowOpen : ''}`}
                  onClick={() => setExpandedEntry(isOpen ? null : roster.entry_id)}
                >
                  <td className={css.td}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <span className={css.entryId}>{shortEntry(roster.entry_id)}</span>
                      {selectedPlayers.length > 0 && rosterSearchMatches[roster.entry_id]?.map(name => (
                        <span key={name} style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                          background: '#00e5a010', color: '#00e5a0',
                          border: '1px solid #00e5a030', borderRadius: 3,
                          padding: '2px 6px', whiteSpace: 'nowrap',
                        }}>✦ {name}</span>
                      ))}
                      {selectedTeams.length > 0 && roster.players
                        .filter(p => selectedTeams.includes(p.team) && !selectedPlayers.includes(p.name))
                        .map(p => (
                        <span key={`team-${p.name}`} style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                          background: '#3b82f610', color: '#60a5fa',
                          border: '1px solid #3b82f630', borderRadius: 3,
                          padding: '2px 6px', whiteSpace: 'nowrap',
                        }}>✦ {p.name} ({p.team})</span>
                      ))}
                      {roster.tournamentTitle && (
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 11,
                          color: '#666', whiteSpace: 'nowrap',
                        }}>{roster.tournamentTitle}</span>
                      )}
                    </div>
                  </td>

                  {/* Grade */}
                  <td className={css.td} style={{ textAlign: 'center' }}>
                    {grade.grade ? (
                      <span title={gradeTooltip} style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700,
                        color: grade.grade.color, cursor: 'help',
                      }}>
                        {grade.grade.letter}
                      </span>
                    ) : <span style={{ color: '#555' }}>—</span>}
                  </td>

                  <td className={css.td} style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#bbb' }}>
                    {roster.draftDate
                      ? roster.draftDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                      : '—'}
                  </td>
                  <td className={css.td} style={{ textAlign: 'center' }}><PositionSnapshot snap={roster.posSnap} /></td>
                  <td className={`${css.td} ${css.colProjPts}`} style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: '#60a5fa' }}>
                    {roster.projectedPoints > 0 ? roster.projectedPoints.toFixed(1) : '—'}
                  </td>
                  <td className={css.td}><ArchetypePill archetypeKey={roster.path.rb} /></td>
                  <td className={css.td}><ArchetypePill archetypeKey={roster.path.qb} /></td>
                  <td className={css.td}><ArchetypePill archetypeKey={roster.path.te} /></td>

                  {/* Composite Uniq Lift */}
                  <td className={`${css.td} ${css.colUniq}`} style={{ textAlign: 'center' }}>
                    <span
                      title={tooltipTxt}
                      className={css.uniqBadge}
                      style={{
                        color: uniquenessColor(scores.uniqLiftNorm ?? 0.5),
                        borderColor: uniquenessColor(scores.uniqLiftNorm ?? 0.5) + '55',
                      }}
                    >
                      {scores.rarity?.toFixed(2) ?? '—'}
                    </span>
                  </td>

                  <td className={`${css.td} ${css.colSpike}`} style={{ textAlign: 'center' }}>
                    {(() => {
                      const spike = rosterSpikeData[roster.entry_id];
                      if (!spike) return <span style={{ color: '#555', fontSize: 12 }}>...</span>;
                      const raw = spike.spikeScore ?? 0;
                      const pct = spike.percentile ?? 0;
                      const spikeColor = uniquenessColor(pct / 100);
                      return raw > 0 ? (
                        <span style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700,
                          color: spikeColor,
                        }}>
                          {raw.toFixed(1)}
                        </span>
                      ) : <span style={{ color: '#555' }}>—</span>;
                    })()}
                  </td>
                  <td className={css.td} style={{ textAlign: 'center' }}>
                    <span className={css.clvBadge} style={{ color: clv.color, borderColor: clv.color + '44' }}>{clv.text}</span>
                  </td>
                  <td className={css.td} style={{ textAlign: 'center' }}>
                    <span className={css.chevron}>{isOpen ? '▲' : '▼'}</span>
                  </td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={12} style={{ padding: 0 }}>
                      <PlayerDetail players={roster.players} alpha={alpha} stacks={stacks} grade={grade} spikeData={rosterSpikeData[roster.entry_id]} isMobile={false} />
                    </td>
                  </tr>
                )}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className={css.root}>
      {/* Header */}
      <div className={css.header}>
        <div>
          <h2 className={css.title}>ROSTER VIEWER</h2>
          <p className={css.subtitle}>{displayed.length} / {rosters.length} entries · {rosterData.length} players</p>
        </div>
      </div>

      {/* Control Panel — collapsible */}
      {renderControlPanel()}

      {/* Mobile sort + card list */}
      {isMobile && renderMobileSortBar()}
      {isMobile ? renderCardList() : renderTable()}
    </div>
  );
}

// ── Filter group sub-component ────────────────────────────────────────────────

function FilterGroup({ label, options, value, onChange, counts = {} }) {
  const archetypeOptions = options.filter(o => o !== 'all');
  const total = archetypeOptions.reduce((sum, opt) => sum + (counts[opt] || 0), 0);

  return (
    <div className={css.filterGroupRow}>
      <div className={css.filterGroupInner}>
        <span className={css.filterGroupLabel}>{label}</span>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
          {options.map(opt => {
            const isActive = value === opt;
            const color = opt === 'all' ? '#00e5a0' : archetypeColor(opt);
            const name = opt === 'all' ? 'All' : (ARCHETYPE_METADATA[opt]?.name || opt);
            const count = counts[opt];
            return (
              <button
                key={opt}
                title={ARCHETYPE_METADATA[opt]?.desc}
                className={css.filterBtn}
                style={{
                  ...(opt === 'all'
                    ? (isActive ? { background: color + '1a', borderColor: color, color } : {})
                    : {
                        background: isActive ? color + '30' : color + '12',
                        borderColor: isActive ? color : color + '44',
                        color: isActive ? color : color + 'cc',
                      }),
                }}
                onClick={() => onChange(opt)}
              >
                {name}{opt !== 'all' && total > 0 ? ` ${((count || 0) / total * 100).toFixed(0)}%` : ''}
              </button>
            );
          })}
        </div>
      </div>
      {total > 0 && (
        <div className={css.filterBar}>
          {archetypeOptions.map(opt => {
            const count = counts[opt] || 0;
            if (count === 0) return null;
            const pct = (count / total) * 100;
            const color = archetypeColor(opt);
            const name = ARCHETYPE_METADATA[opt]?.name || opt;
            return (
              <div
                key={opt}
                title={`${name}: ${pct.toFixed(1)}%`}
                onClick={() => onChange(opt)}
                style={{
                  width: `${pct}%`,
                  background: color,
                  opacity: value === 'all' || value === opt ? 0.85 : 0.3,
                  cursor: 'pointer',
                  transition: 'opacity 0.2s',
                }}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Draft Capital Map ────────────────────────────────────────────────────────

function DraftCapitalMap({ players, isMobile = false }) {
  const maxRound = 18;
  const byRound = {};
  players.forEach(p => {
    const r = parseInt(p.round) || 0;
    if (r >= 1 && r <= maxRound) {
      if (!byRound[r]) byRound[r] = [];
      byRound[r].push(p);
    }
  });

  const posByRound = {};
  players.forEach(p => {
    const pos = p.position || 'N/A';
    const r = parseInt(p.round) || 0;
    if (r < 1) return;
    if (!posByRound[pos]) posByRound[pos] = [];
    posByRound[pos].push(r);
  });
  const posOrder = ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DEF'];
  const summaryParts = posOrder
    .filter(pos => posByRound[pos])
    .map(pos => `${pos}s: R${posByRound[pos].sort((a, b) => a - b).join(',R')}`);

  if (isMobile) {
    return (
      <div className={css.capitalMapWrap}>
        <div className={css.capitalMapSummary}>
          {summaryParts.join(' | ')}
        </div>
      </div>
    );
  }

  return (
    <div className={css.capitalMapWrap}>
      <div className={css.capitalMapGrid}>
        {Array.from({ length: maxRound }, (_, i) => i + 1).map(round => {
          const picks = byRound[round] || [];
          return (
            <div key={round} className={css.capitalMapCell}>
              {picks.map((p, j) => (
                <div key={j} title={`${p.name} (${p.position} R${round})`} style={{
                  width: 30, height: 22, borderRadius: 3,
                  background: posColor(p.position) + '33',
                  border: `1px solid ${posColor(p.position)}66`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontFamily: "'JetBrains Mono', monospace",
                  color: posColor(p.position), fontWeight: 700, cursor: 'default',
                }}>
                  {p.position}
                </div>
              ))}
              {picks.length === 0 && <div className={css.capitalMapEmpty} />}
              <span className={css.capitalMapRoundLabel}>R{round}</span>
            </div>
          );
        })}
      </div>
      <div className={css.capitalMapSummary}>
        {summaryParts.join(' | ')}
      </div>
    </div>
  );
}

// ── Stack summary bar ────────────────────────────────────────────────────────

function StackSummaryBar({ stacks }) {
  if (!stacks || stacks.length === 0) return null;
  return (
    <div className={css.stackBar}>
      <span className={css.stackLabel}>STACKS</span>
      {stacks.map((s, i) => (
        <span key={i} className={css.stackPill} style={{
          background: s.color + '15', color: s.color,
          border: `1px solid ${s.color}33`,
        }}>
          <span style={{ fontWeight: 700 }}>{s.team}:</span>{' '}
          {s.members.map(m => m.name.split(' ').pop()).join(' + ')}{' '}
          <span style={{ opacity: 0.7 }}>({s.type.replace(/^[^\w]*/, '')})</span>
        </span>
      ))}
    </div>
  );
}

// ── Grade detail card ────────────────────────────────────────────────────────

function GradeCard({ grade }) {
  if (!grade || !grade.grade) return null;
  const bars = [
    { label: 'PROJ', score: grade.projScore, color: '#3b82f6' },
    { label: 'CLV',  score: grade.clvScore,  color: '#00e5a0' },
    { label: 'RARE', score: grade.rarityScore, color: '#c084fc' },
    { label: 'SPIKE', score: grade.spikeScore, color: '#f59e0b' },
  ];
  return (
    <div className={css.gradeCard}>
      <div className={css.gradeLetter} style={{ color: grade.grade.color }}>
        {grade.grade.letter}
      </div>
      <div className={css.gradeBarGroup}>
        {bars.map(b => (
          <div key={b.label} className={css.gradeBarItem}>
            <div className={css.gradeBarLabel}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#888', letterSpacing: 1 }}>{b.label}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: b.color, fontWeight: 700 }}>
                {b.score}
                {b.label === 'SPIKE' && grade.spikeRaw > 0 && (
                  <span style={{ color: '#888', fontWeight: 400, marginLeft: 4, fontSize: 10 }}>
                    {grade.spikeRaw.toFixed(1)} pts
                  </span>
                )}
              </span>
            </div>
            <div className={css.gradeBarTrack}>
              <div className={css.gradeBarFill} style={{
                width: `${b.score}%`, background: b.color,
              }} />
            </div>
          </div>
        ))}
      </div>
      <div className={css.gradeComposite}>
        {grade.composite}/100
      </div>
    </div>
  );
}

// ── Expanded player detail ────────────────────────────────────────────────────

function PlayerDetail({ players, alpha = 0.5, stacks = [], grade = {}, spikeData = null, isMobile = false }) {
  const [pSort, setPSort] = useState('pick');
  const [pDir,  setPDir]  = useState('asc');

  const stackPlayerTeams = useMemo(() => {
    const map = {};
    stacks.forEach(s => {
      s.members.forEach(m => { map[m.name] = s.color; });
    });
    return map;
  }, [stacks]);

  const spikeLineupNames = useMemo(() => {
    if (!spikeData?.lineup?.length) return new Set();
    return new Set(spikeData.lineup.map(p => p.name));
  }, [spikeData]);

  const sorted = useMemo(() => [...players].sort((a, b) => {
    let av, bv;
    if (pSort === 'clv')  { av = calcCLV(a.pick, a.latestADP, alpha) ?? -Infinity; bv = calcCLV(b.pick, b.latestADP, alpha) ?? -Infinity; }
    else if (pSort === 'pick') { av = a.pick || 0; bv = b.pick || 0; }
    else if (pSort === 'adp')  { av = a.latestADP || 9999; bv = b.latestADP || 9999; }
    else if (pSort === 'name') { return pDir === 'asc' ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name); }
    else { av = a[pSort] ?? -Infinity; bv = b[pSort] ?? -Infinity; }
    return pDir === 'asc' ? av - bv : bv - av;
  }), [players, pSort, pDir, alpha]);

  function tp(key) {
    if (pSort === key) setPDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setPSort(key); setPDir(key === 'clv' ? 'desc' : 'asc'); }
  }
  const piIcon = (col) => {
    if (pSort !== col) return <span style={{ opacity: 0.2, marginLeft: 4 }}>↕</span>;
    return <span style={{ marginLeft: 4 }}>{pDir === 'desc' ? '↓' : '↑'}</span>;
  };

  if (isMobile) {
    const PLAYER_SORT_OPTIONS = [
      { value: 'pick', label: 'Draft Pick' },
      { value: 'name', label: 'Name' },
      { value: 'adp', label: 'Current ADP' },
      { value: 'projectedPoints', label: 'Proj Pts' },
      { value: 'clv', label: 'CLV%' },
    ];

    return (
      <div className={css.detail}>
        {/* Player cards */}
        {sorted.map((p, i) => {
          const clvPct = calcCLV(p.pick, p.latestADP, alpha);
          const clv = clvLabel(clvPct);
          const stackColor = stackPlayerTeams[p.name];
          const isSpikeStar = spikeLineupNames.has(p.name);
          return (
            <div key={`${p.name}-${i}`} className={css.playerDetailCard} style={isSpikeStar ? { borderLeft: '3px solid #f59e0b', background: '#f59e0b08' } : {}}>
              <div className={css.playerDetailRow1}>
                <span className={css.playerDetailName}>
                  {stackColor && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: stackColor, marginRight: 6, verticalAlign: 'middle' }} />}
                  {p.name}
                </span>
                <span className={css.posPill} style={{ background: posColor(p.position) + '22', color: posColor(p.position), borderColor: posColor(p.position) + '55' }}>
                  {p.position}
                </span>
                {isSpikeStar && (
                  <span title="Week 17 Spike Lineup starter" style={{
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
                    background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44',
                    borderRadius: 3, padding: '1px 5px', letterSpacing: 0.5,
                  }}>W17</span>
                )}
              </div>
              <div className={css.playerDetailRow2}>
                <div className={css.cardStat}>
                  <span className={css.cardStatLabel}>Pick</span>
                  <span className={css.cardStatValue}>{p.pick || '—'}</span>
                </div>
                <div className={css.cardStat}>
                  <span className={css.cardStatLabel}>ADP</span>
                  <span className={css.cardStatValue}>{p.latestADPDisplay || '—'}</span>
                </div>
                <div className={css.cardStat}>
                  <span className={css.cardStatLabel}>Proj</span>
                  <span className={css.cardStatValue}>{p.projectedPoints ? p.projectedPoints.toFixed(1) : '—'}</span>
                </div>
                <div className={css.cardStat}>
                  <span className={css.cardStatLabel}>CLV</span>
                  <span className={css.cardStatValue} style={{ color: clv.color }}>{clv.text}</span>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className={css.detail}>
      <GradeCard grade={grade} />
      <DraftCapitalMap players={players} isMobile={false} />
      <StackSummaryBar stacks={stacks} />
      <table className={css.table}>
        <thead>
          <tr className={css.thead} style={{ background: '#080808' }}>
            <th className={css.dth} onClick={() => tp('name')}>Player {piIcon('name')}</th>
            <th className={css.dth} style={{ textAlign: 'center' }}>Pos</th>
            <th className={css.dth} style={{ textAlign: 'center' }}>Team</th>
            <th className={css.dth} style={{ textAlign: 'center' }} onClick={() => tp('pick')}>Draft Pick {piIcon('pick')}</th>
            <th className={css.dth} style={{ textAlign: 'center' }} onClick={() => tp('projectedPoints')}>Proj Pts {piIcon('projectedPoints')}</th>
            <th className={css.dth} style={{ textAlign: 'center' }} onClick={() => tp('adp')}>Cur ADP {piIcon('adp')}</th>
            <th className={css.dth} style={{ textAlign: 'center', color: '#00e5a055' }} onClick={() => tp('clv')}>CLV% {piIcon('clv')}</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const clvPct = calcCLV(p.pick, p.latestADP, alpha);
            const clv = clvLabel(clvPct);
            const stackColor = stackPlayerTeams[p.name];
            const isSpikeStar = spikeLineupNames.has(p.name);
            return (
              <tr key={`${p.name}-${i}`} className={css.drow} style={isSpikeStar ? { borderLeft: '3px solid #f59e0b', background: '#f59e0b08' } : {}}>
                <td className={css.dtd}>
                  <span className={css.playerName}>
                    {stackColor && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: stackColor, marginRight: 6, verticalAlign: 'middle' }} />}
                    {p.name}
                    {isSpikeStar && (
                      <span title="Week 17 Spike Lineup starter" style={{
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700,
                        background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44',
                        borderRadius: 3, padding: '1px 5px', marginLeft: 7, verticalAlign: 'middle',
                        letterSpacing: 0.5,
                      }}>W17</span>
                    )}
                  </span>
                </td>
                <td className={css.dtd} style={{ textAlign: 'center' }}>
                  <span className={css.posPill} style={{ background: posColor(p.position) + '22', color: posColor(p.position), borderColor: posColor(p.position) + '55' }}>
                    {p.position}
                  </span>
                </td>
                <td className={css.dtd} style={{ textAlign: 'center', color: '#e0e0e0', fontFamily: "'JetBrains Mono', monospace", fontSize: 14 }}>{p.team}</td>
                <td className={css.dtd} style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 15 }}>{p.pick || '—'}</td>
                <td className={css.dtd} style={{ textAlign: 'center', color: '#ececec', fontFamily: "'JetBrains Mono', monospace", fontSize: 15 }}>{p.projectedPoints ? p.projectedPoints.toFixed(1) : '—'}</td>
                <td className={css.dtd} style={{ textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: '#f0f0f0' }}>{p.latestADPDisplay || '—'}</td>
                <td className={css.dtd} style={{ textAlign: 'center' }}>
                  {clvPct !== null ? (
                    <div className={css.clvBar}>
                      <div className={css.clvFill} style={{
                        width: `${Math.min(Math.abs(clvPct), 100)}%`,
                        background: clv.color,
                        marginLeft: clvPct >= 0 ? '50%' : `${50 - Math.min(Math.abs(clvPct), 50)}%`,
                      }} />
                      <span className={css.clvText} style={{ color: clv.color }}>{clv.text}</span>
                    </div>
                  ) : (
                    <span style={{ color: '#e2e2e2', fontSize: 14 }}>N/A</span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
