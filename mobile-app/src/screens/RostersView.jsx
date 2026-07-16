// RostersView — mobile port of RosterViewer.jsx (the web's mobile card-list
// variant). Per-roster: CLV, Early Combo % (uniqueness), Proj Pts (advanceModel
// outlook), pod-exact Adv %, archetype pills, expandable player detail, draft
// board modal, share image (view-shot → share sheet), and delete. Cross-tab
// navigation contexts (players / teams / archetype / entry) arrive via
// PortfolioContext.rosterNavContext.
import React, { useState, useMemo, useRef, useCallback, useEffect } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, ScrollView, Keyboard } from 'react-native';
import { FolderSync, Download, LayoutGrid, Trash2, ArrowUp, ArrowDown, X } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import ViewShot from 'react-native-view-shot';
import * as Sharing from 'expo-sharing';
import {
  loadComboTable, buildComboKey, lookupTier1, comboTablesSig, hydrateComboTables, persistComboTables,
} from '../../shared/utils/uniquenessEngine';
import { isExcludedSlate, formatComboPct } from '../../shared/utils/realDraftData';
import { canonicalName, compactTournamentName } from '../../shared/utils/helpers';
import { classifyRosterPath, ARCHETYPE_METADATA } from '../../shared/utils/rosterArchetypes';
import { NFL_TEAMS, NFL_TEAMS_ABBREV } from '../../shared/utils/nflTeams';
import { calcCLV, clvLabel } from '../../shared/utils/clvHelpers';
import {
  computeRosterOutlook, advanceStructureFor, scoringForPlatform, advanceLabel,
} from '../../shared/utils/advanceModel';
import { BYE_WEEKS_2026 } from '../../shared/data/byeWeeks';
import { fetchUserBoardsOnce } from '../../shared/utils/draftBoards';
import {
  podAdvVersionKey, getMemoPodAdv, hydratePodAdv, subscribePodAdv, computePodAdvance,
} from '../../shared/utils/podAdvanceStore';
import { generateDemoBoards } from '../../shared/utils/demoBoards';
import { posColor } from '../../shared/utils/positionColors';
import { trackEvent } from '../../shared/utils/analytics';
import DraftBoardModal from '../components/DraftBoardModal';
import TournamentFilter from '../components/TournamentFilter';
import { SearchBar, EmptyView, Button, ChipRow } from '../components/ui';
import { colors, spacing, radii, type } from '../theme';
import { usePortfolio } from '../contexts/PortfolioContext';
import { INSTALL_URL } from '../../shared/config';

const RB_OPTIONS = ['RB_ZERO', 'RB_HERO', 'RB_DOUBLE_ANCHOR', 'RB_HYPER_FRAGILE', 'RB_BALANCED'];
const QB_OPTIONS = ['QB_ELITE', 'QB_CORE', 'QB_LATE'];
const TE_OPTIONS = ['TE_ELITE', 'TE_ANCHOR', 'TE_LATE'];

const SORT_OPTIONS = [
  { key: 'avgCLV', label: 'Avg CLV' },
  { key: 'draftDate', label: 'Draft Date' },
  { key: 'uniqueness', label: 'Combo Rate' },
  { key: 'projectedPoints', label: 'Proj Pts' },
  { key: 'advanceProb', label: 'Adv %' },
];
const DESC_FIRST_KEYS = ['avgCLV', 'projectedPoints', 'advanceProb', 'actualPoints'];

function archetypeColor(key) { return ARCHETYPE_METADATA[key]?.color || '#6b7280'; }

function formatUniqueness(score, loading) {
  if (loading || !score || score.loading || score.notApplicable || score.unscored) return { text: '—', muted: true };
  const text = formatComboPct(score.found ? score.count : 0, score.totalRosters);
  if (text == null) return { text: '—', muted: true };
  return { text, muted: false };
}

function ArchetypePill({ archetypeKey }) {
  const meta = ARCHETYPE_METADATA[archetypeKey];
  const color = archetypeColor(archetypeKey);
  if (!meta) return <Text style={{ color: colors.textMuted }}>—</Text>;
  return (
    <View style={{
      backgroundColor: color + '1a', borderColor: color + '44', borderWidth: 1,
      borderRadius: 4, paddingHorizontal: 7, paddingVertical: 2,
    }}>
      <Text style={{ color, fontSize: 11, fontWeight: '600' }}>{meta.name}</Text>
    </View>
  );
}

