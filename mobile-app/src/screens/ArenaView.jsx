// ArenaView — the Best Ball Arena shell (ADR-013), a mobile port of the web app's
// Arena that matches its responsive/mobile layout: a brand header, a Vote / Leaderboard
// / My Teams sub-nav, and the three sub-views (best-ball-manager/src/components/arena/*).
// Blind head-to-head voting, the public leaderboard, and My Teams enrollment run on the
// same arenaClient Edge-Function/RLS surface as the web; owner identity is never shown
// while voting, and you're never shown your own teams.
//
// On mount we auto-register the user's own + participant-captured board teams into the
// opt-out pool (ADR-014), once per app session.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { Swords } from 'lucide-react-native';
import { useAuth } from '../contexts/AuthContext';
import { usePortfolio } from '../contexts/PortfolioContext';
import { canonicalName } from '../../shared/utils/helpers';
import { computeRosterOutlook } from '../../shared/utils/advanceModel';
import { BYE_WEEKS_2026 } from '../../shared/data/byeWeeks';
import { buildEnrollableTeams, buildBoardTeams, buildAdpLookup, playerNameKey } from '../../shared/utils/arenaSnapshot';
import { loadRealDraftData, comboRateForSnapshot } from '../../shared/utils/realDraftData';
import { fetchDraftBoards } from '../../shared/utils/draftBoards';
import { registerAllArenaTeams, ARENA_AVAILABLE } from '../../shared/utils/arenaClient';
import { Segmented } from '../components/ui';
import { colors, spacing } from '../theme';
import ArenaVote from './arena/ArenaVote';
import ArenaLeaderboard from './arena/ArenaLeaderboard';
import ArenaMyTeams from './arena/ArenaMyTeams';

const NAV = [
  { key: 'vote', label: 'Vote' },
  { key: 'leaderboard', label: 'Leaderboard' },
  { key: 'myteams', label: 'My Teams' },
];

// Auto-register own + board teams into the opt-out pool, once per app session.
const _registeredThisSession = new Set();
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
          draftedAtByDraft[id] = times.length ? new Date(Math.min(...times)).toISOString().slice(0, 10) : null;
        });
        const boards = await fetchDraftBoards(draftIds);
        const boardTeams = [];
        boards.forEach((board) => {
          boardTeams.push(...buildBoardTeams(
            board, ownKeyByDraft[board.draftId], adpLookup, titleByDraft[board.draftId], draftedAtByDraft[board.draftId],
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

export default function ArenaView() {
  const [view, setView] = useState('vote');
  const { user } = useAuth();
  const { rosterData, masterPlayers, adpByPlatform } = usePortfolio();
  useAutoRegister(user, rosterData, masterPlayers);

  // The viewer's own ADP, used to compute CLV at display time for every matchup.
  const adpLookup = useMemo(() => buildAdpLookup(masterPlayers), [masterPlayers]);

  // Early Combo rarity, computed fresh from the real-draft frequency tables so every
  // snapshot gets it regardless of registration age. Guests resolve to empty tables.
  const [comboData, setComboData] = useState(null);
  useEffect(() => {
    let cancelled = false;
    loadRealDraftData(masterPlayers ?? [], rosterData ?? [])
      .then((d) => { if (!cancelled) setComboData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [masterPlayers, rosterData]);
  const comboLookup = useMemo(
    () => (comboData ? (snapshot) => comboRateForSnapshot(comboData, snapshot) : null),
    [comboData],
  );

  // The viewer's projections, same display-time treatment as CLV.
  const projLookup = useMemo(() => {
    const map = Object.values(adpByPlatform || {}).find((p) => p?.projPointsMap)?.projPointsMap;
    if (!map) return null;
    return (name) => {
      const v = map[canonicalName(name)];
      return Number.isFinite(v) ? v : null;
    };
  }, [adpByPlatform]);

  // Team Proj Pts total, computed the lineup-aware way (computeRosterOutlook): only a
  // starting lineup scores, real byes cost what they cost, surplus QBs don't inflate.
  const projTotalFn = useMemo(() => (players) => {
    const outlook = computeRosterOutlook(
      players.map((p) => ({ ...p, projectedPoints: p.proj })),
      { byeWeeks: BYE_WEEKS_2026 },
    );
    return outlook.projectedPoints;
  }, []);

  return (
    <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={styles.brand}>
        <Swords size={16} color={colors.accent} />
        <Text style={styles.brandText}>Best Ball Arena</Text>
        <View style={styles.seasonTag}><Text style={styles.seasonTagText}>BBM7</Text></View>
      </View>

      <Segmented options={NAV} value={view} onChange={setView} style={{ marginBottom: spacing.md }} />

      {view === 'vote' && (
        <ArenaVote adpLookup={adpLookup} projLookup={projLookup} projTotalFn={projTotalFn} comboLookup={comboLookup} onGoToMyTeams={() => setView('myteams')} />
      )}
      {view === 'leaderboard' && <ArenaLeaderboard adpLookup={adpLookup} comboLookup={comboLookup} masterPlayers={masterPlayers} />}
      {view === 'myteams' && <ArenaMyTeams rosterData={rosterData} masterPlayers={masterPlayers} />}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing.sm, marginTop: spacing.sm },
  brandText: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.textPrimary },
  seasonTag: { borderWidth: 1, borderColor: colors.accent, borderRadius: 4, paddingHorizontal: 5, paddingVertical: 1 },
  seasonTagText: { color: colors.accent, fontSize: 10, fontWeight: '800' },
});
