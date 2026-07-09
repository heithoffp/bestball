import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LabelList, Cell } from 'recharts';
import {
  BarChart3, Users, TrendingUp, ListOrdered, Crosshair, FolderSync, Network,
  Layers, Scale, Link2, Trophy, Star, TrendingDown,
} from 'lucide-react';
import EmptyState from './EmptyState';
import { analyzePortfolioTree, ARCHETYPE_METADATA } from '../utils/rosterArchetypes';
import { NFL_TEAMS_ABBREV } from '../utils/nflTeams';
import { canonicalName } from '../utils/helpers';
import { calcCLV, clvLabel } from '../utils/clvHelpers';
import { aggregatePortfolioPlayoffStacks, PLAYOFF_WEEKS } from '../utils/playoffStacks';
import playoffSchedule from '../data/playoff-schedule-2026.json';
import useMediaQuery from '../hooks/useMediaQuery';
import TabLayout from './TabLayout';
import TournamentMultiSelect from './TournamentMultiSelect';
import styles from './Dashboard.module.css';

const POS_COLORS = { QB: '#bf44ef', RB: '#10b981', WR: '#f59e0b', TE: '#3b82f6' };
const ACCENT = '#E8BF4A';
const POSITIVE = '#2ECC71';
const NEGATIVE = '#E74C3C';

const fmtAdp = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n.toFixed(1) : '-';
};

