// ArenaVote — the blind head-to-head voting screen (ADR-013 / TASK-282, redesigned
// in TASK-297 as a "tale of the tape" prizefight scorecard). Free + guest-accessible.
// Shows two anonymized contenders flanking a central comparison spine, takes a pick,
// reveals the Elo deltas, and auto-advances. The next matchup is PREFETCHED during the
// reveal window so advancing feels instant; a skeleton (not a spinner) covers cold loads.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Swords, Trophy, RefreshCw, ArrowRight, Gavel, Zap } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { getPairing, submitVote } from '../../utils/arenaClient';
import { enrichSnapshotCLV } from '../../utils/arenaSnapshot';
import { compactTournamentName } from '../../utils/helpers';
import ArenaRosterCard from './ArenaRosterCard';
import ArenaTape from './ArenaTape';
import css from '../Arena.module.css';

const REVEAL_MS = 1500;

// Session scorecard (TASK-302): votes judged + upset picks this browser session.
// Momentum feedback only — the durable record lives server-side in arena_matches.
const SESSION_STATS_KEY = 'bbe_arena_session_stats';

function readSessionStats() {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_STATS_KEY));
    if (s && Number.isFinite(s.judged) && Number.isFinite(s.upsets)) return s;
  } catch { /* fresh session */ }
  return { judged: 0, upsets: 0 };
}

function platformLabel(platform) {
  return platform === 'draftkings' ? 'DraftKings' : 'Underdog';
}

// Shared context above the tape. Platform is always shared (pairing enforces it); the
// tournament/slate is shown only when both contenders share it (else it'd mislead).
function ContextBar({ pairing }) {
  const a = pairing?.team_a?.display_snapshot;
  const b = pairing?.team_b?.display_snapshot;
  const platform = a?.platform || b?.platform;
  const sharedTournament = a?.tournamentTitle && a.tournamentTitle === b?.tournamentTitle
    ? a.tournamentTitle : null;
  const sharedSlate = a?.slateTitle && a.slateTitle === b?.slateTitle ? a.slateTitle : null;
  const context = sharedTournament ? compactTournamentName(sharedTournament) : sharedSlate;
  return (
    <div className={css.contextBar}>
      <span className={css.ctxBrand}><Swords size={13} /> Blind Matchup</span>
      {platform && <span className={css.ctxDot} />}
      {platform && <span className={css.ctxPlatform}>{platformLabel(platform)}</span>}
      {context && <><span className={css.ctxDot} /><span className={css.ctxSlate} title={sharedTournament || sharedSlate}>{context}</span></>}
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className={`${css.card} ${css.skel}`} aria-hidden="true">
      <div className={css.skelHead} />
      <div className={css.skelMeta} />
      {Array.from({ length: 9 }).map((_, i) => <div key={i} className={css.skelRow} />)}
    </div>
  );
}

function MatchupSkeleton() {
  return (
    <div className={css.arena}>
      <div className={css.contextBar}>
        <span className={css.ctxBrand}><Swords size={13} /> Finding a matchup…</span>
      </div>
      <div className={css.matchup}>
        <div className={css.sideCol}><SkeletonCard /><div className={css.skelBtn} /></div>
        <div className={css.tapeCol}><div className={css.skelVs} /></div>
        <div className={css.sideCol}><SkeletonCard /><div className={css.skelBtn} /></div>
      </div>
    </div>
  );
}

