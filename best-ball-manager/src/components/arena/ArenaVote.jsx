// ArenaVote — the blind head-to-head voting screen (ADR-013 / TASK-282, redesigned
// in TASK-297 as a "tale of the tape" prizefight scorecard). Free + guest-accessible.
// Shows two anonymized contenders flanking a central comparison spine, takes a pick,
// reveals the Elo deltas, and auto-advances. The next matchup is PREFETCHED during the
// reveal window so advancing feels instant; a skeleton (not a spinner) covers cold loads.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Swords, Trophy, RefreshCw, ArrowRight, Gavel, Zap, Link2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import useMediaQuery from '../../hooks/useMediaQuery';
import { getPairing, submitVote } from '../../utils/arenaClient';
import { enrichSnapshotDisplay } from '../../utils/arenaSnapshot';
import { compactTournamentName } from '../../utils/helpers';
import ArenaRosterCard from './ArenaRosterCard';
import ArenaTape from './ArenaTape';
import css from '../Arena.module.css';

const REVEAL_MS = 2000;

// Session scorecard (TASK-302): votes judged + upset picks this browser session.
// Momentum feedback only — the durable record lives server-side in arena_matches.
const SESSION_STATS_KEY = 'bbe_arena_session_stats';

// Scouting-lens preferences persist across sessions — a voter who scouts by
// projections shouldn't have to re-flip the lens every visit.
const LENS_KEY = 'bbe_arena_lens';
const STACKS_KEY = 'bbe_arena_stacks';

function readLens() {
  try { if (localStorage.getItem(LENS_KEY) === 'proj') return 'proj'; } catch { /* default */ }
  return 'clv';
}

function readShowStacks() {
  try { return localStorage.getItem(STACKS_KEY) !== 'off'; } catch { return true; }
}

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
      {Array.from({ length: 16 }).map((_, i) => <div key={i} className={css.skelRow} />)}
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
        <div className={css.sideCol}><SkeletonCard /></div>
        <div className={css.tapeCol}><div className={css.skelVs} /></div>
        <div className={css.sideCol}><SkeletonCard /></div>
      </div>
    </div>
  );
}

