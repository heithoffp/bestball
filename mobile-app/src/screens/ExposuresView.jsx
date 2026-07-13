// ExposuresView — mobile port of ExposureTable.jsx (the web's mobile card-list
// variant). Same filter model: search, tournament multi-select, RB/QB/TE
// archetype chips (exposure % recalculates over matching rosters), show-0%
// toggle, sortable fields, expandable cards with the ADP sparkline.
import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { FolderSync, ArrowUp, ArrowDown } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import AdpSparkline from '../components/AdpSparkline';
import TournamentFilter from '../components/TournamentFilter';
import { SearchBar, EmptyView, Button, ChipRow } from '../components/ui';
import { ARCHETYPE_METADATA, classifyRosterPath } from '../../shared/utils/rosterArchetypes';
import { NFL_TEAMS } from '../../shared/utils/nflTeams';
import { canonicalName } from '../../shared/utils/helpers';
import { calcCLV, clvLabel } from '../../shared/utils/clvHelpers';
import { colors, spacing, radii, type } from '../theme';
import { usePortfolio } from '../contexts/PortfolioContext';
import { INSTALL_URL } from '../../shared/config';

const COLORS = { QB: '#bf44ef', RB: '#10b981', WR: '#f59e0b', TE: '#3b82f6', default: '#6b7280' };
const getPosColor = (pos) => COLORS[pos] || COLORS.default;

const RB_OPTIONS = ['RB_ZERO', 'RB_HERO', 'RB_DOUBLE_ANCHOR', 'RB_HYPER_FRAGILE', 'RB_BALANCED'];
const QB_OPTIONS = ['QB_ELITE', 'QB_CORE', 'QB_LATE'];
const TE_OPTIONS = ['TE_ELITE', 'TE_ANCHOR', 'TE_LATE'];

const SORT_OPTIONS = [
  { key: 'exposure', label: 'Exposure %' },
  { key: 'adp', label: 'ADP' },
  { key: 'clv', label: 'Avg CLV' },
  { key: 'name', label: 'Name' },
  { key: 'count', label: 'Count' },
  { key: 'adpTrend', label: 'Trend' },
];

