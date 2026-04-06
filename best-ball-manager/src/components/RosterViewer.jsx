// src/components/RosterViewer.jsx
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { loadSimData, buildComboKey, lookupTier1 } from '../utils/uniquenessEngine';
import { canonicalName } from '../utils/helpers';
import { useVirtualizer } from '@tanstack/react-virtual';
import { classifyRosterPath, ARCHETYPE_METADATA } from '../utils/rosterArchetypes';
import useMediaQuery from '../hooks/useMediaQuery';
import { CombinedSearchInput } from './filters';
import { NFL_TEAMS } from '../utils/nflTeams';
import TournamentMultiSelect from './TournamentMultiSelect';
import css from './RosterViewer.module.css';
import { trackEvent } from '../utils/analytics';

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

// ── Uniqueness display helper ────────────────────────────────────────────────��

/**
 * Format a uniqueness score for display.
 * @param {{ found: boolean, count?: number, totalRosters: number }|null} score
 * @param {boolean} loading - true while sim data is still fetching
 * @returns {{ text: string, muted: boolean }}
 */
function formatUniqueness(score, loading) {
  if (loading || !score) return { text: '—', muted: true };
  if (!score.found) return { text: '0.0', muted: false };
  const perMillion = (score.count / (score.totalRosters / 1_000_000)).toFixed(1);
  return { text: perMillion, muted: false };
}

// ── Archetype display helpers ─────────────────────────────────────────────────

function archetypeColor(key) { return ARCHETYPE_METADATA[key]?.color || '#6b7280'; }

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

// ── Sort icon ─────────────────────────────────────────────────────────────────

function SortIcon({ col, sortKey, sortDir }) {
  if (sortKey !== col) return <span style={{ opacity: 0.25, marginLeft: 5 }}>↕</span>;
  return <span style={{ marginLeft: 5 }}>{sortDir === 'desc' ? '↓' : '↑'}</span>;
}

// ── Position snapshot ─────────────────────────────────────────────────────────

