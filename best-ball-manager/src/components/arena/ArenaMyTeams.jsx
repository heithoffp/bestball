// ArenaMyTeams — your teams' Arena standings + the account-level enrollment
// switch (ADR-016). Enrollment is opt-out and all-or-nothing: every synced team
// is in the Arena by default, and one switch removes/returns ALL of your teams.
// There is no per-team selection. Teams keep their Elo while unenrolled (they
// just leave the pool + leaderboard). Owners are never shown while voting.
// Presentation is scoped to the featured tournament (BBM7) — only BBM teams are
// listed, though the enrollment switch still governs the whole portfolio.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Swords, Lock } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { buildEnrollableTeams } from '../../utils/arenaSnapshot';
import { FEATURED_TOURNAMENT, isFeaturedSnapshot } from '../../utils/arenaFeatured';
import { getMyArenaTeams, getArenaEnrollment, setArenaEnrollment, ARENA_AVAILABLE } from '../../utils/arenaClient';
import css from '../Arena.module.css';

const keyOf = (entryId, platform) => `${entryId}::${platform}`;

export default function ArenaMyTeams({ rosterData, masterPlayers }) {
  const { user } = useAuth();

  const allTeams = useMemo(
    () => buildEnrollableTeams(rosterData, masterPlayers),
    [rosterData, masterPlayers],
  );
  // BBM7-only presentation: the rest of the portfolio stays registered in the
  // pool's database, it just isn't listed until more slates are presented.
  const teams = useMemo(
    () => allTeams.filter((t) => isFeaturedSnapshot(t.snapshot)),
    [allTeams],
  );
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
    } catch {
      setError('Couldn’t load your Arena status.');
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
      setError('That didn’t go through. Try again.');
    } finally {
      setBusy(false);
    }
  }, [enrolled, refresh]);

  // ── Gates ────────────────────────────────────────────────────────────────
  if (!ARENA_AVAILABLE) {
    return (
      <div className={css.stateBox}>
        <Swords size={32} className={css.stateIcon} />
        <h3>The Arena is warming up</h3>
        <p>Team standings aren’t available here yet. Check back once the Arena is live.</p>
      </div>
    );
  }
  if (!user) {
    return (
      <div className={css.stateBox}>
        <Lock size={32} className={css.stateIcon} />
        <h3>Sign in to see your teams</h3>
        <p>Voting is free for everyone. Sign in with the account button up top to see how your synced teams are ranking.</p>
      </div>
    );
  }
  if (teams.length === 0) {
    return (
      <div className={css.stateBox}>
        <Swords size={32} className={css.stateIcon} />
        {allTeams.length === 0 ? (
          <>
            <h3>No teams yet</h3>
            <p>Sync your portfolio with the Chrome extension and your teams will join the Arena automatically.</p>
          </>
        ) : (
          <>
            <h3>No {FEATURED_TOURNAMENT.shortLabel} teams yet</h3>
            <p>The Arena runs on {FEATURED_TOURNAMENT.label} for now. Draft a BBM team and it will join the Arena on your next sync.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={css.myTeams}>
      <div className={css.myIntro}>
        <p>
          {enrolled
            ? `Your ${FEATURED_TOURNAMENT.label} teams are in the Arena: they appear (anonymously) in the blind vote pool and on the leaderboard. Owners are never shown while voting.`
            : 'Your teams are out of the Arena — none of them appear in the vote pool or on the leaderboard. Their ratings are kept for if you return.'}
        </p>
        <button
          className={enrolled ? css.enrolledBtn : css.enrollBtn}
          onClick={toggle}
          disabled={busy}
        >
          {busy ? '…' : enrolled ? 'Leave the Arena' : 'Rejoin the Arena'}
        </button>
      </div>
      {error && <p className={css.errorNote}>{error}</p>}
      <ul className={css.myList}>
        {teams.map((team) => {
          const k = keyOf(team.entryId, team.platform);
          const row = arenaRows?.[k];
          return (
            <li key={k} className={css.myRow}>
              <div className={css.myInfo}>
                <span className={css.myTitle}>{team.tournamentTitle || team.slateTitle || 'Best-ball team'}</span>
                <span className={css.myMeta}>{team.count} picks</span>
              </div>
              <div className={css.myRight}>
                {row ? (
                  <span className={css.myStandings} title="Hidden Elo, wins–losses">
                    {Math.round(row.elo)} Elo · {row.wins}–{row.losses}{row.provisional ? ' · new' : ''}
                  </span>
                ) : (
                  <span className={css.myMeta}>awaiting first sync</span>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
