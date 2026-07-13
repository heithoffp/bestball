// DashboardScreen — mobile port of best-ball-manager/src/components/Dashboard.jsx.
// All computation memos are line-for-line ports; layout is rebuilt for phones as
// a single scroll of cards. Section order mirrors the web: tournament filter,
// KPI row, top exposures, exposure by round, team stacks, CLV, ADP movers,
// archetypes, draft capital, draft slots, playoff stacks, drill-down cards.
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  BarChart3, Users, TrendingUp, ListOrdered, Crosshair, FolderSync, Network,
  Layers, Scale, Link2, Trophy, Star, TrendingDown,
} from 'lucide-react-native';
import ScreenScaffold, { HelpSection } from '../components/ScreenScaffold';
import TournamentFilter from '../components/TournamentFilter';
import { Card, SectionTitle, Bar, EmptyView, Button, StatTile } from '../components/ui';
import { colors, spacing, type, radii } from '../theme';
import { analyzePortfolioTree, ARCHETYPE_METADATA } from '../../shared/utils/rosterArchetypes';
import { NFL_TEAMS_ABBREV } from '../../shared/utils/nflTeams';
import { canonicalName } from '../../shared/utils/helpers';
import { calcCLV, clvLabel } from '../../shared/utils/clvHelpers';
import { aggregatePortfolioPlayoffStacks, PLAYOFF_WEEKS } from '../../shared/utils/playoffStacks';
import playoffSchedule from '../../shared/data/playoff-schedule-2026.json';
import { usePortfolio } from '../contexts/PortfolioContext';
import { useAuth } from '../contexts/AuthContext';
import { INSTALL_URL } from '../../shared/config';

const POS_COLORS = { QB: '#bf44ef', RB: '#10b981', WR: '#f59e0b', TE: '#3b82f6' };
const ACCENT = colors.accent;
const POSITIVE = colors.positive;
const NEGATIVE = colors.negative;

const fmtAdp = v => {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n.toFixed(1) : '-';
};
const fmtSigned = (v, digits = 1) => `${v >= 0 ? '+' : ''}${v.toFixed(digits)}`;

const DRILL_CARDS = [
  { key: 'exposures', label: 'Exposures', icon: BarChart3, route: '/portfolio', params: { view: 'exposures' } },
  { key: 'rosters', label: 'Rosters', icon: Users, route: '/portfolio', params: { view: 'rosters' } },
  { key: 'timeseries', label: 'ADP Tracker', icon: TrendingUp, route: '/market', params: { view: 'adp' } },
  { key: 'combo', label: 'Combos', icon: Network, route: '/portfolio', params: { view: 'combos' } },
  { key: 'rankings', label: 'Rankings', icon: ListOrdered, route: '/market', params: { view: 'rankings' } },
  { key: 'draftflow', label: 'Draft Assistant', icon: Crosshair, route: '/draft', params: { view: 'assistant' } },
];

const HELP = (
  <>
    <HelpSection heading="Portfolio Pulse">Headline portfolio stats: size, value vs the market, stack coverage.</HelpSection>
    <HelpSection heading="Top Exposures">Most-drafted players per position. Bar = exposure %.</HelpSection>
    <HelpSection heading="Exposure by Round">Highest/lowest exposure per ADP round. Grey = 0% blind spots.</HelpSection>
    <HelpSection heading="Team Stacks">QB + teammate pairings across rosters.</HelpSection>
    <HelpSection heading="Closing Line Value">Where your picks sit vs current ADP. Positive = the market moved toward your picks.</HelpSection>
    <HelpSection heading="ADP Movers">Biggest recent ADP moves among players you actually hold.</HelpSection>
    <HelpSection heading="Archetypes">RB/QB/TE strategy mix. Tap a segment to filter rosters.</HelpSection>
    <HelpSection heading="Draft Capital">Position mix by round. Solid = yours, faded = market.</HelpSection>
    <HelpSection heading="Draft Slots">How many of your entries drafted from each first-round slot.</HelpSection>
    <HelpSection heading="Playoff Stacks">Rosters carrying a Week 15–17 game stack, and your most-stacked playoff games.</HelpSection>
  </>
);