function PositionSnapshot({ snap }) {
  const ORDER = ['QB', 'RB', 'WR', 'TE', 'K', 'DST', 'DEF'];
  const entries = ORDER.filter(p => snap[p]).map(p => ({ pos: p, count: snap[p] }));
  Object.keys(snap).forEach(p => { if (!ORDER.includes(p)) entries.push({ pos: p, count: snap[p] }); });
  return (
    <View style={{ flexDirection: 'row', gap: 5, flexWrap: 'wrap' }}>
      {entries.map(({ pos, count }) => (
        <View key={pos} style={{
          backgroundColor: posColor(pos) + '22', borderColor: posColor(pos) + '55', borderWidth: 1,
          borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1,
        }}>
          <Text style={{ color: posColor(pos), fontSize: 11, fontWeight: '700' }}>{count}{pos}</Text>
        </View>
      ))}
    </View>
  );
}

function shortEntry(id) {
  if (!id) return '???';
  if (id.length <= 10) return id;
  return id.slice(0, 6) + '…' + id.slice(-4);
}

// Mirrors the classification used in ComboAnalysis (name-based).
const isPreDraftRoster = (slateTitle, tournamentTitle) => {
  const slate = (slateTitle || '').toLowerCase();
  const tourn = (tournamentTitle || '').toLowerCase();
  if (slate.includes('pre-draft') || slate.includes('predraft')) return true;
  if (tourn.includes('early bird')) return true;
  return false;
};

