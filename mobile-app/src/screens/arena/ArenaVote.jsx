// ArenaVote — RN port of the web blind head-to-head voting screen (best-ball-manager/
// src/components/arena/ArenaVote.jsx), specifically its <900px mobile layout: a "tale
// of the tape" spine up top, then a snap-scrolled contender deck (the other card's edge
// peeks in) with a Red/Blue corner toggle synced to the swipe, and a sticky pick dock.
//
// The reveal is INSTANT: the tapped card flips and the Elo ticker rolls the moment the
// user taps, using a rating change predicted client-side (predictEloResult mirrors the
// server math). The vote submits in the background and its authoritative result
// reconciles silently. The next matchup is PREFETCHED during the reveal so advancing
// feels instant.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, Pressable, ScrollView, useWindowDimensions, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Swords, Trophy, RefreshCw, ArrowRight, Gavel, Zap, Link2 } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { getPairing, submitVote } from '../../../shared/utils/arenaClient';
import { enrichSnapshotDisplay } from '../../../shared/utils/arenaSnapshot';
import { FEATURED_TOURNAMENT } from '../../../shared/utils/arenaFeatured';
import { colors, spacing, radii, type, corner as cornerColors } from '../../theme';
import { Button, LoadingView } from '../../components/ui';
import ArenaRosterCard from './ArenaRosterCard';
import ArenaTape from './ArenaTape';

const REVEAL_MS = 1800;

// Client mirror of the server Elo update (supabase/functions/_shared/arena.ts) so the
// rating change can roll the instant a pick lands — no round trip.
const K_PROVISIONAL = 40;
const K_STABLE = 20;
const N_PROVISIONAL = 10;
const expectedScore = (forElo, againstElo) => 1 / (1 + 10 ** ((againstElo - forElo) / 400));
const kFactor = (matches) => (matches < N_PROVISIONAL ? K_PROVISIONAL : K_STABLE);

function predictEloResult(winner, teamA, teamB) {
  const eloA = Number(teamA?.elo);
  const eloB = Number(teamB?.elo);
  if (!Number.isFinite(eloA) || !Number.isFinite(eloB)) return null;
  const matchesA = Number(teamA?.matches) || 0;
  const matchesB = Number(teamB?.matches) || 0;
  const winnerElo = winner === 'a' ? eloA : eloB;
  const loserElo = winner === 'a' ? eloB : eloA;
  const winnerMatches = winner === 'a' ? matchesA : matchesB;
  const loserMatches = winner === 'a' ? matchesB : matchesA;
  const winnerAfter = winnerElo + kFactor(winnerMatches) * (1 - expectedScore(winnerElo, loserElo));
  const loserAfter = loserElo + kFactor(loserMatches) * (0 - expectedScore(loserElo, winnerElo));
  const aAfter = winner === 'a' ? winnerAfter : loserAfter;
  const bAfter = winner === 'a' ? loserAfter : winnerAfter;
  return {
    team_a: { before: eloA, after: aAfter, delta: aAfter - eloA },
    team_b: { before: eloB, after: bAfter, delta: bAfter - eloB },
  };
}

// Persistence keys (AsyncStorage) — session scorecard + guest cap are per-run signals,
// lens/stacks persist across sessions. Reuse the web key names for conceptual parity.
const STATS_KEY = 'bbe_arena_session_stats';
const GUEST_CAP_KEY = 'bbe_arena_guest_capped';
const LENS_KEY = 'bbe_arena_lens';
const STACKS_KEY = 'bbe_arena_stacks';

