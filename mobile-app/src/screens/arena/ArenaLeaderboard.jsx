// ArenaLeaderboard — RN port of the web opt-in public leaderboard (best-ball-manager/
// src/components/arena/ArenaLeaderboard.jsx). Enrolled teams ranked by hidden Elo, with
// W/L, win%, rank movement, and a "your rank" highlight for the signed-in owner. Owner
// identity is never shown for OTHER users' teams. Scoped to the featured tournament
// (BBM7). A chip-based player / NFL-team search filters the board to teams carrying every
// selected chip, best Elo first.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, TextInput, ActivityIndicator, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Trophy, RefreshCw, ChevronDown, ChevronLeft, ChevronRight, LocateFixed, Search, X } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { getLeaderboard, searchLeaderboard, getMyBestArenaTeam, getArenaRank, ARENA_AVAILABLE } from '../../../shared/utils/arenaClient';
import { FEATURED_TOURNAMENT } from '../../../shared/utils/arenaFeatured';
import { ARCHETYPE_METADATA } from '../../../shared/utils/rosterArchetypes';
import { enrichSnapshotCLV } from '../../../shared/utils/arenaSnapshot';
import { NFL_TEAMS, teamAbbrev } from '../../../shared/utils/nflTeams';
import { nflTeamColor } from '../../../shared/utils/nflTeamColors';
import { posColor } from '../../../shared/utils/positionColors';
import { colors, spacing, radii, type, withAlpha } from '../../theme';
import { Bar } from '../../components/ui';
import ArenaRosterCard from './ArenaRosterCard';

const RANK_STORE_KEY = 'bbe_arena_lb_ranks';
const RANK_VIEW_KEY = 'featured:bbm7';
const PAGE_SIZE = 50;
const SEARCH_LIMIT = 50;

const RANK_GOLD = '#f7d36a';
const RANK_SILVER = '#d8dee8';
const RANK_BRONZE = '#e0a36b';

function rankColor(rank) {
  if (rank === 1) return RANK_GOLD;
  if (rank === 2) return RANK_SILVER;
  if (rank === 3) return RANK_BRONZE;
  return null;
}

function pageWindow(page, pageCount) {
  const pages = new Set([1, pageCount, page - 1, page, page + 1]);
  return [...pages]
    .filter((p) => p >= 1 && p <= pageCount)
    .sort((a, b) => a - b)
    .reduce((acc, p) => {
      if (acc.length > 0 && p - acc[acc.length - 1] > 1) acc.push('…');
      acc.push(p);
      return acc;
    }, []);
}

function archetypeSummary(path) {
  if (!path) return '';
  return [path.rb, path.qb, path.te].map((k) => ARCHETYPE_METADATA[k]?.name).filter(Boolean).join(' · ');
}

function draftDateLabel(iso) {
  const d = new Date(`${iso}T00:00:00`);
  if (isNaN(d)) return null;
  const opts = { month: 'short', day: 'numeric' };
  if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
  return d.toLocaleDateString('en-US', opts);
}

function escapeLike(s) { return s.replace(/[\\%_]/g, '\\$&'); }

function snapshotMeta(snapshot, adpLookup) {
  const snap = enrichSnapshotCLV(snapshot, adpLookup) || {};
  const posSnap = snap.posSnap || {};
  const build = ['QB', 'RB', 'WR', 'TE'].map((p) => (posSnap[p] ? `${posSnap[p]}${p}` : null)).filter(Boolean).join(' ');
  return {
    date: snap.draftedAt ? draftDateLabel(snap.draftedAt) : null,
    build: build || null,
    clv: Number.isFinite(snap.avgCLV) ? snap.avgCLV : null,
  };
}

function BuildMeta({ meta }) {
  if (!meta || (!meta.date && !meta.build && meta.clv == null)) return null;
  return (
    <View style={styles.buildLine}>
      {meta.date && <Text style={styles.metaBit}>{meta.date}</Text>}
      {meta.build && <Text style={styles.metaBit}>{meta.build}</Text>}
      {meta.clv != null && (
        <Text style={[styles.metaBit, { color: meta.clv >= 0 ? colors.positive : colors.negative }]}>
          {meta.clv >= 0 ? '+' : ''}{meta.clv.toFixed(1)}% CLV
        </Text>
      )}
    </View>
  );
}

