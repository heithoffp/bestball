// ArenaView — mobile port of the Best Ball Arena (ADR-013): blind head-to-head
// voting, the public leaderboard, and My Teams enrollment. Uses the same
// arenaClient Edge-Function/RLS surface as the web; owner identity is never
// shown while voting, and you're never shown your own teams.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, FlatList, ActivityIndicator, StyleSheet } from 'react-native';
import { Swords, RefreshCw, Lock } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../contexts/AuthContext';
import { usePortfolio } from '../contexts/PortfolioContext';
import { canonicalName } from '../../shared/utils/helpers';
import { computeRosterOutlook } from '../../shared/utils/advanceModel';
import { BYE_WEEKS_2026 } from '../../shared/data/byeWeeks';
import {
  buildEnrollableTeams, buildBoardTeams, buildAdpLookup, playerNameKey, enrichSnapshotDisplay,
} from '../../shared/utils/arenaSnapshot';
import { isFeaturedSnapshot } from '../../shared/utils/arenaFeatured';
import { loadRealDraftData, comboRateForSnapshot } from '../../shared/utils/realDraftData';
import { fetchDraftBoards } from '../../shared/utils/draftBoards';
import {
  registerAllArenaTeams, getPairing, submitVote, getLeaderboard, getMyBestArenaTeam,
  getArenaRank, getMyArenaTeams, getArenaEnrollment, setArenaEnrollment, ARENA_AVAILABLE,
} from '../../shared/utils/arenaClient';
import { posColor } from '../../shared/utils/positionColors';
import { Segmented, Button, LoadingView } from '../components/ui';
import { colors, spacing, radii, type } from '../theme';

const NAV = [
  { key: 'vote', label: 'Vote' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'myteams', label: 'My Teams' },
];

const POS_ORDER = ['QB', 'RB', 'WR', 'TE'];

// Auto-register own + board teams into the opt-out pool, once per app session.
let _registeredThisSession = new Set();
function useAutoRegister(user, rosterData, masterPlayers) {
  const ref = useRef(false);
  useEffect(() => {
    if (ref.current) return;
    if (!ARENA_AVAILABLE || !user?.id) return;
    if (!Array.isArray(rosterData) || rosterData.length === 0) return;
    if (_registeredThisSession.has(user.id)) { ref.current = true; return; }

    ref.current = true;
    let cancelled = false;

    (async () => {
      try {
        const adpLookup = buildAdpLookup(masterPlayers);
        const ownedTeams = buildEnrollableTeams(rosterData, masterPlayers).map((t) => ({
          entryId: t.entryId, platform: t.platform, draftId: t.entryId, snapshot: t.snapshot,
        }));

        const draftIds = [...new Set(rosterData.map((r) => r.entry_id).filter(Boolean))];
        const ownKeyByDraft = {};
        const titleByDraft = {};
        const draftedAtByDraft = {};
        draftIds.forEach((id) => {
          const rows = rosterData.filter((r) => r.entry_id === id);
          ownKeyByDraft[id] = playerNameKey(rows);
          titleByDraft[id] = rows.find((r) => r.tournamentTitle)?.tournamentTitle || null;
          const times = rows
            .map((r) => (r.pickedAt ? new Date(r.pickedAt).getTime() : NaN))
            .filter((t) => Number.isFinite(t));
          draftedAtByDraft[id] = times.length
            ? new Date(Math.min(...times)).toISOString().slice(0, 10)
            : null;
        });
        const boards = await fetchDraftBoards(draftIds);
        const boardTeams = [];
        boards.forEach((board) => {
          boardTeams.push(...buildBoardTeams(
            board, ownKeyByDraft[board.draftId], adpLookup, titleByDraft[board.draftId],
            draftedAtByDraft[board.draftId],
          ));
        });

        if (cancelled) return;
        if (ownedTeams.length || boardTeams.length) {
          await registerAllArenaTeams({ ownedTeams, boardTeams });
        }
        _registeredThisSession.add(user.id);
      } catch {
        ref.current = false;
      }
    })();

    return () => { cancelled = true; };
  }, [user, rosterData, masterPlayers]);
}