export default function DashboardScreen() {
  const router = useRouter();
  const { user } = useAuth();
  const {
    rosterData, masterPlayers, adpSnapshots, isUsingDemoData,
    loadDemoData, setRosterNavContext,
  } = usePortfolio();
  const [selectedPositions, setSelectedPositions] = useState(null); // null = All
  const [selectedTournaments, setSelectedTournaments] = useState([]);

  const navigateToRosters = (context) => {
    setRosterNavContext(context);
    router.push({ pathname: '/portfolio', params: { view: 'rosters', nav: Date.now() } });
  };

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

  // ── Rosters grouped by entry ──
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

  // ── Closing Line Value ──
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

  // ── ADP Movers You Hold ──
  const adpMovers = useMemo(() => {
    const MS_DAY = 86400000;
    const movers = [];
    filteredMasterPlayers.forEach(p => {
      if (!(p.count > 0) || !Array.isArray(p.history)) return;
      const valid = p.history.filter(h => h.adpPick != null);
      if (valid.length < 2) return;
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
      let baseline = series[0];
      for (let i = series.length - 2; i >= 0; i--) {
        baseline = series[i];
        if (latestT - new Date(series[i].date).getTime() >= 12 * MS_DAY) break;
      }
      if (baseline === latest) return;
      const delta = baseline.adpPick - latest.adpPick;
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

  // ── Archetype Distributions ──
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

  // ── Exposure by ADP Round ──
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

  // ── Top Team Stacks ──
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

  // ── Draft position per entry / slot distribution ──
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
      return { round: r, user: uc, market: mc };
    });
  }, [filteredRosterData, masterPlayers, selectedPositions, draftPositionByEntry]);

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

  // ── Empty state (no rosters yet) — roster sync is a desktop step ──
  if (rosterData.length === 0) {
    return (
      <ScreenScaffold title="Dashboard" help={HELP}>
        <EmptyView
          icon={<FolderSync size={40} color={colors.accent} />}
          title="Getting started"
          body={
            'Roster sync happens on your desktop:\n\n1. Install the Chrome extension on your computer\n2. Open your Underdog or DraftKings entries page\n3. Click the gold logo button and Sync Now\n4. Your portfolio appears here automatically'
          }
          cta={
            <View style={{ gap: spacing.sm, minWidth: 240 }}>
              <Button title="Open install guide" onPress={() => WebBrowser.openBrowserAsync(INSTALL_URL)} />
              {!user && <Button title="Sign in" variant="ghost" onPress={() => router.push('/account')} />}
              <Button title="Try demo data" variant="ghost" onPress={loadDemoData} />
            </View>
          }
        />
      </ScreenScaffold>
    );
  }

  const avgClvColor = clvStats ? clvLabel(clvStats.avg).color : colors.textPrimary;

  return (
    <ScreenScaffold title="Dashboard" help={HELP}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <TournamentFilter slateGroups={slateGroups} selected={selectedTournaments} onChange={setSelectedTournaments} />

        {/* KPI grid */}
        <View style={styles.kpiGrid}>
          <StatTile label="Rosters" value={metrics.totalRosters}
            sub={metrics.tournaments > 0 ? `across ${metrics.tournaments} tournament${metrics.tournaments === 1 ? '' : 's'}` : 'synced entries'}
            style={styles.kpiTile} />
          <StatTile label="Players Drafted" value={metrics.uniquePlayers} sub="unique names held" style={styles.kpiTile} />
          {clvStats && (
            <View style={[styles.kpiTile]}>
              <StatTile label="Portfolio CLV" value={<Text style={{ color: avgClvColor }}>{fmtSigned(clvStats.avg, 2)}%</Text>}
                sub="avg value vs current ADP" style={{ flex: 1 }} />
            </View>
          )}
          <StatTile label="Stacked Rosters"
            value={metrics.totalRosters > 0 ? `${((teamStacks.stackedCount / metrics.totalRosters) * 100).toFixed(0)}%` : '—'}
            sub={`${teamStacks.stackedCount} of ${metrics.totalRosters} carry a QB stack`} style={styles.kpiTile} />
          {playoffCoverage && (
            <StatTile label="Playoff Stacked" value={`${playoffCoverage.coveredPct.toFixed(0)}%`}
              sub={`${playoffCoverage.covered} of ${playoffCoverage.total} with a W15–17 stack`} style={styles.kpiTile} />
          )}
          {metrics.topPlayer && (
            <StatTile label="Highest Exposure" value={`${parseFloat(metrics.topPlayer.exposure).toFixed(0)}%`}
              sub={`${metrics.topPlayer.name} · ${metrics.topPlayer.count} rosters`} style={styles.kpiTile} />
          )}
        </View>

        {/* Top Exposures */}
        <Card>
          <SectionTitle>Top Exposures</SectionTitle>
          <View style={styles.expGrid}>
            {['QB', 'RB', 'WR', 'TE'].map(pos => (
              <View key={pos} style={styles.expCol}>
                <Text style={[styles.expColHead, { color: POS_COLORS[pos] }]}>{pos}</Text>
                {topExposures[pos].map(p => (
                  <Pressable key={p.name} style={styles.expRow} onPress={() => navigateToRosters({ players: [p.name] })}>
                    <Text style={styles.expName} numberOfLines={1}>{p.name}</Text>
                    <Bar pct={Math.min(p.exposure, 100)} color={POS_COLORS[pos]} height={5} style={{ flex: 1 }} />
                    <Text style={styles.expPct}>{p.exposure.toFixed(0)}%</Text>
                  </Pressable>
                ))}
                {topExposures[pos].length === 0 && <Text style={type.muted}>—</Text>}
              </View>
            ))}
          </View>
        </Card>

        {/* Exposure by ADP Round */}
        {exposureByRound.length > 0 && (
          <Card>
            <SectionTitle>Exposure by ADP Round</SectionTitle>
            {exposureByRound.map(r => (
              <View key={r.round} style={styles.roundBlock}>
                <Text style={styles.roundLabel}>R{r.round}</Text>
                <View style={{ flex: 1 }}>
                  <Pressable style={styles.roundRow} onPress={() => navigateToRosters({ players: [r.highest.name] })}>
                    <Text style={styles.roundTag}>HIGH</Text>
                    <Text style={[styles.roundName, { color: POS_COLORS[r.highest.position] || colors.textPrimary }]} numberOfLines={1}>{r.highest.name}</Text>
                    <Text style={styles.roundAdp}>{fmtAdp(r.highest.adp)}</Text>
                    <Text style={styles.roundExp}>{r.highest.exposure.toFixed(0)}%</Text>
                  </Pressable>
                  {r.blindSpots.length > 0 ? (
                    r.blindSpots.map(p => (
                      <View key={p.name} style={styles.roundRow}>
                        <Text style={[styles.roundTag, { color: colors.textMuted }]}>0%</Text>
                        <Text style={[styles.roundName, { color: POS_COLORS[p.position] || colors.textPrimary }]} numberOfLines={1}>{p.name}</Text>
                        <Text style={styles.roundAdp}>{fmtAdp(p.adp)}</Text>
                        <Text style={[styles.roundExp, { color: colors.textMuted }]}>0%</Text>
                      </View>
                    ))
                  ) : r.lowest ? (
                    <Pressable style={styles.roundRow} onPress={() => navigateToRosters({ players: [r.lowest.name] })}>
                      <Text style={[styles.roundTag, { color: colors.textMuted }]}>LOW</Text>
                      <Text style={[styles.roundName, { color: POS_COLORS[r.lowest.position] || colors.textPrimary }]} numberOfLines={1}>{r.lowest.name}</Text>
                      <Text style={styles.roundAdp}>{fmtAdp(r.lowest.adp)}</Text>
                      <Text style={styles.roundExp}>{r.lowest.exposure.toFixed(0)}%</Text>
                    </Pressable>
                  ) : null}
                </View>
              </View>
            ))}
          </Card>
        )}

        {/* Team Stacks */}
        {teamStacks.teams.length > 0 && (
          <Card>
            <SectionTitle>Top Team Stacks</SectionTitle>
            {teamStacks.teams.map(({ team, count, pct }) => (
              <View key={team} style={styles.stackRow}>
                <Text style={styles.stackTeam} numberOfLines={1}>{NFL_TEAMS_ABBREV[team.toUpperCase()] || team}</Text>
                <Bar pct={(count / teamStacks.teams[0].count) * 100} color="#3b82f6" height={6} style={{ flex: 1 }} />
                <Text style={styles.stackCount}>{count}</Text>
                <Text style={styles.stackPct}>{pct}%</Text>
              </View>
            ))}
          </Card>
        )}

        {/* Closing Line Value */}
        {clvStats && (
          <Card>
            <SectionTitle right={<Text style={type.muted}>{clvStats.n.toLocaleString()} picks</Text>}>Closing Line Value</SectionTitle>
            <View style={styles.clvHero}>
              <Text style={[styles.clvHeroValue, { color: avgClvColor }]}>{fmtSigned(clvStats.avg, 2)}%</Text>
              <Text style={type.secondary}>portfolio average</Text>
            </View>
            <View style={styles.clvMeter}>
              {clvStats.posPct > 0 && <View style={{ width: `${clvStats.posPct}%`, backgroundColor: POSITIVE }} />}
              {clvStats.flatPct > 0 && <View style={{ width: `${clvStats.flatPct}%`, backgroundColor: colors.surface3 }} />}
              {clvStats.negPct > 0 && <View style={{ width: `${clvStats.negPct}%`, backgroundColor: NEGATIVE }} />}
            </View>
            <View style={styles.clvLegend}>
              <Text style={type.muted}>{clvStats.posPct.toFixed(0)}% beat close</Text>
              <Text style={type.muted}>{clvStats.flatPct.toFixed(0)}% flat</Text>
              <Text style={type.muted}>{clvStats.negPct.toFixed(0)}% behind</Text>
            </View>
            <View style={styles.clvCols}>
              <View style={{ flex: 1 }}>
                <Text style={styles.listLabel}>Best value</Text>
                {clvStats.best.map(p => (
                  <Pressable key={p.name} style={styles.clvRow} onPress={() => navigateToRosters({ players: [p.name] })}>
                    <View style={[styles.posDot, { backgroundColor: POS_COLORS[p.position] || colors.textMuted }]} />
                    <Text style={styles.expName} numberOfLines={1}>{p.name}</Text>
                    <Text style={[styles.clvVal, { color: clvLabel(p.avg).color }]}>{fmtSigned(p.avg, 1)}%</Text>
                  </Pressable>
                ))}
                {clvStats.best.length === 0 && <Text style={type.muted}>—</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.listLabel}>Worst value</Text>
                {clvStats.worst.map(p => (
                  <Pressable key={p.name} style={styles.clvRow} onPress={() => navigateToRosters({ players: [p.name] })}>
                    <View style={[styles.posDot, { backgroundColor: POS_COLORS[p.position] || colors.textMuted }]} />
                    <Text style={styles.expName} numberOfLines={1}>{p.name}</Text>
                    <Text style={[styles.clvVal, { color: clvLabel(p.avg).color }]}>{fmtSigned(p.avg, 1)}%</Text>
                  </Pressable>
                ))}
                {clvStats.worst.length === 0 && <Text style={type.muted}>—</Text>}
              </View>
            </View>
          </Card>
        )}

        {/* ADP Movers You Hold */}
        {adpMovers && (
          <Card>
            <SectionTitle right={<Text style={type.muted}>last ~{adpMovers.windowDays} days</Text>}>ADP Movers You Hold</SectionTitle>
            <View style={styles.moverColHead}>
              <TrendingUp size={12} color={POSITIVE} />
              <Text style={[styles.listLabel, { marginBottom: 0 }]}>Risers</Text>
            </View>
            {adpMovers.risers.map(m => (
              <Pressable key={m.name} style={styles.moverRow} onPress={() => navigateToRosters({ players: [m.name] })}>
                <View style={[styles.posDot, { backgroundColor: POS_COLORS[m.position] || colors.textMuted }]} />
                <Text style={styles.expName} numberOfLines={1}>{m.name}</Text>
                <Text style={styles.moverExp}>{m.exposure.toFixed(0)}%</Text>
                <Bar pct={(m.delta / adpMovers.maxAbs) * 100} color={POSITIVE} height={5} style={{ width: 60 }} />
                <Text style={[styles.moverDelta, { color: POSITIVE }]}>{fmtSigned(m.delta)}</Text>
              </Pressable>
            ))}
            {adpMovers.risers.length === 0 && <Text style={type.muted}>No notable risers</Text>}
            <View style={[styles.moverColHead, { marginTop: spacing.md }]}>
              <TrendingDown size={12} color={NEGATIVE} />
              <Text style={[styles.listLabel, { marginBottom: 0 }]}>Fallers</Text>
            </View>
            {adpMovers.fallers.map(m => (
              <Pressable key={m.name} style={styles.moverRow} onPress={() => navigateToRosters({ players: [m.name] })}>
                <View style={[styles.posDot, { backgroundColor: POS_COLORS[m.position] || colors.textMuted }]} />
                <Text style={styles.expName} numberOfLines={1}>{m.name}</Text>
                <Text style={styles.moverExp}>{m.exposure.toFixed(0)}%</Text>
                <Bar pct={(-m.delta / adpMovers.maxAbs) * 100} color={NEGATIVE} height={5} style={{ width: 60 }} />
                <Text style={[styles.moverDelta, { color: NEGATIVE }]}>{fmtSigned(m.delta)}</Text>
              </Pressable>
            ))}
            {adpMovers.fallers.length === 0 && <Text style={type.muted}>No notable fallers</Text>}
            <Text style={[type.muted, { marginTop: spacing.sm }]}>Δ = ADP picks moved since ~2 weeks ago · % = your exposure</Text>
          </Card>
        )}

        {/* Archetype Distribution */}
        <Card>
          <SectionTitle>Archetype Distribution</SectionTitle>
          {[
            { title: 'RB Archetype', data: rbDistribution, kind: 'rb' },
            { title: 'QB Archetype', data: qbDistribution, kind: 'qb' },
            { title: 'TE Archetype', data: teDistribution, kind: 'te' },
          ].map(({ title, data, kind }) => {
            const totalPct = data.reduce((sum, d) => sum + d.pct, 0) || 1;
            return (
              <View key={title} style={{ marginBottom: spacing.lg }}>
                <Text style={styles.archLabel}>{title}</Text>
                <View style={styles.stackedBar}>
                  {data.map(seg => (
                    <Pressable
                      key={seg.key}
                      style={{ width: `${(seg.pct / totalPct) * 100}%`, backgroundColor: seg.color }}
                      onPress={() => navigateToRosters({ archetype: { [kind]: seg.key } })}
                    />
                  ))}
                </View>
                <View style={styles.legendWrap}>
                  {data.map(seg => (
                    <View key={seg.key} style={styles.legendItem}>
                      <View style={[styles.posDot, { backgroundColor: seg.color }]} />
                      <Text style={type.muted}>{seg.label}: <Text style={{ color: colors.textSecondary, fontWeight: '600' }}>{seg.count} ({seg.pct.toFixed(0)}%)</Text></Text>
                    </View>
                  ))}
                </View>
              </View>
            );
          })}
        </Card>

        {/* Draft Capital by Round */}
        <Card>
          <SectionTitle>Draft Capital by Round</SectionTitle>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingVertical: 4 }}>
            {['All', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(p => {
              const isAll = p === 'All';
              const active = isAll ? !selectedPositions : selectedPositions?.has(p);
              return (
                <Pressable
                  key={p}
                  onPress={() => togglePosition(isAll ? 'all' : p)}
                  style={[styles.slotBtn, active && styles.slotBtnActive]}
                >
                  <Text style={[styles.slotBtnText, active && { color: colors.accent }]}>{p}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={[type.muted, { marginBottom: 4 }]}>Filter by round-1 draft slot · solid = yours, faded = market</Text>
          <View style={styles.capitalChart}>
            {draftCapitalShape.map(d => (
              <View key={d.round} style={styles.capitalCol}>
                <View style={styles.capitalBars}>
                  <View style={styles.capitalBar}>
                    {['TE', 'WR', 'RB', 'QB'].map(pos => (
                      <View key={pos} style={{ height: `${d.user[pos]}%`, backgroundColor: POS_COLORS[pos] }} />
                    ))}
                  </View>
                  <View style={[styles.capitalBar, { opacity: 0.3 }]}>
                    {['TE', 'WR', 'RB', 'QB'].map(pos => (
                      <View key={pos} style={{ height: `${d.market[pos]}%`, backgroundColor: POS_COLORS[pos] }} />
                    ))}
                  </View>
                </View>
                <Text style={styles.capitalRound}>{d.round}</Text>
              </View>
            ))}
          </View>
          <View style={styles.legendWrap}>
            {['QB', 'RB', 'WR', 'TE'].map(pos => (
              <View key={pos} style={styles.legendItem}>
                <View style={[styles.posDot, { backgroundColor: POS_COLORS[pos] }]} />
                <Text style={type.muted}>{pos}</Text>
              </View>
            ))}
          </View>
        </Card>

        {/* Draft Slot Distribution */}
        {draftSlots && (
          <Card>
            <SectionTitle right={<Text style={type.muted}>{draftSlots.known} entries</Text>}>Draft Slot Distribution</SectionTitle>
            <View style={styles.slotChart}>
              {draftSlots.counts.map(c => (
                <View key={c.slot} style={styles.slotCol}>
                  <Text style={styles.slotCount}>{c.entries > 0 ? c.entries : ''}</Text>
                  <View style={styles.slotTrack}>
                    <View style={{
                      height: `${draftSlots.max > 0 ? (c.entries / draftSlots.max) * 100 : 0}%`,
                      backgroundColor: ACCENT,
                      opacity: c.entries === draftSlots.max && draftSlots.max > 0 ? 0.95 : 0.55,
                      borderTopLeftRadius: 3,
                      borderTopRightRadius: 3,
                    }} />
                  </View>
                  <Text style={styles.capitalRound}>{c.slot}</Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* Playoff Stacks */}
        {playoffCoverage && (
          <Card>
            <SectionTitle right={<Text style={type.muted}>{playoffCoverage.naked} roster{playoffCoverage.naked === 1 ? '' : 's'} with none</Text>}>
              Playoff Stacks · W15–17
            </SectionTitle>
            {playoffCoverage.weekCoverage.map(w => (
              <View key={w.week} style={styles.stackRow}>
                <Text style={[styles.roundLabel, { width: 32 }]}>W{w.week}</Text>
                <Bar pct={w.pct} color={ACCENT} height={7} style={{ flex: 1 }} />
                <Text style={styles.stackCount}>{w.pct.toFixed(0)}%</Text>
                <Text style={styles.stackPct}>{w.count}</Text>
              </View>
            ))}
            {playoffCoverage.topGames.length > 0 && (
              <>
                <Text style={[styles.listLabel, { marginTop: spacing.md }]}>Most-stacked playoff games</Text>
                {playoffCoverage.topGames.map(g => (
                  <View key={`${g.week}-${g.label}`} style={styles.gameRow}>
                    <Text style={styles.gameWeek}>W{g.week}</Text>
                    <Text style={[type.body, { flex: 1 }]} numberOfLines={1}>{g.label}</Text>
                    <Text style={type.secondary}>{g.count} <Text style={type.muted}>({g.pct.toFixed(0)}%)</Text></Text>
                  </View>
                ))}
              </>
            )}
          </Card>
        )}

        {/* Drill-down cards */}
        <View style={styles.drillGrid}>
          {DRILL_CARDS.map(({ key, label, icon: Icon, route, params }) => (
            <Pressable
              key={key}
              style={styles.drillCard}
              onPress={() => router.push({ pathname: route, params })}
            >
              <Icon size={20} color={ACCENT} />
              <Text style={styles.drillLabel}>{label}</Text>
              <Text style={type.muted} numberOfLines={1}>{drillStats[key]}</Text>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </ScreenScaffold>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: spacing.lg, paddingBottom: 40 },
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  kpiTile: { flexBasis: '48%', flexGrow: 1 },
  expGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  expCol: { flexBasis: '46%', flexGrow: 1 },
  expColHead: { fontSize: 13, fontWeight: '800', marginBottom: 6 },
  expRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  expName: { fontSize: 12, color: colors.textPrimary, flexShrink: 1, minWidth: 70, maxWidth: 110 },
  expPct: { fontSize: 11, color: colors.textSecondary, fontVariant: ['tabular-nums'], width: 34, textAlign: 'right' },
  roundBlock: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm, alignItems: 'flex-start' },
  roundLabel: { width: 30, fontSize: 12, fontWeight: '800', color: colors.accent, marginTop: 2 },
  roundRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 },
  roundTag: { fontSize: 9, fontWeight: '800', color: colors.positive, width: 30 },
  roundName: { fontSize: 12.5, fontWeight: '600', flex: 1 },
  roundAdp: { fontSize: 11, color: colors.textMuted, fontVariant: ['tabular-nums'], width: 38, textAlign: 'right' },
  roundExp: { fontSize: 11.5, color: colors.textSecondary, fontVariant: ['tabular-nums'], width: 36, textAlign: 'right', fontWeight: '700' },
  stackRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 7 },
  stackTeam: { width: 100, fontSize: 12, color: colors.textPrimary },
  stackCount: { width: 30, fontSize: 12, fontWeight: '700', color: colors.textPrimary, textAlign: 'right', fontVariant: ['tabular-nums'] },
  stackPct: { width: 44, fontSize: 11, color: colors.textMuted, textAlign: 'right', fontVariant: ['tabular-nums'] },
  clvHero: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.sm, marginBottom: spacing.sm },
  clvHeroValue: { fontSize: 28, fontWeight: '800', fontVariant: ['tabular-nums'] },
  clvMeter: { flexDirection: 'row', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: colors.surface3 },
  clvLegend: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 6, marginBottom: spacing.md },
  clvCols: { flexDirection: 'row', gap: spacing.lg },
  clvRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  clvVal: { fontSize: 11.5, fontWeight: '700', fontVariant: ['tabular-nums'] },
  listLabel: { fontSize: 11, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 6 },
  posDot: { width: 7, height: 7, borderRadius: 4 },
  moverColHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 6 },
  moverRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 },
  moverExp: { fontSize: 11, color: colors.textMuted, width: 32, textAlign: 'right', fontVariant: ['tabular-nums'] },
  moverDelta: { fontSize: 12, fontWeight: '700', width: 42, textAlign: 'right', fontVariant: ['tabular-nums'] },
  archLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, marginBottom: 5 },
  stackedBar: { flexDirection: 'row', height: 16, borderRadius: 5, overflow: 'hidden', backgroundColor: colors.surface3 },
  legendWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  slotBtn: {
    paddingHorizontal: 11, paddingVertical: 5, borderRadius: radii.sm,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.borderDefault,
  },
  slotBtnActive: { backgroundColor: colors.accentMuted, borderColor: colors.accent },
  slotBtnText: { fontSize: 12, fontWeight: '600', color: colors.textSecondary },
  capitalChart: { flexDirection: 'row', height: 140, alignItems: 'flex-end', gap: 2, marginTop: spacing.sm },
  capitalCol: { flex: 1, alignItems: 'center' },
  capitalBars: { flexDirection: 'row', height: 120, gap: 1, alignItems: 'flex-end' },
  capitalBar: { width: 6, height: '100%', flexDirection: 'column', justifyContent: 'flex-end', overflow: 'hidden', borderRadius: 2 },
  capitalRound: { fontSize: 8.5, color: colors.textMuted, marginTop: 3, fontVariant: ['tabular-nums'] },
  slotChart: { flexDirection: 'row', height: 150, gap: 4, marginTop: spacing.sm },
  slotCol: { flex: 1, alignItems: 'center' },
  slotCount: { fontSize: 10, color: colors.textSecondary, height: 16, fontVariant: ['tabular-nums'] },
  slotTrack: { flex: 1, width: '70%', justifyContent: 'flex-end' },
  gameRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 5 },
  gameWeek: { width: 32, fontSize: 11, fontWeight: '700', color: colors.accent },
  drillGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  drillCard: {
    flexBasis: '48%', flexGrow: 1,
    backgroundColor: colors.surface1, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.borderSubtle,
    padding: spacing.md, gap: 4,
  },
  drillLabel: { fontSize: 13.5, fontWeight: '700', color: colors.textPrimary },
});