const POS_COLORS = {
  QB: '#BF44EF', RB: '#10B981', WR: '#F59E0B', TE: '#3B82F6',
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

const RB_OPTIONS = ['all', 'RB_ZERO', 'RB_HERO', 'RB_DOUBLE_ANCHOR', 'RB_HYPER_FRAGILE', 'RB_BALANCED'];
const QB_OPTIONS = ['all', 'QB_ELITE', 'QB_CORE', 'QB_LATE'];
const TE_OPTIONS = ['all', 'TE_ELITE', 'TE_ANCHOR', 'TE_LATE'];

// All chip groups for mobile
const CHIP_GROUPS = [
  { pos: 'RB', options: RB_OPTIONS.filter(o => o !== 'all') },
  { pos: 'QB', options: QB_OPTIONS.filter(o => o !== 'all') },
  { pos: 'TE', options: TE_OPTIONS.filter(o => o !== 'all') },
];

const SORT_OPTIONS = [
  { value: 'draftDate', label: 'Draft Date' },
  { value: 'avgCLV', label: 'Avg CLV' },
  { value: 'uniqueness', label: 'Early Combo Rate' },
];


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

export default function RosterViewer({ rosterData = [], masterPlayers = [], initialFilter = null }) {
  const { isMobile } = useMediaQuery();
  const [expandedEntry, setExpandedEntry]   = useState(null);
  const [filtersOpen, setFiltersOpen]       = useState(false);
  const [sortKey, setSortKey]               = useState('avgCLV');
  const [sortDir, setSortDir]               = useState('desc');
  const alpha = 0.5; // Balanced CLV curve
  const [clvFilter, setClvFilter]           = useState('all');
  const [rbFilter,  setRbFilter]            = useState(() => initialFilter?.archetype?.rb ?? 'all');
  const [qbFilter,  setQbFilter]            = useState(() => initialFilter?.archetype?.qb ?? 'all');
  const [teFilter,  setTeFilter]            = useState(() => initialFilter?.archetype?.te ?? 'all');
  const [selectedTournaments, setSelectedTournaments] = useState([]);
  const [combinedSearch, setCombinedSearch] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState(() => initialFilter?.players ?? []);
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [navBannerPlayers, setNavBannerPlayers] = useState(() => initialFilter?.players ?? []);
  const [navBannerArchetype, setNavBannerArchetype] = useState(() => initialFilter?.archetype ?? null);
  const scrollRef = useRef(null);

  // ── Simulation data ──────────────────────────────────────────────────────────
  const [tier1, setTier1] = useState(null);
  useEffect(() => { loadSimData().then(setTier1); }, []);

  // name (lowercase, normalised) → player_id from masterPlayers (uses full team name — matches sim format)
  const nameToPlayerId = useMemo(() => {
    const map = new Map();
    masterPlayers.forEach(p => {
      if (p.player_id && p.name)
        map.set(canonicalName(p.name), p.player_id);
    });
    return map;
  }, [masterPlayers]);

  // Unique player names for autocomplete
  const allPlayerNames = useMemo(() => {
    const names = new Set();
    rosterData.forEach(p => { if (p.name) names.add(p.name); });
    return [...names].sort();
  }, [rosterData]);

  // Unique team names for autocomplete
  const allTeamNames = useMemo(() => {
    const teams = new Set();
    rosterData.forEach(p => { if (p.team) teams.add(p.team); });
    return [...teams].sort();
  }, [rosterData]);

  const combinedQuery = combinedSearch.trim().toLowerCase();

  const playerSuggestions = useMemo(() => {
    if (!combinedQuery) return [];
    return allPlayerNames
      .filter(n => n.toLowerCase().includes(combinedQuery) && !selectedPlayers.includes(n))
      .slice(0, 6);
  }, [combinedQuery, allPlayerNames, selectedPlayers]);

  const teamSuggestions = useMemo(() => {
    if (!combinedQuery) return allTeamNames.filter(t => !selectedTeams.includes(t));
    return allTeamNames
      .filter(t => {
        if (selectedTeams.includes(t)) return false;
        const fullName = (NFL_TEAMS[t] || '').toLowerCase();
        return t.toLowerCase().includes(combinedQuery) || fullName.includes(combinedQuery);
      })
      .slice(0, 4);
  }, [combinedQuery, allTeamNames, selectedTeams]);

  const addTeam = useCallback((team) => {
    if (team && !selectedTeams.includes(team)) {
      setSelectedTeams(prev => [...prev, team]);
    }
    setCombinedSearch('');
  }, [selectedTeams]);

  const removeTeam = useCallback((team) => {
    setSelectedTeams(prev => prev.filter(t => t !== team));
  }, []);

  const addPlayer = useCallback((name) => {
    if (name && !selectedPlayers.includes(name)) {
      setSelectedPlayers(prev => [...prev, name]);
    }
    setCombinedSearch('');
  }, [selectedPlayers]);

  const removePlayer = useCallback((name) => {
    setSelectedPlayers(prev => prev.filter(n => n !== name));
  }, []);

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
      const slateTitle = players[0]?.slateTitle || null;

      const projectedPoints = players.reduce((sum, p) => sum + (p.projectedPoints || 0), 0);

      // Annotate each player with simulation player_id via masterPlayers name lookup
      const annotatedPlayers = players.map(p => ({
        ...p,
        player_id: nameToPlayerId.get(canonicalName(p.name)) ?? null,
      }));

      const adpPlatform = players.find(p => p.adpPlatform !== 'global')?.adpPlatform || 'global';
      return { entry_id, players: annotatedPlayers, avgCLV, posSnap, count: players.length, path, draftDate, tournamentTitle, slateTitle, projectedPoints, adpPlatform };
    });
  }, [rosterData, alpha, nameToPlayerId]);

  // Per-roster uniqueness score via Tier 1 simulation lookup
  const rosterScores = useMemo(() => {
    const byId = {};
    rosters.forEach(r => {
      const key = buildComboKey(r.players);
      const hit = key && tier1 ? lookupTier1(key, tier1) : null;
      byId[r.entry_id] = hit
        ? { found: true, count: hit.count, totalRosters: hit.totalRosters }
        : { found: false, totalRosters: tier1?.metadata?.total_rosters ?? 10000000 };
    });
    return byId;
  }, [rosters, tier1]);



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
    if (selectedTournaments.length > 0) {
      list = list.filter(r => selectedTournaments.includes(r.tournamentTitle));
    }

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
      if (sortKey === 'uniqueness') {
        const as = rosterScores[a.entry_id];
        const bs = rosterScores[b.entry_id];
        const av = as?.found ? as.count : 0;
        const bv = bs?.found ? bs.count : 0;
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return list;
  }, [rosters, sortKey, sortDir, clvFilter, rbFilter, qbFilter, teFilter, selectedTournaments, rosterScores, selectedPlayers, selectedTeams, rosterSearchMatches]);

  const slateGroups = useMemo(() => {
    const map = new Map();
    rosters.forEach(r => {
      if (!r.tournamentTitle) return;
      const slate = r.slateTitle || 'Other';
      if (!map.has(slate)) map.set(slate, new Set());
      map.get(slate).add(r.tournamentTitle);
    });
    return [...map.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([slate, tourns]) => ({ slate, tournaments: [...tourns].sort() }));
  }, [rosters]);

  // Base list with all non-archetype filters applied
  const baseFiltered = useMemo(() => {
    let list = [...rosters];
    if (selectedPlayers.length > 0) list = list.filter(r => r.entry_id in rosterSearchMatches);
    if (selectedTeams.length > 0) list = list.filter(r => selectedTeams.every(team => r.players.some(p => p.team === team && !selectedPlayers.includes(p.name))));
    if (clvFilter === 'positive') list = list.filter(r => r.avgCLV !== null && r.avgCLV >= 0);
    if (clvFilter === 'negative') list = list.filter(r => r.avgCLV !== null && r.avgCLV < 0);
    if (selectedTournaments.length > 0) {
      list = list.filter(r => selectedTournaments.includes(r.tournamentTitle));
    }
    return list;
  }, [rosters, clvFilter, selectedTournaments, selectedPlayers, selectedTeams, rosterSearchMatches]);

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
  // eslint-disable-next-line react-hooks/incompatible-library
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

  // Build active filter summary pills for collapsed state (must be before early return)
  const activeFilterPills = useMemo(() => {
    const pills = [];
    if (selectedPlayers.length > 0) pills.push(...selectedPlayers.map(n => ({ label: n, color: '#00e5a0' })));
    if (selectedTeams.length > 0) pills.push(...selectedTeams.map(t => ({ label: t, color: '#60a5fa' })));
    if (rbFilter !== 'all') pills.push({ label: ARCHETYPE_METADATA[rbFilter]?.name || rbFilter, color: archetypeColor(rbFilter) });
    if (qbFilter !== 'all') pills.push({ label: ARCHETYPE_METADATA[qbFilter]?.name || qbFilter, color: archetypeColor(qbFilter) });
    if (teFilter !== 'all') pills.push({ label: ARCHETYPE_METADATA[teFilter]?.name || teFilter, color: archetypeColor(teFilter) });
    if (clvFilter !== 'all') pills.push({ label: clvFilter === 'positive' ? '+CLV' : '-CLV', color: '#00e5a0' });
    if (selectedTournaments.length > 0) pills.push({ label: `Tournament: ${selectedTournaments.length} selected`, color: '#f59e0b', onClear: () => setSelectedTournaments([]) });
    return pills;
  }, [selectedPlayers, selectedTeams, rbFilter, qbFilter, teFilter, clvFilter, selectedTournaments]);

  if (!rosterData.length) {
    return (
      <div className={css.empty}>
        <span style={{ fontSize: 50 }}>📋</span>
        <p>No roster data loaded. Sync your portfolio from the Chrome extension to get started.</p>
      </div>
    );
  }

  // ── Render: Mobile Card ─────────────────────────────────────────────────────

  const renderRosterCard = (roster, virtualRow) => {
    const clv    = clvLabel(roster.avgCLV);
    const isOpen = expandedEntry === roster.entry_id;
    const uniq   = formatUniqueness(rosterScores[roster.entry_id], !tier1);

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
        onClick={() => { if (!isOpen) trackEvent('roster_viewed'); setExpandedEntry(isOpen ? null : roster.entry_id); }}
      >
        {/* Header: Entry + Chevron */}
        <div className={css.rosterCardHeader}>
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

        {/* Footer: stats */}
        <div className={css.rosterCardFooter}>
          <div className={css.cardStat}>
            <span className={css.cardStatLabel}>CLV</span>
            <span className={css.cardStatValue} style={{ color: clv.color }}>{clv.text}</span>
          </div>
          <div className={css.cardStat}>
            <span className={css.cardStatLabel}>Uniq</span>
            <span className={css.cardStatValue} style={{ color: uniq.muted ? 'var(--text-muted)' : 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {uniq.text}
            </span>
          </div>
        </div>

        {/* Expanded detail */}
        {isOpen && (
          <div className={css.rosterCardExpanded} onClick={e => e.stopPropagation()}>
            <DraftCapitalMap players={roster.players} isMobile={true} />
            <div className={css.playerListScroll}>
              <PlayerDetail players={roster.players} alpha={alpha} isMobile={true} />
            </div>
          </div>
        )}
      </div>
    );
  };

  // ── Render: Mobile Sort Bar ─────────────────────────────────────────────────

  const renderMobileSortBar = () => (
    <div className={css.sortBar}>
      <select
        className="filter-select"
        style={{ flex: 1 }}
        value={sortKey}
        onChange={e => {
          const key = e.target.value;
          setSortKey(key);
          setSortDir(key === 'avgCLV' ? 'desc' : 'asc');
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
    <div className="filter-chip-group filter-chip-group--scroll">
      {CHIP_GROUPS.map((group, gi) => (
        <React.Fragment key={group.pos}>
          {gi > 0 && <div className="filter-chip-group__separator" />}
          {group.options.map(opt => {
            const active = isChipActive(opt);
            const color = archetypeColor(opt);
            return (
              <button
                key={opt}
                className={`filter-chip ${active ? 'filter-chip--active' : ''}`}
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
      style={{ overflowY: 'auto', minHeight: 400, flexShrink: 0, borderRadius: 8, border: '1px solid var(--border-subtle)' }}
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
              <span key={i} style={{ background: p.color + '18', color: p.color, border: `1px solid ${p.color}40` }} className="filter-badge">
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
              <CombinedSearchInput
                selectedPlayers={selectedPlayers}
                selectedTeams={selectedTeams}
                onAddPlayer={addPlayer}
                onAddTeam={addTeam}
                onRemovePlayer={removePlayer}
                onRemoveTeam={removeTeam}
                onClear={() => { setSelectedPlayers([]); setSelectedTeams([]); setCombinedSearch(''); }}
                playerSuggestions={playerSuggestions}
                teamSuggestions={teamSuggestions}
                teamNames={NFL_TEAMS}
                searchValue={combinedSearch}
                onSearchChange={setCombinedSearch}
                placeholder="Search players & teams..."
                label="Player / Team Search"
              />
              {(selectedPlayers.length > 0 || selectedTeams.length > 0) && (
                <span className="filter-count" style={{ marginLeft: 0 }}>
                  <strong style={{ color: '#00e5a0' }}>{displayed.length}</strong>
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
                <label className="filter-select-label">Tournament</label>
                <TournamentMultiSelect
                  slateGroups={slateGroups}
                  selected={selectedTournaments}
                  onChange={setSelectedTournaments}
                />
              </div>
              <div style={{ width: '100%' }}>
                <label className="filter-select-label">CLV Filter</label>
                <div className="filter-chip-group">
                  {[['all', 'All'], ['positive', '+CLV'], ['negative', '-CLV']].map(([v, lbl]) => (
                    <button key={v} className={`filter-chip ${clvFilter === v ? 'filter-chip--active' : ''}`} onClick={() => setClvFilter(v)}>
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

    // Desktop/Tablet — no longer called (handled by renderDesktopFilters)
    return null;
  };

  const renderDesktopFilters = () => (
    <>
      {/* Row 1: Search + Tournament + CLV + Result Count */}
      <div className={css.filterRow1}>
        <div style={{ flex: '0 1 375px', minWidth: 180 }}>
          <CombinedSearchInput
            selectedPlayers={selectedPlayers}
            selectedTeams={selectedTeams}
            onAddPlayer={addPlayer}
            onAddTeam={addTeam}
            onRemovePlayer={removePlayer}
            onRemoveTeam={removeTeam}
            onClear={() => { setSelectedPlayers([]); setSelectedTeams([]); setCombinedSearch(''); }}
            playerSuggestions={playerSuggestions}
            teamSuggestions={teamSuggestions}
            teamNames={NFL_TEAMS}
            searchValue={combinedSearch}
            onSearchChange={setCombinedSearch}
            placeholder="Search players & teams..."
            label="Player / Team Search"
          />
        </div>
        <TournamentMultiSelect
          slateGroups={slateGroups}
          selected={selectedTournaments}
          onChange={setSelectedTournaments}
        />
        <div className="filter-chip-group">
          {[['all', 'All'], ['positive', '+CLV'], ['negative', '-CLV']].map(([v, lbl]) => (
            <button key={v} className={`filter-chip ${clvFilter === v ? 'filter-chip--active' : ''}`} onClick={() => setClvFilter(v)}>
              {lbl}
            </button>
          ))}
        </div>
        {activeFilterPills.length > 0 && (
          <span className="filter-count" style={{ marginLeft: 0 }}>
            <strong style={{ color: 'var(--positive)' }}>{displayed.length}</strong>
            {' '}roster{displayed.length !== 1 ? 's' : ''} match
          </span>
        )}
      </div>

      {/* Row 2: RB | QB | TE archetype chips */}
      <div className={css.filterRow2}>
        <FilterGroup label="RB" options={RB_OPTIONS} value={rbFilter} onChange={setRbFilter} counts={rbCounts} />
        <div className={css.filterSep} />
        <FilterGroup label="QB" options={QB_OPTIONS} value={qbFilter} onChange={setQbFilter} counts={qbCounts} />
        <div className={css.filterSep} />
        <FilterGroup label="TE" options={TE_OPTIONS} value={teFilter} onChange={setTeFilter} counts={teCounts} />
      </div>
    </>
  );

  const renderControlPanel = () => (
    <div className={css.controlPanel}>
      {isMobile ? (
        <>
          {renderFilterToggleHeader()}
          {renderFilterBody()}
        </>
      ) : (
        renderDesktopFilters()
      )}
    </div>
  );

  // ── Render: Desktop Table ───────────────────────────────────────────────────

  const renderTable = () => (
    <div className={css.tableWrap} ref={scrollRef}>
      <table className={css.table}>
        <thead>
          <tr className={css.thead}>
            <th className={css.th} onClick={() => toggleSort('entry_id')}>Entry <SortIcon col="entry_id" sortKey={sortKey} sortDir={sortDir} /></th>
            <th className={css.th} style={{ textAlign: 'center' }} onClick={() => toggleSort('draftDate')}>Draft Date <SortIcon col="draftDate" sortKey={sortKey} sortDir={sortDir} /></th>
            <th className={css.th} style={{ textAlign: 'center' }}>Snapshot</th>
            <th className={`${css.th} ${css.colProjPts}`} style={{ textAlign: 'center', color: '#60a5fa' }} onClick={() => toggleSort('projectedPoints')}>Proj Pts <SortIcon col="projectedPoints" sortKey={sortKey} sortDir={sortDir} /></th>
            <th className={css.th} style={{ color: archetypeColor('RB_HERO') }} onClick={() => toggleSort('path.rb')}>RB Arch <SortIcon col="path.rb" sortKey={sortKey} sortDir={sortDir} /></th>
            <th className={css.th} style={{ color: archetypeColor('QB_CORE') }} onClick={() => toggleSort('path.qb')}>QB Arch <SortIcon col="path.qb" sortKey={sortKey} sortDir={sortDir} /></th>
            <th className={css.th} style={{ color: archetypeColor('TE_ANCHOR') }} onClick={() => toggleSort('path.te')}>TE Arch <SortIcon col="path.te" sortKey={sortKey} sortDir={sortDir} /></th>
            <th
              className={`${css.th} ${css.colUniq}`}
              style={{ textAlign: 'center', color: '#7dffcc' }}
              onClick={() => toggleSort('uniqueness')}
              title="Expected occurrences of this roster's first-4-round player combo per 1 million simulated drafts"
            >
              Early Combo Rate / 1M <SortIcon col="uniqueness" sortKey={sortKey} sortDir={sortDir} />
            </th>
            <th className={css.th} style={{ textAlign: 'center', color: '#00e5a0' }} onClick={() => toggleSort('avgCLV')}>Avg CLV% <SortIcon col="avgCLV" sortKey={sortKey} sortDir={sortDir} /></th>
            <th className={css.th} style={{ textAlign: 'center', cursor: 'default' }}></th>
          </tr>
        </thead>
        <tbody>
          {displayed.map((roster) => {
            const clv    = clvLabel(roster.avgCLV);
            const isOpen = expandedEntry === roster.entry_id;
            const uniq = formatUniqueness(rosterScores[roster.entry_id], !tier1);
            const uniqTooltip = rosterScores[roster.entry_id]?.found
              ? 'Observed in simulation — exact frequency count per simulated rosters.'
              : !tier1 ? 'Loading simulation data…' : 'Not observed — this is a uniquely rare combo.';
            return (
              <React.Fragment key={roster.entry_id}>
                <tr
                  className={`${css.row} ${isOpen ? css.rowOpen : ''}`}
                  onClick={() => { if (!isOpen) trackEvent('roster_viewed'); setExpandedEntry(isOpen ? null : roster.entry_id); }}
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

                  {/* Uniqueness — simulation-based frequency lookup */}
                  <td className={`${css.td} ${css.colUniq}`} style={{ textAlign: 'center' }}>
                    <span
                      title={uniqTooltip}
                      aria-label={uniqTooltip}
                      className={css.uniqBadge}
                      style={{
                        display: 'inline-block',
                        minWidth: '7ch',
                        textAlign: 'right',
                        color: uniq.muted ? 'var(--text-muted)' : 'var(--text-primary)',
                        borderColor: 'transparent',
                        fontVariantNumeric: 'tabular-nums',
                      }}
                    >
                      {uniq.text}
                    </span>
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
                    <td colSpan={10} style={{ padding: 0 }}>
                      <PlayerDetail players={roster.players} alpha={alpha} isMobile={false} />
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
      {navBannerArchetype ? (
        <div className={css.navBanner}>
          {(() => {
            const type = Object.keys(navBannerArchetype)[0];
            const key = navBannerArchetype[type];
            const label = ARCHETYPE_METADATA[key]?.name ?? key;
            return (
              <>
                Showing {type.toUpperCase()} archetype: <strong>{label}</strong>
                {' — '}
                <button
                  className={css.navBannerClear}
                  onClick={() => {
                    if (type === 'rb') setRbFilter('all');
                    else if (type === 'qb') setQbFilter('all');
                    else if (type === 'te') setTeFilter('all');
                    setNavBannerArchetype(null);
                  }}
                >
                  Clear filter
                </button>
              </>
            );
          })()}
        </div>
      ) : navBannerPlayers.length > 0 ? (
        <div className={css.navBanner}>
          Showing rosters containing <strong>{navBannerPlayers.join(', ')}</strong>
          {' — '}
          <button
            className={css.navBannerClear}
            onClick={() => { setNavBannerPlayers([]); setSelectedPlayers([]); }}
          >
            Clear filter
          </button>
        </div>
      ) : null}
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
    <div className={css.filterGroupInner}>
      <span className={css.filterGroupLabel} style={{ color: POS_COLORS[label] }}>{label}</span>
      <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
        {options.map(opt => {
          const isActive = value === opt;
          const color = opt === 'all' ? '#E8BF4A' : archetypeColor(opt);
          const name = opt === 'all' ? 'All' : (ARCHETYPE_METADATA[opt]?.name || opt);
          const count = counts[opt];
          return (
            <button
              key={opt}
              title={ARCHETYPE_METADATA[opt]?.desc}
              className={`filter-chip ${isActive ? 'filter-chip--active' : ''}`}
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

// ── Expanded player detail ────────────────────────────────────────────────────

function PlayerDetail({ players, alpha = 0.5, isMobile = false }) {
  const [pSort, setPSort] = useState('pick');
  const [pDir,  setPDir]  = useState('asc');

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
          return (
            <div key={`${p.name}-${i}`} className={css.playerDetailCard}>
              <div className={css.playerDetailRow1}>
                <span className={css.playerDetailName}>
                  {p.name}
                </span>
                <span className={css.posPill} style={{ background: posColor(p.position) + '22', color: posColor(p.position), borderColor: posColor(p.position) + '55' }}>
                  {p.position}
                </span>
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
      <DraftCapitalMap players={players} isMobile={false} />
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
            return (
              <tr key={`${p.name}-${i}`} className={css.drow}>
                <td className={css.dtd}>
                  <span className={css.playerName}>
                    {p.name}
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