/** Compact blind roster card built from a display snapshot. */
function SnapshotCard({ snapshot, label, elo, delta, picked, onPick, revealed }) {
  if (!snapshot) return null;
  const players = [...(snapshot.players || [])].sort((a, b) => (a.pick || 0) - (b.pick || 0));
  const grouped = POS_ORDER.map(pos => ({
    pos,
    players: players.filter(p => String(p.position).toUpperCase() === pos),
  })).filter(g => g.players.length > 0);
  const others = players.filter(p => !POS_ORDER.includes(String(p.position).toUpperCase()));

  return (
    <Pressable
      onPress={onPick}
      disabled={!onPick}
      style={[styles.snapCard, picked && { borderColor: colors.accent, borderWidth: 2 }]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <Text style={[type.h3, { color: colors.accent }]}>{label}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {snapshot.projTotal != null && <Text style={type.muted}>Proj {snapshot.projTotal.toFixed(0)}</Text>}
          {snapshot.avgCLV != null && <Text style={type.muted}>CLV {snapshot.avgCLV > 0 ? '+' : ''}{snapshot.avgCLV.toFixed(1)}%</Text>}
          {revealed && elo != null && (
            <Text style={{ color: delta > 0 ? colors.positive : delta < 0 ? colors.negative : colors.textMuted, fontWeight: '800', fontSize: 12 }}>
              {Math.round(elo)}{delta != null ? ` (${delta > 0 ? '+' : ''}${Math.round(delta)})` : ''}
            </Text>
          )}
        </View>
      </View>
      {grouped.map(g => (
        <View key={g.pos} style={{ flexDirection: 'row', marginBottom: 3 }}>
          <Text style={{ width: 26, color: posColor(g.pos), fontSize: 10.5, fontWeight: '800', marginTop: 1 }}>{g.pos}</Text>
          <Text style={[type.secondary, { flex: 1, lineHeight: 17, fontSize: 12 }]}>
            {g.players.map(p => p.name).join(' · ')}
          </Text>
        </View>
      ))}
      {others.length > 0 && (
        <Text style={type.muted}>{others.map(p => p.name).join(' · ')}</Text>
      )}
      {onPick && (
        <View style={styles.pickBtn}>
          <Text style={{ color: colors.textInverse, fontWeight: '800', fontSize: 13 }}>Pick this team</Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Vote sub-view ──
function ArenaVote({ adpLookup, projLookup, projTotalFn, onGoToMyTeams }) {
  const [pairing, setPairing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState(null);
  const [result, setResult] = useState(null);
  const [revealed, setRevealed] = useState(false);
  const [voteBusy, setVoteBusy] = useState(false);
  const [streak, setStreak] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    setResult(null);
    setRevealed(false);
    const r = await getPairing();
    setPairing(r.pairing);
    setReason(r.pairing ? null : (r.reason || 'error'));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const vote = useCallback(async (winner) => {
    if (!pairing || voteBusy || revealed) return;
    setVoteBusy(true);
    try {
      const data = await submitVote({ token: pairing.token, winner });
      setResult({ ...data, winner });
      setRevealed(true);
      setStreak(s => s + 1);
    } catch (e) {
      setReason(e?.status === 429 ? 'rate_limited' : 'error');
      setPairing(null);
    } finally {
      setVoteBusy(false);
    }
  }, [pairing, voteBusy, revealed]);

  const snapA = useMemo(
    () => (pairing ? enrichSnapshotDisplay(pairing.team_a.display_snapshot, adpLookup, projLookup, projTotalFn) : null),
    [pairing, adpLookup, projLookup, projTotalFn]
  );
  const snapB = useMemo(
    () => (pairing ? enrichSnapshotDisplay(pairing.team_b.display_snapshot, adpLookup, projLookup, projTotalFn) : null),
    [pairing, adpLookup, projLookup, projTotalFn]
  );

  if (loading) return <LoadingView msg="Finding a matchup..." />;

  if (!pairing) {
    return (
      <View style={{ alignItems: 'center', padding: spacing.xl }}>
        <Swords size={30} color={colors.accent} />
        <Text style={[type.h3, { marginTop: spacing.sm }]}>
          {reason === 'rate_limited' ? "You're voting fast — take a breather" : 'No matchup available'}
        </Text>
        <Text style={[type.secondary, { textAlign: 'center', marginTop: 4 }]}>
          {reason === 'rate_limited'
            ? 'The Arena caps vote rate to keep ratings honest. Try again in a bit.'
            : reason === 'unavailable'
              ? 'The Arena backend is warming up. Check back soon.'
              : 'Could not fetch a pairing. Pull to retry.'}
        </Text>
        <Button title="Try again" variant="ghost" style={{ marginTop: spacing.lg }} onPress={load} />
      </View>
    );
  }

  return (
    <View style={{ paddingBottom: 30 }}>
      <Text style={[type.secondary, { textAlign: 'center', marginBottom: spacing.sm }]}>
        Two real BBM7 teams, shown blind. Which would you rather have?
        {streak > 0 ? `  ·  ${streak} vote${streak === 1 ? '' : 's'} this session` : ''}
      </Text>
      <SnapshotCard
        snapshot={snapA}
        label="Team A"
        elo={result?.team_a?.after}
        delta={result?.team_a?.delta}
        revealed={revealed}
        picked={revealed && result?.winner === 'a'}
        onPick={revealed ? null : () => vote('a')}
      />
      <View style={{ alignItems: 'center', marginVertical: 2 }}>
        <Text style={{ color: colors.accent, fontWeight: '800', fontSize: 13 }}>VS</Text>
      </View>
      <SnapshotCard
        snapshot={snapB}
        label="Team B"
        elo={result?.team_b?.after}
        delta={result?.team_b?.delta}
        revealed={revealed}
        picked={revealed && result?.winner === 'b'}
        onPick={revealed ? null : () => vote('b')}
      />
      {revealed && (
        <View style={{ marginTop: spacing.sm }}>
          {result?.counted === false && (
            <Text style={[type.muted, { textAlign: 'center', marginBottom: 4 }]}>
              Vote recorded but not rated (guest votes may carry reduced weight).
            </Text>
          )}
          <Button title="Next matchup" onPress={load} />
        </View>
      )}
      <Pressable onPress={onGoToMyTeams} style={{ marginTop: spacing.md }}>
        <Text style={[type.muted, { textAlign: 'center' }]}>
          Your synced teams enter the Arena automatically — manage them in My Teams.
        </Text>
      </Pressable>
    </View>
  );
}

// ── Leaderboard sub-view ──
function ArenaLeaderboard({ adpLookup }) {
  const { user } = useAuth();
  const [rows, setRows] = useState(null);
  const [total, setTotal] = useState(0);
  const [platform, setPlatform] = useState('all');
  const [offset, setOffset] = useState(0);
  const [myBest, setMyBest] = useState(null);
  const [myRank, setMyRank] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const LIMIT = 50;

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    getLeaderboard({ platform, limit: LIMIT, offset })
      .then(({ rows, total }) => { if (!cancelled) { setRows(rows); setTotal(total); } })
      .catch(() => { if (!cancelled) setRows([]); });
    return () => { cancelled = true; };
  }, [platform, offset]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMyBestArenaTeam({ platform }).then(async (best) => {
      if (cancelled || !best) { setMyBest(null); setMyRank(null); return; }
      setMyBest(best);
      const rank = await getArenaRank({ elo: best.elo, platform });
      if (!cancelled) setMyRank(rank);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [user, platform]);

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm }}>
        <Segmented
          style={{ flex: 1 }}
          options={[{ key: 'all', label: 'All' }, { key: 'underdog', label: 'UD' }, { key: 'draftkings', label: 'DK' }]}
          value={platform}
          onChange={(p) => { setPlatform(p); setOffset(0); }}
        />
      </View>
      {myBest && myRank && (
        <View style={styles.myRankBar}>
          <Text style={type.secondary}>
            Your best team: <Text style={{ color: colors.accent, fontWeight: '800' }}>#{myRank.rank}</Text> of {myRank.total} · Elo {Math.round(myBest.elo)}
            {myBest.provisional ? ' (provisional)' : ''}
          </Text>
        </View>
      )}
      {rows == null ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: spacing.xl }} />
      ) : rows.length === 0 ? (
        <Text style={[type.secondary, { textAlign: 'center', padding: spacing.xl }]}>
          No enrolled teams yet under this filter.
        </Text>
      ) : (
        <>
          {rows.map((r, i) => {
            const rank = offset + i + 1;
            const isMine = user && r.user_id === user.id;
            const winPct = r.matches > 0 ? (r.wins / r.matches) * 100 : 0;
            const isOpen = expanded === r.id;
            const snap = isOpen ? enrichSnapshotDisplay(r.display_snapshot, adpLookup, null) : null;
            return (
              <Pressable key={r.id} style={[styles.lbRow, isMine && { borderColor: colors.accent }]} onPress={() => setExpanded(isOpen ? null : r.id)}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                  <Text style={[styles.lbRank, rank <= 3 && { color: colors.accent }]}>#{rank}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[type.body, { fontWeight: '700' }]}>
                      Elo {Math.round(r.elo)}{r.provisional ? <Text style={type.muted}> · prov</Text> : ''}
                      {isMine ? <Text style={{ color: colors.accent }}>  YOU</Text> : ''}
                    </Text>
                    <Text style={type.muted}>{r.platform === 'draftkings' ? 'DraftKings' : 'Underdog'} · {r.wins}W–{r.losses}L · {winPct.toFixed(0)}% win</Text>
                  </View>
                  <Text style={type.muted}>{isOpen ? '▲' : '▼'}</Text>
                </View>
                {isOpen && snap && (
                  <View style={{ marginTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.borderSubtle, paddingTop: spacing.sm }}>
                    {POS_ORDER.map(pos => {
                      const ps = (snap.players || []).filter(p => String(p.position).toUpperCase() === pos);
                      if (!ps.length) return null;
                      return (
                        <View key={pos} style={{ flexDirection: 'row', marginBottom: 2 }}>
                          <Text style={{ width: 26, color: posColor(pos), fontSize: 10.5, fontWeight: '800' }}>{pos}</Text>
                          <Text style={[type.muted, { flex: 1, fontSize: 11.5, lineHeight: 16 }]}>{ps.map(p => p.name).join(' · ')}</Text>
                        </View>
                      );
                    })}
                  </View>
                )}
              </Pressable>
            );
          })}
          <View style={{ flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm }}>
            <Button title="Prev" variant="ghost" style={{ flex: 1 }} disabled={offset === 0} onPress={() => setOffset(Math.max(0, offset - LIMIT))} />
            <Text style={[type.muted, { alignSelf: 'center' }]}>{offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</Text>
            <Button title="Next" variant="ghost" style={{ flex: 1 }} disabled={offset + LIMIT >= total} onPress={() => setOffset(offset + LIMIT)} />
          </View>
        </>
      )}
    </View>
  );
}

// ── My Teams sub-view ──
function ArenaMyTeams({ rosterData, masterPlayers }) {
  const { user } = useAuth();
  const router = useRouter();

  const allTeams = useMemo(
    () => buildEnrollableTeams(rosterData ?? [], masterPlayers ?? []),
    [rosterData, masterPlayers]
  );
  const teams = useMemo(
    () => allTeams.filter((t) => isFeaturedSnapshot(t.snapshot)),
    [allTeams]
  );
  const [arenaRows, setArenaRows] = useState(null);
  const [enrolled, setEnrolled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const keyOf = (entryId, platform) => `${entryId}::${platform}`;

  const refresh = useCallback(async () => {
    if (!user || !ARENA_AVAILABLE) return;
    try {
      const [rows, isEnrolled] = await Promise.all([getMyArenaTeams(), getArenaEnrollment()]);
      const map = {};
      rows.forEach((r) => { map[keyOf(r.entry_id, r.platform)] = r; });
      setArenaRows(map);
      setEnrolled(isEnrolled);
      setError(null);
    } catch {
      setError("Couldn't load your Arena status.");
    }
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  const toggle = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await setArenaEnrollment(!enrolled);
      await refresh();
    } catch {
      setError("That didn't go through. Try again.");
    } finally {
      setBusy(false);
    }
  }, [enrolled, refresh]);

  if (!user) {
    return (
      <View style={{ alignItems: 'center', padding: spacing.xl }}>
        <Lock size={26} color={colors.accent} />
        <Text style={[type.h3, { marginTop: spacing.sm }]}>Sign in to manage your teams</Text>
        <Button title="Go to Account" variant="ghost" style={{ marginTop: spacing.md }} onPress={() => router.push('/account')} />
      </View>
    );
  }

  return (
    <View>
      <View style={styles.enrollCard}>
        <View style={{ flex: 1 }}>
          <Text style={type.h3}>Arena enrollment</Text>
          <Text style={[type.secondary, { marginTop: 2, lineHeight: 18 }]}>
            All your synced teams are in the Arena by default. One switch removes or returns all of them — Elo is kept while unenrolled.
          </Text>
        </View>
        <Pressable
          onPress={toggle}
          disabled={busy}
          style={[styles.switch, enrolled && { backgroundColor: colors.accent }]}
        >
          <View style={[styles.knob, enrolled && { alignSelf: 'flex-end' }]} />
        </Pressable>
      </View>
      {error && <Text style={{ color: colors.negative, marginBottom: spacing.sm }}>{error}</Text>}
      <Text style={[type.muted, { marginBottom: spacing.sm }]}>
        {teams.length} BBM7 team{teams.length === 1 ? '' : 's'} listed (the rest of your portfolio stays registered but isn't presented yet).
      </Text>
      {teams.map((t) => {
        const row = arenaRows?.[keyOf(t.entryId, t.platform)];
        const winPct = row?.matches > 0 ? (row.wins / row.matches) * 100 : null;
        return (
          <View key={t.entryId} style={styles.lbRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Text style={[type.body, { fontWeight: '700' }]} numberOfLines={1}>
                  {t.entryId.slice(0, 8)}…
                </Text>
                <Text style={type.muted}>
                  {row
                    ? `Elo ${Math.round(row.elo)}${row.provisional ? ' (prov)' : ''} · ${row.wins}W–${row.losses}L${winPct != null ? ` · ${winPct.toFixed(0)}%` : ''}`
                    : 'Not rated yet'}
                </Text>
              </View>
              <Text style={[type.muted, { fontSize: 11 }]}>{enrolled ? 'In the pool' : 'Unenrolled'}</Text>
            </View>
          </View>
        );
      })}
      {teams.length === 0 && (
        <Text style={[type.secondary, { textAlign: 'center', padding: spacing.lg }]}>
          No BBM7 teams synced yet — sync rosters with the desktop extension first.
        </Text>
      )}
    </View>
  );
}

export default function ArenaView() {
  const [view, setView] = useState('vote');
  const { user } = useAuth();
  const { rosterData, masterPlayers, adpByPlatform } = usePortfolio();
  useAutoRegister(user, rosterData, masterPlayers);

  const adpLookup = useMemo(() => buildAdpLookup(masterPlayers), [masterPlayers]);

  const [comboData, setComboData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadRealDraftData(masterPlayers ?? [], rosterData ?? [])
      .then((d) => { if (!cancelled) setComboData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [masterPlayers, rosterData]);
  // eslint-disable-next-line no-unused-vars
  const comboLookup = useMemo(
    () => (comboData ? (snapshot) => comboRateForSnapshot(comboData, snapshot) : null),
    [comboData]
  );

  const projLookup = useMemo(() => {
    const map = Object.values(adpByPlatform || {}).find((p) => p?.projPointsMap)?.projPointsMap;
    if (!map) return null;
    return (name) => {
      const v = map[canonicalName(name)];
      return Number.isFinite(v) ? v : null;
    };
  }, [adpByPlatform]);

  const projTotalFn = useMemo(() => (players) => {
    const outlook = computeRosterOutlook(
      players.map((p) => ({ ...p, projectedPoints: p.proj })),
      { byeWeeks: BYE_WEEKS_2026 },
    );
    return outlook.projectedPoints;
  }, []);

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm }}>
        <Swords size={16} color={colors.accent} />
        <Text style={[type.h3, { flex: 1 }]}>Best Ball Arena</Text>
        <View style={styles.seasonTag}><Text style={{ color: colors.accent, fontSize: 10, fontWeight: '800' }}>BBM7</Text></View>
      </View>
      <Segmented options={NAV} value={view} onChange={setView} style={{ marginBottom: spacing.md }} />
      {view === 'vote' && (
        <ArenaVote
          adpLookup={adpLookup}
          projLookup={projLookup}
          projTotalFn={projTotalFn}
          onGoToMyTeams={() => setView('myteams')}
        />
      )}
      {view === 'leaderboard' && <ArenaLeaderboard adpLookup={adpLookup} />}
      {view === 'myteams' && <ArenaMyTeams rosterData={rosterData} masterPlayers={masterPlayers} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  snapCard: {
    backgroundColor: colors.surface1, borderRadius: radii.lg,
    borderWidth: 1, borderColor: colors.borderDefault,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  pickBtn: {
    backgroundColor: colors.accent, borderRadius: radii.md,
    alignItems: 'center', paddingVertical: 9, marginTop: spacing.sm,
  },
  seasonTag: {
    borderWidth: 1, borderColor: colors.accent, borderRadius: 4,
    paddingHorizontal: 5, paddingVertical: 1,
  },
  lbRow: {
    backgroundColor: colors.surface1, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.borderSubtle,
    padding: spacing.md, marginBottom: 6,
  },
  lbRank: { width: 40, fontSize: 14, fontWeight: '800', color: colors.textSecondary, fontVariant: ['tabular-nums'] },
  myRankBar: {
    backgroundColor: colors.accentMuted, borderRadius: radii.md,
    paddingHorizontal: spacing.md, paddingVertical: 8, marginBottom: spacing.sm,
  },
  enrollCard: {
    flexDirection: 'row', alignItems: 'center', gap: spacing.md,
    backgroundColor: colors.surface1, borderRadius: radii.md,
    borderWidth: 1, borderColor: colors.borderDefault,
    padding: spacing.md, marginBottom: spacing.sm,
  },
  switch: {
    width: 46, height: 26, borderRadius: 13,
    backgroundColor: colors.surface3, padding: 3,
  },
  knob: { width: 20, height: 20, borderRadius: 10, backgroundColor: '#fff' },
});
