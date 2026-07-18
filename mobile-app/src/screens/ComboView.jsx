// ComboView — mobile port of ComboAnalysis.jsx with its five sub-views:
// Stacks (QB stack profiles + spectrum), QB Pairs (frequency leaderboard),
// Similarity (most-overlapping roster pairs), Playoffs (W15–17 stacks), and
// Explorer (real-draft pick-path frequencies). Computations are line-for-line
// ports; rendering is rebuilt for phones.
import React, { useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, ScrollView, FlatList, StyleSheet, Keyboard } from 'react-native';
import { useRouter } from 'expo-router';
import { FolderSync, ChevronRight, ChevronDown, Minus, Plus } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import TournamentFilter from '../components/TournamentFilter';
import { SearchBar, EmptyView, Button, Segmented } from '../components/ui';
import { NFL_TEAMS } from '../../shared/utils/nflTeams';
import { isExcludedSlate } from '../../shared/utils/realDraftData';
import { colors, spacing, radii, type } from '../theme';
import { usePortfolio } from '../contexts/PortfolioContext';
import { INSTALL_URL } from '../../shared/config';
import PlayoffStacksView from './PlayoffStacksView';
import DraftExplorerView from './DraftExplorerView';

const POS_COLORS = { QB: '#bf44ef', RB: '#10b981', WR: '#f59e0b', TE: '#3b82f6', default: '#6b7280' };

const COMBO_PALETTE = [
  '#10B981', '#EC4899', '#14B8A6', '#F97316', '#8B5CF6',
  '#06B6D4', '#F43F5E', '#A3E635', '#60A5FA', '#FB923C',
];
const comboColor = (index) => COMBO_PALETTE[index % COMBO_PALETTE.length];

const VIEW_TABS = [
  { key: 'stacks', label: 'Stacks' },
  { key: 'qbpairs', label: 'Pairs' },
  { key: 'similarity', label: 'Similar' },
  { key: 'playoffs', label: 'Playoffs' },
  { key: 'explorer', label: 'Explorer' },
];

function PlayerBadge({ name, position }) {
  const c = POS_COLORS[position] || POS_COLORS.default;
  return (
    <View style={[styles.pBadge, { borderColor: c + '55' }]}>
      <Text style={{ color: c, fontSize: 9.5, fontWeight: '800' }}>{position}</Text>
      <Text style={{ color: colors.textPrimary, fontSize: 11.5 }} numberOfLines={1}>{name}</Text>
    </View>
  );
}