export default function ArenaVote({ onGoToMyTeams, adpLookup, projLookup }) {
  const { user } = useAuth();
  const isGuest = !user;
  // <900px swaps the three-column matchup for the swipeable contender deck
  // (TASK-308); matches the stylesheet's 899px breakpoint.
  const { isDesktop } = useMediaQuery();
  const [status, setStatus] = useState('loading'); // loading|voting|revealed|empty|unavailable|rate_limited|error
  const [pairing, setPairing] = useState(null);
  const [result, setResult] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [stats, setStats] = useState(readSessionStats);
  const [lens, setLens] = useState(readLens);
  const [showStacks, setShowStacks] = useState(readShowStacks);
  // Mobile deck (TASK-308): which contender card is snapped into view.
  const [deckIndex, setDeckIndex] = useState(0);
  const deckRef = useRef(null);
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

  // Scouting lens (this pass): which stat rides each roster row (CLV vs projected
  // points), plus the team-color stack layer. Both persist across sessions.
  const toggleLens = useCallback(() => {
    setLens((l) => {
      const next = l === 'clv' ? 'proj' : 'clv';
      try { localStorage.setItem(LENS_KEY, next); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const setLensTo = useCallback((next) => {
    setLens(next);
    try { localStorage.setItem(LENS_KEY, next); } catch { /* ignore */ }
  }, []);
  const toggleStacks = useCallback(() => {
    setShowStacks((s) => {
      try { localStorage.setItem(STACKS_KEY, s ? 'off' : 'on'); } catch { /* ignore */ }
      return !s;
    });
  }, []);

  // Mobile contender deck (TASK-308): the corner toggle and the deck stay in sync
  // both ways — swiping updates the toggle, tapping the toggle scrolls the deck.
  // With exactly two items a midpoint test is sturdier than stride math.
  const scrollDeckTo = useCallback((idx) => {
    const el = deckRef.current;
    if (!el) return;
    const left = idx === 0 ? 0 : el.scrollWidth - el.clientWidth;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollTo({ left, behavior: reduced ? 'auto' : 'smooth' });
  }, []);
  const onDeckScroll = useCallback(() => {
    const el = deckRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    setDeckIndex(el.scrollLeft > max / 2 ? 1 : 0);
  }, []);

  // A new pairing remounts the deck (scrollLeft resets to 0), but this state
  // lives above the keyed node — reset it too so the toggle starts back on Red.
  useEffect(() => { setDeckIndex(0); }, [pairing?.pairing_id]);

  // Reveal payoff on mobile: bring the picked card into view so its Elo delta
  // and stamp are actually visible.
  useEffect(() => {
    if (status === 'revealed' && result && !isDesktop) {
      scrollDeckTo(result.winner === 'a' ? 0 : 1);
    }
  }, [status, result, isDesktop, scrollDeckTo]);

  // Keyboard voting (TASK-302): ← picks red/left, → picks blue/right, S/↓ skips,
  // Space/Enter advances during the reveal, L flips the scouting lens. Inert in
  // every other state.
  useEffect(() => {
    const onKey = (e) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
      if (e.key === 'l' || e.key === 'L') { e.preventDefault(); toggleLens(); return; }
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
  }, [status, submitting, vote, fetchNext, toggleLens]);

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

  // Recompute CLV + projected points against the viewer's data — the stored
  // snapshot is frozen insert-new-only, so both are derived fresh at display time.
  const snapA = enrichSnapshotDisplay(pairing.team_a.display_snapshot, adpLookup, projLookup);
  const snapB = enrichSnapshotDisplay(pairing.team_b.display_snapshot, adpLookup, projLookup);
  // One proj-bar scale across the whole matchup so bars compare between cards.
  const maxProj = Math.max(
    0,
    ...(snapA?.players || []).map((p) => p.proj || 0),
    ...(snapB?.players || []).map((p) => p.proj || 0),
  ) || null;

  // Reveal footer — shared verbatim by the desktop skip row and the mobile
  // pick dock so the two layouts can't drift.
  const advanceContent = (
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
  );

  return (
    <div className={css.arena}>
      <div className={css.topRow}>
        <div className={css.lensStrip} role="group" aria-label="Scouting lens">
          <span className={css.lensSeg}>
            <button
              className={`${css.lensBtn} ${lens === 'clv' ? css.lensActive : ''}`}
              onClick={() => setLensTo('clv')}
              title="Closing line value per pick (L to flip)"
            >
              CLV
            </button>
            <button
              className={`${css.lensBtn} ${lens === 'proj' ? css.lensActive : ''}`}
              onClick={() => setLensTo('proj')}
              title="Projected season points per player (L to flip)"
            >
              Proj
            </button>
          </span>
          <button
            className={`${css.lensBtn} ${css.lensToggle} ${showStacks ? css.lensActive : ''}`}
            onClick={toggleStacks}
            aria-pressed={showStacks}
            title="Paint stacked players in their NFL team's colors"
          >
            <Link2 size={11} /> Stacks
          </button>
        </div>
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

      {isDesktop ? (
        <>
          <div className={css.matchup} key={pairing.pairing_id}>
            <div className={css.sideCol}>
              <ArenaRosterCard
                snapshot={snapA}
                corner="red"
                cornerLabel="Red Corner"
                outcome={outcome('a')}
                delta={revealed ? result?.team_a?.delta : null}
                stamp={revealed && result?.upset && result?.winner === 'a' ? 'Upset' : null}
                lens={lens}
                showStacks={showStacks}
                maxProj={maxProj}
                pickable={!revealed && !submitting}
                picked={revealed && result?.winner === 'a'}
                onPick={() => vote('a')}
              />
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
                lens={lens}
                showStacks={showStacks}
                maxProj={maxProj}
                pickable={!revealed && !submitting}
                picked={revealed && result?.winner === 'b'}
                onPick={() => vote('b')}
              />
            </div>
          </div>

          <div className={css.skipRow}>
            {!revealed ? (
              <button className={css.skipBtn} onClick={fetchNext} disabled={submitting}>
                Skip <ArrowRight size={15} />
              </button>
            ) : advanceContent}
          </div>

          <div className={css.kbdRow} aria-hidden="true">
            <span><kbd>←</kbd> Pick Red</span>
            <span>Pick Blue <kbd>→</kbd></span>
            <span><kbd>S</kbd> Skip</span>
            <span><kbd>Space</kbd> Next</span>
            <span><kbd>L</kbd> Lens</span>
          </div>
        </>
      ) : (
        /* Mobile (TASK-308): tape up top for the at-a-glance comparison, then a
           snap-scrolled contender deck (the other card's edge peeks in), a corner
           toggle synced to the deck, and a sticky pick dock so voting never
           requires scrolling. */
        <>
          <div className={css.mobileMatchup} key={pairing.pairing_id}>
            <div className={css.mobileTape}>
              <ArenaTape a={snapA} b={snapB} active={revealed} />
            </div>
            <div className={css.cornerToggle} role="group" aria-label="Jump to contender">
              <button
                className={`${css.cornerTab} ${css.cornerTabRed} ${deckIndex === 0 ? css.cornerTabActive : ''}`}
                aria-pressed={deckIndex === 0}
                onClick={() => scrollDeckTo(0)}
              >
                Red Corner
              </button>
              <button
                className={`${css.cornerTab} ${css.cornerTabBlue} ${deckIndex === 1 ? css.cornerTabActive : ''}`}
                aria-pressed={deckIndex === 1}
                onClick={() => scrollDeckTo(1)}
              >
                Blue Corner
              </button>
            </div>
            <div className={css.deck} ref={deckRef} onScroll={onDeckScroll} aria-label="Contender rosters">
              <div className={css.deckItem}>
                <ArenaRosterCard
                  snapshot={snapA}
                  corner="red"
                  cornerLabel="Red Corner"
                  outcome={outcome('a')}
                  delta={revealed ? result?.team_a?.delta : null}
                  stamp={revealed && result?.upset && result?.winner === 'a' ? 'Upset' : null}
                  lens={lens}
                  showStacks={showStacks}
                  maxProj={maxProj}
                />
              </div>
              <div className={css.deckItem}>
                <ArenaRosterCard
                  snapshot={snapB}
                  corner="blue"
                  cornerLabel="Blue Corner"
                  outcome={outcome('b')}
                  delta={revealed ? result?.team_b?.delta : null}
                  stamp={revealed && result?.upset && result?.winner === 'b' ? 'Upset' : null}
                  lens={lens}
                  showStacks={showStacks}
                  maxProj={maxProj}
                />
              </div>
            </div>
          </div>

          <div className={css.pickDock}>
            {!revealed ? (
              <>
                <div className={css.dockPicks}>
                  <button
                    className={`${css.pickBtn} ${css.pickRed}`}
                    onClick={() => vote('a')}
                    disabled={submitting}
                  >
                    Pick Red
                  </button>
                  <button
                    className={`${css.pickBtn} ${css.pickBlue}`}
                    onClick={() => vote('b')}
                    disabled={submitting}
                  >
                    Pick Blue
                  </button>
                </div>
                <div className={css.skipRow}>
                  <button className={css.skipBtn} onClick={fetchNext} disabled={submitting}>
                    Skip <ArrowRight size={15} />
                  </button>
                </div>
              </>
            ) : advanceContent}
          </div>
        </>
      )}
    </div>
  );
}