export default function RostersView() {
  const {
    rosterData, masterPlayers, adpByPlatform, weeklyActuals: actuals,
    isUsingDemoData: demoMode, deleteRoster, rosterNavContext, setRosterNavContext,
  } = usePortfolio();
  const onDeleteRoster = !demoMode ? deleteRoster : undefined;

  const [expandedEntry, setExpandedEntry] = useState(null);
  const [sortKey, setSortKey] = useState('avgCLV');
  const [sortDir, setSortDir] = useState('desc');
  const alpha = 0.5;
  const [clvFilter, setClvFilter] = useState('all');
  const [rbFilter, setRbFilter] = useState('all');
  const [qbFilter, setQbFilter] = useState('all');
  const [teFilter, setTeFilter] = useState('all');
  const [selectedTournaments, setSelectedTournaments] = useState([]);
  const [combinedSearch, setCombinedSearch] = useState('');
  const [selectedPlayers, setSelectedPlayers] = useState([]);
  const [selectedTeams, setSelectedTeams] = useState([]);
  const [selectedEntryId, setSelectedEntryId] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(null);
  const shotRefs = useRef({});

  // Consume the cross-tab navigation context (web: initialFilter prop).
  useEffect(() => {
    if (!rosterNavContext) return;
    if (rosterNavContext.players) setSelectedPlayers(rosterNavContext.players);
    if (rosterNavContext.teams) setSelectedTeams(rosterNavContext.teams);
    if (rosterNavContext.archetype) {
      const { rb, qb, te } = rosterNavContext.archetype;
      if (rb) setRbFilter(rb);
      if (qb) setQbFilter(qb);
      if (te) setTeFilter(te);
    }
    if (rosterNavContext.entry_id) {
      setSelectedEntryId(rosterNavContext.entry_id);
      setExpandedEntry(rosterNavContext.entry_id);
    }
    setRosterNavContext(null);
  }, [rosterNavContext, setRosterNavContext]);

  // ── Draft boards ──
  const [fetchedBoards, setFetchedBoards] = useState(null);
  const [boardRoster, setBoardRoster] = useState(null);
  useEffect(() => {
    if (demoMode || rosterData.length === 0) return undefined;
    let cancelled = false;
    const ids = [...new Set(rosterData.map(p => p.entry_id))];
    fetchUserBoardsOnce(ids).then(boards => { if (!cancelled) setFetchedBoards(boards); });
    return () => { cancelled = true; };
  }, [demoMode, rosterData]);

  // ── Combo frequency data (stale-while-revalidate) ──
  const [tier1Pre, setTier1Pre] = useState(null);
  const [tier1Post, setTier1Post] = useState(null);
  useEffect(() => {
    let cancelled = false;
    let fresh = false;
    const sig = comboTablesSig(masterPlayers, rosterData);
    if (!demoMode) {
      hydrateComboTables(sig).then(cached => {
        if (cancelled || fresh || !cached) return;
        setTier1Pre(prev => prev ?? cached.pre);
        setTier1Post(prev => prev ?? cached.post);
      });
    }
    Promise.all([
      loadComboTable('pre', { masterPlayers, rosterData }),
      loadComboTable('post', { masterPlayers, rosterData }),
    ]).then(([pre, post]) => {
      if (cancelled) return;
      fresh = true;
      setTier1Pre(pre);
      setTier1Post(post);
      if (!demoMode) persistComboTables(sig, pre, post);
    });
    return () => { cancelled = true; };
  }, [masterPlayers, rosterData, demoMode]);

  const nameToPlayerId = useMemo(() => {
    const map = new Map();
    masterPlayers.forEach(p => {
      if (p.player_id && p.name) map.set(canonicalName(p.name), p.player_id);
    });
    return map;
  }, [masterPlayers]);

  const allPlayerNames = useMemo(() => {
    const names = new Set();
    rosterData.forEach(p => { if (p.name) names.add(p.name); });
    return [...names].sort();
  }, [rosterData]);

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
    if (!combinedQuery) return [];
    return allTeamNames
      .filter(t => {
        if (selectedTeams.includes(t)) return false;
        const fullName = (NFL_TEAMS[t] || '').toLowerCase();
        return t.toLowerCase().includes(combinedQuery) || fullName.includes(combinedQuery);
      })
      .slice(0, 4);
  }, [combinedQuery, allTeamNames, selectedTeams]);

  // ── Group + classify each entry ──
  const rosters = useMemo(() => {
    const map = {};
    rosterData.forEach(p => {
      const id = p.entry_id || 'Unknown';
      if (!map[id]) map[id] = [];
      map[id].push(p);
    });

    // Keep the seeded Monte Carlo cheap on very large portfolios.
    const sims = Object.keys(map).length > 300 ? 150 : 300;

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
      const draftDate = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null;

      const tournamentTitle = players[0]?.tournamentTitle || null;
      const slateTitle = players[0]?.slateTitle || null;

      const adpPlatform = players.find(p => p.adpPlatform !== 'global')?.adpPlatform || 'global';
      const superflex = (slateTitle || '').toLowerCase().includes('superflex');
      const structure = advanceStructureFor(slateTitle, tournamentTitle);

      const outlook = computeRosterOutlook(players, {
        scoring: scoringForPlatform(adpPlatform, slateTitle),
        actuals,
        superflex,
        sims,
        seedKey: entry_id,
        byeWeeks: BYE_WEEKS_2026,
      });

      const annotatedPlayers = players.map(p => ({
        ...p,
        player_id: nameToPlayerId.get(canonicalName(p.name)) ?? null,
        actualPoints: outlook.weeksCompleted > 0
          ? (outlook.playerActuals.get(canonicalName(p.name)) ?? 0)
          : null,
      }));

      return {
        entry_id, players: annotatedPlayers, avgCLV, posSnap, count: players.length, path,
        draftDate, tournamentTitle, slateTitle, adpPlatform, structure,
        projectedPoints: outlook.projectedPoints,
        actualPoints: outlook.actualPoints,
        weeksCompleted: outlook.weeksCompleted,
      };
    });
  }, [rosterData, alpha, nameToPlayerId, actuals]);

  // Demo mode: synthesize deterministic boards for guests.
  const demoBoards = useMemo(() => {
    if (!demoMode) return null;
    return generateDemoBoards(rosters, adpByPlatform?.underdog?.latestRows ?? []);
  }, [demoMode, rosters, adpByPlatform]);

  const boardIds = useMemo(() => {
    if (demoMode) return new Set((demoBoards ?? []).map(b => b.draftId));
    return fetchedBoards ? new Set(fetchedBoards.map(b => b.draftId)) : null;
  }, [demoMode, demoBoards, fetchedBoards]);
  const activeBoards = demoMode ? demoBoards : fetchedBoards;

  // ── Pod-exact Adv % ──
  const podAdvVersion = useMemo(
    () => podAdvVersionKey(adpByPlatform, actuals, demoMode ? 'demo' : 'real'),
    [adpByPlatform, actuals, demoMode]
  );
  const [podAdvById, setPodAdvById] = useState(() => ({ ...(getMemoPodAdv(podAdvVersion) ?? {}) }));
  useEffect(() => {
    setPodAdvById({ ...(getMemoPodAdv(podAdvVersion) ?? {}) });
    return subscribePodAdv(podAdvVersion, results => {
      setPodAdvById(prev => ({ ...prev, ...results }));
    });
  }, [podAdvVersion]);
  useEffect(() => {
    if (!activeBoards?.length || rosters.length === 0) return undefined;
    let cancelled = false;
    let task = null;
    const rosterById = new Map(rosters.map(r => [r.entry_id, r]));
    (async () => {
      let known = getMemoPodAdv(podAdvVersion);
      if (!known && !demoMode) {
        known = await hydratePodAdv(podAdvVersion);
        if (cancelled) return;
        if (known && Object.keys(known).length) setPodAdvById(prev => ({ ...known, ...prev }));
      }
      const missing = activeBoards.filter(b => rosterById.has(b.draftId) && !(known && b.draftId in known));
      if (missing.length === 0) return;
      const metaById = {};
      for (const b of missing) {
        const r = rosterById.get(b.draftId);
        metaById[b.draftId] = {
          players: r.players.map(p => ({ name: p.name })),
          tournamentTitle: r.tournamentTitle,
        };
      }
      task = computePodAdvance({
        boards: missing,
        metaById,
        adp: {
          latestAdpMap: adpByPlatform?.underdog?.latestAdpMap ?? {},
          projPointsMap: adpByPlatform?.underdog?.projPointsMap ?? {},
        },
        actuals,
        versionKey: podAdvVersion,
        persist: !demoMode,
      });
    })();
    return () => { cancelled = true; task?.cancel(); };
  }, [activeBoards, rosters, adpByPlatform, actuals, podAdvVersion, demoMode]);

  const advanceProbs = podAdvById;

  // ── Uniqueness scores ──
  const rosterScores = useMemo(() => {
    const byId = {};
    rosters.forEach(r => {
      if (isExcludedSlate(r.slateTitle)) {
        byId[r.entry_id] = { notApplicable: true, found: false, totalRosters: 0 };
        return;
      }
      const isPre = isPreDraftRoster(r.slateTitle, r.tournamentTitle);
      const source = isPre ? tier1Pre : tier1Post;
      if (!source) {
        byId[r.entry_id] = { loading: true, found: false, totalRosters: 0 };
        return;
      }
      const key = buildComboKey(r.players);
      if (!key) {
        byId[r.entry_id] = { unscored: true, found: false, totalRosters: 0 };
        return;
      }
      const rawTotal = source.metadata?.total_rosters ?? 0;
      if (rawTotal <= 0) {
        byId[r.entry_id] = { found: false, totalRosters: 0 };
        return;
      }
      const hit = lookupTier1(key, source);
      const others = Math.max(0, (hit?.count ?? 0) - 1);
      byId[r.entry_id] = { found: true, count: others, totalRosters: Math.max(1, rawTotal - 1) };
    });
    return byId;
  }, [rosters, tier1Pre, tier1Post]);

  const rosterSearchMatches = useMemo(() => {
    if (selectedPlayers.length === 0) return {};
    const out = {};
    rosters.forEach(r => {
      const playerNames = r.players.map(p => p.name);
      const allMatch = selectedPlayers.every(sp => playerNames.some(pn => pn === sp));
      if (allMatch) out[r.entry_id] = selectedPlayers;
    });
    return out;
  }, [rosters, selectedPlayers]);

  // ── Filter + sort ──
  const displayed = useMemo(() => {
    let list = [...rosters];
    if (selectedEntryId) list = list.filter(r => r.entry_id === selectedEntryId);
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
      if (sortKey === 'draftDate') {
        const at = a.draftDate ? a.draftDate.getTime() : -Infinity;
        const bt = b.draftDate ? b.draftDate.getTime() : -Infinity;
        return sortDir === 'asc' ? at - bt : bt - at;
      }
      if (sortKey === 'uniqueness') {
        const as = rosterScores[a.entry_id];
        const bs = rosterScores[b.entry_id];
        const av = as?.found ? as.count / (as.totalRosters || 1) : 0;
        const bv = bs?.found ? bs.count / (bs.totalRosters || 1) : 0;
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      if (sortKey === 'advanceProb') {
        const av = advanceProbs[a.entry_id] ?? -Infinity;
        const bv = advanceProbs[b.entry_id] ?? -Infinity;
        return sortDir === 'asc' ? av - bv : bv - av;
      }
      let av = a[sortKey] ?? -Infinity;
      let bv = b[sortKey] ?? -Infinity;
      if (typeof av === 'string') return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
    return list;
  }, [rosters, sortKey, sortDir, clvFilter, rbFilter, qbFilter, teFilter, selectedTournaments,
      rosterScores, advanceProbs, selectedPlayers, selectedTeams, rosterSearchMatches, selectedEntryId]);

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

  const toggleChip = (optionKey) => {
    if (RB_OPTIONS.includes(optionKey)) setRbFilter(prev => prev === optionKey ? 'all' : optionKey);
    else if (QB_OPTIONS.includes(optionKey)) setQbFilter(prev => prev === optionKey ? 'all' : optionKey);
    else if (TE_OPTIONS.includes(optionKey)) setTeFilter(prev => prev === optionKey ? 'all' : optionKey);
  };
  const isChipActive = (k) => rbFilter === k || qbFilter === k || teFilter === k;

  const handleShareImage = useCallback(async (entryId) => {
    trackEvent('roster_image_shared');
    try {
      const ref = shotRefs.current[entryId];
      if (!ref) return;
      const uri = await ref.capture();
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png' });
      }
    } catch (err) {
      console.error('Share image failed:', err);
    }
  }, []);

  const hasActiveSearch = selectedPlayers.length > 0 || selectedTeams.length > 0;

  if (!rosterData.length) {
    return (
      <EmptyView
        icon={<FolderSync size={38} color={colors.accent} />}
        title="No roster data"
        body="Sync your rosters from the browser extension on desktop to get started."
        cta={<Button title="Open install guide" onPress={() => WebBrowser.openBrowserAsync(INSTALL_URL)} />}
      />
    );
  }

  const renderRosterCard = ({ item: roster }) => {
    const clv = clvLabel(roster.avgCLV);
    const isOpen = expandedEntry === roster.entry_id;
    const uniq = formatUniqueness(rosterScores[roster.entry_id], false);
    const adv = advanceLabel(advanceProbs[roster.entry_id], roster.structure.baseline);

    // Position summary line for expanded view (web DraftCapitalMap mobile mode)
    const posByRound = {};
    roster.players.forEach(p => {
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

    const sortedPlayers = [...roster.players].sort((a, b) => (a.pick || 0) - (b.pick || 0));
    const showActuals = roster.players.some(p => p.actualPoints != null);

    return (
      <Pressable
        style={styles.rosterCard}
        onPress={() => { if (!isOpen) trackEvent('roster_viewed'); setExpandedEntry(isOpen ? null : roster.entry_id); }}
      >
        <View style={styles.cardHeader}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <Text style={styles.entryId}>{shortEntry(roster.entry_id)}</Text>
              <Text style={type.muted}>
                {roster.draftDate
                  ? roster.draftDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                  : '—'}
              </Text>
            </View>
            {roster.tournamentTitle && (
              <Text style={[type.muted, { marginTop: 2 }]} numberOfLines={1}>{compactTournamentName(roster.tournamentTitle)}</Text>
            )}
          </View>
          <Text style={{ color: colors.textMuted }}>{isOpen ? '▲' : '▼'}</Text>
        </View>

        <View style={{ marginTop: spacing.sm, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 5 }}>
          <PositionSnapshot snap={roster.posSnap} />
          <ArchetypePill archetypeKey={roster.path.rb} />
          <ArchetypePill archetypeKey={roster.path.qb} />
          <ArchetypePill archetypeKey={roster.path.te} />
        </View>

        <View style={styles.cardFooter}>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>CLV</Text>
            <Text style={[styles.statValue, { color: clv.color }]}>{clv.text}</Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Combo</Text>
            <Text style={[styles.statValue, { color: uniq.muted ? colors.textMuted : colors.textPrimary }]}>{uniq.text}</Text>
          </View>
          {roster.weeksCompleted > 0 && (
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Actual</Text>
              <Text style={[styles.statValue, { color: '#fbbf24' }]}>{roster.actualPoints.toFixed(0)}</Text>
            </View>
          )}
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Proj</Text>
            <Text style={[styles.statValue, { color: '#60a5fa' }]}>
              {roster.projectedPoints > 0 ? roster.projectedPoints.toFixed(0) : '—'}
            </Text>
          </View>
          <View style={styles.stat}>
            <Text style={styles.statLabel}>Adv %</Text>
            <Text style={[styles.statValue, { color: adv.color }]}>{adv.text}</Text>
          </View>
        </View>

        {isOpen && (
          <ViewShot
            ref={(r) => { if (r) shotRefs.current[roster.entry_id] = r; }}
            options={{ format: 'png', quality: 1 }}
            style={styles.expanded}
          >
            {summaryParts.length > 0 && (
              <Text style={[type.muted, { marginBottom: spacing.sm }]}>{summaryParts.join(' | ')}</Text>
            )}
            <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginBottom: spacing.sm }}>
              {boardIds?.has(roster.entry_id) && (
                <Pressable style={styles.actionBtn} onPress={(e) => {
                  trackEvent('roster_draft_board_open', { draftId: roster.entry_id });
                  setBoardRoster(roster);
                }}>
                  <LayoutGrid size={13} color={colors.accent} />
                  <Text style={styles.actionBtnText}>Board</Text>
                </Pressable>
              )}
              <Pressable style={styles.actionBtn} onPress={() => handleShareImage(roster.entry_id)}>
                <Download size={13} color={colors.accent} />
                <Text style={styles.actionBtnText}>Share Image</Text>
              </Pressable>
              {!demoMode && onDeleteRoster && (
                confirmingDelete === roster.entry_id ? (
                  <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
                    <Pressable style={styles.actionBtn} onPress={() => setConfirmingDelete(null)}>
                      <Text style={styles.actionBtnText}>Cancel</Text>
                    </Pressable>
                    <Pressable
                      style={[styles.actionBtn, { borderColor: colors.negative }]}
                      onPress={async () => {
                        try {
                          await onDeleteRoster(roster.entry_id);
                          setExpandedEntry(null);
                          setConfirmingDelete(null);
                        } catch (err) {
                          console.error('Roster delete failed:', err);
                        }
                      }}
                    >
                      <Trash2 size={13} color={colors.negative} />
                      <Text style={[styles.actionBtnText, { color: colors.negative }]}>Confirm delete</Text>
                    </Pressable>
                  </View>
                ) : (
                  <Pressable style={[styles.actionBtn, { borderColor: colors.negative + '66' }]} onPress={() => setConfirmingDelete(roster.entry_id)}>
                    <Trash2 size={13} color={colors.negative} />
                    <Text style={[styles.actionBtnText, { color: colors.negative }]}>Delete</Text>
                  </Pressable>
                )
              )}
            </View>
            {sortedPlayers.map((p, i) => {
              const clvPct = calcCLV(p.pick, p.latestADP, alpha);
              const pclv = clvLabel(clvPct);
              const matchHighlight = selectedPlayers.includes(p.name) ||
                (selectedTeams.includes(p.team) && !selectedPlayers.includes(p.name));
              return (
                <View key={`${p.name}-${i}`} style={[styles.playerRow, matchHighlight && { backgroundColor: colors.accentMuted }]}>
                  <Text style={styles.playerPick}>{p.pick || '—'}</Text>
                  <View style={{
                    backgroundColor: posColor(p.position) + '22', borderColor: posColor(p.position) + '55',
                    borderWidth: 1, borderRadius: 3, paddingHorizontal: 5, paddingVertical: 1, width: 38, alignItems: 'center',
                  }}>
                    <Text style={{ color: posColor(p.position), fontSize: 10, fontWeight: '700' }}>{p.position}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>{p.name}</Text>
                    <Text style={type.muted}>{NFL_TEAMS_ABBREV[p.team?.toUpperCase()] || p.team}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={type.muted}>
                      ADP {(!p.latestADPDisplay || p.latestADPDisplay === 'N/A') ? '240' : p.latestADPDisplay}
                      {p.projectedPoints ? ` · ${p.projectedPoints.toFixed(0)}pt` : ''}
                      {showActuals && p.actualPoints != null ? ` · ${p.actualPoints.toFixed(0)}act` : ''}
                    </Text>
                    <Text style={{ color: pclv.color, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] }}>{pclv.text}</Text>
                  </View>
                </View>
              );
            })}
          </ViewShot>
        )}
      </Pressable>
    );
  };

  const chipOptions = [...RB_OPTIONS, ...QB_OPTIONS, ...TE_OPTIONS];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: spacing.lg }}>
        {/* Nav banner from cross-tab hand-off */}
        {selectedEntryId ? (
          <NavBanner text={`Showing roster ${shortEntry(selectedEntryId)}`} onClear={() => { setSelectedEntryId(null); setExpandedEntry(null); }} />
        ) : selectedPlayers.length > 0 ? (
          <NavBanner text={`Rosters containing ${selectedPlayers.join(', ')}`} onClear={() => setSelectedPlayers([])} />
        ) : selectedTeams.length > 0 ? (
          <NavBanner text={`Rosters with players from ${selectedTeams.join(' & ')}`} onClear={() => setSelectedTeams([])} />
        ) : null}

        {/* Search with player/team suggestions */}
        <SearchBar value={combinedSearch} onChange={setCombinedSearch} placeholder="Search players & teams..." style={{ marginBottom: spacing.sm }} />
        {(playerSuggestions.length > 0 || teamSuggestions.length > 0) && (
          <View style={styles.suggestBox}>
            {playerSuggestions.map(n => (
              <Pressable key={n} style={styles.suggestRow} onPress={() => { setSelectedPlayers(prev => [...prev, n]); setCombinedSearch(''); Keyboard.dismiss(); }}>
                <Text style={{ color: '#00e5a0', fontSize: 13 }}>+ {n}</Text>
              </Pressable>
            ))}
            {teamSuggestions.map(t => (
              <Pressable key={t} style={styles.suggestRow} onPress={() => { setSelectedTeams(prev => [...prev, t]); setCombinedSearch(''); Keyboard.dismiss(); }}>
                <Text style={{ color: '#60a5fa', fontSize: 13 }}>+ {NFL_TEAMS[t] || t} (team)</Text>
              </Pressable>
            ))}
          </View>
        )}
        {hasActiveSearch && (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: spacing.sm }}>
            {selectedPlayers.map(n => (
              <Pressable key={n} style={[styles.tokenPill, { borderColor: '#00e5a0' }]} onPress={() => setSelectedPlayers(prev => prev.filter(x => x !== n))}>
                <Text style={{ color: '#00e5a0', fontSize: 12 }}>{n}</Text>
                <X size={11} color="#00e5a0" />
              </Pressable>
            ))}
            {selectedTeams.map(t => (
              <Pressable key={t} style={[styles.tokenPill, { borderColor: '#60a5fa' }]} onPress={() => setSelectedTeams(prev => prev.filter(x => x !== t))}>
                <Text style={{ color: '#60a5fa', fontSize: 12 }}>{t}</Text>
                <X size={11} color="#60a5fa" />
              </Pressable>
            ))}
            <Text style={[type.muted, { alignSelf: 'center' }]}>
              <Text style={{ color: '#00e5a0', fontWeight: '700' }}>{displayed.length}</Text> match
            </Text>
          </View>
        )}

        <TournamentFilter slateGroups={slateGroups} selected={selectedTournaments} onChange={setSelectedTournaments} />

        {/* Archetype chips + CLV filter */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: spacing.sm }}>
          {[['all', 'All'], ['positive', '+CLV'], ['negative', '-CLV']].map(([v, lbl]) => (
            <Pressable
              key={v}
              onPress={() => setClvFilter(v)}
              style={[styles.chip, clvFilter === v && { borderColor: '#00e5a0', backgroundColor: '#00e5a018' }]}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: clvFilter === v ? '#00e5a0' : colors.textSecondary }}>{lbl}</Text>
            </Pressable>
          ))}
          <View style={{ width: 8 }} />
          {chipOptions.map(opt => {
            const active = isChipActive(opt);
            const color = archetypeColor(opt);
            return (
              <Pressable
                key={opt}
                onPress={() => toggleChip(opt)}
                style={[styles.chip, active && { borderColor: color, backgroundColor: `${color}25` }]}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? color : colors.textSecondary }}>
                  {ARCHETYPE_METADATA[opt]?.name || opt}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* Sort bar */}
        <View style={styles.sortBar}>
          <ChipRow options={SORT_OPTIONS} value={sortKey} onChange={(k) => {
            setSortKey(k);
            setSortDir(DESC_FIRST_KEYS.includes(k) ? 'desc' : 'asc');
          }} style={{ flex: 1 }} />
          <Pressable style={styles.sortDirBtn} onPress={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}>
            {sortDir === 'asc' ? <ArrowUp size={15} color={colors.accent} /> : <ArrowDown size={15} color={colors.accent} />}
          </Pressable>
        </View>
      </View>

      <FlatList
        data={displayed}
        keyExtractor={(r) => r.entry_id}
        renderItem={renderRosterCard}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
        ListEmptyComponent={<Text style={[type.secondary, { textAlign: 'center', padding: spacing.xl }]}>No rosters match current filters.</Text>}
        initialNumToRender={8}
        windowSize={7}
        removeClippedSubviews
      />

      {boardRoster && (
        <DraftBoardModal
          roster={boardRoster}
          adpByPlatform={adpByPlatform}
          actuals={actuals}
          boardOverride={demoMode
            ? ((activeBoards ?? []).find(b => b.draftId === boardRoster.entry_id) ?? null)
            : null}
          onClose={() => setBoardRoster(null)}
        />
      )}
    </View>
  );
}