function Movement({ delta }) {
  if (delta == null) return <Text style={styles.moveFlat}>•</Text>;
  if (delta > 0) return <Text style={styles.moveUp}>▲{delta}</Text>;
  if (delta < 0) return <Text style={styles.moveDown}>▼{Math.abs(delta)}</Text>;
  return <Text style={styles.moveFlat}>—</Text>;
}

async function computeMovement(rows, viewKey, offset) {
  let store = {};
  try { store = JSON.parse((await AsyncStorage.getItem(RANK_STORE_KEY)) || '{}'); } catch { store = {}; }
  const prev = store[viewKey] || {};
  const moves = {};
  const next = { ...prev };
  rows.forEach((r, i) => {
    const rank = offset + i + 1;
    next[r.id] = rank;
    moves[r.id] = prev[r.id] != null ? prev[r.id] - rank : null;
  });
  try {
    store[viewKey] = next;
    await AsyncStorage.setItem(RANK_STORE_KEY, JSON.stringify(store));
  } catch { /* ignore */ }
  return moves;
}

export default function ArenaLeaderboard({ adpLookup, comboLookup = null, masterPlayers = null }) {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [moves, setMoves] = useState({});
  const [error, setError] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [yourRank, setYourRank] = useState(null);
  const [flashId, setFlashId] = useState(null);

  const [chips, setChips] = useState([]);
  const [query, setQuery] = useState('');
  const [searchFocus, setSearchFocus] = useState(false);
  const [searchRes, setSearchRes] = useState(null);

  const offset = (page - 1) * PAGE_SIZE;

  useEffect(() => {
    if (!ARENA_AVAILABLE) return undefined;
    let ignore = false;
    (async () => {
      try {
        const { rows: data, total: count } = await getLeaderboard({ tournament: 'featured', limit: PAGE_SIZE, offset });
        if (ignore) return;
        setRows(data);
        setTotal(count);
        setError(null);
        const m = await computeMovement(data, RANK_VIEW_KEY, offset);
        if (!ignore) setMoves(m);
      } catch {
        if (!ignore) { setRows([]); setError("Couldn't load the leaderboard."); }
      }
    })();
    return () => { ignore = true; };
  }, [offset]);

  const chipsKey = chips.map((c) => c.key).join('|');
  useEffect(() => {
    if (!ARENA_AVAILABLE || chips.length === 0) { setSearchRes(null); return undefined; }
    let ignore = false;
    const key = chipsKey;
    (async () => {
      try {
        const { rows: data, total: count } = await searchLeaderboard({ patterns: chips.map((c) => c.pattern), tournament: 'featured', limit: SEARCH_LIMIT });
        if (!ignore) setSearchRes({ key, rows: data, total: count, error: null });
      } catch {
        if (!ignore) setSearchRes({ key, rows: [], total: 0, error: "Couldn't run the search." });
      }
    })();
    return () => { ignore = true; };
  }, [chipsKey]);

  useEffect(() => {
    if (!ARENA_AVAILABLE || !user) { setYourRank(null); return undefined; }
    let ignore = false;
    (async () => {
      try {
        const best = await getMyBestArenaTeam({ tournament: 'featured' });
        if (ignore) return;
        if (!best) { setYourRank(null); return; }
        const rank = await getArenaRank({ elo: best.elo, tournament: 'featured' });
        if (!ignore) setYourRank(rank ? { best, ...rank } : null);
      } catch {
        if (!ignore) setYourRank(null);
      }
    })();
    return () => { ignore = true; };
  }, [user]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const searching = chips.length > 0;
  const searchLoading = searching && searchRes?.key !== chipsKey;
  const shownRows = searching ? (searchLoading ? null : searchRes.rows) : rows;
  const shownError = searching ? (searchLoading ? null : searchRes?.error) : error;

  const chipKeys = useMemo(() => new Set(chips.map((c) => c.key)), [chips]);
  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const seen = new Set();
    const players = [];
    (masterPlayers || []).forEach((p) => {
      const name = p?.name;
      if (!name) return;
      const lower = name.toLowerCase();
      if (!lower.includes(q) || seen.has(lower)) return;
      seen.add(lower);
      players.push(p);
    });
    players.sort((a, b) => (Number(a.adpPick) || 9999) - (Number(b.adpPick) || 9999));
    const out = players.slice(0, 6).map((p) => ({
      key: `p:${p.name.toLowerCase()}`,
      kind: 'player',
      label: p.name,
      meta: [p.position, p.team && p.team !== 'N/A' ? teamAbbrev(p.team) : null].filter(Boolean).join(' · '),
      color: posColor(p.position),
      pattern: `%${escapeLike(p.name)}%`,
    }));
    const seenTeams = new Set();
    Object.entries(NFL_TEAMS).forEach(([abbr, full]) => {
      if (seenTeams.has(full)) return;
      if (!abbr.toLowerCase().startsWith(q) && !full.toLowerCase().includes(q)) return;
      seenTeams.add(full);
      out.push({ key: `t:${full}`, kind: 'team', label: full.split(' ').pop(), meta: 'NFL team', color: nflTeamColor(abbr), pattern: `%${escapeLike(full)}%` });
    });
    return out.filter((s) => !chipKeys.has(s.key)).slice(0, 8);
  }, [query, masterPlayers, chipKeys]);

  const addChip = (chip) => {
    setChips((prev) => (prev.some((c) => c.key === chip.key) ? prev : [...prev, chip]));
    setQuery('');
  };
  const removeChip = (key) => setChips((prev) => prev.filter((c) => c.key !== key));
  const submitQuery = () => {
    const term = query.trim();
    if (suggestions.length > 0) addChip(suggestions[0]);
    else if (term.length >= 2) addChip({ key: `x:${term.toLowerCase()}`, kind: 'text', label: term, pattern: `%${escapeLike(term)}%` });
  };

  const metaById = useMemo(() => {
    const map = {};
    [...(rows || []), ...(searchRes?.rows || [])].forEach((r) => { map[r.id] = snapshotMeta(r.display_snapshot, adpLookup); });
    return map;
  }, [rows, searchRes, adpLookup]);

  const eloRange = useMemo(() => {
    if (!shownRows || shownRows.length === 0) return null;
    const vals = shownRows.map((r) => r.elo);
    return { min: Math.min(...vals), max: Math.max(...vals) };
  }, [shownRows]);
  const eloPct = (elo) => {
    if (!eloRange || eloRange.max === eloRange.min) return 100;
    return 10 + (90 * (elo - eloRange.min)) / (eloRange.max - eloRange.min);
  };

  const findMyRow = () => {
    const id = yourRank?.best?.id;
    if (!id) return;
    setChips([]);
    const targetPage = Math.max(1, Math.ceil(yourRank.rank / PAGE_SIZE));
    setPage(targetPage);
    setFlashId(id);
    setTimeout(() => setFlashId(null), 1800);
  };

  if (!ARENA_AVAILABLE) {
    return (
      <View style={styles.stateBox}>
        <Trophy size={30} color={colors.accent} />
        <Text style={[type.h3, { marginTop: spacing.sm }]}>The Arena is warming up</Text>
        <Text style={[type.secondary, { textAlign: 'center', marginTop: 4 }]}>The leaderboard appears once the Arena is live and teams start collecting votes.</Text>
      </View>
    );
  }

  const podiumRows = !searching && page === 1 && rows && rows.length >= 3 ? [rows[0], rows[1], rows[2]] : null;

  return (
    <View>
      {/* Scope + search */}
      <View style={styles.scopeRow}>
        <Trophy size={13} color={colors.accent} />
        <Text style={styles.scopeText}> {FEATURED_TOURNAMENT.label}</Text>
        <Text style={styles.scopeMeta}> · ranked by community vote</Text>
      </View>

      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Search size={14} color={colors.textMuted} />
          {chips.map((c) => (
            <View key={c.key} style={[styles.chip, c.color && { borderColor: withAlpha(c.color, 0.4), backgroundColor: withAlpha(c.color, 0.12) }]}>
              <Text style={[styles.chipText, c.color && { color: c.color }]}>{c.label}</Text>
              <Pressable onPress={() => removeChip(c.key)} hitSlop={6}><X size={11} color={c.color || colors.textMuted} /></Pressable>
            </View>
          ))}
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder={chips.length > 0 ? 'Add another…' : 'Search player or NFL team…'}
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            onFocus={() => setSearchFocus(true)}
            onBlur={() => setTimeout(() => setSearchFocus(false), 150)}
            onSubmitEditing={submitQuery}
            returnKeyType="search"
          />
        </View>
        {searchFocus && suggestions.length > 0 && (
          <View style={styles.suggBox}>
            {suggestions.map((s) => (
              <Pressable key={s.key} style={styles.suggBtn} onPress={() => addChip(s)}>
                <View style={[styles.suggDot, { backgroundColor: s.color || colors.textMuted }]} />
                <Text style={styles.suggName} numberOfLines={1}>{s.label}</Text>
                <Text style={styles.suggMeta}>{s.meta}</Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Your-rank banner */}
      {user && yourRank && (
        <View style={styles.banner}>
          <View style={styles.bannerMain}>
            <Text style={styles.bannerRank}>#{yourRank.rank}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.bannerTitle}>Your best team</Text>
              <Text style={styles.bannerMeta}>
                {yourRank.total > 0 ? `Top ${Math.max(1, Math.ceil((yourRank.rank / yourRank.total) * 100))}% of ${yourRank.total.toLocaleString()} teams · ` : ''}
                {Math.round(yourRank.best.elo)} Elo · {yourRank.best.wins}–{yourRank.best.losses}
              </Text>
            </View>
          </View>
          <Pressable style={styles.findBtn} onPress={findMyRow}>
            <LocateFixed size={14} color={colors.accent} />
            <Text style={styles.findBtnText}> Find my team</Text>
          </Pressable>
        </View>
      )}

      {shownError && <Text style={styles.errorNote}>{shownError}</Text>}

      {shownRows === null ? (
        <View style={styles.stateBox}>
          <ActivityIndicator color={colors.accent} />
          <Text style={[type.secondary, { marginTop: spacing.sm }]}>{searching ? 'Searching teams…' : 'Loading rankings…'}</Text>
        </View>
      ) : shownRows.length === 0 ? (
        shownError ? null : (
          <View style={styles.stateBox}>
            {searching ? <Search size={30} color={colors.accent} /> : <Trophy size={30} color={colors.accent} />}
            <Text style={[type.h3, { marginTop: spacing.sm }]}>{searching ? 'No teams match' : 'No ranked teams yet'}</Text>
            <Text style={[type.secondary, { textAlign: 'center', marginTop: 4 }]}>
              {searching ? `No ranked team has ${chips.map((c) => c.label).join(' + ')}. Remove a chip to widen the search.` : 'Once teams are entered and votes come in, the leaderboard fills in here.'}
            </Text>
          </View>
        )
      ) : (
        <>
          {searching && (
            <Text style={styles.searchSummary}>
              {searchRes.total.toLocaleString()} team{searchRes.total === 1 ? '' : 's'} with {chips.map((c) => c.label).join(' + ')} · best Elo first{searchRes.total > SEARCH_LIMIT ? ` · showing top ${SEARCH_LIMIT}` : ''}
            </Text>
          )}

          {/* Podium (champion first) */}
          {podiumRows && (
            <View style={styles.podium}>
              {podiumRows.map((r, idx) => {
                const rank = idx + 1;
                const rc = rankColor(rank);
                const isOpen = expanded === r.id;
                return (
                  <Pressable key={r.id} style={[styles.podiumCard, rank === 1 && styles.podiumFirst]} onPress={() => setExpanded(isOpen ? null : r.id)}>
                    <View style={styles.podiumHead}>
                      <View style={[styles.rankBadge, rc && { backgroundColor: rc }]}><Text style={[styles.rankBadgeText, rc && { color: '#11151c' }]}>{rank}</Text></View>
                      <Text style={styles.podiumElo}>{Math.round(r.elo)}</Text>
                      <Text style={styles.podiumRec}>{r.wins}–{r.losses}{r.wins + r.losses > 0 ? ` · ${Math.round((r.wins / (r.wins + r.losses)) * 100)}%` : ''}</Text>
                    </View>
                    <Text style={styles.podiumArche} numberOfLines={1}>{archetypeSummary(r.display_snapshot?.path) || 'Best-ball team'}</Text>
                    <BuildMeta meta={metaById[r.id]} />
                    {isOpen && (
                      <View style={{ marginTop: spacing.sm }}>
                        <ArenaRosterCard snapshot={enrichSnapshotCLV(r.display_snapshot, adpLookup)} corner="neutral" cornerLabel={`Rank #${rank}`} comboLookup={comboLookup} />
                      </View>
                    )}
                  </Pressable>
                );
              })}
            </View>
          )}

          {/* Table */}
          <View style={styles.table}>
            {shownRows.map((r, i) => {
              const rank = searching ? i + 1 : offset + i + 1;
              const games = r.wins + r.losses;
              const pct = games > 0 ? Math.round((r.wins / games) * 100) : null;
              const mine = user && r.user_id === user.id;
              const isOpen = expanded === r.id;
              const rc = searching ? null : rankColor(rank);
              return (
                <View key={r.id} style={[styles.rowGroup, flashId === r.id && styles.rowFlash]}>
                  <Pressable style={[styles.row, mine && styles.rowYou]} onPress={() => setExpanded(isOpen ? null : r.id)}>
                    <View style={[styles.rankBadge, rc && { backgroundColor: rc }]}><Text style={[styles.rankBadgeText, rc && { color: '#11151c' }]}>{rank}</Text></View>
                    <View style={styles.teamCell}>
                      <View style={styles.teamLine}>
                        {mine && <View style={styles.youTag}><Text style={styles.youTagText}>You</Text></View>}
                        <Text style={styles.arche} numberOfLines={1}>{archetypeSummary(r.display_snapshot?.path) || 'Best-ball team'}</Text>
                        {r.provisional && <Text style={styles.teamMeta}>new</Text>}
                      </View>
                      <BuildMeta meta={metaById[r.id]} />
                    </View>
                    <View style={styles.eloCell}>
                      <Text style={styles.eloVal}>{Math.round(r.elo)}</Text>
                      <Bar pct={eloPct(r.elo)} color={colors.accent} height={3} style={{ width: '100%', marginTop: 3 }} />
                    </View>
                    <Text style={styles.recCell}>{r.wins}–{r.losses}</Text>
                    <View style={styles.moveCell}>
                      {!searching && <Movement delta={moves[r.id]} />}
                      <ChevronDown size={13} color={colors.textMuted} style={{ transform: [{ rotate: isOpen ? '180deg' : '0deg' }] }} />
                    </View>
                  </Pressable>
                  {isOpen && (
                    <View style={styles.expand}>
                      <ArenaRosterCard snapshot={enrichSnapshotCLV(r.display_snapshot, adpLookup)} corner="neutral" cornerLabel={searching ? `${Math.round(r.elo)} Elo` : `Rank #${rank}`} comboLookup={comboLookup} />
                    </View>
                  )}
                </View>
              );
            })}
          </View>

          {/* Pager */}
          {!searching && pageCount > 1 && (
            <View style={styles.pager}>
              <Pressable style={[styles.pagerBtn, page === 1 && styles.pagerDisabled]} disabled={page === 1} onPress={() => setPage((p) => Math.max(1, p - 1))}>
                <ChevronLeft size={14} color={page === 1 ? colors.textMuted : colors.textSecondary} />
              </Pressable>
              {pageWindow(page, pageCount).map((p, i) => (
                p === '…' ? (
                  <Text key={`gap-${i}`} style={styles.pagerEllipsis}>…</Text>
                ) : (
                  <Pressable key={p} style={[styles.pagerNum, p === page && styles.pagerActive]} onPress={() => setPage(p)}>
                    <Text style={[styles.pagerNumText, p === page && { color: colors.textInverse }]}>{p}</Text>
                  </Pressable>
                )
              ))}
              <Pressable style={[styles.pagerBtn, page === pageCount && styles.pagerDisabled]} disabled={page === pageCount} onPress={() => setPage((p) => Math.min(pageCount, p + 1))}>
                <ChevronRight size={14} color={page === pageCount ? colors.textMuted : colors.textSecondary} />
              </Pressable>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stateBox: { alignItems: 'center', padding: spacing.xl },
  scopeRow: { flexDirection: 'row', alignItems: 'center', marginBottom: spacing.sm },
  scopeText: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  scopeMeta: { fontSize: 12, color: colors.textMuted },

  searchWrap: { marginBottom: spacing.sm, position: 'relative', zIndex: 10 },
  searchBox: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.borderDefault, borderRadius: radii.md, paddingHorizontal: 10, paddingVertical: 6 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  chipText: { fontSize: 12, color: colors.textPrimary, fontWeight: '600' },
  searchInput: { flex: 1, minWidth: 120, color: colors.textPrimary, fontSize: 13, paddingVertical: 2 },
  suggBox: { position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.borderDefault, borderRadius: radii.md, overflow: 'hidden', zIndex: 20 },
  suggBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  suggDot: { width: 8, height: 8, borderRadius: 4 },
  suggName: { flex: 1, color: colors.textPrimary, fontSize: 13, fontWeight: '600' },
  suggMeta: { color: colors.textMuted, fontSize: 11 },

  banner: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, flexWrap: 'wrap', backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.borderDefault, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm },
  bannerMain: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 },
  bannerRank: { fontSize: 22, fontWeight: '900', color: colors.accent, fontVariant: ['tabular-nums'] },
  bannerTitle: { fontSize: 13, fontWeight: '700', color: colors.textPrimary },
  bannerMeta: { fontSize: 12, color: colors.textSecondary, marginTop: 1 },
  findBtn: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.accent, borderRadius: radii.md, paddingHorizontal: 10, paddingVertical: 6 },
  findBtnText: { color: colors.accent, fontSize: 12.5, fontWeight: '700' },

  errorNote: { color: colors.negative, fontSize: 13, marginBottom: spacing.sm },
  searchSummary: { fontSize: 12, color: colors.textSecondary, marginBottom: spacing.sm },

  podium: { gap: 8, marginBottom: spacing.md },
  podiumCard: { backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.borderDefault, borderRadius: radii.md, padding: spacing.md },
  podiumFirst: { borderColor: withAlpha(RANK_GOLD, 0.55) },
  podiumHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  podiumElo: { fontSize: 18, fontWeight: '900', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  podiumRec: { marginLeft: 'auto', fontSize: 12, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  podiumArche: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },

  table: {},
  rowGroup: { marginBottom: 6 },
  rowFlash: { backgroundColor: colors.accentMuted, borderRadius: radii.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radii.md, paddingHorizontal: 10, paddingVertical: 8 },
  rowYou: { borderColor: colors.accent },
  rankBadge: { width: 30, height: 24, borderRadius: 6, backgroundColor: colors.surface3, alignItems: 'center', justifyContent: 'center' },
  rankBadgeText: { fontSize: 12, fontWeight: '800', color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  teamCell: { flex: 1, minWidth: 0 },
  teamLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  youTag: { backgroundColor: colors.accent, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  youTagText: { fontSize: 9, fontWeight: '800', color: colors.textInverse, letterSpacing: 0.5 },
  arche: { color: colors.textPrimary, fontSize: 13, flexShrink: 1 },
  teamMeta: { fontSize: 11, color: colors.textMuted },
  buildLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  metaBit: { fontSize: 11, color: colors.textMuted, fontVariant: ['tabular-nums'] },
  eloCell: { width: 58, alignItems: 'flex-start' },
  eloVal: { fontSize: 13, fontWeight: '800', color: colors.textPrimary, fontVariant: ['tabular-nums'] },
  recCell: { width: 46, fontSize: 12, color: colors.textSecondary, textAlign: 'center', fontVariant: ['tabular-nums'] },
  moveCell: { width: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 3 },
  moveUp: { color: colors.positive, fontSize: 11, fontWeight: '700' },
  moveDown: { color: colors.negative, fontSize: 11, fontWeight: '700' },
  moveFlat: { color: colors.textMuted, fontSize: 11 },
  expand: { marginTop: 6 },

  pager: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, marginTop: spacing.md, flexWrap: 'wrap' },
  pagerBtn: { padding: 6, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.borderDefault },
  pagerDisabled: { opacity: 0.4 },
  pagerNum: { minWidth: 30, alignItems: 'center', paddingVertical: 5, paddingHorizontal: 8, borderRadius: radii.sm, borderWidth: 1, borderColor: colors.borderDefault },
  pagerActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  pagerNumText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  pagerEllipsis: { color: colors.textMuted, paddingHorizontal: 4 },
});
