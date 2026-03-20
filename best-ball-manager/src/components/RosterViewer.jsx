// src/components/RosterViewer.jsx
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { classifyRosterPath, ARCHETYPE_METADATA } from '../utils/rosterArchetypes';
import { analyzeRosterStacks, scoreRosterStacks } from '../utils/stackAnalysis';

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
  // If reach is 0, survival to your current pick was standard (~0.5 or lower).
  // The larger the reach, the closer survival probability gets to 1.0.
  // We use this as a multiplier: reaching for a player with a 99% chance 
  // to survive to your next pick yields a massive rarity boost.
  return 1 - Math.exp(-reachMagnitude / scale);
}

function calculateCompositeRarity(rosterPlayers, rbArchetype, opts = {}) {
  const {
    alphaPhase = 1.2,
    betaPhase = -0.5,
    archetypeWeight = 1.5, // Increased default to balance against draft RSS scale
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

    // Standardize deviation by phase volatility
    const denom = alphaPhase * Math.sqrt(adp) + betaPhase;
    
    // Use absolute deviation so both Reaches AND Steals (CLV) make the roster unique
    const rawDeviation = Math.abs(adp - pick); 
    // Floor the denominator at 0.5 to prevent explosive early-round scaling
    const deviationScaled = rawDeviation / Math.max(0.5, denom);
    
    rawReachDevs.push(deviationScaled); // (You may want to rename this array to rawDevs)

    // Uniqueness Multiplier based on absolute deviation
    const uniquenessMultiplier = rawDeviation >= reachThreshold 
        ? survivalProbability(rawDeviation, denom * 2) 
        : 1.0; 

    const adjustedDev = deviationScaled * uniquenessMultiplier;
    adjustedReachDevs.push(adjustedDev);
  });

  // Aggregation
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

  // Normalization
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
  if (!query) return <span style={styles.playerName}>{name}</span>;
  const idx = name.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return <span style={styles.playerName}>{name}</span>;
  return (
    <span style={styles.playerName}>
      {name.slice(0, idx)}
      <mark style={styles.searchHighlight}>{name.slice(idx, idx + query.length)}</mark>
      {name.slice(idx + query.length)}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function RosterViewer({ rosterData = [] }) {
  const [expandedEntry, setExpandedEntry]   = useState(null);
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
  const [archetypeBoostMax] = useState(0.5); // 0 = ignore archetype, 1 = can double score

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

      // Derive draft date from earliest pick timestamp
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
        archetypeWeight: 0.3,        // If RSS scales high, you may need to bump this to 0.5 - 1.5 to make archetype matter
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
        // Expose archetype boost factor for tooltip
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

  // Composite roster grades
  const rosterGrades = useMemo(() => {
    if (!rosters || rosters.length === 0) return {};

    // Collect raw values for percentile ranking
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

      const stacks = rosterStacks[r.entry_id] || [];
      const stackQuality = scoreRosterStacks(stacks, r.players);

      return { entry_id: r.entry_id, projTotal, avgCLV, rarityPct, stackQuality };
    });

    const byId = {};
    rawData.forEach(d => {
      const projScore = percentileRankArray(d.projTotal, projTotals);
      const clvScore = percentileRankArray(d.avgCLV, clvValues);
      const rarityScore = d.rarityPct;
      const stackScore = d.stackQuality;

      const composite = 0.30 * projScore + 0.25 * clvScore + 0.20 * rarityScore + 0.25 * stackScore;
      const grade = computeLetterGrade(composite);

      byId[d.entry_id] = {
        composite: Math.round(composite),
        grade,
        projScore: Math.round(projScore),
        clvScore: Math.round(clvScore),
        rarityScore: Math.round(rarityScore),
        stackScore: Math.round(stackScore),
      };
    });
    return byId;
  }, [rosters, rosterScores, rosterStacks]);

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
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return list;
}, [rosters, sortKey, sortDir, clvFilter, rbFilter, qbFilter, teFilter, tournamentFilter, rosterScores, rosterGrades, selectedPlayers, selectedTeams, rosterSearchMatches]);

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

  // Each category's counts are based on the base list filtered by the OTHER two archetype filters
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

  function toggleSort(key) {
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir(key === 'avgCLV' ? 'desc' : 'asc'); }
  }

  function SortIcon({ col }) {
    if (sortKey !== col) return <span style={{ opacity: 0.25, marginLeft: 5 }}>↕</span>;
    return <span style={{ marginLeft: 5 }}>{sortDir === 'desc' ? '↓' : '↑'}</span>;
  }

  if (!rosterData.length) {
    return (
      <div style={styles.empty}>
        <span style={{ fontSize: 50 }}>📋</span>
        <p>No roster data loaded. Go to the Exposures tab and use the Upload button to import your Underdog Exposure CSV.</p>
      </div>
    );
  }

  return (
    <div style={styles.root}>
      {/* ── Header ── */}
      <div style={styles.header}>
        <div>
          <h2 style={styles.title}>ROSTER VIEWER</h2>
          <p style={styles.subtitle}>{displayed.length} / {rosters.length} entries · {rosterData.length} players</p>
        </div>
      </div>

      {/* ── Control Panel ── */}
      <div style={styles.controlPanel}>
        {/* Section A: Search */}
        <div>
          <span style={styles.sectionLabel}>Search</span>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18, marginTop: 10, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 55%', minWidth: 250 }}>
              <label style={{ ...styles.sectionLabel, fontSize: 11, display: 'block', marginBottom: 5 }}>Player Search</label>
              <div style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5,
                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
                padding: '5px 10px', minHeight: 40, boxSizing: 'border-box',
              }}>
                {selectedPlayers.map(name => (
                  <span key={name} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                    background: '#00e5a015', color: '#00e5a0',
                    border: '1px solid #00e5a035', borderRadius: 4,
                    padding: '3px 8px', whiteSpace: 'nowrap',
                  }}>
                    {name}
                    <button
                      onClick={(e) => { e.stopPropagation(); removePlayer(name); }}
                      style={{
                        background: 'none', border: 'none', color: '#00e5a066',
                        cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1,
                      }}
                    >✕</button>
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
                  <button
                    onClick={() => { setSelectedPlayers([]); setPlayerSearch(''); }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '0 3px' }}
                  >✕</button>
                )}
              </div>
              {showDropdown && autocompleteSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6,
                  marginTop: 3, maxHeight: 200, overflowY: 'auto',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                }}>
                  {autocompleteSuggestions.map((name, i) => (
                    <div
                      key={name}
                      onMouseDown={(e) => { e.preventDefault(); clearTimeout(blurTimeout.current); addPlayer(name); }}
                      onMouseEnter={() => setHighlightIdx(i)}
                      style={{
                        padding: '8px 15px', cursor: 'pointer',
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: 'var(--text-secondary)',
                        background: i === highlightIdx ? '#00e5a015' : 'transparent',
                        borderBottom: i < autocompleteSuggestions.length - 1 ? '1px solid var(--border)' : 'none',
                      }}
                    >{name}</div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ position: 'relative', flex: '1 1 35%', minWidth: 180 }}>
              <label style={{ ...styles.sectionLabel, fontSize: 11, display: 'block', marginBottom: 5 }}>Team Stack</label>
              <div style={{
                display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 5,
                background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
                padding: '5px 10px', minHeight: 40, boxSizing: 'border-box',
              }}>
                {selectedTeams.map(team => (
                  <span key={team} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                    background: '#3b82f615', color: '#60a5fa',
                    border: '1px solid #3b82f635', borderRadius: 4,
                    padding: '3px 8px', whiteSpace: 'nowrap',
                  }}>
                    {team}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeTeam(team); }}
                      style={{
                        background: 'none', border: 'none', color: '#60a5fa66',
                        cursor: 'pointer', fontSize: 13, padding: 0, lineHeight: 1,
                      }}
                    >✕</button>
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
                  <button
                    onClick={() => { setSelectedTeams([]); setTeamSearch(''); }}
                    style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 14, padding: '0 3px' }}
                  >✕</button>
                )}
              </div>
              {showTeamDropdown && teamAutocompleteSuggestions.length > 0 && (
                <div style={{
                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                  background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 6,
                  marginTop: 3, maxHeight: 200, overflowY: 'auto',
                  boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
                }}>
                  {teamAutocompleteSuggestions.map((team, i) => (
                    <div
                      key={team}
                      onMouseDown={(e) => { e.preventDefault(); clearTimeout(teamBlurTimeout.current); addTeam(team); }}
                      onMouseEnter={() => setTeamHighlightIdx(i)}
                      style={{
                        padding: '8px 15px', cursor: 'pointer',
                        fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: 'var(--text-secondary)',
                        background: i === teamHighlightIdx ? '#3b82f615' : 'transparent',
                        borderBottom: i < teamAutocompleteSuggestions.length - 1 ? '1px solid var(--border)' : 'none',
                      }}
                    >{team}</div>
                  ))}
                </div>
              )}
            </div>
            {(selectedPlayers.length > 0 || selectedTeams.length > 0) && (
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: 'var(--text-muted)', paddingTop: 24, whiteSpace: 'nowrap' }}>
                <span style={{ color: '#00e5a0', fontWeight: 700 }}>{displayed.length}</span>
                {' '}roster{displayed.length !== 1 ? 's' : ''} match
              </span>
            )}
          </div>
        </div>

        {/* Section B: Archetype Filters */}
        <div style={styles.sectionDivider}>
          <span style={styles.sectionLabel}>Archetype Filters</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
            <FilterGroup label="RB" options={RB_OPTIONS} value={rbFilter} onChange={setRbFilter} counts={rbCounts} />
            <FilterGroup label="QB" options={QB_OPTIONS} value={qbFilter} onChange={setQbFilter} counts={qbCounts} />
            <FilterGroup label="TE" options={TE_OPTIONS} value={teFilter} onChange={setTeFilter} counts={teCounts} />
          </div>
        </div>

        {/* Section C: Additional Filters */}
        <div style={styles.sectionDivider}>
          <span style={styles.sectionLabel}>Additional Filters</span>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 30, marginTop: 10, flexWrap: 'wrap' }}>
            <div>
              <label style={{ ...styles.sectionLabel, fontSize: 11, display: 'block', marginBottom: 5 }}>Tournament</label>
              <select
                value={tournamentFilter}
                onChange={e => setTournamentFilter(e.target.value)}
                style={{
                  background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6,
                  color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
                  padding: '5px 10px', cursor: 'pointer',
                }}
              >
                {allTournaments.map(t => (
                  <option key={t} value={t}>{t === 'all' ? 'All Tournaments' : t}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ ...styles.sectionLabel, fontSize: 11, display: 'block', marginBottom: 5 }}>CLV Filter</label>
              <div style={{ display: 'flex', gap: 5 }}>
                {[['all', 'All'], ['positive', '+CLV'], ['negative', '-CLV']].map(([v, lbl]) => (
                  <button key={v} style={{ ...styles.filterBtn, ...(clvFilter === v ? { background: '#00e5a01a', borderColor: '#00e5a0', color: '#00e5a0' } : {}) }} onClick={() => setClvFilter(v)}>
                    {lbl}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Table ── */}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead>
            <tr style={styles.thead}>
              <th style={styles.th} onClick={() => toggleSort('entry_id')}>Entry <SortIcon col="entry_id" /></th>
              <th style={{ ...styles.th, textAlign: 'center', color: '#fbbf24' }} onClick={() => toggleSort('grade')}>Grade <SortIcon col="grade" /></th>
              <th style={{ ...styles.th, textAlign: 'center' }} onClick={() => toggleSort('draftDate')}>Draft Date <SortIcon col="draftDate" /></th>
              <th style={{ ...styles.th, textAlign: 'center' }}>Snapshot</th>
              <th style={{ ...styles.th, textAlign: 'center', color: '#60a5fa' }} onClick={() => toggleSort('projectedPoints')}>Proj Pts <SortIcon col="projectedPoints" /></th>
              <th style={{ ...styles.th, color: archetypeColor('RB_HERO') }} onClick={() => toggleSort('path.rb')}>RB Arch <SortIcon col="path.rb" /></th>
              <th style={{ ...styles.th, color: archetypeColor('QB_CORE') }} onClick={() => toggleSort('path.qb')}>QB Arch <SortIcon col="path.qb" /></th>
              <th style={{ ...styles.th, color: archetypeColor('TE_ANCHOR') }} onClick={() => toggleSort('path.te')}>TE Arch <SortIcon col="path.te" /></th>
              <th
                style={{ ...styles.th, textAlign: 'center', color: '#7dffcc' }}
                onClick={() => toggleSort('rarityPercentile')}
              >
                Uniq Lift <SortIcon col="rarityPercentile" />
              </th>
              <th style={{ ...styles.th, textAlign: 'center', color: '#00e5a0' }} onClick={() => toggleSort('avgCLV')}>Avg CLV% <SortIcon col="avgCLV" /></th>
              <th style={{ ...styles.th, textAlign: 'center', cursor: 'default' }}></th>
            </tr>
          </thead>
          <tbody>
            {displayed.map((roster) => {
              const clv    = clvLabel(roster.avgCLV);
              const isOpen = expandedEntry === roster.entry_id;
              const scores = rosterScores[roster.entry_id] || {};
              const grade  = rosterGrades[roster.entry_id] || {};
              const stacks = rosterStacks[roster.entry_id] || [];
              // Tooltip: show archetype boost contribution
              const archNorm  = archetypeRarityNorm(roster.path.rb);
              const boostPct  = Math.round(archetypeBoostMax * archNorm * 100);
              const tooltipTxt = `Draft rarity × ${scores.archBoost ?? '—'}× arch boost (+${boostPct}% from ${roster.path.rb})`;
              const gradeTooltip = grade.grade ? `Proj: ${grade.projScore} | CLV: ${grade.clvScore} | Rarity: ${grade.rarityScore} | Stack: ${grade.stackScore} → ${grade.composite}` : '';
              return (
                <React.Fragment key={roster.entry_id}>
                  <tr
                    style={{ ...styles.row, ...(isOpen ? styles.rowOpen : {}) }}
                    onClick={() => setExpandedEntry(isOpen ? null : roster.entry_id)}
                  >
                    <td style={styles.td}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                        <span style={styles.entryId}>{shortEntry(roster.entry_id)}</span>
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
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      {grade.grade ? (
                        <span title={gradeTooltip} style={{
                          fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700,
                          color: grade.grade.color, cursor: 'help',
                        }}>
                          {grade.grade.letter}
                        </span>
                      ) : <span style={{ color: '#555' }}>—</span>}
                    </td>

                    <td style={{ ...styles.td, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: '#bbb' }}>
                      {roster.draftDate
                        ? roster.draftDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                        : '—'}
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center' }}><PositionSnapshot snap={roster.posSnap} /></td>
                    <td style={{ ...styles.td, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: '#60a5fa' }}>
                      {roster.projectedPoints > 0 ? roster.projectedPoints.toFixed(1) : '—'}
                    </td>
                    <td style={styles.td}><ArchetypePill archetypeKey={roster.path.rb} /></td>
                    <td style={styles.td}><ArchetypePill archetypeKey={roster.path.qb} /></td>
                    <td style={styles.td}><ArchetypePill archetypeKey={roster.path.te} /></td>

                    {/* Composite Uniq Lift — rank-normalized color, archetype boost shown on hover */}
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      <span
                        title={tooltipTxt}
                        style={{
                          ...styles.uniqBadge,
                          color: uniquenessColor(scores.uniqLiftNorm ?? 0.5),
                          borderColor: uniquenessColor(scores.uniqLiftNorm ?? 0.5) + '55',
                        }}
                      >
                        {scores.rarity?.toFixed(2) ?? '—'}
                      </span>
                    </td>

                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      <span style={{ ...styles.clvBadge, color: clv.color, borderColor: clv.color + '44' }}>{clv.text}</span>
                    </td>
                    <td style={{ ...styles.td, textAlign: 'center' }}>
                      <span style={styles.chevron}>{isOpen ? '▲' : '▼'}</span>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={11} style={{ padding: 0 }}>
                        <PlayerDetail players={roster.players} alpha={alpha} stacks={stacks} grade={grade} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Filter group sub-component ────────────────────────────────────────────────

function FilterGroup({ label, options, value, onChange, counts = {} }) {
  const archetypeOptions = options.filter(o => o !== 'all');
  const total = archetypeOptions.reduce((sum, opt) => sum + (counts[opt] || 0), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ ...styles.filterGroupLabel, minWidth: 32 }}>{label}</span>
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
                style={{
                  ...styles.filterBtn,
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
        <div style={{ display: 'flex', marginLeft: 44, height: 8, borderRadius: 4, overflow: 'hidden', background: 'rgba(255,255,255,0.05)' }}>
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

function DraftCapitalMap({ players }) {
  const maxRound = 18;
  // Group picks by round
  const byRound = {};
  players.forEach(p => {
    const r = parseInt(p.round) || 0;
    if (r >= 1 && r <= maxRound) {
      if (!byRound[r]) byRound[r] = [];
      byRound[r].push(p);
    }
  });

  // Position summary
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

  return (
    <div style={{ padding: '13px 18px 8px', borderBottom: '1px solid #0f0f0f' }}>
      <div style={{ display: 'flex', gap: 3, alignItems: 'flex-end' }}>
        {Array.from({ length: maxRound }, (_, i) => i + 1).map(round => {
          const picks = byRound[round] || [];
          return (
            <div key={round} style={{ display: 'flex', flexDirection: 'column-reverse', alignItems: 'center', gap: 1, minWidth: 33 }}>
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
              {picks.length === 0 && (
                <div style={{ width: 30, height: 22, borderRadius: 3, background: '#111', border: '1px solid #1a1a1a' }} />
              )}
              <span style={{ fontSize: 9, color: '#555', fontFamily: "'JetBrains Mono', monospace", marginTop: 3 }}>R{round}</span>
            </div>
          );
        })}
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#888',
        marginTop: 8, letterSpacing: 0.3,
      }}>
        {summaryParts.join(' | ')}
      </div>
    </div>
  );
}

// ── Stack summary bar ────────────────────────────────────────────────────────

function StackSummaryBar({ stacks }) {
  if (!stacks || stacks.length === 0) return null;
  return (
    <div style={{
      padding: '10px 18px', borderBottom: '1px solid #0f0f0f',
      display: 'flex', gap: 15, flexWrap: 'wrap', alignItems: 'center',
    }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: '#666', letterSpacing: 1.5, textTransform: 'uppercase' }}>STACKS</span>
      {stacks.map((s, i) => (
        <span key={i} style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: 13,
          background: s.color + '15', color: s.color,
          border: `1px solid ${s.color}33`, borderRadius: 4,
          padding: '4px 10px',
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
    { label: 'STACK', score: grade.stackScore, color: '#f59e0b' },
  ];
  return (
    <div style={{
      padding: '10px 18px', borderBottom: '1px solid #0f0f0f',
      display: 'flex', gap: 20, alignItems: 'center',
    }}>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 28, fontWeight: 700,
        color: grade.grade.color, minWidth: 50, textAlign: 'center',
      }}>
        {grade.grade.letter}
      </div>
      <div style={{ display: 'flex', gap: 15, flex: 1 }}>
        {bars.map(b => (
          <div key={b.label} style={{ flex: 1, minWidth: 75 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: '#888', letterSpacing: 1 }}>{b.label}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: b.color, fontWeight: 700 }}>{b.score}</span>
            </div>
            <div style={{ height: 5, background: '#1a1a1a', borderRadius: 2 }}>
              <div style={{
                height: 5, borderRadius: 2, background: b.color,
                width: `${b.score}%`, transition: 'width 0.3s',
              }} />
            </div>
          </div>
        ))}
      </div>
      <div style={{
        fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: '#666',
      }}>
        {grade.composite}/100
      </div>
    </div>
  );
}

// ── Expanded player detail ────────────────────────────────────────────────────

function PlayerDetail({ players, alpha = 0.5, stacks = [], grade = {} }) {
  const [pSort, setPSort] = useState('pick');
  const [pDir,  setPDir]  = useState('asc');

  // Build a set of player names that are in stacks for dot indicators
  const stackPlayerTeams = useMemo(() => {
    const map = {};
    stacks.forEach(s => {
      s.members.forEach(m => { map[m.name] = s.color; });
    });
    return map;
  }, [stacks]);

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
  function PI({ col }) {
    if (pSort !== col) return <span style={{ opacity: 0.2, marginLeft: 4 }}>↕</span>;
    return <span style={{ marginLeft: 4 }}>{pDir === 'desc' ? '↓' : '↑'}</span>;
  }

  return (
    <div style={styles.detail}>
      <GradeCard grade={grade} />
      <DraftCapitalMap players={players} />
      <StackSummaryBar stacks={stacks} />
      <table style={{ ...styles.table }}>
        <thead>
          <tr style={{ ...styles.thead, background: '#080808' }}>
            <th style={styles.dth} onClick={() => tp('name')}>Player <PI col="name" /></th>
            <th style={{ ...styles.dth, textAlign: 'center' }}>Pos</th>
            <th style={{ ...styles.dth, textAlign: 'center' }}>Team</th>
            <th style={{ ...styles.dth, textAlign: 'center' }} onClick={() => tp('pick')}>Draft Pick <PI col="pick" /></th>
            <th style={{ ...styles.dth, textAlign: 'center' }} onClick={() => tp('projectedPoints')}>Proj Pts <PI col="projectedPoints" /></th>
            <th style={{ ...styles.dth, textAlign: 'center' }} onClick={() => tp('adp')}>Cur ADP <PI col="adp" /></th>
            <th style={{ ...styles.dth, textAlign: 'center', color: '#00e5a055' }} onClick={() => tp('clv')}>CLV% <PI col="clv" /></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((p, i) => {
            const clvPct = calcCLV(p.pick, p.latestADP, alpha);
            const clv = clvLabel(clvPct);
            const stackColor = stackPlayerTeams[p.name];
            return (
              <tr key={`${p.name}-${i}`} style={styles.drow}>
                <td style={styles.dtd}>
                  <span style={styles.playerName}>
                    {stackColor && <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: stackColor, marginRight: 6, verticalAlign: 'middle' }} />}
                    {p.name}
                  </span>
                </td>
                <td style={{ ...styles.dtd, textAlign: 'center' }}>
                  <span style={{ ...styles.posPill, background: posColor(p.position) + '22', color: posColor(p.position), borderColor: posColor(p.position) + '55' }}>
                    {p.position}
                  </span>
                </td>
                <td style={{ ...styles.dtd, textAlign: 'center', color: '#e0e0e0', fontFamily: "'JetBrains Mono', monospace", fontSize: 14 }}>{p.team}</td>
                <td style={{ ...styles.dtd, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 15 }}>{p.pick || '—'}</td>
                <td style={{ ...styles.dtd, textAlign: 'center', color: '#ececec', fontFamily: "'JetBrains Mono', monospace", fontSize: 15 }}>{p.projectedPoints ? p.projectedPoints.toFixed(1) : '—'}</td>
                <td style={{ ...styles.dtd, textAlign: 'center', fontFamily: "'JetBrains Mono', monospace", fontSize: 15, color: '#f0f0f0' }}>{p.latestADPDisplay || '—'}</td>
                <td style={{ ...styles.dtd, textAlign: 'center' }}>
                  {clvPct !== null ? (
                    <div style={styles.clvBar}>
                      <div style={{
                        ...styles.clvFill,
                        width: `${Math.min(Math.abs(clvPct), 100)}%`,
                        background: clv.color,
                        marginLeft: clvPct >= 0 ? '50%' : `${50 - Math.min(Math.abs(clvPct), 50)}%`,
                      }} />
                      <span style={{ ...styles.clvText, color: clv.color }}>{clv.text}</span>
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

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = {
  searchHighlight: {
    background: '#00e5a025', color: '#00e5a0',
    borderRadius: 2, padding: '0 1px', fontWeight: 700,
  },
  root: { fontFamily: "'DM Sans', sans-serif", color: 'var(--text-primary)', padding: '0 0 40px', overflowY: 'auto', flex: 1, minHeight: 0 },
  header: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    marginBottom: 20, paddingBottom: 18, borderBottom: '1px solid var(--border)',
  },
  title: { fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 700, letterSpacing: 3, color: 'var(--text-primary)', margin: 0 },
  subtitle: { fontSize: 14, color: 'var(--text-primary)', margin: '5px 0 0', fontFamily: "'JetBrains Mono', monospace" },

  controlPanel: {
    background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12,
    padding: 20, display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 18,
  },
  sectionLabel: {
    fontSize: 13, fontWeight: 700, textTransform: 'uppercase',
    letterSpacing: '0.05em', color: 'var(--text-secondary)',
    fontFamily: "'JetBrains Mono', monospace",
  },
  sectionDivider: { borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16 },

  filterGroupLabel: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: 1.5,
    textTransform: 'uppercase', color: 'var(--text-primary)', minWidth: 28,
  },
  filterBtn: {
    background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-primary)',
    borderRadius: 6, padding: '5px 11px', fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace", cursor: 'pointer',
    letterSpacing: 0.3, transition: 'all 0.12s', whiteSpace: 'nowrap',
  },
  filterBtnActive: {},

  tableWrap: { overflowX: 'auto', borderRadius: 8, border: '1px solid var(--border)' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 16 },
  thead: { background: 'rgba(0,0,0,0.2)' },
  th: {
    padding: '14px 18px', textAlign: 'left',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700,
    letterSpacing: 1.5, color: 'var(--text-secondary)', textTransform: 'uppercase',
    cursor: 'pointer', userSelect: 'none',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  },
  row: { borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' },
  rowOpen: { background: 'var(--bg-dark)', borderBottom: '1px solid #00e5a07a' },
  td: { padding: '14px 18px', verticalAlign: 'middle' },
  entryId: { fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: 'var(--text-secondary)', letterSpacing: 0.5 },
  clvBadge: {
    fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700,
    border: '1px solid', borderRadius: 4, padding: '3px 9px',
  },
  chevron: { color: 'var(--text-secondary)', fontSize: 13, fontFamily: "'JetBrains Mono', monospace" },

  detail: { background: 'var(--bg-dark)', borderTop: '1px solid #00e5a01a' },
  dth: {
    padding: '11px 18px', textAlign: 'left',
    fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700,
    letterSpacing: 1.5, color: 'var(--text-primary)', textTransform: 'uppercase',
    cursor: 'pointer', userSelect: 'none',
    borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
  },
  drow: { borderBottom: '1px solid var(--border)' },
  dtd: { padding: '10px 18px', verticalAlign: 'middle' },
  playerName: { fontWeight: 500, color: 'var(--text-secondary)', fontSize: 16 },
  posPill: { fontSize: 13, fontFamily: "'JetBrains Mono', monospace", border: '1px solid', borderRadius: 3, padding: '2px 6px', letterSpacing: 0.5 },
  clvBar: { position: 'relative', width: '100%', height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' },
  clvFill: { position: 'absolute', height: 4, top: '50%', transform: 'translateY(-50%)', borderRadius: 2, opacity: 0.5, maxWidth: '50%' },
  clvText: { position: 'relative', fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 700, zIndex: 1, background: 'var(--bg-dark)', padding: '0 5px' },

  empty: { textAlign: 'center', padding: '75px 25px', color: 'var(--text-primary)', fontFamily: "'JetBrains Mono', monospace" },

  uniqBadge: {
    fontFamily: "'JetBrains Mono', monospace",
    fontSize: 14,
    fontWeight: 700,
    border: '1px solid',
    borderRadius: 4,
    padding: '3px 9px',
    cursor: 'help',
  },
};