export default function ArenaVote({ onGoToMyTeams, adpLookup }) {
  const { user } = useAuth();
  const isGuest = !user;
  const [status, setStatus] = useState('loading'); // loading|voting|revealed|empty|unavailable|rate_limited|error
  const [pairing, setPairing] = useState(null);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [stats, setStats] = useState(readSessionStats);
  const advanceTimer = useRef(null);
  const nextRef = useRef(null);        // a prefetched pairing, ready for instant advance
  const prefetching = useRef(false);

  // Warm the next matchup in the background. Pairing requests mutate no state, so this
  // is safe; it just trades one extra request for an instant-feeling advance.
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

  const fetchNext = useCallback(async () => {
    clearTimeout(advanceTimer.current);
    setResult(null);

    // Instant advance when a prefetched matchup is ready — no spinner, no wait.
    if (nextRef.current) {
      const p = nextRef.current;
      nextRef.current = null;
      setPairing(p);
      setStatus('voting');
      prefetch();
      return;
    }

    setStatus('loading');
    const r = await getPairing();
    if (r.pairing) {
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
    if (submitting || status !== 'voting' || !pairing) return;
    setSubmitting(true);
    try {
      const data = await submitVote({ token: pairing.token, winner });
      // Upset = the picked team carried the LOWER pre-vote Elo. Ratings only come
      // back with the vote response, so blindness holds until after the pick.
      const pickedBefore = winner === 'a' ? data?.team_a?.before : data?.team_b?.before;
      const otherBefore = winner === 'a' ? data?.team_b?.before : data?.team_a?.before;
      const upset = Number.isFinite(pickedBefore) && Number.isFinite(otherBefore) &&
        pickedBefore < otherBefore;
      setResult({ winner, upset, ...data });
      setStats((s) => {
        const next = { judged: s.judged + 1, upsets: s.upsets + (upset ? 1 : 0) };
        try { sessionStorage.setItem(SESSION_STATS_KEY, JSON.stringify(next)); } catch { /* ignore */ }
        return next;
      });
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

  // Keyboard voting (TASK-302): ← picks red/left, → picks blue/right, S/↓ skips,
  // Space/Enter advances during the reveal. Inert in every other state.
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
      if (status === 'voting' && !submitting) {
        if (e.key === 'ArrowLeft') { e.preventDefault(); vote('a'); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); vote('b'); }
        else if (e.key === 's' || e.key === 'S' || e.key === 'ArrowDown') { e.preventDefault(); fetchNext(); }
      } else if (status === 'revealed') {
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); fetchNext(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [status, submitting, vote, fetchNext]);

  // ── Non-matchup states ──────────────────────────────────────────────────
  if (status === 'loading') return <MatchupSkeleton />;
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

  // Recompute CLV against the viewer's ADP — the stored snapshot's CLV may be stale
  // or absent (snapshots are frozen insert-new-only). This is what the screen shows.
  const snapA = enrichSnapshotCLV(pairing.team_a.display_snapshot, adpLookup);
  const snapB = enrichSnapshotCLV(pairing.team_b.display_snapshot, adpLookup);

  return (
    <div className={css.arena}>
      <div className={css.topRow}>
        <span className={css.topSpacer} aria-hidden="true" />
        <ContextBar pairing={pairing} />
        <div className={css.scoreStrip} aria-label="Session scorecard">
          <span className={css.statChip} title="Matchups you've judged this session">
            <Gavel size={12} /> <strong>{stats.judged}</strong> judged
          </span>
          <span className={css.statChip} title="Times you picked the lower-rated team">
            <Zap size={12} /> <strong>{stats.upsets}</strong> upsets
          </span>
        </div>
      </div>

      <div className={css.matchup} key={pairing.pairing_id}>
        <div className={css.sideCol}>
          <ArenaRosterCard
            snapshot={snapA}
            corner="red"
            cornerLabel="Red Corner"
            outcome={outcome('a')}
            delta={revealed ? result?.team_a?.delta : null}
            stamp={revealed && result?.upset && result?.winner === 'a' ? 'Upset' : null}
          />
          <button
            className={`${css.pickBtn} ${css.pickRed}`}
            onClick={() => vote('a')}
            disabled={revealed || submitting}
          >
            {revealed && result?.winner === 'a' ? 'Your pick ✓' : 'Pick Red'}
          </button>
        </div>

        <div className={css.tapeCol}>
          <ArenaTape a={snapA} b={snapB} active={revealed} />
        </div>

        <div className={css.sideCol}>
          <ArenaRosterCard
            snapshot={snapB}
            corner="blue"
            cornerLabel="Blue Corner"
            outcome={outcome('b')}
            delta={revealed ? result?.team_b?.delta : null}
            stamp={revealed && result?.upset && result?.winner === 'b' ? 'Upset' : null}
          />
          <button
            className={`${css.pickBtn} ${css.pickBlue}`}
            onClick={() => vote('b')}
            disabled={revealed || submitting}
          >
            {revealed && result?.winner === 'b' ? 'Your pick ✓' : 'Pick Blue'}
          </button>
        </div>
      </div>

      <div className={css.skipRow}>
        {!revealed ? (
          <button className={css.skipBtn} onClick={fetchNext} disabled={submitting}>
            Skip <ArrowRight size={15} />
          </button>
        ) : (
          <div className={css.advanceRow}>
            {guestCapped ? (
              <p className={css.revealNote}>
                That’s your last counted guest vote — keep voting freely, but new picks no longer move the rankings.
                {onGoToMyTeams && <> <button className={css.linkBtn} onClick={onGoToMyTeams}>Enter your own teams</button></>}
              </p>
            ) : (
              <p className={css.revealNote}>
                {result?.upset ? 'Upset pick — the ratings had it the other way.' : 'Vote counted — next up.'}
              </p>
            )}
            <span className={css.advanceTrack}>
              <span className={css.advanceFill} style={{ animationDuration: `${REVEAL_MS}ms` }} />
            </span>
            <button className={css.nextBtn} onClick={fetchNext}>
              Next <ArrowRight size={14} />
            </button>
          </div>
        )}
      </div>

      <div className={css.kbdRow} aria-hidden="true">
        <span><kbd>←</kbd> Pick Red</span>
        <span>Pick Blue <kbd>→</kbd></span>
        <span><kbd>S</kbd> Skip</span>
        <span><kbd>Space</kbd> Next</span>
      </div>
    </div>
  );
}
