// ArenaMyTeams — RN port of the web My Teams view (best-ball-manager/src/components/
// arena/ArenaMyTeams.jsx). Your teams' Arena standings + the account-level enrollment
// switch (ADR-016). Enrollment is opt-out and all-or-nothing: every synced team is in
// the Arena by default, and one switch removes/returns ALL of your teams. Teams keep
// their Elo while unenrolled. Owners are never shown while voting. Presentation is
// scoped to the featured tournament (BBM7).
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Swords, Lock } from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { buildEnrollableTeams } from '../../../shared/utils/arenaSnapshot';
import { FEATURED_TOURNAMENT, isFeaturedSnapshot } from '../../../shared/utils/arenaFeatured';
import { getMyArenaTeams, getArenaEnrollment, setArenaEnrollment, ARENA_AVAILABLE } from '../../../shared/utils/arenaClient';
import { colors, spacing, radii, type } from '../../theme';

const keyOf = (entryId, platform) => `${entryId}::${platform}`;

function Gate({ icon, title, body }) {
  return (
    <View style={styles.stateBox}>
      {icon}
      <Text style={[type.h3, { marginTop: spacing.sm, textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.secondary, { textAlign: 'center', marginTop: 4, lineHeight: 19 }]}>{body}</Text>
    </View>
  );
}

export default function ArenaMyTeams({ rosterData, masterPlayers }) {
  const { user } = useAuth();

  const allTeams = useMemo(() => buildEnrollableTeams(rosterData ?? [], masterPlayers ?? []), [rosterData, masterPlayers]);
  const teams = useMemo(() => allTeams.filter((t) => isFeaturedSnapshot(t.snapshot)), [allTeams]);

  const [arenaRows, setArenaRows] = useState(null);
  const [enrolled, setEnrolled] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

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

  if (!ARENA_AVAILABLE) {
    return <Gate icon={<Swords size={30} color={colors.accent} />} title="The Arena is warming up" body="Team standings aren't available here yet. Check back once the Arena is live." />;
  }
  if (!user) {
    return <Gate icon={<Lock size={30} color={colors.accent} />} title="Sign in to see your teams" body="Voting is free for everyone. Sign in with the account button to see how your synced teams are ranking." />;
  }
  if (teams.length === 0) {
    return allTeams.length === 0
      ? <Gate icon={<Swords size={30} color={colors.accent} />} title="No teams yet" body="Sync your portfolio with the Chrome extension and your teams will join the Arena automatically." />
      : <Gate icon={<Swords size={30} color={colors.accent} />} title={`No ${FEATURED_TOURNAMENT.shortLabel} teams yet`} body={`The Arena runs on ${FEATURED_TOURNAMENT.label} for now. Draft a BBM team and it will join the Arena on your next sync.`} />;
  }

  return (
    <View>
      <View style={styles.intro}>
        <Text style={[type.secondary, { lineHeight: 19, flex: 1 }]}>
          {enrolled
            ? `Your ${FEATURED_TOURNAMENT.label} teams are in the Arena: they appear (anonymously) in the blind vote pool and on the leaderboard. Owners are never shown while voting.`
            : 'Your teams are out of the Arena — none of them appear in the vote pool or on the leaderboard. Their ratings are kept for if you return.'}
        </Text>
        <Pressable onPress={toggle} disabled={busy} style={[styles.enrollBtn, enrolled ? styles.leaveBtn : styles.rejoinBtn]}>
          <Text style={[styles.enrollBtnText, enrolled ? { color: colors.textSecondary } : { color: colors.textInverse }]}>
            {busy ? '…' : enrolled ? 'Leave the Arena' : 'Rejoin the Arena'}
          </Text>
        </Pressable>
      </View>

      {error && <Text style={styles.errorNote}>{error}</Text>}

      <View style={{ gap: 6 }}>
        {teams.map((team) => {
          const row = arenaRows?.[keyOf(team.entryId, team.platform)];
          return (
            <View key={keyOf(team.entryId, team.platform)} style={styles.row}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.title} numberOfLines={1}>{team.tournamentTitle || team.slateTitle || 'Best-ball team'}</Text>
                <Text style={styles.meta}>{team.count} picks</Text>
              </View>
              {row ? (
                <Text style={styles.standings}>{Math.round(row.elo)} Elo · {row.wins}–{row.losses}{row.provisional ? ' · new' : ''}</Text>
              ) : (
                <Text style={styles.meta}>awaiting first sync</Text>
              )}
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  stateBox: { alignItems: 'center', padding: spacing.xl },
  intro: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.borderDefault, borderRadius: radii.md, padding: spacing.md, marginBottom: spacing.sm, flexWrap: 'wrap' },
  enrollBtn: { borderRadius: radii.md, paddingHorizontal: 14, paddingVertical: 8 },
  leaveBtn: { borderWidth: 1, borderColor: colors.borderStrong, backgroundColor: 'transparent' },
  rejoinBtn: { backgroundColor: colors.accent },
  enrollBtnText: { fontSize: 13, fontWeight: '700' },
  errorNote: { color: colors.negative, fontSize: 13, marginBottom: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface1, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radii.md, padding: spacing.md },
  title: { color: colors.textPrimary, fontSize: 14, fontWeight: '700' },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  standings: { color: colors.textSecondary, fontSize: 12.5, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
