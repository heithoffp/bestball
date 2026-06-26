// ArenaMyTeams — enroll/unenroll your own teams (ADR-013 / TASK-284).
// Entering a team is a PAID feature (gated via featureAccess 'arena_enroll');
// viewing + voting stay free. Enrollment = explicit consent to public ranking.
// Enrolled teams keep their Elo when unenrolled (they just leave the pool).

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Swords, Lock, Trophy } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useSubscription } from '../../contexts/SubscriptionContext';
import { canAccessFeature } from '../../utils/featureAccess';
import { buildEnrollableTeams } from '../../utils/arenaSnapshot';
import { getMyArenaTeams, enrollTeam, unenrollTeam, ARENA_AVAILABLE } from '../../utils/arenaClient';
import css from '../Arena.module.css';

const keyOf = (entryId, platform) => `${entryId}::${platform}`;

function platformLabel(p) { return p === 'draftkings' ? 'DraftKings' : 'Underdog'; }

export default function ArenaMyTeams({ rosterData }) {
  const { user } = useAuth();
  const { tier, openPlanPicker } = useSubscription();
  const canEnroll = canAccessFeature(tier, 'arena_enroll');

  const teams = useMemo(() => buildEnrollableTeams(rosterData), [rosterData]);
  const [arenaRows, setArenaRows] = useState(null);
  const [busy, setBusy] = useState({});
  const [error, setError] = useState(null);

  const refresh = useCallback(async () => {
    if (!user || !canEnroll || !ARENA_AVAILABLE) return;
    try {
      const rows = await getMyArenaTeams();
      const map = {};
      rows.forEach((r) => { map[keyOf(r.entry_id, r.platform)] = r; });
      setArenaRows(map);
    } catch {
      setError('Couldn’t load your Arena status.');
    }
  }, [user, canEnroll]);

  useEffect(() => { refresh(); }, [refresh]);

  const toggle = useCallback(async (team) => {
    const k = keyOf(team.entryId, team.platform);
    setBusy((b) => ({ ...b, [k]: true }));
    setError(null);
    try {
      const cur = arenaRows?.[k];
      if (cur?.enrolled) {
        await unenrollTeam({ entryId: team.entryId, platform: team.platform });
      } else {
        await enrollTeam({ entryId: team.entryId, platform: team.platform, snapshot: team.snapshot });
      }
      await refresh();
    } catch {
      setError('That didn’t go through. Try again.');
    } finally {
      setBusy((b) => ({ ...b, [k]: false }));
    }
  }, [arenaRows, refresh]);

  // ── Gates ────────────────────────────────────────────────────────────────
  if (!ARENA_AVAILABLE) {
    return (
      <div className={css.stateBox}>
        <Swords size={32} className={css.stateIcon} />
        <h3>The Arena is warming up</h3>
        <p>Team entry isn’t available here yet. Check back once the Arena is live.</p>
      </div>
    );
  }
  if (!user) {
    return (
      <div className={css.stateBox}>
        <Lock size={32} className={css.stateIcon} />
        <h3>Sign in to enter your teams</h3>
        <p>Voting is free for everyone. To put your own teams on the leaderboard, sign in with the account button up top, then go Pro.</p>
      </div>
    );
  }
  if (!canEnroll) {
    return (
      <div className={css.stateBox}>
        <Trophy size={32} className={css.stateIcon} />
        <h3>Entering teams is a Pro feature</h3>
        <p>Get ranked against the field: enter your best-ball teams and climb the public leaderboard. Voting stays free.</p>
        <button className={css.primaryBtn} onClick={openPlanPicker}>Upgrade to Pro</button>
      </div>
    );
  }
  if (teams.length === 0) {
    return (
      <div className={css.stateBox}>
        <Swords size={32} className={css.stateIcon} />
        <h3>No teams to enter yet</h3>
        <p>Sync your portfolio with the Chrome extension, then come back to enter your teams in the Arena.</p>
      </div>
    );
  }

  const enrolledCount = arenaRows
    ? Object.values(arenaRows).filter((r) => r.enrolled).length
    : 0;

  return (
    <div className={css.myTeams}>
      <div className={css.myIntro}>
        <p>Enter a team to add it to the blind vote pool and the public leaderboard. Owners are never shown while voting. {enrolledCount > 0 && <strong>{enrolledCount} entered.</strong>}</p>
      </div>
      {error && <p className={css.errorNote}>{error}</p>}
      <ul className={css.myList}>
        {teams.map((team) => {
          const k = keyOf(team.entryId, team.platform);
          const row = arenaRows?.[k];
          const enrolled = !!row?.enrolled;
          const isDk = team.platform === 'draftkings';
          return (
            <li key={k} className={css.myRow}>
              <div className={css.myInfo}>
                <span
                  className={css.platformChip}
                  style={{
                    color: isDk ? 'var(--platform-dk)' : 'var(--platform-ud)',
                    background: isDk ? 'var(--platform-dk-bg)' : 'var(--platform-ud-bg)',
                  }}
                >
                  {platformLabel(team.platform)}
                </span>
                <span className={css.myTitle}>{team.tournamentTitle || team.slateTitle || 'Best-ball team'}</span>
                <span className={css.myMeta}>{team.count} picks</span>
              </div>
              <div className={css.myRight}>
                {enrolled && row && (
                  <span className={css.myStandings} title="Hidden Elo, wins–losses">
                    {Math.round(row.elo)} Elo · {row.wins}–{row.losses}{row.provisional ? ' · new' : ''}
                  </span>
                )}
                <button
                  className={enrolled ? css.enrolledBtn : css.enrollBtn}
                  onClick={() => toggle(team)}
                  disabled={!!busy[k]}
                >
                  {busy[k] ? '…' : enrolled ? 'Entered ✓' : 'Enter'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