export default function ExposuresView() {
  const router = useRouter();
  const { masterPlayers, rosterData, setRosterNavContext } = usePortfolio();

  const [search, setSearch] = useState('');
  const [sortField, setSortField] = useState(rosterData.length === 0 ? 'adp' : 'exposure');
  const [sortDir, setSortDir] = useState(rosterData.length === 0 ? 'asc' : 'desc');
  const [showUndrafted, setShowUndrafted] = useState(rosterData.length === 0);

  const [rbFilter, setRbFilter] = useState('Any');
  const [qbFilter, setQbFilter] = useState('Any');
  const [teFilter, setTeFilter] = useState('Any');
  const [selectedTournaments, setSelectedTournaments] = useState([]);
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => {
    setExpandedId(null);
  }, [search, sortField, sortDir, rbFilter, qbFilter, teFilter, selectedTournaments, showUndrafted]);

  const { totalFilteredEntries, playerExposures } = useMemo(() => {
    if (!rosterData || rosterData.length === 0) {
      return { totalFilteredEntries: 0, playerExposures: {} };
    }
    const entriesMap = {};
    rosterData.forEach(p => {
      const id = p.entry_id ?? p.entryId ?? 'unknown';
      if (!entriesMap[id]) entriesMap[id] = [];
      entriesMap[id].push(p);
    });

    const filtered = [];
    Object.entries(entriesMap).forEach(([id, roster]) => {
      const path = classifyRosterPath(roster);
      const rbMatch = rbFilter === 'Any' || path.rb === rbFilter;
      const qbMatch = qbFilter === 'Any' || path.qb === qbFilter;
      const teMatch = teFilter === 'Any' || path.te === teFilter;
      const rosterTournament = roster[0]?.tournamentTitle || null;
      const tournamentMatch = selectedTournaments.length === 0
        || selectedTournaments.includes(rosterTournament);

      if (rbMatch && qbMatch && teMatch && tournamentMatch) {
        filtered.push({ id, roster, path });
      }
    });

    const playerCounts = {};
    filtered.forEach(({ roster }) => {
      roster.forEach(player => {
        const key = canonicalName(player.name || '');
        if (!key) return;
        if (!playerCounts[key]) playerCounts[key] = { count: 0, clvSum: 0, clvCount: 0 };
        playerCounts[key].count++;
        const clv = calcCLV(player.pick, player.latestADP, 0.5);
        if (clv !== null) {
          playerCounts[key].clvSum += clv;
          playerCounts[key].clvCount++;
        }
      });
    });

    const exposures = {};
    const rosterCount = filtered.length;
    Object.entries(playerCounts).forEach(([nameKey, { count, clvSum, clvCount }]) => {
      exposures[nameKey] = {
        count,
        exposure: rosterCount > 0 ? (count / rosterCount) * 100 : 0,
        avgCLV: clvCount > 0 ? clvSum / clvCount : null,
      };
    });

    return { totalFilteredEntries: filtered.length, playerExposures: exposures };
  }, [rosterData, rbFilter, qbFilter, teFilter, selectedTournaments]);

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

  const playersWithFilteredExposure = useMemo(() => {
    const now = new Date();
    const twoWeeksAgo = new Date(now);
    twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

    return masterPlayers.map(p => {
      const nameKey = canonicalName(p.name || '');
      const filtered = playerExposures[nameKey];

      let trendValue = null;
      if (p.history && p.history.length >= 2) {
        const valid = p.history.filter(h => h.adpPick !== null);
        if (valid.length >= 2) {
          const latest = valid[valid.length - 1];
          let baseline = valid[0];
          for (const h of valid) {
            if (new Date(h.date) <= twoWeeksAgo) {
              baseline = h;
            } else {
              break;
            }
          }
          if (baseline !== latest) {
            trendValue = latest.adpPick - baseline.adpPick;
          }
        }
      }

      return {
        ...p,
        trendValue,
        filteredExposure: filtered ? filtered.exposure : 0,
        filteredCount: filtered ? filtered.count : 0,
        avgCLV: filtered ? filtered.avgCLV : null,
      };
    });
  }, [masterPlayers, playerExposures]);

  const hasActiveFilter = rbFilter !== 'Any' || qbFilter !== 'Any' || teFilter !== 'Any' || selectedTournaments.length > 0;

  const filteredAndSorted = useMemo(() => {
    const q = (search || '').toLowerCase().trim();
    const dataToUse = playersWithFilteredExposure;

    let list = showUndrafted
      ? dataToUse
      : dataToUse.filter(p => {
          const count = hasActiveFilter ? (p.filteredCount || 0) : (p.count || 0);
          return count > 0;
        });

    if (q) {
      list = list.filter(p => {
        const hay = `${p.name || ''} ${p.team || ''} ${NFL_TEAMS[p.team] || ''} ${p.position || ''}`.toLowerCase();
        return hay.includes(q);
      });
    }

    const compare = (a, b) => {
      if (sortField === 'name') return (a.name || '').localeCompare(b.name || '');

      const aVal = hasActiveFilter
        ? (sortField === 'count' ? a.filteredCount : a.filteredExposure)
        : (sortField === 'count' ? a.count : a.exposure);
      const bVal = hasActiveFilter
        ? (sortField === 'count' ? b.filteredCount : b.filteredExposure)
        : (sortField === 'count' ? b.count : b.exposure);

      if (sortField === 'adp') {
        return (a.adpPick ?? Number.POSITIVE_INFINITY) - (b.adpPick ?? Number.POSITIVE_INFINITY);
      }
      if (sortField === 'adpTrend') {
        return (a.trendValue ?? Number.POSITIVE_INFINITY) - (b.trendValue ?? Number.POSITIVE_INFINITY);
      }
      if (sortField === 'clv') {
        return (a.avgCLV ?? Number.NEGATIVE_INFINITY) - (b.avgCLV ?? Number.NEGATIVE_INFINITY);
      }
      return (parseFloat(aVal) || 0) - (parseFloat(bVal) || 0);
    };

    return [...list].sort((a, b) => {
      const res = compare(a, b);
      return sortDir === 'asc' ? res : -res;
    });
  }, [playersWithFilteredExposure, search, sortField, sortDir, showUndrafted, hasActiveFilter]);

  const toggleChip = (optionKey) => {
    if (RB_OPTIONS.includes(optionKey)) {
      setRbFilter(prev => prev === optionKey ? 'Any' : optionKey);
    } else if (QB_OPTIONS.includes(optionKey)) {
      setQbFilter(prev => prev === optionKey ? 'Any' : optionKey);
    } else if (TE_OPTIONS.includes(optionKey)) {
      setTeFilter(prev => prev === optionKey ? 'Any' : optionKey);
    }
  };

  const isChipActive = (optionKey) =>
    rbFilter === optionKey || qbFilter === optionKey || teFilter === optionKey;

  const navigateToRosters = (name) => {
    setRosterNavContext({ players: [name] });
    router.push({ pathname: '/portfolio', params: { view: 'rosters', nav: Date.now() } });
  };

  const renderCard = useCallback(({ item: p }) => {
    const posColor = getPosColor(p.position);
    const displayExp = hasActiveFilter ? (p.filteredExposure || 0) : (p.exposure || 0);
    const displayCount = hasActiveFilter ? (p.filteredCount || 0) : (p.count || 0);
    const clv = clvLabel(p.avgCLV ?? null);
    const cardId = p.player_id || p.name;
    const isExpanded = expandedId === cardId;

    return (
      <Pressable
        style={[styles.playerCard, { borderLeftColor: posColor, opacity: displayCount === 0 ? 0.55 : 1 }]}
        onPress={() => setExpandedId(isExpanded ? null : cardId)}
      >
        <View style={styles.cardRow1}>
          <Text style={styles.cardName} numberOfLines={1}>{p.name}</Text>
          <View style={[styles.posBadge, { backgroundColor: `${posColor}25` }]}>
            <Text style={{ color: posColor, fontSize: 10.5, fontWeight: '700' }}>{p.position}</Text>
          </View>
          <Text style={styles.cardTeam}>{p.team}</Text>
        </View>
        <View style={styles.cardRow2}>
          <View style={styles.cardStat}>
            <Text style={styles.cardStatLabel}>Exp</Text>
            <Text style={styles.cardStatValue}>{parseFloat(displayExp).toFixed(1)}%</Text>
          </View>
          <View style={styles.cardStat}>
            <Text style={styles.cardStatLabel}>Count</Text>
            <Text style={styles.cardStatValue}>{displayCount}</Text>
          </View>
          <View style={styles.cardStat}>
            <Text style={styles.cardStatLabel}>ADP</Text>
            <Text style={styles.cardStatValue}>{p.adpDisplay}</Text>
          </View>
          <View style={styles.cardStat}>
            <Text style={styles.cardStatLabel}>CLV</Text>
            <Text style={[styles.cardStatValue, displayCount > 0 && { color: clv.color }]}>
              {displayCount > 0 ? clv.text : '—'}
            </Text>
          </View>
        </View>
        {isExpanded && (
          <View style={styles.cardExpanded}>
            <AdpSparkline history={p.history} width={140} height={32} />
            <View style={{ flex: 1 }}>
              {p.trendValue !== null && (
                <Text style={type.secondary}>
                  2-wk trend: {p.trendValue > 0 ? '+' : ''}{p.trendValue.toFixed(1)} picks
                </Text>
              )}
              {displayCount > 0 && (
                <Pressable onPress={() => navigateToRosters(p.name)}>
                  <Text style={{ color: colors.accent, fontSize: 13, fontWeight: '600', marginTop: 4 }}>
                    See rosters →
                  </Text>
                </Pressable>
              )}
            </View>
          </View>
        )}
      </Pressable>
    );
  }, [expandedId, hasActiveFilter]);

  if (masterPlayers.length === 0) {
    return (
      <EmptyView
        icon={<FolderSync size={38} color={colors.accent} />}
        title="No exposure data"
        body="Sync your rosters from the browser extension on desktop to see exposure data."
        cta={<Button title="Open install guide" onPress={() => WebBrowser.openBrowserAsync(INSTALL_URL)} />}
      />
    );
  }

  const chipOptions = [
    ...RB_OPTIONS.map(k => ({ key: k, label: ARCHETYPE_METADATA[k]?.name || k })),
    ...QB_OPTIONS.map(k => ({ key: k, label: ARCHETYPE_METADATA[k]?.name || k })),
    ...TE_OPTIONS.map(k => ({ key: k, label: ARCHETYPE_METADATA[k]?.name || k })),
  ];

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Search name, team, pos..." style={{ marginBottom: spacing.sm }} />
        <TournamentFilter slateGroups={slateGroups} selected={selectedTournaments} onChange={setSelectedTournaments} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingBottom: spacing.sm }}>
          {chipOptions.map(opt => {
            const active = isChipActive(opt.key);
            const grpColor = RB_OPTIONS.includes(opt.key) ? COLORS.RB : QB_OPTIONS.includes(opt.key) ? COLORS.QB : COLORS.TE;
            return (
              <Pressable
                key={opt.key}
                onPress={() => toggleChip(opt.key)}
                style={[styles.archChip, { borderColor: active ? grpColor : colors.borderDefault, backgroundColor: active ? `${grpColor}30` : colors.surface1 }]}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: active ? grpColor : colors.textSecondary }}>{opt.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
        <View style={styles.sortBar}>
          <ChipRow options={SORT_OPTIONS} value={sortField} onChange={(f) => {
            setSortField(f);
            setSortDir(f === 'adp' || f === 'name' || f === 'adpTrend' ? 'asc' : 'desc');
          }} style={{ flex: 1 }} />
          <Pressable style={styles.sortDirBtn} onPress={() => setSortDir(d => d === 'asc' ? 'desc' : 'asc')}>
            {sortDir === 'asc' ? <ArrowUp size={15} color={colors.accent} /> : <ArrowDown size={15} color={colors.accent} />}
          </Pressable>
          <Pressable
            style={[styles.archChip, showUndrafted && { borderColor: colors.accent, backgroundColor: colors.accentMuted }]}
            onPress={() => setShowUndrafted(v => !v)}
          >
            <Text style={{ fontSize: 11.5, fontWeight: '600', color: showUndrafted ? colors.accent : colors.textSecondary }}>0%</Text>
          </Pressable>
        </View>
        {hasActiveFilter && (
          <Text style={[type.muted, { marginBottom: spacing.sm }]}>
            <Text style={{ color: colors.positive, fontWeight: '700' }}>{totalFilteredEntries}</Text> roster{totalFilteredEntries !== 1 ? 's' : ''} match filters
          </Text>
        )}
        {rosterData.length === 0 && (
          <Text style={[type.muted, { marginBottom: spacing.sm }]}>
            Showing all ADP players. Sync your rosters on desktop to see exposure data.
          </Text>
        )}
      </View>
      <FlatList
        data={filteredAndSorted}
        keyExtractor={(p) => p.player_id || p.name}
        renderItem={renderCard}
        contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
        ListEmptyComponent={<Text style={[type.secondary, { textAlign: 'center', padding: spacing.xl }]}>No players match.</Text>}
        initialNumToRender={14}
        windowSize={8}
        removeClippedSubviews
      />
    </View>
  );
}

const styles = StyleSheet.create({
  playerCard: {
    backgroundColor: colors.surface1,
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderLeftWidth: 4,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  cardRow1: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardName: { flex: 1, fontSize: 14.5, fontWeight: '700', color: colors.textPrimary },
  posBadge: { borderRadius: radii.sm, paddingHorizontal: 7, paddingVertical: 2 },
  cardTeam: { fontSize: 12, color: colors.textMuted },
  cardRow2: { flexDirection: 'row', marginTop: spacing.sm, gap: spacing.md },
  cardStat: { flex: 1 },
  cardStatLabel: { fontSize: 10, fontWeight: '700', color: colors.textMuted, textTransform: 'uppercase' },
  cardStatValue: { fontSize: 13.5, fontWeight: '700', color: colors.textPrimary, fontVariant: ['tabular-nums'], marginTop: 1 },
  cardExpanded: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    marginTop: spacing.sm, paddingTop: spacing.sm,
    borderTopWidth: 1, borderTopColor: colors.borderSubtle,
  },
  archChip: {
    paddingHorizontal: 11, paddingVertical: 6, borderRadius: radii.pill,
    borderWidth: 1, alignItems: 'center', justifyContent: 'center',
    backgroundColor: colors.surface1, borderColor: colors.borderDefault,
  },
  sortBar: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm },
  sortDirBtn: {
    width: 34, height: 30, borderRadius: radii.sm,
    backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.borderDefault,
    alignItems: 'center', justifyContent: 'center',
  },
});
