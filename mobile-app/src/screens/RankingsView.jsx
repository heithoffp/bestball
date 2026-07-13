// RankingsView — mobile port of PlayerRankings.jsx. Per-platform personal
// draft board seeded from saved rankings (or current ADP), tier breaks with
// editable labels, position-filtered views, and a Compare lens (your rank vs
// live ADP — value/reach deltas). Reordering uses tap-to-select + move
// controls instead of the web's drag-and-drop; Save persists to the same
// Supabase storage + user_rankings table the extension reads.
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { View, Text, Pressable, FlatList, TextInput, StyleSheet } from 'react-native';
import { ListOrdered, ChevronUp, ChevronDown, ChevronsUp, ChevronsDown, X, Save, Share2, RotateCcw } from 'lucide-react-native';
import * as WebBrowser from 'expo-web-browser';
import { canonicalName, expandTeam } from '../../shared/utils/helpers';
import { exportRankingsCSV, saveRankings } from '../../shared/utils/rankingsExport';
import { deriveTierBreaks, getTierLabel, getTierColor } from '../../shared/utils/rankingsTiers';
import { posColor } from '../../shared/utils/positionColors';
import { SearchBar, Segmented, EmptyView, Button } from '../components/ui';
import { colors, spacing, radii, type } from '../theme';
import { usePortfolio } from '../contexts/PortfolioContext';
import { useAuth } from '../contexts/AuthContext';
import { WEB_APP_URL } from '../../shared/config';

const VIEWS = ['overall', 'QB', 'RB', 'WR', 'TE'];
const POS_COLORS = { QB: '#bf44ef', RB: '#10b981', WR: '#f59e0b', TE: '#3b82f6' };

/* Build the displayed-player array from a row source (saved rankings or ADP
   rows) — line-for-line port of buildRankedPlayers in PlayerRankings.jsx. */
function buildRankedPlayers(source, { projMap = {}, nameToAdpId = new Map(), adpLookup = new Map(), teamLookup = new Map() } = {}) {
  const players = source.map(row => {
    const firstName = row.firstName || row.first_name || row['First Name'] || '';
    const lastName = row.lastName || row.last_name || row['Last Name'] || '';
    const name = `${firstName} ${lastName}`.trim() || row['Player Name'] || row.player_name || row.Name || row.name || 'Unknown';
    const adpVal = parseFloat(row.adp ?? row.ADP ?? '');
    const nameKey = canonicalName(name);
    const projFromMap = projMap[nameKey] != null ? String(projMap[nameKey]) : '';
    const projRaw = row.projectedPoints || row.projected_points || '';
    const proj = projFromMap || projRaw;
    const rawId = row.id || row.ID || '';
    const id = (!rawId || String(rawId).startsWith('gen_'))
      ? (nameToAdpId.get(nameKey) || `gen_${name.replace(/\s+/g, '_')}`)
      : String(rawId);
    const teamFromSource = expandTeam(row.teamName || row.team || row.Team || '');
    return {
      id,
      firstName,
      lastName,
      name,
      adp: isNaN(adpVal) ? 9999 : adpVal,
      originalAdp: isNaN(adpVal) ? '-' : String(adpVal),
      latestAdp: adpLookup.get(nameKey) || null,
      projectedPoints: proj,
      positionRank: row.positionRank || '',
      slotName: row.slotName || row.position || row.Position || row.pos || 'N/A',
      teamName: teamLookup.get(nameKey) || teamFromSource,
      lineupStatus: row.lineupStatus || '',
      byeWeek: row.byeWeek || '',
      _csvTier: row.tier || '',
      _csvTierNum: row.tierNum || '',
    };
  });
  players.sort((a, b) => a.adp - b.adp);
  return players.filter(p => p.adp !== 9999);
}

function buildTeamLookup(adpRows) {
  const map = new Map();
  adpRows.forEach(r => {
    const n = canonicalName(
      (`${r.firstName || r.first_name || ''} ${r.lastName || r.last_name || ''}`).trim()
      || r.Name || r.name || ''
    );
    const team = r.teamName || r.team || r.Team || '';
    if (n && team) map.set(n, team);
  });
  return map;
}

function buildNameToAdpId(adpRows) {
  const map = new Map();
  adpRows.forEach(r => {
    const n = canonicalName(
      (`${r.firstName || r.first_name || ''} ${r.lastName || r.last_name || ''}`).trim()
      || r.Name || r.name || ''
    );
    const id = r.id || r.ID;
    if (n && id) map.set(n, String(id));
  });
  return map;
}

