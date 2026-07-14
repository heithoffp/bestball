// sessionEngine.js — the monotonic pick ledger + derived draft state (ADR-021).
// Observations from underdogParser merge here; everything the assistant and the
// Live Activity show is *derived*: remaining = pool − ledger − inferred-gone,
// picks-until-turn = snake math from the (confirmed or inferred) slot.
// Pure JS — no React Native imports (Node fixture tests run this directly).

import {
  roundForOverall, pickInRoundForOverall, slotForOverall, nextOverallForSlot, overallsForSlot,
} from './snake.js';
import { usernameMatches, matchAbbrevPlayer } from './playerMatcher.js';

/**
 * @param {object} cfg
 *   pool         required, from playerMatcher.buildPool()
 *   teams        default 12
 *   rounds       default 18
 *   slot         1..teams, or null -> anchored from the user's drafter card
 *                (username evidence), falling back to "UP IN N PICKS" inference
 *   username     the user's UD username, or null -> auto-learned from the lobby
 *                (only named card among "Filled" seats) or from the on-clock
 *                card while the header reads "Your pick"
 *   rankMap      Map(canonical -> rank) from the user's UD custom rankings
 *   exposureMap  Map(canonical -> global exposure %) from the synced portfolio
 */
export function createDraftSession(cfg) {
  const teams = cfg.teams || 12;
  const rounds = cfg.rounds || 18;
  const pool = cfg.pool;
  const rankMap = cfg.rankMap || new Map();
  const exposureMap = cfg.exposureMap || new Map();

  const state = {
    manualSlot: cfg.slot || null,
    anchoredSlot: null,       // pinned from the user's own drafter card (TASK-328)
    anchorCandidate: null,    // a contradicting anchor needs two consistent reads
    inferredSlot: null,       // legacy ticker-math fallback
    learnedUsername: cfg.username || null,
    usernameCandidate: null,  // a contradicting learn needs two consistent reads
    usernameSlots: new Map(), // username -> slot, from labeled drafter cards
    tallies: new Map(),       // username -> { QB, RB, WR, TE } roster tally
    slotConflict: false,
    currentPick: 1,          // monotonic floor; only ratchets upward
    observedStartPick: null, // pick position the first time we saw real evidence
    explicitPicksUntil: null, // last header reading (may go stale between syncs)
    ledger: new Map(),        // overall -> { player, round, pickInRound, score, raw }
    inferredGone: new Set(),  // canonicals implied gone by Players-tab availability
    queue: new Set(),         // canonicals seen on the Queue tab
    wasOnClock: false,        // previous ingest's header said "Your pick"
    lastConfirmKey: null,     // dedupes the lingering pick-confirmation card
    syncCount: 0,
    lastObs: null,
  };

  const slot = () => state.manualSlot || state.anchoredSlot || state.inferredSlot;

  function ratchetCurrentPick(candidate) {
    if (Number.isFinite(candidate) && candidate > state.currentPick) {
      state.currentPick = Math.min(candidate, teams * rounds + 1);
    }
  }

  /** Learn/confirm the user's username; a contradiction needs two reads. */
  function learnUsername(name) {
    if (!name) return;
    if (!state.learnedUsername) {
      state.learnedUsername = name;
      state.usernameCandidate = null;
    } else if (usernameMatches(state.learnedUsername, name)) {
      state.usernameCandidate = null;
    } else if (state.usernameCandidate && usernameMatches(state.usernameCandidate, name)) {
      state.learnedUsername = name;
      state.usernameCandidate = null;
    } else {
      state.usernameCandidate = name;
    }
  }

  /**
   * Pin/confirm the anchored slot. Re-pinning an established anchor takes
   * three consecutive contradicting reads — OCR pairing glitches produce
   * short runs of a wrong slot, while a genuinely wrong anchor keeps
   * contradicting until it flips.
   */
  function proposeAnchor(candidate) {
    if (!(candidate >= 1 && candidate <= teams)) return;
    if (state.anchoredSlot == null || state.anchoredSlot === candidate) {
      state.anchoredSlot = candidate;
      state.anchorCandidate = null;
    } else if (state.anchorCandidate && state.anchorCandidate.slot === candidate) {
      state.anchorCandidate.count++;
      if (state.anchorCandidate.count >= 3) {
        state.anchoredSlot = candidate;
        state.anchorCandidate = null;
      }
    } else {
      state.anchorCandidate = { slot: candidate, count: 1 };
    }
  }

  function refreshSlotConflict() {
    const evidence = state.anchoredSlot || state.inferredSlot;
    state.slotConflict = !!(state.manualSlot && evidence && evidence !== state.manualSlot);
  }

  /** Merge one parsed observation. Returns a summary for the sync log. */
  function ingest(obs) {
    if (!obs) return null;
    // Our own Live Activity captured over the draft room — fully inert, no
    // state mutation at all (its target rows would resurrect drafted players).
    if (obs.kind === 'self') {
      return {
        kind: 'self', newBoardPicks: 0, rowsMatched: 0, picksUntil: null,
        slotInferred: null, slotAnchored: null, myPickEvent: false, confirmPick: null,
      };
    }
    state.syncCount++;
    state.lastObs = obs;
    const summary = {
      kind: obs.kind,
      newBoardPicks: 0,
      rowsMatched: obs.rows.length,
      picksUntil: obs.picksUntil,
      slotInferred: null,
      slotAnchored: null,
      myPickEvent: false,
      confirmPick: null,
    };

    // Board cells are the highest-fidelity source: idempotent ledger appends.
    for (const bp of obs.boardPicks) {
      const existing = state.ledger.get(bp.overall);
      if (!existing || bp.score > existing.score) {
        if (!existing) summary.newBoardPicks++;
        state.ledger.set(bp.overall, {
          player: bp.player, round: bp.round, pickInRound: bp.pickInRound,
          score: bp.score, raw: bp.raw,
        });
      }
    }
    // Only board-grade entries ratchet the pick: event entries (confirmation
    // cards) are placed AT currentPick−1, so feeding them back would turn any
    // over-ratchet into a self-reinforcing climb.
    const boardOveralls = [...state.ledger.entries()]
      .filter(([, e]) => e.src !== 'event')
      .map(([o]) => o);
    if (boardOveralls.length) {
      ratchetCurrentPick(Math.max(...boardOveralls) + 1);
    }

    // Drafter cards show each opponent's *next* pick -> current <= min visible − 1.
    // Valid ONLY when the on-clock card is visible in the same frame: that
    // proves the carousel is auto-tracking, so the labeled cards are the ones
    // immediately after the current pick. A hand-scrolled carousel (lobby
    // scrub, or the user browsing seats) shows arbitrary future cards whose
    // minimum says nothing about how many picks have happened.
    //
    // This is an UPPER bound — OCR routinely misses the card nearest the
    // clock, inflating the minimum by a pick or two. With an anchored slot and
    // a legible ticker, the ticker is the exact user-relative source, so the
    // bound only informs rung selection below; it ratchets directly only when
    // nothing better exists in the frame (headerless, or slot not anchored —
    // the legacy inference path derives the slot from currentPick + N and
    // needs the direct ratchet).
    const carouselTracking = (obs.drafterCards || []).some(c => c.onClock);
    const upcomingFloor = (obs.upcomingOveralls.length && carouselTracking && !obs.lobby)
      ? Math.min(...obs.upcomingOveralls) - 1 : 0;
    const headerPicksUntil = obs.picksUntil ?? obs.picksAwayDivider;
    if (upcomingFloor > 0 && (!state.anchoredSlot || headerPicksUntil == null)) {
      ratchetCurrentPick(upcomingFloor);
    }

    // ---- Drafter cards: learn the username, anchor the slot, harvest tallies.
    const cards = obs.drafterCards || [];
    // Early lobby: the only named card among "Filled" placeholder seats is ours.
    if (obs.lobby && obs.filledCount >= 1 && (obs.lobbyUsernames || []).length === 1) {
      learnUsername(obs.lobbyUsernames[0]);
    }
    // "Your pick" header: the (single) on-clock card is the user's.
    if (obs.onClock) {
      const onClockCards = cards.filter(c => c.onClock);
      if (onClockCards.length === 1) learnUsername(onClockCards[0].username);
    }
    for (const c of cards) {
      if (c.nextOverall == null) continue;
      const cardSlot = slotForOverall(c.nextOverall, teams);
      state.usernameSlots.set(c.username, cardSlot);
      if (c.tally) state.tallies.set(c.username, c.tally);
      if (state.learnedUsername && usernameMatches(state.learnedUsername, c.username)) {
        proposeAnchor(cardSlot);
        if (state.anchoredSlot === cardSlot) summary.slotAnchored = cardSlot;
      }
    }

    // Header "UP IN N PICKS": with an anchored slot the ticker ratchets the
    // current pick (my next overall − N); without one it falls back to the
    // legacy slot inference. This inversion is what keeps the countdown alive
    // when the ticker OCR drops out — picks-until derives from snake math.
    const picksUntil = headerPicksUntil;
    if (picksUntil != null) {
      state.explicitPicksUntil = picksUntil;
      if (state.anchoredSlot) {
        // Choose the snake rung near the best position estimate (currentPick,
        // or the carousel bound when it's ahead — that's what positions a
        // mid-draft resume). The small backward tolerance absorbs a bound
        // inflated by missed cards — without it, "o − N >= floor" skips a
        // whole snake round and every later read inherits the offset.
        const rungFloor = Math.max(state.currentPick, upcomingFloor);
        for (const o of overallsForSlot(state.anchoredSlot, teams, rounds)) {
          if (o - picksUntil >= rungFloor - 3) {
            ratchetCurrentPick(o - picksUntil);
            break;
          }
        }
      } else {
        const myNext = state.currentPick + picksUntil;
        if (myNext >= 1 && myNext <= teams * rounds) {
          const inferred = slotForOverall(myNext, teams);
          state.inferredSlot = inferred;
          summary.slotInferred = inferred;
        }
      }
    }
    refreshSlotConflict();

    // ---- Pick-confirmation card -> event-ledger append (fast-draft path).
    // Attribution needs a fresh position read in the same frame; the card
    // lingers several frames, so dedupe on its raw text.
    if (obs.confirmCard && obs.confirmCard.raw !== state.lastConfirmKey) {
      state.lastConfirmKey = obs.confirmCard.raw;
      const overall = state.currentPick - 1;
      const freshPosition = picksUntil != null || obs.upcomingOveralls.length > 0;
      if (freshPosition && overall >= 1 && !state.ledger.has(overall)) {
        const match = matchAbbrevPlayer(pool, obs.confirmCard.nameRaw, obs.confirmCard.team);
        // Sanity: a player "falling" 30+ picks past ADP is far more likely a
        // misattributed overall than a real fall — leave it to board evidence.
        if (match && Number.isFinite(match.player.adp) && overall - match.player.adp > 30) {
          summary.confirmPick = null;
        } else if (match) {
          const dup = [...state.ledger.values()]
            .some(e => e.player.canonical === match.player.canonical);
          if (!dup) {
            state.ledger.set(overall, {
              player: match.player,
              round: roundForOverall(overall, teams),
              pickInRound: pickInRoundForOverall(overall, teams),
              score: 0.6,
              raw: obs.confirmCard.raw,
              src: 'event',
            });
            summary.confirmPick = match.player.name;
          }
        }
      }
    }

    // ---- "Your pick" -> any other in-draft header = our pick just landed.
    if (obs.kind !== 'unknown') {
      if (state.wasOnClock && !obs.onClock) summary.myPickEvent = true;
      state.wasOnClock = !!obs.onClock;
    }

    // Players-tab availability: everything below the top visible ADP that isn't
    // visible (and plays a position we could see) is gone. Rebuilt per snapshot.
    // Only when the list is plausibly at its top: a user-scrolled list is also
    // clean and ADP-sorted, but its top row says nothing about who's gone —
    // trusting it marked whole rounds of available players drafted (replay
    // corpus, TASK-328). currentPick has already ratcheted from carousel /
    // ticker / board evidence this frame, so compare against it.
    // Marks accumulate across snapshots (each scroll window contributes what
    // it can see); a stale mark is cleared the moment the player is visible
    // again in any row. Rebuilding per-snapshot made the LAST scroll position
    // the only truth and left mid-draft resumes mostly unmarked.
    if (obs.availability && obs.availability.topVisibleAdp <= state.currentPick + 12) {
      const { topVisibleAdp, positionsSeen, visibleCanonicals } = obs.availability;
      const visible = new Set(visibleCanonicals);
      const posSet = new Set(positionsSeen);
      for (const p of pool.players) {
        if (!Number.isFinite(p.adp) || p.adp >= topVisibleAdp - 0.05) continue;
        if (!posSet.has(p.position)) continue;
        if (visible.has(p.canonical)) continue;
        state.inferredGone.add(p.canonical);
      }
      // NOTE: availability deliberately does NOT ratchet currentPick — ADP is
      // not a pick number, and a slightly-scrolled list inflates the top-ADP
      // read. Position comes from the carousel, ticker, and board evidence.
    }

    if (obs.kind === 'queue') {
      state.queue = new Set(obs.queueNames);
    }
    // Any tab: visible available rows can clear stale inferred-gone marks.
    for (const r of obs.rows) state.inferredGone.delete(r.player.canonical);

    // Resume detection: the first time a screen gives us a real read on draft
    // position, remember how far along the draft already was. currentPick has
    // fully ratcheted for this observation by now (board/upcoming/availability
    // above). A high value means we joined a draft already in progress.
    if (state.observedStartPick == null
      && (obs.boardPicks.length || obs.upcomingOveralls.length || obs.availability || picksUntil != null)) {
      state.observedStartPick = state.currentPick;
    }

    return summary;
  }

  function draftedCanonicals() {
    const set = new Set();
    for (const e of state.ledger.values()) set.add(e.player.canonical);
    return set;
  }

  function myPicks() {
    const s = slot();
    if (!s) return [];
    const out = [];
    for (const overall of overallsForSlot(s, teams, rounds)) {
      const e = state.ledger.get(overall);
      if (e) {
        out.push({
          name: e.player.name, position: e.player.position, team: e.player.team,
          round: roundForOverall(overall, teams), overall,
        });
      }
    }
    return out;
  }

  function myNextOverall() {
    const s = slot();
    if (!s) {
      return state.explicitPicksUntil != null
        ? state.currentPick + state.explicitPicksUntil : null;
    }
    return nextOverallForSlot(s, state.currentPick, teams, rounds);
  }

  function rankOf(p) {
    const r = rankMap.get(p.canonical);
    if (Number.isFinite(r)) return r;
    return Number.isFinite(p.adp) ? 1000 + p.adp : 99999;
  }

  function availablePlayers(limit = 60) {
    const gone = draftedCanonicals();
    return pool.players
      .filter(p => !gone.has(p.canonical) && !state.inferredGone.has(p.canonical))
      .sort((a, b) => rankOf(a) - rankOf(b))
      .slice(0, limit)
      .map(p => ({ name: p.name, position: p.position, team: p.team, adp: p.adp, canonical: p.canonical }));
  }

  /** DraftState per chrome-extension/src/adapters/interface.js (draftFeed contract). */
  function getDraftState() {
    return {
      currentPick: state.currentPick,
      currentRound: roundForOverall(Math.min(state.currentPick, teams * rounds), teams),
      draftSlot: slot() || 1,
      availablePlayers: availablePlayers(),
      myPicks: myPicks(),
    };
  }

  function targetFlag(p, picks, next) {
    if (state.queue.has(p.canonical) && Number.isFinite(p.adp) && next != null && p.adp < next - 1) {
      return 'QUEUE RISK';
    }
    for (const mine of picks) {
      if (mine.team === p.team && mine.team !== 'N/A' && (p.position === 'QB' || mine.position === 'QB')) {
        return 'STACK';
      }
    }
    if (Number.isFinite(p.adp) && next != null && p.adp <= next - 4) return 'FALLING';
    const exp = exposureMap.get(p.canonical);
    if (Number.isFinite(exp) && exp >= 25) return `${Math.round(exp)}% OWNED`;
    return '';
  }

  /** Glance payload for the Live Activity (small, flat, ≤ a few hundred bytes). */
  function getGlance({ phaseOverride } = {}) {
    const picks = myPicks();
    const next = myNextOverall();
    const done = state.currentPick > teams * rounds
      || state.ledger.size >= teams * rounds
      || (slot() && picks.length >= rounds);
    const picksUntil = next != null ? Math.max(0, next - state.currentPick) : (state.explicitPicksUntil ?? -1);

    let phase = 'tracking';
    if (phaseOverride) phase = phaseOverride;
    else if (state.syncCount === 0) phase = 'armed';
    else if (done) phase = 'done';
    else if (picksUntil === 0) phase = 'onClock';
    else if (picksUntil === 1) phase = 'onDeck';

    const round = roundForOverall(Math.min(state.currentPick, teams * rounds), teams);
    let headline;
    if (phase === 'armed') headline = 'Waiting for capture to start';
    else if (phase === 'done') headline = 'Draft complete';
    else if (phase === 'onClock') headline = "You're on the clock!";
    else if (phase === 'onDeck') headline = "You're up next";
    else if (picksUntil > 0) headline = `Up in ${picksUntil} picks`;
    else headline = `Tracking · R${round} · P${state.currentPick}`;

    const counts = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const p of picks) if (counts[p.position] != null) counts[p.position]++;

    const targets = availablePlayers(12)
      .slice(0, 3)
      .map(p => {
        const flag = targetFlag(p, picks, next);
        return `${p.position} · ${p.name}${flag ? ` · ${flag}` : ''}`;
      });

    return {
      phase,
      headline,
      picksUntil: Number.isFinite(picksUntil) ? picksUntil : -1,
      currentPick: state.currentPick,
      round,
      myNextPick: next ?? -1,
      rosterBar: `QB ${counts.QB} · RB ${counts.RB} · WR ${counts.WR} · TE ${counts.TE}`,
      targets,
      syncedAtEpoch: 0, // stamped by the controller at send time
    };
  }

  /**
   * JSON-safe snapshot for cross-process handoff (broadcast extension <-> app,
   * App Group storage). Players are stored by canonical name and re-resolved
   * against the pool on hydrate, so both sides must share the same pool.
   */
  function serialize() {
    return {
      v: 2,
      manualSlot: state.manualSlot,
      anchoredSlot: state.anchoredSlot,
      inferredSlot: state.inferredSlot,
      learnedUsername: state.learnedUsername,
      currentPick: state.currentPick,
      osp: state.observedStartPick,
      explicitPicksUntil: state.explicitPicksUntil,
      syncCount: state.syncCount,
      ledger: [...state.ledger.entries()].map(([overall, e]) => ({
        o: overall, c: e.player.canonical, r: e.round, p: e.pickInRound, s: e.score,
        ...(e.src === 'event' ? { e: 1 } : {}),
      })),
      inferredGone: [...state.inferredGone],
      queue: [...state.queue],
      usernameSlots: Object.fromEntries(state.usernameSlots),
      tallies: Object.fromEntries(state.tallies),
    };
  }

  /**
   * Merge a serialized snapshot into this session (union ledger, ratchet the
   * current pick, freshest header evidence wins). Unknown canonicals are
   * dropped rather than guessed. Accepts v1 (pre-anchor) and v2 snapshots.
   */
  function hydrate(data) {
    if (!data || (data.v !== 1 && data.v !== 2)) return false;
    for (const e of data.ledger || []) {
      const player = pool.byCanonical.get(e.c);
      if (!player || !Number.isFinite(e.o)) continue;
      const existing = state.ledger.get(e.o);
      if (!existing || (e.s ?? 0) > existing.score) {
        state.ledger.set(e.o, {
          player, round: e.r, pickInRound: e.p, score: e.s ?? 0.5, raw: e.c,
          ...(e.e ? { src: 'event' } : {}),
        });
      }
    }
    ratchetCurrentPick(data.currentPick);
    if (data.osp != null && state.observedStartPick == null) state.observedStartPick = data.osp;
    if (data.explicitPicksUntil != null) state.explicitPicksUntil = data.explicitPicksUntil;
    if (data.inferredSlot != null) state.inferredSlot = data.inferredSlot;
    if (data.anchoredSlot != null) state.anchoredSlot = data.anchoredSlot;
    if (data.learnedUsername != null) state.learnedUsername = data.learnedUsername;
    if (data.manualSlot != null && state.manualSlot == null) state.manualSlot = data.manualSlot;
    if (Array.isArray(data.inferredGone)) {
      for (const c of data.inferredGone) state.inferredGone.add(c);
    }
    if (Array.isArray(data.queue)) state.queue = new Set(data.queue);
    if (data.usernameSlots) {
      for (const [u, s] of Object.entries(data.usernameSlots)) state.usernameSlots.set(u, s);
    }
    if (data.tallies) {
      for (const [u, t] of Object.entries(data.tallies)) state.tallies.set(u, t);
    }
    state.syncCount = Math.max(state.syncCount, data.syncCount || 0);
    return true;
  }

  return {
    teams, rounds,
    ingest,
    getDraftState,
    getGlance,
    serialize,
    hydrate,
    setManualSlot(s) { state.manualSlot = s || null; state.slotConflict = false; },
    getStatus() {
      return {
        slot: slot(),
        slotSource: state.manualSlot ? 'manual'
          : state.anchoredSlot ? 'anchored'
          : state.inferredSlot ? 'inferred' : null,
        manualSlot: state.manualSlot,
        anchoredSlot: state.anchoredSlot,
        inferredSlot: state.inferredSlot,
        learnedUsername: state.learnedUsername,
        opponentTallies: Object.fromEntries(state.tallies),
        usernameSlots: Object.fromEntries(state.usernameSlots),
        slotConflict: state.slotConflict,
        currentPick: state.currentPick,
        round: roundForOverall(Math.min(state.currentPick, teams * rounds), teams),
        picksUntil: myNextOverall() != null ? Math.max(0, myNextOverall() - state.currentPick) : null,
        myNextPick: myNextOverall(),
        picksAtStart: state.observedStartPick != null ? state.observedStartPick - 1 : null,
        isResume: state.observedStartPick != null && (state.observedStartPick - 1) > teams,
        ledgerSize: state.ledger.size,
        inferredGone: state.inferredGone.size,
        queueSize: state.queue.size,
        syncCount: state.syncCount,
        myPicks: myPicks(),
      };
    },
  };
}