const fmtSigned = (v, digits = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;

const DRILL_CARDS = [
  { key: 'exposures', label: 'Exposures', icon: BarChart3 },
  { key: 'rosters', label: 'Rosters', icon: Users },
  { key: 'timeseries', label: 'ADP Tracker', icon: TrendingUp },
  { key: 'combo', label: 'Combos', icon: Network },
  { key: 'rankings', label: 'Rankings', icon: ListOrdered },
  { key: 'draftflow', label: 'Draft Assistant', icon: Crosshair },
];

const HELP_ANNOTATIONS = [
  { id: 'metrics-row', label: 'Portfolio Pulse', description: 'Headline portfolio stats: size, value vs the market, stack coverage.' },
  { id: 'top-exposures', label: 'Top Exposures', description: 'Most-drafted players per position. Bar = exposure %.' },
  { id: 'exposure-by-round', label: 'Exposure by Round', description: 'Highest/lowest exposure per ADP round. Grey = 0% blind spots.' },
  { id: 'team-stacks', label: 'Team Stacks', description: 'QB + teammate pairings across rosters.' },
  { id: 'clv-card', label: 'Closing Line Value', description: 'Where your picks sit vs current ADP. Positive = the market moved toward your picks.' },
  { id: 'adp-movers', label: 'ADP Movers', description: 'Biggest recent ADP moves among players you actually hold.' },
  { id: 'archetype-dist', label: 'Archetypes', description: 'RB/QB/TE strategy mix. Click a segment to filter rosters.' },
  { id: 'draft-capital', label: 'Draft Capital', description: 'Position mix by round. Solid = yours, faded = market.' },
  { id: 'draft-slots', label: 'Draft Slots', description: 'How many of your entries drafted from each first-round slot.' },
  { id: 'playoff-stacks', label: 'Playoff Stacks', description: 'Rosters carrying a Week 15–17 game stack, and your most-stacked playoff games.' },
  { id: 'drill-cards', label: 'Navigation', description: 'Click to jump to a detail tab.' },
];

export default function Dashboard({ rosterData = [], masterPlayers = [], adpSnapshots = [], onNavigate, onNavigateToRosters = null, helpOpen = false, onHelpToggle }) {
  const { isMobile } = useMediaQuery();
  const [hoveredSeg, setHoveredSeg] = useState(null);
  const [selectedPositions, setSelectedPositions] = useState(null); // null = All
  const [selectedTournaments, setSelectedTournaments] = useState([]);

  // ── Tournament filter ──
  const slateGroups = useMemo(() => {
    const map = new Map();
    rosterData.forEach(p => {
      if (!p.tournamentTitle) return;
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
    return rosterData.filter(p => set.has(p.tournamentTitle));
  }, [rosterData, selectedTournaments]);

  // Recompute per-player count/exposure from filtered roster set; preserve ADP/position/team from upstream join.
  // Matching uses canonicalName to mirror processMasterList in utils/helpers.js.
  const filteredMasterPlayers = useMemo(() => {
    if (selectedTournaments.length === 0) return masterPlayers;
    const totalEntries = new Set(filteredRosterData.map(r => r.entry_id)).size || 1;
    const draftCounts = {};
    filteredRosterData.forEach(r => {
      const nm = canonicalName(r.name);
      draftCounts[nm] = (draftCounts[nm] || 0) + 1;
    });
    return masterPlayers.map(mp => {
      const nm = canonicalName(mp.name);
      const count = draftCounts[nm] || 0;
      const exposure = ((count / totalEntries) * 100).toFixed(1);
      return { ...mp, count, exposure };
    });
  }, [masterPlayers, filteredRosterData, selectedTournaments]);

  // ── Rosters grouped by entry (shared by several sections) ──
  const rosterGroups = useMemo(() => {
    const map = new Map();
    filteredRosterData.forEach(p => {
      const id = p.entry_id || 'unknown';
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(p);
    });
    return map;
  }, [filteredRosterData]);

  // ── Headline Metrics ──
  const metrics = useMemo(() => {
    const totalRosters = rosterGroups.size;
    const uniquePlayers = filteredMasterPlayers.filter(p => p.count > 0).length;
    const tournaments = new Set(filteredRosterData.map(p => p.tournamentTitle).filter(Boolean)).size;
    const topPlayer = filteredMasterPlayers.reduce(
      (best, p) => (p.count > 0 && parseFloat(p.exposure) > parseFloat(best?.exposure ?? -1) ? p : best),
      null
    );
    return { totalRosters, uniquePlayers, tournaments, topPlayer };
  }, [rosterGroups, filteredMasterPlayers, filteredRosterData]);

  // ── Closing Line Value (descriptive: where the market moved vs your picks) ──
  const clvStats = useMemo(() => {
    const byPlayer = new Map();
    let sum = 0, n = 0, pos = 0, neg = 0;
    filteredRosterData.forEach(p => {
      const clv = calcCLV(p.pick, p.latestADP);
      if (clv === null) return;
      sum += clv; n++;
      if (clv > 0.5) pos++;
      else if (clv < -0.5) neg++;
      let e = byPlayer.get(p.name);
      if (!e) { e = { name: p.name, position: p.position, sum: 0, picks: 0 }; byPlayer.set(p.name, e); }
      e.sum += clv; e.picks++;
    });
    if (n === 0) return null;
    const players = [...byPlayer.values()].map(e => ({ ...e, avg: e.sum / e.picks }));
    const best = [...players].sort((a, b) => b.avg - a.avg).slice(0, 4).filter(p => p.avg > 0);
    const worst = [...players].sort((a, b) => a.avg - b.avg).slice(0, 4).filter(p => p.avg < 0);
    return {
      avg: sum / n,
      n,
      posPct: (pos / n) * 100,
      negPct: (neg / n) * 100,
      flatPct: ((n - pos - neg) / n) * 100,
      best,
      worst,
    };
  }, [filteredRosterData]);

  // ── ADP Movers You Hold (trailing ~2 weeks, per platform timeline) ──
  const adpMovers = useMemo(() => {
    const MS_DAY = 86400000;
    const movers = [];
    filteredMasterPlayers.forEach(p => {
      if (!(p.count > 0) || !Array.isArray(p.history)) return;
      const valid = p.history.filter(h => h.adpPick != null);
      if (valid.length < 2) return;
      // Group by platform; use the series with the freshest snapshot
      const byPlat = new Map();
      valid.forEach(h => {
        if (!byPlat.has(h.platform)) byPlat.set(h.platform, []);
        byPlat.get(h.platform).push(h);
      });
      let series = null;
      for (const g of byPlat.values()) {
        if (g.length >= 2 && (!series || g[g.length - 1].date > series[series.length - 1].date)) series = g;
      }
      if (!series) return;
      const latest = series[series.length - 1];
      const latestT = new Date(latest.date).getTime();
      // Walk back to the snapshot ~2 weeks before the latest
      let baseline = series[0];
      for (let i = series.length - 2; i >= 0; i--) {
        baseline = series[i];
        if (latestT - new Date(series[i].date).getTime() >= 12 * MS_DAY) break;
      }
      if (baseline === latest) return;
      const delta = baseline.adpPick - latest.adpPick; // positive = ADP moved earlier (riser)
      if (Math.abs(delta) < 1) return;
      movers.push({
        name: p.name,
        position: p.position,
        exposure: parseFloat(p.exposure),
        delta,
        adpNow: latest.adpPick,
        spanDays: Math.round((latestT - new Date(baseline.date).getTime()) / MS_DAY),
      });
    });
    const risers = [...movers].filter(m => m.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5);
    const fallers = [...movers].filter(m => m.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 5);
    if (risers.length === 0 && fallers.length === 0) return null;
    const maxAbs = Math.max(1, ...risers.map(m => m.delta), ...fallers.map(m => -m.delta));
    const windowDays = Math.max(...[...risers, ...fallers].map(m => m.spanDays));
    return { risers, fallers, maxAbs, windowDays };
  }, [filteredMasterPlayers]);

  // ── Archetype Distributions (RB, QB, TE) ──
  const { rbDistribution, qbDistribution, teDistribution } = useMemo(() => {
    const empty = { rbDistribution: [], qbDistribution: [], teDistribution: [] };
    if (filteredRosterData.length === 0) return empty;
    const { totalEntries, tree } = analyzePortfolioTree(filteredRosterData);
    if (totalEntries === 0) return empty;

    const rbDist = Object.entries(tree)
      .map(([key, node]) => ({
        key, label: ARCHETYPE_METADATA[key]?.name || key,
        count: node.count, pct: (node.count / totalEntries) * 100,
        color: ARCHETYPE_METADATA[key]?.color || '#6b7280',
      }))
      .filter(d => d.count > 0);

    // Aggregate QB counts across all RB branches
    const qbCounts = {};
    Object.values(tree).forEach(rbNode => {
      Object.entries(rbNode.children).forEach(([qbKey, qbNode]) => {
        qbCounts[qbKey] = (qbCounts[qbKey] || 0) + qbNode.count;
      });
    });
    const qbDist = Object.entries(qbCounts)
      .map(([key, count]) => ({
        key, label: ARCHETYPE_METADATA[key]?.name || key,
        count, pct: (count / totalEntries) * 100,
        color: ARCHETYPE_METADATA[key]?.color || '#6b7280',
      }))
      .filter(d => d.count > 0);

    // Aggregate TE counts across all RB -> QB branches
    const teCounts = {};
    Object.values(tree).forEach(rbNode => {
      Object.values(rbNode.children).forEach(qbNode => {
        Object.entries(qbNode.children).forEach(([teKey, teNode]) => {
          teCounts[teKey] = (teCounts[teKey] || 0) + teNode.count;
        });
      });
    });
    const teDist = Object.entries(teCounts)
      .map(([key, count]) => ({
        key, label: ARCHETYPE_METADATA[key]?.name || key,
        count, pct: (count / totalEntries) * 100,
        color: ARCHETYPE_METADATA[key]?.color || '#6b7280',
      }))
      .filter(d => d.count > 0);

    return { rbDistribution: rbDist, qbDistribution: qbDist, teDistribution: teDist };
  }, [filteredRosterData]);

  // ── Top Exposures by Position ──
  const topExposures = useMemo(() => {
    const positions = ['QB', 'RB', 'WR', 'TE'];
    const result = {};
    positions.forEach(pos => {
      result[pos] = filteredMasterPlayers
        .filter(p => p.position === pos && p.count > 0)
        .sort((a, b) => parseFloat(b.exposure) - parseFloat(a.exposure))
        .slice(0, 5)
        .map(p => ({ name: p.name, exposure: parseFloat(p.exposure) }));
    });
    return result;
  }, [filteredMasterPlayers]);

  // ── Exposure by ADP Round (highest + lowest + blind spots) ──
  const exposureByRound = useMemo(() => {
    const totalRosters = metrics.totalRosters;
    if (totalRosters === 0) return [];
    const rounds = [];
    for (let r = 1; r <= 10; r++) {
      const start = (r - 1) * 12 + 1;
      const end = r * 12;
      const inRound = filteredMasterPlayers.filter(
        p => p.adpPick != null && p.adpPick >= start && p.adpPick <= end
      );
      if (inRound.length === 0) continue;
      const sorted = [...inRound].sort((a, b) => a.count - b.count);
      const highest = sorted[sorted.length - 1];

      const blindSpots = inRound
        .filter(p => p.count === 0)
        .sort((a, b) => a.adpPick - b.adpPick)
        .slice(0, 3)
        .map(p => ({ name: p.name, position: p.position, adp: p.adpDisplay }));

      const lowestEntry = sorted[0];
      const lowest = blindSpots.length === 0
        ? { name: lowestEntry.name, position: lowestEntry.position, exposure: parseFloat(lowestEntry.exposure), adp: lowestEntry.adpDisplay }
        : null;

      rounds.push({
        round: r,
        lowest,
        blindSpots,
        highest: { name: highest.name, position: highest.position, exposure: parseFloat(highest.exposure), adp: highest.adpDisplay },
      });
    }
    return rounds;
  }, [filteredMasterPlayers, metrics.totalRosters]);

  // ── Top Team Stacks + stacked-roster share ──
  const teamStacks = useMemo(() => {
    if (rosterGroups.size === 0) return { teams: [], stackedCount: 0 };
    const rosters = Array.from(rosterGroups.values());
    const totalRosters = rosters.length;
    const teamCount = new Map();
    let stackedCount = 0;
    rosters.forEach(roster => {
      const countedTeams = new Set();
      roster.filter(p => p.position === 'QB').forEach(qb => {
        if (countedTeams.has(qb.team)) return;
        const hasStack = roster.some(p =>
          p.team === qb.team &&
          p.name !== qb.name &&
          ['WR', 'TE', 'RB'].includes(p.position)
        );
        if (hasStack) {
          countedTeams.add(qb.team);
          teamCount.set(qb.team, (teamCount.get(qb.team) || 0) + 1);
        }
      });
      if (countedTeams.size > 0) stackedCount++;
    });
    const teams = Array.from(teamCount.entries())
      .filter(([team]) => team && team !== 'N/A' && team !== 'FA')
      .map(([team, count]) => ({ team, count, pct: ((count / totalRosters) * 100).toFixed(1) }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15);
    return { teams, stackedCount };
  }, [rosterGroups]);

  // ── Playoff (W15–17) game-stack coverage ──
  const playoffCoverage = useMemo(() => {
    if (rosterGroups.size === 0) return null;
    const rosters = Array.from(rosterGroups.values());
    const total = rosters.length;
    const agg = aggregatePortfolioPlayoffStacks(rosters, playoffSchedule);
    const weekCoverage = PLAYOFF_WEEKS.map(w => ({
      week: w,
      count: agg.weeks[w].rostersWithAny.size,
      pct: (agg.weeks[w].rostersWithAny.size / total) * 100,
    }));
    const games = [];
    PLAYOFF_WEEKS.forEach(w => {
      agg.weeks[w].games.forEach(g => {
        games.push({ week: w, label: `${g.teamA} vs ${g.teamB}`, count: g.rosterEntryIds.size, pct: (g.rosterEntryIds.size / total) * 100 });
      });
    });
    games.sort((a, b) => b.count - a.count);
    const covered = total - agg.nakedRosters.size;
    return {
      total,
      covered,
      coveredPct: (covered / total) * 100,
      naked: agg.nakedRosters.size,
      weekCoverage,
      topGames: games.slice(0, 6),
    };
  }, [rosterGroups]);

  // ── Draft Position per Entry (min pick = round-1 slot) ──
  const draftPositionByEntry = useMemo(() => {
    const map = {};
    filteredRosterData.forEach(p => {
      const pick = Number(p.pick);
      if (!pick) return;
      if (map[p.entry_id] === undefined || pick < map[p.entry_id]) {
        map[p.entry_id] = pick;
      }
    });
    return map;
  }, [filteredRosterData]);

  // ── Draft Slot Distribution (entries per round-1 slot) ──
  const draftSlots = useMemo(() => {
    const counts = Array.from({ length: 12 }, (_, i) => ({ slot: i + 1, entries: 0 }));
    let known = 0;
    Object.values(draftPositionByEntry).forEach(pick => {
      if (pick >= 1 && pick <= 12) { counts[pick - 1].entries++; known++; }
    });
    if (known === 0) return null;
    const max = Math.max(...counts.map(c => c.entries));
    return { counts, max, known };
  }, [draftPositionByEntry]);

  function togglePosition(pos) {
    if (pos === 'all') { setSelectedPositions(null); return; }
    setSelectedPositions(prev => {
      // If All is active, isolate to just this position
      if (prev === null) return new Set([pos]);
      const next = new Set(prev);
      if (next.has(pos)) {
        next.delete(pos);
        if (next.size === 0 || next.size === 12) return null;
      } else {
        next.add(pos);
        if (next.size === 12) return null;
      }
      return next;
    });
  }

  // ── Draft Capital by Round (user vs market) ──
  const draftCapitalShape = useMemo(() => {
    const filtered = selectedPositions
      ? filteredRosterData.filter(p => selectedPositions.has(draftPositionByEntry[p.entry_id]))
      : filteredRosterData;
    const roundCounts = {};
    filtered.forEach(p => {
      const r = p.round ? Number(p.round) : Math.ceil(Number(p.pick) / 12);
      if (r >= 1 && r <= 18) {
        if (!roundCounts[r]) roundCounts[r] = { QB: 0, RB: 0, WR: 0, TE: 0 };
        if (roundCounts[r][p.position] !== undefined) roundCounts[r][p.position]++;
      }
    });

    // Market positional breakdown from ADP
    const marketCounts = {};
    masterPlayers.forEach(p => {
      if (p.adpPick != null) {
        const r = Math.ceil(p.adpPick / 12);
        if (r >= 1 && r <= 18) {
          if (!marketCounts[r]) marketCounts[r] = { QB: 0, RB: 0, WR: 0, TE: 0 };
          if (marketCounts[r][p.position] !== undefined) marketCounts[r][p.position]++;
        }
      }
    });

    // Normalize both to percentages so bars are directly comparable
    const toPct = (counts) => {
      const total = counts.QB + counts.RB + counts.WR + counts.TE;
      if (total === 0) return { QB: 0, RB: 0, WR: 0, TE: 0 };
      return {
        QB: (counts.QB / total) * 100,
        RB: (counts.RB / total) * 100,
        WR: (counts.WR / total) * 100,
        TE: (counts.TE / total) * 100,
      };
    };

    return Array.from({ length: 18 }, (_, i) => {
      const r = i + 1;
      const uc = toPct(roundCounts[r] || { QB: 0, RB: 0, WR: 0, TE: 0 });
      const mc = toPct(marketCounts[r] || { QB: 0, RB: 0, WR: 0, TE: 0 });
      return {
        round: r,
        QB: uc.QB, RB: uc.RB, WR: uc.WR, TE: uc.TE,
        mQB: mc.QB, mRB: mc.RB, mWR: mc.WR, mTE: mc.TE,
      };
    });
  }, [filteredRosterData, masterPlayers, selectedPositions, draftPositionByEntry]);

  // ── Drill-down stat lines ──
  const drillStats = useMemo(() => {
    const latestDate = adpSnapshots.length > 0
      ? adpSnapshots[adpSnapshots.length - 1]?.date || '—'
      : '—';
    return {
      exposures: `${metrics.uniquePlayers} players tracked`,
      rosters: `${metrics.totalRosters} rosters`,
      timeseries: `Latest: ${latestDate}`,
      combo: `${teamStacks.stackedCount} stacked rosters`,
      rankings: 'Your personal board',
      draftflow: 'Strategy-aware scoring',
    };
  }, [metrics, adpSnapshots, teamStacks.stackedCount]);

  const tooltipStyle = {
    background: 'var(--surface-3)',
    border: '1px solid var(--border-default)',
    borderRadius: 8,
    boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
    maxWidth: 280,
    fontSize: '0.8rem',
  };

  // ── Empty State ──
  if (rosterData.length === 0) {
    const linkStyle = { color: 'var(--accent)', textDecoration: 'underline' };
    return (
      <EmptyState icon={FolderSync} title="Getting started">
        <ol style={{ textAlign: 'left', margin: '0.5rem 0 0', padding: '0 0 0 1.4rem', lineHeight: 1.8, fontSize: '0.88rem' }}>
          <li>
            Install the{' '}
            <a href="/install" target="_blank" rel="noopener noreferrer" style={linkStyle}>
              Chrome extension
            </a>
          </li>
          <li>
            Go to your entries page —{' '}
            <a href="https://app.underdogfantasy.com/completed" target="_blank" rel="noopener noreferrer" style={linkStyle}>
              Underdog Completed Entries
            </a>
            {' or '}
            <a href="https://www.draftkings.com/mycontests" target="_blank" rel="noopener noreferrer" style={linkStyle}>
              DraftKings My Contests
            </a>
          </li>
          <li>Click the gold logo button in the bottom-left corner</li>
          <li>Sign in with your account and click <strong>Sync Now</strong></li>
          <li>Come back here — your portfolio loads automatically</li>
        </ol>
        <a
          href="/install"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
            background: '#4285f4', color: '#fff', padding: '0.6rem 1.4rem',
            borderRadius: 'var(--radius-sm)', fontWeight: 600, fontSize: '0.85rem',
            textDecoration: 'none', marginTop: '0.75rem',
          }}
        >
          Add to Chrome
        </a>
      </EmptyState>
    );
  }

  const avgClvColor = clvStats ? clvLabel(clvStats.avg).color : 'var(--text-primary)';

  return (
    <TabLayout
      helpAnnotations={HELP_ANNOTATIONS}
      helpOpen={helpOpen}
      onHelpToggle={onHelpToggle}
      flush
    >
    <div className={styles.root}>
      {/* Tournament Filter — global scope for all sections below */}
      {slateGroups.length > 0 && (
        <div className={styles.filterBar}>
          <span className={styles.filterLabel}>Tournament Filter</span>
          <div className={styles.filterControl}>
            <TournamentMultiSelect
              slateGroups={slateGroups}
              selected={selectedTournaments}
              onChange={setSelectedTournaments}
            />
          </div>
        </div>
      )}

      {/* Section 1: KPI Hero Row */}
      <div className={styles.kpiRow} data-help-id="metrics-row">
        <div className={styles.kpiCard}>
          <Layers size={15} className={styles.kpiIcon} />
          <div className={styles.kpiLabel}>Rosters</div>
          <div className={styles.kpiValue}>{metrics.totalRosters}</div>
          <div className={styles.kpiSub}><span className={styles.kpiSubText}>{metrics.tournaments > 0 ? `across ${metrics.tournaments} tournament${metrics.tournaments === 1 ? '' : 's'}` : 'synced entries'}</span></div>
        </div>

        <div className={styles.kpiCard}>
          <Users size={15} className={styles.kpiIcon} />
          <div className={styles.kpiLabel}>Players Drafted</div>
          <div className={styles.kpiValue}>{metrics.uniquePlayers}</div>
          <div className={styles.kpiSub}><span className={styles.kpiSubText}>unique names held</span></div>
        </div>

        {clvStats && (
          <div className={styles.kpiCard}>
            <Scale size={15} className={styles.kpiIcon} />
            <div className={styles.kpiLabel}>Portfolio CLV</div>
            <div className={styles.kpiValue} style={{ color: avgClvColor }}>{fmtSigned(clvStats.avg, 2)}%</div>
            <div className={styles.kpiSub}><span className={styles.kpiSubText}>avg value vs current ADP</span></div>
          </div>
        )}

        <div className={styles.kpiCard}>
          <Link2 size={15} className={styles.kpiIcon} />
          <div className={styles.kpiLabel}>Stacked Rosters</div>
          <div className={styles.kpiValue}>{metrics.totalRosters > 0 ? `${((teamStacks.stackedCount / metrics.totalRosters) * 100).toFixed(0)}%` : '—'}</div>
          <div className={styles.kpiSub}><span className={styles.kpiSubText}>{teamStacks.stackedCount} of {metrics.totalRosters} carry a QB stack</span></div>
        </div>

        {playoffCoverage && (
          <div className={styles.kpiCard}>
            <Trophy size={15} className={styles.kpiIcon} />
            <div className={styles.kpiLabel}>Playoff Stacked</div>
            <div className={styles.kpiValue}>{playoffCoverage.coveredPct.toFixed(0)}%</div>
            <div className={styles.kpiSub}><span className={styles.kpiSubText}>{playoffCoverage.covered} of {playoffCoverage.total} with a W15–17 stack</span></div>
          </div>
        )}

        {metrics.topPlayer && (
          <div className={styles.kpiCard}>
            <Star size={15} className={styles.kpiIcon} />
            <div className={styles.kpiLabel}>Highest Exposure</div>
            <div className={styles.kpiValue}>{parseFloat(metrics.topPlayer.exposure).toFixed(0)}%</div>
            <div className={styles.kpiSub}>
              <span className={styles.kpiPosDot} style={{ background: POS_COLORS[metrics.topPlayer.position] || 'var(--text-muted)' }} />
              <span className={styles.kpiSubText}>{metrics.topPlayer.name} · {metrics.topPlayer.count} rosters</span>
            </div>
          </div>
        )}
      </div>

      {/* Section 2: Top Exposures | Exposure by Round | Team Stacks */}
      <div className={styles.exposurePair}>
        <div className={styles.exposureSection} data-help-id="top-exposures">
          <div className={styles.sectionTitle}>Top Exposures</div>
          <div className={styles.exposureGrid}>
            {['QB', 'RB', 'WR', 'TE'].map(pos => (
              <div key={pos} className={styles.exposureColumn}>
                <h4 style={{ color: POS_COLORS[pos] }}>{pos}</h4>
                {topExposures[pos].map(p => (
                  <div key={p.name} className={styles.exposureRow}>
                    {onNavigateToRosters
                      ? <button className={styles.playerLink} title="See rosters" onClick={() => onNavigateToRosters({ players: [p.name] })}>{p.name}</button>
                      : <span className={styles.exposureName}>{p.name}</span>
                    }
                    <div className={styles.exposureBarWrap}>
                      <div
                        className={styles.exposureBarFill}
                        style={{
                          width: `${Math.min(p.exposure, 100)}%`,
                          background: POS_COLORS[pos],
                          opacity: 0.7,
                        }}
                      />
                    </div>
                    <span className={styles.exposurePct}>{p.exposure.toFixed(0)}%</span>
                  </div>
                ))}
                {topExposures[pos].length === 0 && (
                  <div className={styles.exposureRow}>
                    <span className={styles.exposureName} style={{ color: 'var(--text-secondary)' }}>—</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Exposure by Round (highest + lowest) */}
        {exposureByRound.length > 0 && (
          <div className={styles.exposureSection} data-help-id="exposure-by-round">
            <div className={styles.sectionTitle}>Exposure by ADP Round</div>
            <div className={styles.exposureByRoundGrid}>
              <div className={styles.exposureByRoundHeader}>
                <span className={styles.blindSpotRound} />
                <div className={styles.exposureByRoundColGroup}>
                  <span className={styles.exposureByRoundSectionLabel}>Highest</span>
                  <span className={styles.exposureByRoundColLabel}>ADP</span>
                  <span className={styles.exposureByRoundColLabel}>Exp</span>
                </div>
                <div className={styles.exposureByRoundColGroup}>
                  <span className={styles.exposureByRoundSectionLabel}>Lowest</span>
                  <span className={styles.exposureByRoundColLabel}>ADP</span>
                  <span className={styles.exposureByRoundColLabel}>Exp</span>
                </div>
              </div>
              {exposureByRound.map(r => (
                <div key={r.round} className={styles.exposureByRoundRow}>
                  <span className={styles.blindSpotRound}>R{r.round}</span>
                  <div className={styles.exposureByRoundPlayer}>
                    <div className={styles.blindSpotEntry}>
                      {onNavigateToRosters
                        ? <button className={styles.playerLink} title="See rosters" style={{ color: POS_COLORS[r.highest.position] || 'var(--text-primary)' }} onClick={() => onNavigateToRosters({ players: [r.highest.name] })}>{r.highest.name}</button>
                        : <span className={styles.blindSpotName} style={{ color: POS_COLORS[r.highest.position] || 'var(--text-primary)' }}>{r.highest.name}</span>
                      }
                      <span className={styles.blindSpotAdp}>{fmtAdp(r.highest.adp)}</span>
                      <span className={styles.exposurePct} style={{ textAlign: 'right' }}>{r.highest.exposure.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className={styles.exposureByRoundPlayer}>
                    {r.blindSpots.length > 0 ? (
                      r.blindSpots.map(p => (
                        <div key={p.name} className={styles.blindSpotEntry}>
                          <span className={styles.blindSpotName} style={{ color: POS_COLORS[p.position] || 'var(--text-primary)' }}>{p.name}</span>
                          <span className={styles.blindSpotAdp}>{fmtAdp(p.adp)}</span>
                          <span className={styles.exposurePct} style={{ color: '#6b7280', textAlign: 'right' }}>0%</span>
                        </div>
                      ))
                    ) : (
                      <div className={styles.blindSpotEntry}>
                        {onNavigateToRosters
                          ? <button className={styles.playerLink} title="See rosters" style={{ color: POS_COLORS[r.lowest.position] || 'var(--text-primary)' }} onClick={() => onNavigateToRosters({ players: [r.lowest.name] })}>{r.lowest.name}</button>
                          : <span className={styles.blindSpotName} style={{ color: POS_COLORS[r.lowest.position] || 'var(--text-primary)' }}>{r.lowest.name}</span>
                        }
                        <span className={styles.blindSpotAdp}>{fmtAdp(r.lowest.adp)}</span>
                        <span className={styles.exposurePct} style={{ textAlign: 'right' }}>{r.lowest.exposure.toFixed(0)}%</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Team Stacks — narrow right column */}
        {teamStacks.teams.length > 0 && (
          <div className={styles.teamStacksSection} data-help-id="team-stacks">
            <div className={styles.sectionTitle}>Top Team Stacks</div>
            {(() => {
              const maxCount = teamStacks.teams[0].count;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {teamStacks.teams.map(({ team, count, pct }) => (
                    <div key={team} className={styles.teamStackRow}>
                      <span className={styles.teamStackName}>{NFL_TEAMS_ABBREV[team.toUpperCase()] || team}</span>
                      <div className={styles.exposureBarWrap}>
                        <div
                          className={styles.exposureBarFill}
                          style={{ width: `${(count / maxCount) * 100}%`, background: '#3b82f6', opacity: 0.7 }}
                        />
                      </div>
                      <span className={styles.teamStackCount}>{count}</span>
                      <span className={styles.teamStackPct}>{pct}%</span>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* Section 3: Market movement — CLV + ADP Movers */}
      {(clvStats || adpMovers) && (
        <div className={styles.marketGrid}>
          {clvStats && (
            <div className={styles.shapeCard} data-help-id="clv-card">
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitle}>Closing Line Value</div>
                <span className={styles.sectionHint}>{clvStats.n.toLocaleString()} picks vs current ADP</span>
              </div>
              <div className={styles.clvHero}>
                <span className={styles.clvHeroValue} style={{ color: avgClvColor }}>{fmtSigned(clvStats.avg, 2)}%</span>
                <span className={styles.clvHeroLabel}>portfolio average</span>
              </div>
              <div className={styles.clvMeter} title={`${clvStats.posPct.toFixed(0)}% of picks positive · ${clvStats.flatPct.toFixed(0)}% flat · ${clvStats.negPct.toFixed(0)}% negative`}>
                {clvStats.posPct > 0 && <div style={{ width: `${clvStats.posPct}%`, background: POSITIVE }} />}
                {clvStats.flatPct > 0 && <div style={{ width: `${clvStats.flatPct}%`, background: 'var(--surface-3)' }} />}
                {clvStats.negPct > 0 && <div style={{ width: `${clvStats.negPct}%`, background: NEGATIVE }} />}
              </div>
              <div className={styles.clvMeterLegend}>
                <span><span className={styles.legendDotInline} style={{ background: POSITIVE }} />{clvStats.posPct.toFixed(0)}% beat close</span>
                <span><span className={styles.legendDotInline} style={{ background: 'var(--surface-3)' }} />{clvStats.flatPct.toFixed(0)}% flat</span>
                <span><span className={styles.legendDotInline} style={{ background: NEGATIVE }} />{clvStats.negPct.toFixed(0)}% behind close</span>
              </div>
              <div className={styles.clvLists}>
                <div>
                  <div className={styles.clvListLabel}>Best value</div>
                  {clvStats.best.map(p => (
                    <div key={p.name} className={styles.clvListRow}>
                      <span className={styles.kpiPosDot} style={{ background: POS_COLORS[p.position] || 'var(--text-muted)' }} />
                      {onNavigateToRosters
                        ? <button className={styles.playerLink} title="See rosters" onClick={() => onNavigateToRosters({ players: [p.name] })}>{p.name}</button>
                        : <span className={styles.exposureName}>{p.name}</span>}
                      <span className={styles.clvListValue} style={{ color: clvLabel(p.avg).color }}>{fmtSigned(p.avg, 1)}%</span>
                    </div>
                  ))}
                  {clvStats.best.length === 0 && <div className={styles.mutedNote}>—</div>}
                </div>
                <div>
                  <div className={styles.clvListLabel}>Worst value</div>
                  {clvStats.worst.map(p => (
                    <div key={p.name} className={styles.clvListRow}>
                      <span className={styles.kpiPosDot} style={{ background: POS_COLORS[p.position] || 'var(--text-muted)' }} />
                      {onNavigateToRosters
                        ? <button className={styles.playerLink} title="See rosters" onClick={() => onNavigateToRosters({ players: [p.name] })}>{p.name}</button>
                        : <span className={styles.exposureName}>{p.name}</span>}
                      <span className={styles.clvListValue} style={{ color: clvLabel(p.avg).color }}>{fmtSigned(p.avg, 1)}%</span>
                    </div>
                  ))}
                  {clvStats.worst.length === 0 && <div className={styles.mutedNote}>—</div>}
                </div>
              </div>
            </div>
          )}

          {adpMovers && (
            <div className={styles.shapeCard} data-help-id="adp-movers">
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitle}>ADP Movers You Hold</div>
                <span className={styles.sectionHint}>last ~{adpMovers.windowDays} days</span>
              </div>
              <div className={styles.moversGrid}>
                <div>
                  <div className={styles.moverColLabel}><TrendingUp size={12} /> Risers</div>
                  {adpMovers.risers.map(m => (
                    <div key={m.name} className={styles.moverRow}>
                      <span className={styles.kpiPosDot} style={{ background: POS_COLORS[m.position] || 'var(--text-muted)' }} />
                      {onNavigateToRosters
                        ? <button className={styles.playerLink} title="See rosters" onClick={() => onNavigateToRosters({ players: [m.name] })}>{m.name}</button>
                        : <span className={styles.exposureName}>{m.name}</span>}
                      <span className={styles.moverExposure}>{m.exposure.toFixed(0)}%</span>
                      <div className={styles.exposureBarWrap}>
                        <div className={styles.exposureBarFill} style={{ width: `${(m.delta / adpMovers.maxAbs) * 100}%`, background: POSITIVE, opacity: 0.75 }} />
                      </div>
                      <span className={styles.moverDelta} style={{ color: POSITIVE }}>{fmtSigned(m.delta)}</span>
                    </div>
                  ))}
                  {adpMovers.risers.length === 0 && <div className={styles.mutedNote}>No notable risers</div>}
                </div>
                <div>
                  <div className={styles.moverColLabel}><TrendingDown size={12} /> Fallers</div>
                  {adpMovers.fallers.map(m => (
                    <div key={m.name} className={styles.moverRow}>
                      <span className={styles.kpiPosDot} style={{ background: POS_COLORS[m.position] || 'var(--text-muted)' }} />
                      {onNavigateToRosters
                        ? <button className={styles.playerLink} title="See rosters" onClick={() => onNavigateToRosters({ players: [m.name] })}>{m.name}</button>
                        : <span className={styles.exposureName}>{m.name}</span>}
                      <span className={styles.moverExposure}>{m.exposure.toFixed(0)}%</span>
                      <div className={styles.exposureBarWrap}>
                        <div className={styles.exposureBarFill} style={{ width: `${(-m.delta / adpMovers.maxAbs) * 100}%`, background: NEGATIVE, opacity: 0.75 }} />
                      </div>
                      <span className={styles.moverDelta} style={{ color: NEGATIVE }}>{fmtSigned(m.delta)}</span>
                    </div>
                  ))}
                  {adpMovers.fallers.length === 0 && <div className={styles.mutedNote}>No notable fallers</div>}
                </div>
              </div>
              <div className={styles.moversFootnote}>Δ = ADP picks moved since ~2 weeks ago · % = your exposure</div>
            </div>
          )}
        </div>
      )}

      {/* Section 4: Shape Visualizations */}
      <div className={styles.shapeGrid}>
        {/* Archetype Distributions */}
        <div className={styles.shapeCard} data-help-id="archetype-dist">
          <div className={styles.sectionTitle}>Archetype Distribution</div>
          {[
            { title: 'RB Archetype', data: rbDistribution, type: 'rb' },
            { title: 'QB Archetype', data: qbDistribution, type: 'qb' },
            { title: 'TE Archetype', data: teDistribution, type: 'te' },
          ].map(({ title, data, type }) => {
            const totalPct = data.reduce((sum, d) => sum + d.pct, 0) || 1;
            return (
            <div key={title} className={styles.archetypeBlock}>
              <div className={styles.archetypeLabel}>{title}</div>
              <div className={styles.stackedBar}>
                {data.map(seg => {
                  const isHovered = hoveredSeg?.type === type && hoveredSeg?.key === seg.key;
                  const isDimmed = hoveredSeg?.type === type && !isHovered;
                  return (
                    <div
                      key={seg.key}
                      style={{
                        width: `${(seg.pct / totalPct) * 100}%`,
                        background: seg.color,
                        cursor: onNavigateToRosters ? 'pointer' : 'default',
                        opacity: isDimmed ? 0.35 : 1,
                        filter: isHovered ? 'brightness(1.25)' : 'none',
                        transition: 'opacity 150ms ease, filter 150ms ease',
                      }}
                      title={onNavigateToRosters ? `${seg.label}: ${seg.count} (${seg.pct.toFixed(0)}%) — See rosters` : `${seg.label}: ${seg.count} (${seg.pct.toFixed(0)}%)`}
                      onMouseEnter={() => setHoveredSeg({ type, key: seg.key })}
                      onMouseLeave={() => setHoveredSeg(null)}
                      onClick={onNavigateToRosters ? () => onNavigateToRosters({ archetype: { [type]: seg.key } }) : undefined}
                    />
                  );
                })}
              </div>
              <div className={styles.legend}>
                {data.map(seg => {
                  const isHovered = hoveredSeg?.type === type && hoveredSeg?.key === seg.key;
                  const isDimmed = hoveredSeg?.type === type && !isHovered;
                  return (
                    <div
                      key={seg.key}
                      className={styles.legendItem}
                      style={{ opacity: isDimmed ? 0.4 : 1, transition: 'opacity 150ms ease' }}
                    >
                      <div className={styles.legendDot} style={{ background: seg.color }} />
                      <span>{seg.label}:</span>
                      <span className={styles.legendCount}>{seg.count} ({seg.pct.toFixed(0)}%)</span>
                    </div>
                  );
                })}
              </div>
            </div>
          );
          })}
        </div>

        {/* Draft Capital by Round — You vs Market */}
        <div className={styles.shapeCard} data-help-id="draft-capital">
          <div className={styles.sectionTitle}>Draft Capital by Round</div>
          <div className={styles.draftPosFilters}>
            <span className={styles.draftPosLabel}>Draft Position:</span>
            {['All',1,2,3,4,5,6,7,8,9,10,11,12].map(p => {
              const isAll = p === 'All';
              const active = isAll ? !selectedPositions : selectedPositions?.has(p);
              return (
                <button
                  key={p}
                  className={`${styles.draftPosBtn}${active ? ` ${styles.draftPosBtnActive}` : ''}`}
                  onClick={() => togglePosition(isAll ? 'all' : p)}
                >
                  {p}
                </button>
              );
            })}
          </div>
          {/* touch-action: pan-y — vertical swipes over the chart must scroll
              the dashboard instead of being captured for tooltip tracking */}
          <div style={{ touchAction: 'pan-y' }}>
          <ResponsiveContainer width="100%" height={isMobile ? 180 : 220}>
            <BarChart data={draftCapitalShape} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
              <YAxis domain={[0, 100]} hide />
              <XAxis
                dataKey="round"
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                axisLine={{ stroke: 'var(--border-subtle)' }}
                tickLine={false}
              />
              <Tooltip
                contentStyle={tooltipStyle}
                labelFormatter={v => `Round ${v}`}
                formatter={(value, name) => {
                  const labels = { QB: 'QB', RB: 'RB', WR: 'WR', TE: 'TE', mQB: 'Mkt QB', mRB: 'Mkt RB', mWR: 'Mkt WR', mTE: 'Mkt TE' };
                  return [`${Math.round(value)}%`, labels[name] || name];
                }}
              />
              {/* Your portfolio */}
              <Bar dataKey="QB" stackId="user" fill={POS_COLORS.QB} radius={[0, 0, 0, 0]} />
              <Bar dataKey="RB" stackId="user" fill={POS_COLORS.RB} />
              <Bar dataKey="WR" stackId="user" fill={POS_COLORS.WR} />
              <Bar dataKey="TE" stackId="user" fill={POS_COLORS.TE} radius={[3, 3, 0, 0]} />
              {/* Market ADP */}
              <Bar dataKey="mQB" stackId="market" fill={POS_COLORS.QB} opacity={0.25} radius={[0, 0, 0, 0]} />
              <Bar dataKey="mRB" stackId="market" fill={POS_COLORS.RB} opacity={0.25} />
              <Bar dataKey="mWR" stackId="market" fill={POS_COLORS.WR} opacity={0.25} />
              <Bar dataKey="mTE" stackId="market" fill={POS_COLORS.TE} opacity={0.25} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
          </div>
          <div className={styles.capitalLegend}>
            <div className={styles.capitalLegendItem}>
              <span className={styles.capitalLegendSwatch} style={{ opacity: 1 }} />
              <span>Yours</span>
            </div>
            <div className={styles.capitalLegendItem}>
              <span className={styles.capitalLegendSwatch} style={{ opacity: 0.25 }} />
              <span>Market</span>
            </div>
          </div>
        </div>
      </div>

      {/* Section 5: Structure — Draft Slots + Playoff Stacks */}
      {(draftSlots || playoffCoverage) && (
        <div className={styles.structureGrid}>
          {draftSlots && (
            <div className={styles.shapeCard} data-help-id="draft-slots">
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitle}>Draft Slot Distribution</div>
                <span className={styles.sectionHint}>{draftSlots.known} entries by round-1 pick</span>
              </div>
              <div style={{ touchAction: 'pan-y' }}>
              <ResponsiveContainer width="100%" height={isMobile ? 160 : 190}>
                <BarChart data={draftSlots.counts} margin={{ top: 18, right: 4, bottom: 0, left: 4 }}>
                  <YAxis hide domain={[0, 'dataMax']} />
                  <XAxis
                    dataKey="slot"
                    tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                    axisLine={{ stroke: 'var(--border-subtle)' }}
                    tickLine={false}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    cursor={{ fill: 'rgba(255, 255, 255, 0.04)' }}
                    labelFormatter={v => `Slot ${v}`}
                    formatter={value => [`${value} ${value === 1 ? 'entry' : 'entries'}`, null]}
                  />
                  <Bar dataKey="entries" maxBarSize={24} radius={[4, 4, 0, 0]}>
                    <LabelList dataKey="entries" position="top" formatter={v => (v > 0 ? v : '')} style={{ fill: 'var(--text-secondary)', fontSize: 10, fontFamily: 'var(--font-mono)' }} />
                    {draftSlots.counts.map(c => (
                      <Cell key={c.slot} fill={ACCENT} fillOpacity={c.entries === draftSlots.max && draftSlots.max > 0 ? 0.95 : 0.55} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              </div>
            </div>
          )}

          {playoffCoverage && (
            <div className={styles.shapeCard} data-help-id="playoff-stacks">
              <div className={styles.sectionHeader}>
                <div className={styles.sectionTitle}>Playoff Stacks · W15–17</div>
                <span className={styles.sectionHint}>{playoffCoverage.naked} roster{playoffCoverage.naked === 1 ? '' : 's'} with none</span>
              </div>
              <div className={styles.playoffWeeks}>
                {playoffCoverage.weekCoverage.map(w => (
                  <div key={w.week} className={styles.playoffWeekRow}>
                    <span className={styles.playoffWeekLabel}>W{w.week}</span>
                    <div className={styles.playoffMeterTrack}>
                      <div className={styles.playoffMeterFill} style={{ width: `${w.pct}%` }} />
                    </div>
                    <span className={styles.playoffWeekPct}>{w.pct.toFixed(0)}%</span>
                    <span className={styles.playoffWeekCount}>{w.count}</span>
                  </div>
                ))}
              </div>
              {playoffCoverage.topGames.length > 0 && (
                <>
                  <div className={styles.clvListLabel} style={{ marginTop: 12 }}>Most-stacked playoff games</div>
                  <div className={styles.playoffGames}>
                    {playoffCoverage.topGames.map(g => (
                      <div key={`${g.week}-${g.label}`} className={styles.playoffGameRow}>
                        <span className={styles.playoffGameWeek}>W{g.week}</span>
                        <span className={styles.playoffGameLabel}>{g.label}</span>
                        <span className={styles.playoffGameCount}>{g.count} <span className={styles.playoffGamePct}>({g.pct.toFixed(0)}%)</span></span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Section 6: Drill-Down Cards */}
      <div className={styles.drillRow} data-help-id="drill-cards">
        {DRILL_CARDS.map(({ key, label, icon: Icon }) => (
          <div
            key={key}
            className={styles.drillCard}
            onClick={() => onNavigate(key)}
            role="button"
            tabIndex={0}
            onKeyDown={e => e.key === 'Enter' && onNavigate(key)}
          >
            <Icon size={20} className={styles.drillIcon} />
            <div className={styles.drillLabel}>{label}</div>
            <div className={styles.drillStat}>{drillStats[key]}</div>
          </div>
        ))}
      </div>
    </div>
    </TabLayout>
  );
}