function NavBanner({ text, onClear }) {
  return (
    <View style={styles.navBanner}>
      <Text style={[type.secondary, { flex: 1 }]} numberOfLines={2}>{text}</Text>
      <Pressable onPress={onClear} hitSlop={8}>
        <Text style={{ color: colors.accent, fontSize: 12.5, fontWeight: '700' }}>Clear</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  rosterCard: {
    backgroundColor: colors.surface1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: 6,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'flex-start' },
  entryId: { fontSize: 13, fontWeight: '700', color: colors.accent, fontVariant: ['tabular-nums'] },
  cardFooter: {
    flexDirection: 'row', marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.borderSubtle,
  },
  stat: { flex: 1 },
  statLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  statValue: { fontSize: 13, fontWeight: '700', fontVariant: ['tabular-nums'], marginTop: 1, color: colors.textPrimary },
  expanded: {
    marginTop: spacing.md, paddingTop: spacing.md,
    borderTopWidth: 1, borderTopColor: colors.borderSubtle,
    backgroundColor: colors.surface1,
  },
  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  actionBtnText: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  playerRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    paddingVertical: 6, borderRadius: radii.sm, paddingHorizontal: 4,
  },
  playerPick: { width: 30, fontSize: 12, color: colors.textMuted, textAlign: 'right', fontVariant: ['tabular-nums'] },
  suggestBox: {
    backgroundColor: colors.surface2, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.borderDefault,
    marginBottom: spacing.sm, overflow: 'hidden',
  },
  suggestRow: { paddingHorizontal: spacing.md, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  tokenPill: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderRadius: radii.pill,
    paddingHorizontal: 9, paddingVertical: 4,
  },
  chip: {
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: radii.pill,
    borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.surface1,
  },
  sortBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sortDirBtn: {
    width: 34, height: 30, borderRadius: radii.sm,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.borderDefault,
    alignItems: 'center', justifyContent: 'center',
  },
  navBanner: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.accentMuted, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: 8, marginBottom: spacing.sm,
  },
});