function StateBox({ icon, title, body, cta, onCta }) {
  return (
    <View style={styles.stateBox}>
      {icon}
      <Text style={[type.h3, { marginTop: spacing.sm, textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.secondary, { textAlign: 'center', marginTop: 4, lineHeight: 19 }]}>{body}</Text>
      {cta && <Button title={cta} style={{ marginTop: spacing.lg }} onPress={onCta} />}
    </View>
  );
}

export default function ArenaVote({ onGoToMyTeams, adpLookup, projLookup, projTotalFn, comboLookup }) {
  const { user } = useAuth();
  const isGuest = !user;
  const { width: winW } = useWindowDimensions();
  // ArenaView applies paddingHorizontal spacing.lg; the deck lives inside that.
  const contentW = winW - spacing.lg * 2;
  const GAP = spacing.sm;
  const itemW = contentW - 26; // leave a peek of the other card
  const snapInterval = itemW + GAP;

  const [status, setStatus] = useState('loading'); // loading|voting|picked|revealed|empty|unavailable|rate_limited|error
  const [pairing, setPairing] = useState(null);
  const [result, setResult] = useState(null);
  const [pick, setPick] = useState(null);
  const [stats, setStats] = useState({ judged: 0, upsets: 0 });
  const [capReached, setCapReached] = useState(false);
  const [lens, setLens] = useState('clv');
  const [showStacks, setShowStacks] = useState(true);
  const [deckIndex, setDeckIndex] = useState(0);

  const deckRef = useRef(null);
  const advanceTimer = useRef(null);
  const nextRef = useRef(null);
  const prefetching = useRef(false);
  const pairingIdRef = useRef(null);

  // Hydrate persisted prefs / session state once on mount (async — never blocks paint).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [rawStats, rawCap, rawLens, rawStacks] = await AsyncStorage.multiGet([STATS_KEY, GUEST_CAP_KEY, LENS_KEY, STACKS_KEY]);
        if (cancelled) return;
        try {
          const s = JSON.parse(rawStats[1]);
          if (s && Number.isFinite(s.judged) && Number.isFinite(s.upsets)) setStats(s);
        } catch { /* fresh */ }
        if (rawCap[1] === '1') setCapReached(true);
        if (rawLens[1] === 'proj') setLens('proj');
        if (rawStacks[1] === 'off') setShowStacks(false);
      } catch { /* AsyncStorage unavailable — defaults stand */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const prefetch = useCallback(async () => {
    if (nextRef.current || prefetching.current) return;
    prefetching.current = true;
    try {
      const r = await getPairing();
      if (r.pairing) nextRef.current = r.pairing;
    } finally {
      prefetching.current = false;
    }
  }, []);

  const scrollDeckTo = useCallback((idx) => {
    deckRef.current?.scrollTo({ x: idx === 0 ? 0 : snapInterval, animated: true });
  }, [snapInterval]);

  const fetchNext = useCallback(async () => {
    clearTimeout(advanceTimer.current);
    setResult(null);
    setPick(null);
    setDeckIndex(0);
    deckRef.current?.scrollTo({ x: 0, animated: false });

    if (nextRef.current) {
      const p = nextRef.current;
      nextRef.current = null;
      pairingIdRef.current = p.pairing_id;
      setPairing(p);
      setStatus('voting');
      prefetch();
      return;
    }

    setStatus('loading');
    const r = await getPairing();
    if (r.pairing) {
      pairingIdRef.current = r.pairing.pairing_id;
      setPairing(r.pairing);
      setStatus('voting');
      prefetch();
    } else {
      const map = { insufficient_pool: 'empty', unavailable: 'unavailable', rate_limited: 'rate_limited' };
      setStatus(map[r.reason] || 'error');
    }
  }, [prefetch]);

  useEffect(() => {
    fetchNext();
    return () => clearTimeout(advanceTimer.current);
  }, [fetchNext]);

  const vote = useCallback(async (winner) => {
    if (status !== 'voting' || !pairing) return;
    const pid = pairing.pairing_id;

    const willCount = !(isGuest && capReached);
    const predicted = willCount ? predictEloResult(winner, pairing.team_a, pairing.team_b) : null;
    const upsetGuess = predicted
      ? (winner === 'a' ? pairing.team_a.elo < pairing.team_b.elo : pairing.team_b.elo < pairing.team_a.elo)
      : false;

    setPick(winner);
    if (predicted) {
      setResult({ winner, upset: upsetGuess, counted: willCount, ...predicted });
      setStatus('revealed');
    } else {
      setStatus('picked');
    }
    // Bring the picked card into view so its stamp + Elo delta are visible.
    scrollDeckTo(winner === 'a' ? 0 : 1);
    clearTimeout(advanceTimer.current);
    advanceTimer.current = setTimeout(fetchNext, REVEAL_MS);

    try {
      const data = await submitVote({ token: pairing.token, winner });
      const pickedBefore = winner === 'a' ? data?.team_a?.before : data?.team_b?.before;
      const otherBefore = winner === 'a' ? data?.team_b?.before : data?.team_a?.before;
      const upset = Number.isFinite(pickedBefore) && Number.isFinite(otherBefore) && pickedBefore < otherBefore;
      setStats((s) => {
        const next = { judged: s.judged + 1, upsets: s.upsets + (upset ? 1 : 0) };
        AsyncStorage.setItem(STATS_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
      if (isGuest && data?.counted === false) {
        setCapReached(true);
        AsyncStorage.setItem(GUEST_CAP_KEY, '1').catch(() => {});
      }
      if (pairingIdRef.current !== pid) return;
      setResult({ winner, upset, ...data });
      setStatus('revealed');
    } catch (e) {
      if (pairingIdRef.current !== pid) return;
      clearTimeout(advanceTimer.current);
      setPick(null);
      setResult(null);
      if (e?.data?.error === 'already_voted') fetchNext();
      else if (e?.status === 429) setStatus('rate_limited');
      else setStatus('error');
    }
  }, [status, pairing, fetchNext, isGuest, capReached, scrollDeckTo]);

  const setLensTo = useCallback((next) => {
    setLens(next);
    AsyncStorage.setItem(LENS_KEY, next).catch(() => {});
  }, []);
  const toggleStacks = useCallback(() => {
    setShowStacks((s) => {
      AsyncStorage.setItem(STACKS_KEY, s ? 'off' : 'on').catch(() => {});
      return !s;
    });
  }, []);

  const onDeckScroll = useCallback((e) => {
    const x = e.nativeEvent.contentOffset.x;
    setDeckIndex(x > snapInterval / 2 ? 1 : 0);
  }, [snapInterval]);

  const snapA = useMemo(
    () => (pairing ? enrichSnapshotDisplay(pairing.team_a.display_snapshot, adpLookup, projLookup, projTotalFn) : null),
    [pairing, adpLookup, projLookup, projTotalFn],
  );
  const snapB = useMemo(
    () => (pairing ? enrichSnapshotDisplay(pairing.team_b.display_snapshot, adpLookup, projLookup, projTotalFn) : null),
    [pairing, adpLookup, projLookup, projTotalFn],
  );
  const maxProj = useMemo(() => Math.max(
    0,
    ...(snapA?.players || []).map((p) => p.proj || 0),
    ...(snapB?.players || []).map((p) => p.proj || 0),
  ) || null, [snapA, snapB]);

  // ── Non-matchup states ──────────────────────────────────────────────────
  if (status === 'loading') return <LoadingView msg="Finding a matchup..." />;
  if (status === 'unavailable') {
    return <StateBox icon={<Swords size={30} color={colors.accent} />} title="The Arena is warming up" body="Head-to-head voting isn't available here yet. Check back once the Arena is live." />;
  }
  if (status === 'empty') {
    return <StateBox icon={<Trophy size={30} color={colors.accent} />} title="No matchups yet" body="Not enough Best Ball Mania VII teams are in the Arena yet. Be among the first — sync your teams and start the competition." cta={onGoToMyTeams ? 'Enter your teams' : null} onCta={onGoToMyTeams} />;
  }
  if (status === 'rate_limited') {
    return <StateBox icon={<RefreshCw size={30} color={colors.accent} />} title="Slow down a sec" body="You're voting quickly. Take a breath, then grab the next matchup." cta="Next matchup" onCta={fetchNext} />;
  }
  if (status === 'error') {
    return <StateBox icon={<RefreshCw size={30} color={colors.accent} />} title="Couldn't load a matchup" body="Something went wrong reaching the Arena. Try again." cta="Retry" onCta={fetchNext} />;
  }

  // ── Matchup (voting + picked + revealed) ────────────────────────────────
  const revealed = status === 'revealed';
  const showOutcome = revealed || status === 'picked';
  const pickedSide = result?.winner ?? pick;
  const outcome = (side) => (!showOutcome ? null : pickedSide === side ? 'win' : 'loss');
  const guestCapped = isGuest && capReached;

  const ratingFor = (side) => {
    if (!revealed || !result) return null;
    const r = side === 'a' ? result.team_a : result.team_b;
    return r && Number.isFinite(r.before) && Number.isFinite(r.after) ? r : null;
  };
  const stampFor = (side) => (showOutcome && pickedSide === side ? (result?.upset ? 'Upset Win' : 'Winner') : null);

  const cardFor = (side, snap) => (
    <ArenaRosterCard
      snapshot={snap}
      corner={side === 'a' ? 'red' : 'blue'}
      cornerLabel={side === 'a' ? 'Red Corner' : 'Blue Corner'}
      outcome={outcome(side)}
      delta={revealed ? (side === 'a' ? result?.team_a?.delta : result?.team_b?.delta) : null}
      rating={ratingFor(side)}
      stamp={stampFor(side)}
      lens={lens}
      comboLookup={comboLookup}
      showStacks={showStacks}
      maxProj={maxProj}
      pickable={status === 'voting'}
      picked={showOutcome && pickedSide === side}
      onPick={() => {
        const idx = side === 'a' ? 0 : 1;
        if (deckIndex === idx) vote(side);
        else scrollDeckTo(idx);
      }}
    />
  );

  return (
    <View style={{ paddingBottom: 20 }}>
      {/* Scouting-lens strip + session scorecard */}
      <View style={styles.topRow}>
        <View style={styles.lensStrip}>
          <View style={styles.lensSeg}>
            <Pressable onPress={() => setLensTo('clv')} style={[styles.lensBtn, lens === 'clv' && styles.lensActive]}>
              <Text style={[styles.lensBtnText, lens === 'clv' && styles.lensActiveText]}>CLV</Text>
            </Pressable>
            <Pressable onPress={() => setLensTo('proj')} style={[styles.lensBtn, lens === 'proj' && styles.lensActive]}>
              <Text style={[styles.lensBtnText, lens === 'proj' && styles.lensActiveText]}>Proj</Text>
            </Pressable>
          </View>
          <Pressable onPress={toggleStacks} style={[styles.lensBtn, styles.stacksBtn, showStacks && styles.lensActive]}>
            <Link2 size={11} color={showStacks ? colors.textInverse : colors.textSecondary} />
            <Text style={[styles.lensBtnText, showStacks && styles.lensActiveText]}>Stacks</Text>
          </Pressable>
        </View>
        <View style={styles.scoreStrip}>
          <View style={styles.statChip}><Gavel size={12} color={colors.textSecondary} /><Text style={styles.statChipText}> {stats.judged} judged</Text></View>
          <View style={styles.statChip}><Zap size={12} color={colors.textSecondary} /><Text style={styles.statChipText}> {stats.upsets} upsets</Text></View>
        </View>
      </View>

      <View style={styles.contextBar}>
        <Swords size={13} color={colors.accent} />
        <Text style={styles.ctxBrand}> Blind Matchup</Text>
        <Text style={styles.ctxDot}> · </Text>
        <Text style={styles.ctxTourney}>{FEATURED_TOURNAMENT.label}</Text>
      </View>

      <ArenaTape a={snapA} b={snapB} active={showOutcome} comboLookup={comboLookup} />

      {/* Corner toggle synced to the deck */}
      <View style={styles.cornerToggle}>
        <Pressable onPress={() => scrollDeckTo(0)} style={[styles.cornerTab, deckIndex === 0 && { borderColor: cornerColors.red, backgroundColor: 'rgba(236,90,95,0.15)' }]}>
          <Text style={[styles.cornerTabText, deckIndex === 0 && { color: cornerColors.red }]}>Red Corner</Text>
        </Pressable>
        <Pressable onPress={() => scrollDeckTo(1)} style={[styles.cornerTab, deckIndex === 1 && { borderColor: cornerColors.blue, backgroundColor: 'rgba(79,147,245,0.15)' }]}>
          <Text style={[styles.cornerTabText, deckIndex === 1 && { color: cornerColors.blue }]}>Blue Corner</Text>
        </Pressable>
      </View>

      <ScrollView
        ref={deckRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={snapInterval}
        decelerationRate="fast"
        disableIntervalMomentum
        onScroll={onDeckScroll}
        scrollEventThrottle={16}
        contentContainerStyle={{ gap: GAP, paddingTop: 16 }}
      >
        <View style={{ width: itemW }}>{cardFor('a', snapA)}</View>
        <View style={{ width: itemW }}>{cardFor('b', snapB)}</View>
      </ScrollView>

      {/* Pick dock */}
      <View style={styles.dock}>
        {!showOutcome ? (
          <View style={styles.dockRow}>
            <Text style={styles.dockHint}>Tap the roster you prefer</Text>
            <Pressable onPress={fetchNext} style={styles.skipBtn}>
              <Text style={styles.skipText}>Skip</Text>
              <ArrowRight size={15} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : (
          <View>
            <Text style={styles.revealNote}>
              {guestCapped
                ? 'Guest voting limit reached — keep playing, but picks no longer move the ratings.'
                : result
                  ? (result.upset ? 'Upset pick — the ratings had it the other way.' : 'Vote counted — next up.')
                  : 'Pick locked in — next up.'}
            </Text>
            <View style={styles.dockRow}>
              {guestCapped && onGoToMyTeams ? (
                <Pressable onPress={onGoToMyTeams}><Text style={styles.linkBtn}>Sign in to enter your teams</Text></Pressable>
              ) : <View />}
              <Pressable onPress={fetchNext} style={[styles.skipBtn, { borderColor: colors.accent }]}>
                <Text style={[styles.skipText, { color: colors.accent }]}>Next</Text>
                <ArrowRight size={15} color={colors.accent} />
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stateBox: { alignItems: 'center', padding: spacing.xl },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.sm, flexWrap: 'wrap', gap: spacing.sm },
  lensStrip: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lensSeg: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radii.sm, overflow: 'hidden' },
  lensBtn: { paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 4 },
  stacksBtn: { backgroundColor: colors.surface2, borderRadius: radii.sm },
  lensActive: { backgroundColor: colors.accent },
  lensBtnText: { fontSize: 11.5, fontWeight: '700', color: colors.textSecondary },
  lensActiveText: { color: colors.textInverse },
  scoreStrip: { flexDirection: 'row', gap: 6 },
  statChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: radii.sm, paddingHorizontal: 8, paddingVertical: 4 },
  statChipText: { fontSize: 11, color: colors.textSecondary, fontWeight: '600' },
  contextBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: spacing.sm },
  ctxBrand: { fontSize: 12, fontWeight: '700', color: colors.accent },
  ctxDot: { fontSize: 12, color: colors.textMuted },
  ctxTourney: { fontSize: 12, color: colors.textSecondary },
  cornerToggle: { flexDirection: 'row', gap: spacing.sm, marginBottom: 2 },
  cornerTab: { flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderSubtle, backgroundColor: colors.surface1 },
  cornerTabText: { fontSize: 12, fontWeight: '800', letterSpacing: 0.5, color: colors.textSecondary },
  dock: { marginTop: spacing.sm },
  dockRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  dockHint: { fontSize: 13, color: colors.textSecondary, fontWeight: '600' },
  skipBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, borderWidth: 1, borderColor: colors.borderDefault, borderRadius: radii.md, paddingHorizontal: 12, paddingVertical: 7 },
  skipText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  revealNote: { fontSize: 12.5, color: colors.textSecondary, textAlign: 'center', marginBottom: spacing.sm, lineHeight: 18 },
  linkBtn: { fontSize: 12.5, color: colors.accent, fontWeight: '700' },
});