export default function ComboView() {
  const router = useRouter();
  const { rosterData, masterPlayers, setRosterNavContext } = usePortfolio();
  const [activeTab, setActiveTab] = useState('stacks');
  const [expandedQBs, setExpandedQBs] = useState(new Set());
  const [minCount, setMinCount] = useState(1);
  const [playerSearch, setPlayerSearch] = useState('');
  const [selectedPlayer, setSelectedPlayer] = useState('');
  const [excludeTE, setExcludeTE] = useState(false);
  const [excludeRB, setExcludeRB] = useState(false);
  const [sortKey, setSortKey] = useState('stackPct');
  const [sortDir, setSortDir] = useState('desc');
  const [includePlayers, setIncludePlayers] = useState([]);
  const [excludePlayers, setExcludePlayers] = useState([]);
  const [includeSearch, setIncludeSearch] = useState('');
  const [excludeSearch, setExcludeSearch] = useState('');
  const [selectedTournaments, setSelectedTournaments] = useState([]);

  const navigateToRosters = useCallback((players, entryId) => {
    setRosterNavContext(entryId ? { entry_id: entryId } : { players });
    router.push({ pathname: '/portfolio', params: { view: 'rosters', nav: Date.now() } });
  }, [setRosterNavContext, router]);

  // ── Slate groups with pre/post classification (mirrors web) ──
  const slateGroups = useMemo(() => {
    const isPreDraftTournament = (slateTitle, tournamentTitle) => {
      const slate = (slateTitle || '').toLowerCase();
      const tourn = (tournamentTitle || '').toLowerCase();
      if (slate.includes('pre-draft') || slate.includes('predraft')) return true;
      if (tourn.includes('early bird')) return true;
      return false;
    };

    const slateToTournaments = new Map();
    rosterData.forEach(p => {
      if (!p.tournamentTitle) return;
      const slate = p.slateTitle || 'Other';
      if (!slateToTournaments.has(slate)) slateToTournaments.set(slate, new Map());
      const tournMap = slateToTournaments.get(slate);
      if (!tournMap.has(p.tournamentTitle)) {
        tournMap.set(p.tournamentTitle, isPreDraftTournament(p.slateTitle, p.tournamentTitle) ? 'pre' : 'post');
      }
    });

    return [...slateToTournaments.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([slate, tournMap]) => ({
        slate,
        tournaments: [...tournMap.keys()].sort(),
        tournamentStatuses: Object.fromEntries(tournMap),
      }));
  }, [rosterData]);

  const draftExplorerDefaultMode = useMemo(() => {
    if (selectedTournaments.length === 0) return 'post';
    const tournamentToStatus = new Map();
    for (const group of slateGroups) {
      for (const [t, status] of Object.entries(group.tournamentStatuses || {})) {
        tournamentToStatus.set(t, status);
      }
    }
    const statuses = selectedTournaments.map(t => tournamentToStatus.get(t)).filter(Boolean);
    if (statuses.length === 0) return 'post';
    return statuses.every(s => s === 'pre') ? 'pre' : 'post';
  }, [selectedTournaments, slateGroups]);

  const filteredRosterData = useMemo(() => {
    if (selectedTournaments.length === 0) return rosterData;
    const set = new Set(selectedTournaments);
    return rosterData.filter(p => set.has(p.tournamentTitle));
  }, [rosterData, selectedTournaments]);

  const explorerRosterData = useMemo(
    () => filteredRosterData.filter(p => !isExcludedSlate(p.slateTitle)),
    [filteredRosterData]
  );

  const rosters = useMemo(() => {
    const map = new Map();
    filteredRosterData.forEach(p => {
      const id = p.entry_id || 'unknown';
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(p);
    });
    return Array.from(map.values());
  }, [filteredRosterData]);

  const totalRosters = rosters.length;

  const allPlayerNames = useMemo(() => {
    const names = new Set();
    filteredRosterData.forEach(p => { if (p.name) names.add(p.name); });
    return [...names].sort();
  }, [filteredRosterData]);

  // ── View 1: Stack Profiles ──
  const stackProfilesData = useMemo(() => {
    if (activeTab !== 'stacks') return null;

    const allowedPositions = ['WR', 'TE', 'RB'].filter(pos =>
      !(pos === 'TE' && excludeTE) && !(pos === 'RB' && excludeRB)
    );

    const qbGroups = new Map();

    rosters.forEach(roster => {
      const qbs = roster.filter(p => p.position === 'QB');
      qbs.forEach(qb => {
        if (!qbGroups.has(qb.name)) {
          qbGroups.set(qb.name, { qb, totalDrafts: 0, combos: new Map() });
        }
        const group = qbGroups.get(qb.name);
        group.totalDrafts += 1;

        const teammates = roster
          .filter(p =>
            p.team === qb.team &&
            p.name !== qb.name &&
            allowedPositions.includes(p.position)
          )
          .sort((a, b) => a.name.localeCompare(b.name));

        const key = teammates.length === 0 ? 'NAKED' : teammates.map(t => t.name).join(' | ');
        if (!group.combos.has(key)) {
          group.combos.set(key, { players: teammates, count: 0 });
        }
        group.combos.get(key).count += 1;
      });
    });

    return Array.from(qbGroups.values())
      .map(g => {
        const nakedCount = Array.from(g.combos.values())
          .filter(c => c.players.length === 0)
          .reduce((sum, c) => sum + c.count, 0);
        const stackPct = ((g.totalDrafts - nakedCount) / g.totalDrafts) * 100;
        return {
          ...g,
          stackPct,
          sortedCombos: [
            ...Array.from(g.combos.values()).filter(c => c.players.length > 0).sort((a, b) => b.count - a.count),
            ...Array.from(g.combos.values()).filter(c => c.players.length === 0),
          ],
        };
      })
      .sort((a, b) => b.stackPct - a.stackPct || b.totalDrafts - a.totalDrafts);
  }, [rosters, activeTab, excludeTE, excludeRB]);

  const allStackPlayerNames = useMemo(() => {
    if (!stackProfilesData) return [];
    const names = new Set();
    stackProfilesData.forEach(g => {
      g.sortedCombos.forEach(c => c.players.forEach(p => names.add(p.name)));
    });
    return [...names].sort();
  }, [stackProfilesData]);

  const playerSuggestions = useMemo(() => {
    if (!playerSearch.trim() || selectedPlayer) return [];
    const q = playerSearch.trim().toLowerCase();
    return allStackPlayerNames.filter(n => n.toLowerCase().includes(q)).slice(0, 8);
  }, [playerSearch, selectedPlayer, allStackPlayerNames]);

  // ── View 2: QB Pairs ──
  const qbPairsData = useMemo(() => {
    if (activeTab !== 'qbpairs') return null;
    const pairMap = new Map();
    rosters.forEach(roster => {
      const qbs = roster.filter(p => p.position === 'QB' && p.team !== 'FA');
      if (qbs.length < 2) return;
      for (let i = 0; i < qbs.length; i++) {
        for (let j = i + 1; j < qbs.length; j++) {
          const sorted = [qbs[i].name, qbs[j].name].sort();
          const key = sorted.join('||');
          if (!pairMap.has(key)) {
            const [name1] = sorted;
            const p1 = qbs[i].name === name1 ? qbs[i] : qbs[j];
            const p2 = qbs[i].name === name1 ? qbs[j] : qbs[i];
            pairMap.set(key, { qb1: p1, qb2: p2, count: 0 });
          }
          pairMap.get(key).count += 1;
        }
      }
    });
    return Array.from(pairMap.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 50)
      .map((p, i) => ({ ...p, rank: i + 1, pct: ((p.count / totalRosters) * 100).toFixed(1) }));
  }, [rosters, activeTab, totalRosters]);

  // ── View 3: Roster Similarity ──
  const similarityData = useMemo(() => {
    if (activeTab !== 'similarity') return null;

    const includePlayerSet = new Set(includePlayers);
    const excludePlayerSet = new Set(excludePlayers);
    const hasInclude = includePlayerSet.size > 0;
    const hasExclude = excludePlayerSet.size > 0;

    const summaries = [];
    for (const roster of rosters) {
      const entryId = roster[0]?.entry_id || 'unknown';
      const tournamentTitle = roster[0]?.tournamentTitle || null;
      const playerSet = new Set(roster.map(p => p.name));

      if (hasInclude) {
        let pass = true;
        for (const p of includePlayerSet) { if (!playerSet.has(p)) { pass = false; break; } }
        if (!pass) continue;
      }
      if (hasExclude) {
        let skip = false;
        for (const p of excludePlayerSet) { if (playerSet.has(p)) { skip = true; break; } }
        if (skip) continue;
      }

      const playerMap = new Map(roster.map(p => [p.name, p.position]));
      summaries.push({ entryId, tournamentTitle, playerSet, playerMap, size: roster.length });
    }

    const pairs = [];
    for (let i = 0; i < summaries.length; i++) {
      for (let j = i + 1; j < summaries.length; j++) {
        const a = summaries[i];
        const b = summaries[j];
        const [smaller, larger] = a.playerSet.size <= b.playerSet.size ? [a, b] : [b, a];
        const shared = [];
        for (const name of smaller.playerSet) {
          if (larger.playerSet.has(name)) {
            shared.push({ name, position: smaller.playerMap.get(name) || larger.playerMap.get(name) });
          }
        }
        if (shared.length >= minCount) {
          pairs.push({
            roster1: { entryId: a.entryId, tournamentTitle: a.tournamentTitle },
            roster2: { entryId: b.entryId, tournamentTitle: b.tournamentTitle },
            overlapCount: shared.length,
            overlapPct: (shared.length / Math.min(a.size, b.size)) * 100,
            sharedPlayers: shared.sort((x, y) => {
              const posOrder = { QB: 0, RB: 1, WR: 2, TE: 3 };
              return (posOrder[x.position] ?? 4) - (posOrder[y.position] ?? 4) || x.name.localeCompare(y.name);
            }),
          });
        }
      }
    }

    pairs.sort((a, b) => b.overlapCount - a.overlapCount || a.roster1.entryId.localeCompare(b.roster1.entryId));
    return pairs.slice(0, 50).map((p, i) => ({ ...p, rank: i + 1 }));
  }, [rosters, activeTab, minCount, includePlayers, excludePlayers]);

  const toggleQB = (name) => {
    setExpandedQBs(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  const handleTabClick = (tab) => {
    setActiveTab(tab);
    setExpandedQBs(new Set());
    setPlayerSearch('');
    setSelectedPlayer('');
    setExcludeTE(false);
    setExcludeRB(false);
    setSortKey('stackPct');
    setSortDir('desc');
    setIncludePlayers([]); setIncludeSearch('');
    setExcludePlayers([]); setExcludeSearch('');
  };

  if (totalRosters === 0 && rosterData.length === 0) {
    return (
      <EmptyView
        icon={<FolderSync size={38} color={colors.accent} />}
        title="No roster data"
        body="Sync your rosters from the browser extension on desktop to view combo analysis."
        cta={<Button title="Open install guide" onPress={() => WebBrowser.openBrowserAsync(INSTALL_URL)} />}
      />
    );
  }

  const visibleStackProfiles = activeTab === 'stacks' && stackProfilesData
    ? (() => {
        const filtered = stackProfilesData.filter(g => {
          if (g.qb.team === 'N/A' || g.qb.team === 'FA') return false;
          const qualifying = g.sortedCombos.filter(c => c.count >= minCount && c.players.length > 0);
          if (qualifying.length === 0) return false;
          if (selectedPlayer) return qualifying.some(c => c.players.some(p => p.name === selectedPlayer));
          return true;
        });
        return [...filtered].sort((a, b) => {
          let cmp = 0;
          if (sortKey === 'stackPct') cmp = a.stackPct - b.stackPct;
          else if (sortKey === 'totalDrafts') cmp = a.totalDrafts - b.totalDrafts;
          else if (sortKey === 'name') cmp = a.qb.name.localeCompare(b.qb.name);
          return sortDir === 'desc' ? -cmp : cmp;
        });
      })()
    : null;

  const visiblePairs = activeTab === 'qbpairs' && qbPairsData
    ? qbPairsData.filter(p => p.count >= minCount)
    : null;

  const minLabel = activeTab === 'stacks' ? 'Min stacks' : activeTab === 'similarity' ? 'Min overlap' : 'Min count';

  const header = (
    <View style={{ paddingHorizontal: spacing.lg }}>
      <Segmented options={VIEW_TABS} value={activeTab} onChange={handleTabClick} style={{ marginBottom: spacing.sm }} />
      <TournamentFilter slateGroups={slateGroups} selected={selectedTournaments} onChange={setSelectedTournaments} />
      {activeTab !== 'explorer' && activeTab !== 'playoffs' && activeTab !== 'stacks' && (
        <View style={styles.stepperRow}>
          <Text style={type.secondary}>{minLabel}</Text>
          <View style={styles.stepper}>
            <Pressable style={styles.stepBtn} onPress={() => setMinCount(v => Math.max(1, v - 1))}>
              <Minus size={14} color={colors.textSecondary} />
            </Pressable>
            <Text style={styles.stepVal}>{minCount}</Text>
            <Pressable style={styles.stepBtn} onPress={() => setMinCount(v => v + 1)}>
              <Plus size={14} color={colors.textSecondary} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );

  // ── Stacks view ──
  if (activeTab === 'stacks') {
    return (
      <View style={{ flex: 1 }}>
        {header}
        <View style={{ paddingHorizontal: spacing.lg }}>
          <View style={{ flexDirection: 'row', gap: 6, marginBottom: spacing.sm }}>
            {[['Exclude TE', excludeTE, setExcludeTE], ['Exclude RB', excludeRB, setExcludeRB]].map(([lbl, val, set]) => (
              <Pressable key={lbl} onPress={() => set(v => !v)}
                style={[styles.chip, val && { borderColor: colors.accent, backgroundColor: colors.accentMuted }]}>
                <Text style={{ fontSize: 12, fontWeight: '600', color: val ? colors.accent : colors.textSecondary }}>{lbl}</Text>
              </Pressable>
            ))}
          </View>
          <SearchBar
            value={playerSearch}
            onChange={(t) => { setPlayerSearch(t); setSelectedPlayer(''); setExpandedQBs(new Set()); }}
            placeholder="Filter by player…"
            style={{ marginBottom: spacing.sm }}
          />
          {playerSuggestions.length > 0 && (
            <View style={styles.suggestBox}>
              {playerSuggestions.map(name => (
                <Pressable key={name} style={styles.suggestRow} onPress={() => { setSelectedPlayer(name); setPlayerSearch(name); setExpandedQBs(new Set()); Keyboard.dismiss(); }}>
                  <Text style={{ color: colors.textPrimary, fontSize: 13 }}>{name}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <Text style={[type.muted, { marginBottom: spacing.sm }]}>
            <Text style={{ fontWeight: '700', color: colors.textSecondary }}>{visibleStackProfiles?.length ?? 0}</Text> QBs · <Text style={{ fontWeight: '700', color: colors.textSecondary }}>{totalRosters}</Text> rosters · tap a QB to expand combos
          </Text>
        </View>
        <FlatList
          data={visibleStackProfiles ?? []}
          keyExtractor={(g) => g.qb.name}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
          renderItem={({ item: group }) => {
            const isExpanded = expandedQBs.has(group.qb.name);
            const barCombos = (() => {
              const qualified = group.sortedCombos
                .map((combo, idx) => ({ combo, idx }))
                .filter(({ combo }) => combo.count >= minCount && combo.players.length > 0);
              if (!selectedPlayer) return qualified;
              const matching = qualified.filter(({ combo }) => combo.players.some(p => p.name === selectedPlayer));
              const rest = qualified.filter(({ combo }) => !combo.players.some(p => p.name === selectedPlayer));
              return [...matching, ...rest];
            })();
            return (
              <Pressable style={styles.card} onPress={() => toggleQB(group.qb.name)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  {isExpanded ? <ChevronDown size={15} color={colors.textMuted} /> : <ChevronRight size={15} color={colors.textMuted} />}
                  <View style={{ flex: 1 }}>
                    <Text style={[type.h3]} numberOfLines={1}>{group.qb.name}</Text>
                    <Text style={type.muted}>{group.qb.team}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[type.h3, { fontVariant: ['tabular-nums'] }]}>{group.stackPct.toFixed(1)}%</Text>
                    <Text style={type.muted}>{group.totalDrafts} drafts</Text>
                  </View>
                  <Pressable style={styles.navBtn} onPress={() => navigateToRosters([group.qb.name])}>
                    <Text style={styles.navBtnText}>→</Text>
                  </Pressable>
                </View>
                {/* Stack spectrum */}
                <View style={styles.spectrum}>
                  {barCombos.map(({ combo, idx }) => (
                    <View key={idx} style={{
                      width: `${(combo.count / group.totalDrafts) * 100}%`,
                      minWidth: 2,
                      backgroundColor: comboColor(idx),
                      opacity: selectedPlayer && !combo.players.some(p => p.name === selectedPlayer) ? 0.3 : 1,
                    }} />
                  ))}
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 5 }}>
                  {barCombos.slice(0, 4).map(({ combo, idx }) => (
                    <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <View style={{ width: 7, height: 7, borderRadius: 2, backgroundColor: comboColor(idx) }} />
                      <Text style={type.muted}>{combo.players.map(p => p.name.split(' ').pop()).join('+')}</Text>
                    </View>
                  ))}
                  {barCombos.length > 4 && <Text style={type.muted}>+{barCombos.length - 4} more</Text>}
                </View>
                {isExpanded && (
                  <View style={{ marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: spacing.sm }}>
                    {group.sortedCombos
                      .map((combo, i) => ({ combo, i }))
                      .filter(({ combo }) => {
                        if (combo.count < minCount) return false;
                        if (combo.players.length === 0) return false;
                        if (selectedPlayer) return combo.players.some(p => p.name === selectedPlayer);
                        return true;
                      })
                      .map(({ combo, i }) => {
                        const pct = ((combo.count / group.totalDrafts) * 100).toFixed(1);
                        return (
                          <View key={i} style={styles.comboLine}>
                            <View style={{ width: 3, alignSelf: 'stretch', borderRadius: 2, backgroundColor: comboColor(i) }} />
                            <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                              {combo.players.map((p, j) => <PlayerBadge key={j} name={p.name} position={p.position} />)}
                            </View>
                            <Text style={[type.secondary, { fontVariant: ['tabular-nums'] }]}>{combo.count} · {pct}%</Text>
                            <Pressable style={styles.navBtn} onPress={() => navigateToRosters([group.qb.name, ...combo.players.map(p => p.name)])}>
                              <Text style={styles.navBtnText}>→</Text>
                            </Pressable>
                          </View>
                        );
                      })}
                  </View>
                )}
              </Pressable>
            );
          }}
          ListEmptyComponent={<Text style={[type.secondary, { textAlign: 'center', padding: spacing.xl }]}>No stacks match.</Text>}
        />
      </View>
    );
  }

  // ── QB Pairs view ──
  if (activeTab === 'qbpairs') {
    const maxCount = visiblePairs?.[0]?.count || 1;
    return (
      <View style={{ flex: 1 }}>
        {header}
        <Text style={[type.muted, { paddingHorizontal: spacing.lg, marginBottom: spacing.sm }]}>
          QB duos rostered together, ranked by frequency. Single-QB rosters excluded.
        </Text>
        <FlatList
          data={visiblePairs ?? []}
          keyExtractor={(p) => `${p.qb1.name}||${p.qb2.name}`}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
          renderItem={({ item: pair }) => {
            const isTop = pair.rank === 1;
            return (
              <View style={[styles.boardRow, isTop && { borderColor: colors.accent }]}>
                <View style={[styles.boardFill, { width: `${(pair.count / maxCount) * 100}%` }]} />
                <Text style={[styles.rank, isTop && { color: colors.accent }]}>#{pair.rank}</Text>
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4 }}>
                  <PlayerBadge name={pair.qb1.name} position="QB" />
                  <Text style={type.muted}>+</Text>
                  <PlayerBadge name={pair.qb2.name} position="QB" />
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={[type.h3, isTop && { color: colors.accent }, { fontVariant: ['tabular-nums'] }]}>{pair.count}</Text>
                  <Text style={type.muted}>{pair.pct}%</Text>
                </View>
                <Pressable style={styles.navBtn} onPress={() => navigateToRosters([pair.qb1.name, pair.qb2.name])}>
                  <Text style={styles.navBtnText}>→</Text>
                </Pressable>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={[type.secondary, { textAlign: 'center', padding: spacing.xl }]}>
              No QB pairs found. Rosters with only one QB will not appear here.
            </Text>
          }
        />
      </View>
    );
  }

  // ── Similarity view ──
  if (activeTab === 'similarity') {
    const maxOverlap = similarityData?.[0]?.overlapCount || 1;
    const shortId = (id) => id.slice(0, 8);
    const includeSuggestions = includeSearch.trim()
      ? allPlayerNames.filter(n => n.toLowerCase().includes(includeSearch.trim().toLowerCase()) && !includePlayers.includes(n)).slice(0, 6)
      : [];
    const excludeSuggestions = excludeSearch.trim()
      ? allPlayerNames.filter(n => n.toLowerCase().includes(excludeSearch.trim().toLowerCase()) && !excludePlayers.includes(n)).slice(0, 6)
      : [];
    return (
      <View style={{ flex: 1 }}>
        {header}
        <View style={{ paddingHorizontal: spacing.lg }}>
          <SearchBar value={includeSearch} onChange={setIncludeSearch} placeholder="Include players…" style={{ marginBottom: 4 }} />
          {includeSuggestions.length > 0 && (
            <View style={styles.suggestBox}>
              {includeSuggestions.map(n => (
                <Pressable key={n} style={styles.suggestRow} onPress={() => { setIncludePlayers(prev => [...prev, n]); setIncludeSearch(''); Keyboard.dismiss(); }}>
                  <Text style={{ color: '#00e5a0', fontSize: 13 }}>+ {n}</Text>
                </Pressable>
              ))}
            </View>
          )}
          <SearchBar value={excludeSearch} onChange={setExcludeSearch} placeholder="Exclude players…" style={{ marginBottom: 4 }} />
          {excludeSuggestions.length > 0 && (
            <View style={styles.suggestBox}>
              {excludeSuggestions.map(n => (
                <Pressable key={n} style={styles.suggestRow} onPress={() => { setExcludePlayers(prev => [...prev, n]); setExcludeSearch(''); Keyboard.dismiss(); }}>
                  <Text style={{ color: colors.negative, fontSize: 13 }}>− {n}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {(includePlayers.length > 0 || excludePlayers.length > 0) && (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: spacing.sm }}>
              {includePlayers.map(n => (
                <Pressable key={n} style={[styles.chip, { borderColor: '#00e5a0' }]} onPress={() => setIncludePlayers(prev => prev.filter(x => x !== n))}>
                  <Text style={{ color: '#00e5a0', fontSize: 12 }}>{n} ✕</Text>
                </Pressable>
              ))}
              {excludePlayers.map(n => (
                <Pressable key={n} style={[styles.chip, { borderColor: colors.negative }]} onPress={() => setExcludePlayers(prev => prev.filter(x => x !== n))}>
                  <Text style={{ color: colors.negative, fontSize: 12 }}>{n} ✕</Text>
                </Pressable>
              ))}
            </View>
          )}
          <Text style={[type.muted, { marginBottom: spacing.sm }]}>
            Most overlapping roster pairs. High overlap = concentrated risk.
          </Text>
        </View>
        <FlatList
          data={similarityData ?? []}
          keyExtractor={(p) => `${p.roster1.entryId}||${p.roster2.entryId}`}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
          renderItem={({ item: pair }) => {
            const isTop = pair.rank === 1;
            return (
              <View style={[styles.boardRow, { flexDirection: 'column', alignItems: 'stretch' }, isTop && { borderColor: colors.accent }]}>
                <View style={[styles.boardFill, { width: `${(pair.overlapCount / maxOverlap) * 100}%` }]} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text style={[styles.rank, isTop && { color: colors.accent }]}>#{pair.rank}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={type.secondary} numberOfLines={1}>
                      <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{shortId(pair.roster1.entryId)}</Text>
                      {'  ×  '}
                      <Text style={{ fontWeight: '700', color: colors.textPrimary }}>{shortId(pair.roster2.entryId)}</Text>
                    </Text>
                    {pair.roster1.tournamentTitle && <Text style={type.muted} numberOfLines={1}>{pair.roster1.tournamentTitle}</Text>}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[type.h3, isTop && { color: colors.accent }, { fontVariant: ['tabular-nums'] }]}>{pair.overlapCount}</Text>
                    <Text style={type.muted}>shared · {pair.overlapPct.toFixed(0)}%</Text>
                  </View>
                  <Pressable style={styles.navBtn} onPress={() => navigateToRosters(pair.sharedPlayers.map(p => p.name))}>
                    <Text style={styles.navBtnText}>→</Text>
                  </Pressable>
                </View>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                  {pair.sharedPlayers.map((p, j) => <PlayerBadge key={j} name={p.name} position={p.position} />)}
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <Text style={[type.secondary, { textAlign: 'center', padding: spacing.xl }]}>
              No roster pairs found with {minCount}+ shared players.
            </Text>
          }
        />
      </View>
    );
  }

  // ── Playoffs view ──
  if (activeTab === 'playoffs') {
    return (
      <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>
        {header}
        <PlayoffStacksView
          rosters={rosters}
          totalRosters={totalRosters}
          minCount={minCount}
          onNavigateToRosters={navigateToRosters}
        />
      </ScrollView>
    );
  }

  // ── Explorer view ──
  return (
    <View style={{ flex: 1 }}>
      {header}
      <DraftExplorerView
        key={`${selectedTournaments.join('|')}::${draftExplorerDefaultMode}`}
        masterPlayers={masterPlayers}
        rosterData={explorerRosterData}
        tournamentStatuses={Object.fromEntries(
          slateGroups.flatMap(g => Object.entries(g.tournamentStatuses || {}))
        )}
        onNavigateToRosters={navigateToRosters}
        defaultMode={draftExplorerDefaultMode}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  chip: {
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: radii.pill,
    borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.surface1,
  },
  stepperRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  stepBtn: {
    width: 30, height: 30, borderRadius: radii.sm,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.borderDefault,
    alignItems: 'center', justifyContent: 'center',
  },
  stepVal: { width: 36, textAlign: 'center', color: colors.textPrimary, fontWeight: '700', fontVariant: ['tabular-nums'] },
  suggestBox: {
    backgroundColor: colors.surface2, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.borderDefault,
    marginBottom: spacing.sm, overflow: 'hidden',
  },
  suggestRow: { paddingHorizontal: spacing.md, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  spectrum: {
    flexDirection: 'row', height: 12, borderRadius: 4, overflow: 'hidden',
    backgroundColor: colors.surface3, marginTop: spacing.sm,
  },
  comboLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 7 },
  pBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 2,
    backgroundColor: colors.surface2,
  },
  boardRow: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface1, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.borderSubtle,
    padding: spacing.md, marginBottom: spacing.sm,
    overflow: 'hidden',
  },
  boardFill: {
    position: 'absolute', left: 0, top: 0, bottom: 0,
    backgroundColor: colors.surface2,
  },
  rank: { width: 34, fontSize: 13, fontWeight: '800', color: colors.textMuted, fontVariant: ['tabular-nums'] },
  navBtn: {
    width: 30, height: 30, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  navBtnText: { color: colors.accent, fontSize: 14, fontWeight: '700' },
});
