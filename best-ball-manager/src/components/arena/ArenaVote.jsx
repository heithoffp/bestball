// ArenaVote — the blind head-to-head voting screen (ADR-013 / TASK-282).
// Free + guest-accessible. Shows two anonymized rosters, takes a pick, reveals
// the Elo deltas instantly, then auto-advances to the next matchup.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Swords, Trophy, RefreshCw, ArrowRight } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getPairing, submitVote } from '../../utils/arenaClient';
import ArenaRosterCard from './ArenaRosterCard';
import css from '../Arena.module.css';

const REVEAL_MS = 2000;

export default function ArenaVote({ onGoToMyTeams }) {
  const { user } = useAuth();
  const isGuest = !user;
  const [status, setStatus] = useState('loading'); // loading|voting|revealed|empty|unavailable|rate_limited|error
  const [pairing, setPairing] = useState(null);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const advanceTimer = useRef(null);

  const fetchNext = useCallback(async () => {
    clearTimeout(advanceTimer.current);
    setResult(null);
    setStatus('loading');
    const r = await getPairing();
    if (r.pairing) {
      setPairing(r.pairing);
      setStatus('voting');
    } else {
      const map = { insufficient_pool: 'empty', unavailable: 'unavailable', rate_limited: 'rate_limited' };
      setStatus(map[r.reason] || 'error');
    }
  }, []);

  useEffect(() => {
    fetchNext();
    return () => clearTimeout(advanceTimer.current);
  }, [fetchNext]);

  const vote = useCallback(async (winner) => {
    if (submitting || status !== 'voting' || !pairing) return;
    setSubmitting(true);
    try {
      const data = await submitVote({ token: pairing.token, winner });
      setResult({ winner, ...data });
      setStatus('revealed');
      advanceTimer.current = setTimeout(fetchNext, REVEAL_MS);
    } catch (e) {
      if (e?.data?.error === 'already_voted') {
        fetchNext();
      } else if (e?.status === 429) {
        setStatus('rate_limited');
      } else {
        setStatus('error');
      }
    } finally {
      setSubmitting(false);
    }
  }, [submitting, status, pairing, fetchNext]);

  // ── Non-matchup states ──────────────────────────────────────────────────
  if (status === 'loading') {
    return (
      <div className={css.stateBox}>
        <RefreshCw className={css.stateSpin} size={28} />
        <p>Finding a matchup…</p>
      </div>
    );
  }
  if (status === 'unavailable') {
    return (
      <div className={css.stateBox}>
        <Swords size={32} className={css.stateIcon} />
        <h3>The Arena is warming up</h3>
        <p>Head-to-head voting isn’t available here yet. Check back once the Arena is live.</p>
      </div>
    );
  }
  if (status === 'empty') {
    return (
      <div className={css.stateBox}>
        <Trophy size={32} className={css.stateIcon} />
        <h3>No matchups yet</h3>
        <p>Not enough teams have entered the Arena. Be among the first — enter your own teams and start the competition.</p>
        {onGoToMyTeams && (
          <button className={css.primaryBtn} onClick={onGoToMyTeams}>Enter your teams</button>
        )}
      </div>
    );
  }
  if (status === 'rate_limited') {
    return (
      <div className={css.stateBox}>
        <RefreshCw size={32} className={css.stateIcon} />
        <h3>Slow down a sec</h3>
        <p>You’re voting quickly. Take a breath, then grab the next matchup.</p>
        <button className={css.primaryBtn} onClick={fetchNext}>Next matchup</button>
      </div>
    );
  }
  if (status === 'error') {
    return (
      <div className={css.stateBox}>
        <RefreshCw size={32} className={css.stateIcon} />
        <h3>Couldn’t load a matchup</h3>
        <p>Something went wrong reaching the Arena. Try again.</p>
        <button className={css.primaryBtn} onClick={fetchNext}>Retry</button>
      </div>
    );
  }

  // ── Matchup (voting + revealed) ─────────────────────────────────────────
  const revealed = status === 'revealed';
  const outcome = (side) => (!revealed ? null : result?.winner === side ? 'win' : 'loss');
  const guestCapped = revealed && result && result.counted === false && isGuest;

  return (
    <div className={css.arena}>
      <div className={css.matchup}>
        <div className={css.sideCol}>
          <ArenaRosterCard
            snapshot={pairing.team_a.display_snapshot}
            sideLabel="Team A"
            outcome={outcome('a')}
            delta={revealed ? result?.team_a?.delta : null}
          />
          <button
            className={css.pickBtn}
            onClick={() => vote('a')}
            disabled={revealed || submitting}
          >
            {revealed && result?.winner === 'a' ? 'Your pick' : 'Pick this team'}
          </button>
        </div>

        <div className={css.vsCol}>
          <div className={`${css.vsMedallion} ${revealed ? css.vsActive : ''}`}>VS</div>
        </div>

        <div className={css.sideCol}>
          <ArenaRosterCard
            snapshot={pairing.team_b.display_snapshot}
            sideLabel="Team B"
            outcome={outcome('b')}
            delta={revealed ? result?.team_b?.delta : null}
          />
          <button
            className={css.pickBtn}
            onClick={() => vote('b')}
            disabled={revealed || submitting}
          >
            {revealed && result?.winner === 'b' ? 'Your pick' : 'Pick this team'}
          </button>
        </div>
      </div>

      <div className={css.skipRow}>
        {!revealed ? (
          <button className={css.skipBtn} onClick={fetchNext} disabled={submitting}>
            Skip <ArrowRight size={15} />
          </button>
        ) : guestCapped ? (
          <p className={css.revealNote}>
            That’s your last counted guest vote — keep voting freely, but new picks no longer move the rankings.
            {onGoToMyTeams && <> <button className={css.linkBtn} onClick={onGoToMyTeams}>Enter your own teams</button></>}
          </p>
        ) : (
          <p className={css.revealNote}>Vote counted — next matchup loading…</p>
        )}
      </div>
    </div>
  );
}