export default function RankingsView() {
  const { rankingsByPlatform, adpByPlatform } = usePortfolio();
  const { user } = useAuth();

  const availablePlatforms = useMemo(
    () => ['underdog', 'draftkings'].filter(p =>
      (rankingsByPlatform[p]?.length ?? 0) > 0 || (adpByPlatform[p]?.latestRows?.length ?? 0) > 0),
    [rankingsByPlatform, adpByPlatform]
  );

  const [selectedPlatform, setSelectedPlatform] = useState(null);
  useEffect(() => {
    if (!selectedPlatform && availablePlatforms.length > 0) {
      setSelectedPlatform(availablePlatforms[0]);
    }
  }, [availablePlatforms, selectedPlatform]);

  const [rankedPlayers, setRankedPlayers] = useState([]);
  const [overallTierBreaks, setOverallTierBreaks] = useState(new Set());
  const [tierLabels, setTierLabels] = useState({});
  const [viewMode, setViewMode] = useState('overall');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [rankInput, setRankInput] = useState('');
  const [compareMode, setCompareMode] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);
  const [dirty, setDirty] = useState(false);
  const listRef = useRef(null);

  const activeSource = useMemo(() => {
    if (!selectedPlatform) return [];
    const saved = rankingsByPlatform[selectedPlatform];
    if (saved?.length) return saved;
    return adpByPlatform[selectedPlatform]?.latestRows ?? [];
  }, [selectedPlatform, rankingsByPlatform, adpByPlatform]);

  const isAdpFallback = !(rankingsByPlatform[selectedPlatform]?.length);

  const adpRows = adpByPlatform?.[selectedPlatform]?.latestRows ?? [];
  const teamLookup = useMemo(() => buildTeamLookup(adpRows), [adpRows]);
  const adpLookup = useMemo(() => {
    const map = new Map();
    adpRows.forEach(r => {
      const n = canonicalName(
        (`${r.firstName || r.first_name || ''} ${r.lastName || r.last_name || ''}`).trim()
        || r.Name || r.name || ''
      );
      const adp = parseFloat(r.adp ?? r.ADP ?? '');
      if (n && !isNaN(adp)) map.set(n, adp);
    });
    return map;
  }, [adpRows]);

  // Seed the board when the source changes. ADP refreshes must not wipe a
  // manual order, so adpLookup/teamLookup are read but not dependencies.
  const seededFor = useRef(null);
  useEffect(() => {
    if (!selectedPlatform || activeSource.length === 0) return;
    const key = `${selectedPlatform}:${activeSource.length}`;
    if (seededFor.current === key) return;
    seededFor.current = key;
    const projMap = adpByPlatform?.[selectedPlatform]?.projPointsMap ?? {};
    const nameToAdpId = buildNameToAdpId(adpRows);
    const players = buildRankedPlayers(activeSource, { projMap, nameToAdpId, adpLookup, teamLookup });
    // Saved rankings arrive ordered by their saved adp column (= rank).
    const { breaks, labels } = deriveTierBreaks(players);
    setRankedPlayers(players);
    setOverallTierBreaks(breaks);
    setTierLabels(labels);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSource, selectedPlatform]);

  // tier map: player id → tier number (1-based), derived from break set
  const fullTierMap = useMemo(() => {
    const map = new Map();
    let tier = 1;
    rankedPlayers.forEach((p, idx) => {
      if (idx > 0 && overallTierBreaks.has(p.id)) tier += 1;
      map.set(p.id, tier);
    });
    return map;
  }, [rankedPlayers, overallTierBreaks]);

  const tierNumLabels = useMemo(() => {
    const map = new Map();
    let tier = 1;
    rankedPlayers.forEach((p, idx) => {
      if (idx === 0) {
        map.set(1, tierLabels['__tier1__'] || getTierLabel(1));
      } else if (overallTierBreaks.has(p.id)) {
        tier += 1;
        map.set(tier, tierLabels[p.id] || getTierLabel(tier));
      }
    });
    return map;
  }, [rankedPlayers, overallTierBreaks, tierLabels]);

  const displayedPlayers = useMemo(() => {
    let list = rankedPlayers;
    if (viewMode !== 'overall') list = list.filter(p => (p.slotName || '').toUpperCase() === viewMode);
    const q = searchTerm.trim().toLowerCase();
    if (q) list = list.filter(p => (`${p.name} ${p.teamName} ${p.slotName}`).toLowerCase().includes(q));
    return list;
  }, [rankedPlayers, viewMode, searchTerm]);

  const overallRankById = useMemo(() => {
    const m = new Map();
    rankedPlayers.forEach((p, i) => m.set(p.id, i + 1));
    return m;
  }, [rankedPlayers]);

  // ── Compare lens: your rank vs live ADP ──
  const compareRows = useMemo(() => {
    if (!compareMode) return [];
    return rankedPlayers
      .map((p, idx) => {
        const adp = p.latestAdp ?? adpLookup.get(canonicalName(p.name)) ?? null;
        if (adp == null) return null;
        return { ...p, rank: idx + 1, liveAdp: adp, delta: adp - (idx + 1) };
      })
      .filter(Boolean)
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, 60);
  }, [compareMode, rankedPlayers, adpLookup]);

  // ── Reorder helpers (overall view only) ──
  const canEdit = viewMode === 'overall' && !searchTerm && !compareMode;

  const moveBy = useCallback((id, delta) => {
    setRankedPlayers(prev => {
      const idx = prev.findIndex(p => p.id === id);
      if (idx < 0) return prev;
      const to = Math.max(0, Math.min(prev.length - 1, idx + delta));
      if (to === idx) return prev;
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDirty(true);
  }, []);

  const moveToRank = useCallback((id, rank) => {
    setRankedPlayers(prev => {
      const idx = prev.findIndex(p => p.id === id);
      if (idx < 0) return prev;
      const to = Math.max(0, Math.min(prev.length - 1, rank - 1));
      if (to === idx) return prev;
      const next = [...prev];
      const [moved] = next.splice(idx, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setDirty(true);
  }, []);

  const toggleTierBreak = useCallback((id) => {
    setOverallTierBreaks(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
    setDirty(true);
  }, []);

  const handleReset = useCallback(() => {
    if (adpRows.length === 0) return;
    const projMap = adpByPlatform?.[selectedPlatform]?.projPointsMap ?? {};
    const nameToAdpId = buildNameToAdpId(adpRows);
    const players = buildRankedPlayers(adpRows, { projMap, nameToAdpId, adpLookup, teamLookup });
    setRankedPlayers(players);
    setOverallTierBreaks(new Set());
    setTierLabels({});
    setDirty(true);
  }, [adpRows, adpByPlatform, selectedPlatform, adpLookup, teamLookup]);

  const handleSave = useCallback(async () => {
    setSaveStatus('saving');
    try {
      await saveRankings(rankedPlayers, fullTierMap, tierLabels, selectedPlatform || 'underdog');
      setSaveStatus('saved');
      setDirty(false);
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      console.error('Save failed:', err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 3000);
    }
  }, [rankedPlayers, fullTierMap, tierLabels, selectedPlatform]);

  const handleExport = useCallback(() => {
    exportRankingsCSV(rankedPlayers, fullTierMap, tierLabels, selectedPlatform || 'underdog').catch(() => {});
  }, [rankedPlayers, fullTierMap, tierLabels, selectedPlatform]);

  if (availablePlatforms.length === 0) {
    return (
      <EmptyView
        icon={<ListOrdered size={38} color={colors.accent} />}
        title="No rankings loaded"
        body="Rankings seed from each platform's current ADP once data loads. You can also upload a rankings CSV on the website."
        cta={<Button title="Open the website" variant="ghost" onPress={() => WebBrowser.openBrowserAsync(WEB_APP_URL)} />}
      />
    );
  }

  const tierCount = rankedPlayers.length > 0 ? overallTierBreaks.size + 1 : 0;

  const renderRow = ({ item: p, index }) => {
    const overallRank = overallRankById.get(p.id) ?? index + 1;
    const tierNum = fullTierMap.get(p.id) || 1;
    const tierColor = getTierColor(tierNum);
    const isBreak = overallTierBreaks.has(p.id);
    const showTierBar = viewMode === 'overall' && !searchTerm && (index === 0 ? true : isBreak);
    const isSel = selectedId === p.id;
    const pc = posColor((p.slotName || '').toUpperCase());
    return (
      <View>
        {showTierBar && (
          <View style={[styles.tierBar, { borderColor: tierColor.border, backgroundColor: tierColor.bg }]}>
            <Text style={{ color: tierColor.text, fontSize: 11, fontWeight: '800' }}>
              {tierNumLabels.get(tierNum) || getTierLabel(tierNum)}
            </Text>
            {canEdit && index > 0 && (
              <Pressable onPress={() => toggleTierBreak(p.id)} hitSlop={8}>
                <X size={13} color={tierColor.text} />
              </Pressable>
            )}
          </View>
        )}
        <Pressable
          style={[styles.row, isSel && { borderColor: colors.accent, backgroundColor: colors.surface2 }]}
          onPress={() => { setSelectedId(isSel ? null : p.id); setRankInput(''); }}
        >
          <Text style={styles.rank}>{overallRank}</Text>
          <View style={[styles.posPill, { backgroundColor: `${pc}22`, borderColor: `${pc}55` }]}>
            <Text style={{ color: pc, fontSize: 10, fontWeight: '800' }}>{p.slotName}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>{p.name}</Text>
            <Text style={type.muted} numberOfLines={1}>
              {p.teamName || '—'}{p.byeWeek ? ` · Bye ${p.byeWeek}` : ''}{p.projectedPoints ? ` · ${parseFloat(p.projectedPoints).toFixed(0)}pt` : ''}
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={type.mono}>{p.latestAdp != null ? p.latestAdp.toFixed(1) : p.originalAdp}</Text>
            <Text style={[type.muted, { fontSize: 10 }]}>ADP</Text>
          </View>
        </Pressable>
        {isSel && canEdit && (
          <View style={styles.editPanel}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <Pressable style={styles.moveBtn} onPress={() => moveBy(p.id, -5)}><ChevronsUp size={16} color={colors.accent} /></Pressable>
              <Pressable style={styles.moveBtn} onPress={() => moveBy(p.id, -1)}><ChevronUp size={16} color={colors.accent} /></Pressable>
              <Pressable style={styles.moveBtn} onPress={() => moveBy(p.id, 1)}><ChevronDown size={16} color={colors.accent} /></Pressable>
              <Pressable style={styles.moveBtn} onPress={() => moveBy(p.id, 5)}><ChevronsDown size={16} color={colors.accent} /></Pressable>
              <View style={styles.rankInputWrap}>
                <TextInput
                  style={styles.rankInput}
                  value={rankInput}
                  onChangeText={setRankInput}
                  placeholder={`#${overallRank}`}
                  placeholderTextColor={colors.textMuted}
                  keyboardType="number-pad"
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    const r = parseInt(rankInput, 10);
                    if (r >= 1) moveToRank(p.id, r);
                    setRankInput('');
                  }}
                />
              </View>
            </View>
            {index > 0 && !isBreak && (
              <Pressable style={styles.tierAddBtn} onPress={() => toggleTierBreak(p.id)}>
                <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: '600' }}>+ Tier break above</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
          {availablePlatforms.length > 1 && (
            <Segmented
              style={{ flex: 1 }}
              options={availablePlatforms.map(p => ({ key: p, label: p === 'underdog' ? 'Underdog' : 'DraftKings' }))}
              value={selectedPlatform ?? availablePlatforms[0]}
              onChange={setSelectedPlatform}
            />
          )}
          <Pressable
            onPress={() => setCompareMode(v => !v)}
            style={[styles.chip, compareMode && { borderColor: colors.accent, backgroundColor: colors.accentMuted }]}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: compareMode ? colors.accent : colors.textSecondary }}>Compare</Text>
          </Pressable>
        </View>

        {!compareMode && (
          <>
            <Segmented
              options={VIEWS.map(v => ({ key: v, label: v === 'overall' ? 'All' : v }))}
              value={viewMode}
              onChange={setViewMode}
              style={{ marginBottom: spacing.sm }}
            />
            <SearchBar value={searchTerm} onChange={setSearchTerm} placeholder="Search the board..." style={{ marginBottom: spacing.sm }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.sm }}>
              <Pressable style={[styles.toolBtn, dirty && { borderColor: colors.accent }]} onPress={handleSave} disabled={!user || saveStatus === 'saving'}>
                <Save size={13} color={user ? colors.accent : colors.textMuted} />
                <Text style={[styles.toolBtnText, !user && { color: colors.textMuted }]}>
                  {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved ✓' : saveStatus === 'error' ? 'Failed' : 'Save'}
                </Text>
              </Pressable>
              <Pressable style={styles.toolBtn} onPress={handleExport}>
                <Share2 size={13} color={colors.textSecondary} />
                <Text style={styles.toolBtnText}>Export</Text>
              </Pressable>
              <Pressable style={styles.toolBtn} onPress={handleReset}>
                <RotateCcw size={13} color={colors.textSecondary} />
                <Text style={styles.toolBtnText}>Reset to ADP</Text>
              </Pressable>
            </View>
            <Text style={[type.muted, { marginBottom: spacing.sm }]}>
              {rankedPlayers.length} players · {tierCount} tiers
              {isAdpFallback ? ' · seeded from current ADP' : ' · your saved order'}
              {canEdit ? ' · tap a player to move them' : compareMode ? '' : ' · switch to All (no search) to edit'}
              {!user ? ' · sign in to save' : ''}
            </Text>
          </>
        )}
      </View>

      {compareMode ? (
        <FlatList
          data={compareRows}
          keyExtractor={(p) => p.id}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
          ListHeaderComponent={
            <Text style={[type.muted, { marginBottom: spacing.sm }]}>
              Your rank vs live {selectedPlatform === 'draftkings' ? 'DraftKings' : 'Underdog'} ADP — biggest disagreements first.
              Positive Δ = market drafts them later than you rank them (your target); negative = earlier (your fade).
            </Text>
          }
          renderItem={({ item: p }) => {
            const pc = posColor((p.slotName || '').toUpperCase());
            return (
              <View style={styles.row}>
                <Text style={styles.rank}>{p.rank}</Text>
                <View style={[styles.posPill, { backgroundColor: `${pc}22`, borderColor: `${pc}55` }]}>
                  <Text style={{ color: pc, fontSize: 10, fontWeight: '800' }}>{p.slotName}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[type.body, { fontWeight: '600' }]} numberOfLines={1}>{p.name}</Text>
                  <Text style={type.muted}>ADP {p.liveAdp.toFixed(1)}</Text>
                </View>
                <Text style={{
                  fontSize: 14, fontWeight: '800', fontVariant: ['tabular-nums'],
                  color: p.delta > 0 ? colors.positive : p.delta < 0 ? colors.negative : colors.textMuted,
                }}>
                  {p.delta > 0 ? '+' : ''}{p.delta.toFixed(1)}
                </Text>
              </View>
            );
          }}
          ListEmptyComponent={<Text style={[type.secondary, { textAlign: 'center', padding: spacing.xl }]}>No comparable players.</Text>}
        />
      ) : (
        <FlatList
          ref={listRef}
          data={displayedPlayers}
          keyExtractor={(p) => p.id}
          renderItem={renderRow}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}
          initialNumToRender={18}
          windowSize={9}
          removeClippedSubviews
          ListEmptyComponent={<Text style={[type.secondary, { textAlign: 'center', padding: spacing.xl }]}>No players match.</Text>}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.sm,
    backgroundColor: colors.surface1, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.borderSubtle,
    paddingHorizontal: spacing.md, paddingVertical: 8, marginBottom: 4,
  },
  rank: { width: 32, textAlign: 'right', color: colors.textSecondary, fontWeight: '700', fontVariant: ['tabular-nums'], fontSize: 13 },
  posPill: { borderRadius: 4, borderWidth: 1, paddingHorizontal: 6, paddingVertical: 2, width: 38, alignItems: 'center' },
  tierBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderLeftWidth: 3, borderWidth: 1, borderRadius: radii.sm,
    paddingHorizontal: spacing.md, paddingVertical: 5,
    marginTop: 6, marginBottom: 5,
  },
  editPanel: {
    backgroundColor: colors.surface2, borderRadius: radii.sm,
    borderWidth: 1, borderColor: colors.borderDefault,
    padding: spacing.sm, marginBottom: 6, gap: 8,
  },
  moveBtn: {
    flex: 1, height: 36, borderRadius: radii.sm,
    backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.borderStrong,
    alignItems: 'center', justifyContent: 'center',
  },
  rankInputWrap: { flex: 1.4 },
  rankInput: {
    height: 36, borderRadius: radii.sm,
    backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.borderStrong,
    color: colors.textPrimary, textAlign: 'center', fontSize: 13,
  },
  tierAddBtn: {
    alignSelf: 'flex-start',
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm,
    paddingHorizontal: 10, paddingVertical: 6,
  },
  toolBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 5,
    borderWidth: 1, borderColor: colors.borderStrong, borderRadius: radii.sm,
    paddingHorizontal: 11, paddingVertical: 7,
  },
  toolBtnText: { fontSize: 12, fontWeight: '600', color: colors.textPrimary },
  chip: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.borderDefault, backgroundColor: colors.surface1,
    alignItems: 'center', justifyContent: 'center',
  },
});
