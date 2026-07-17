// sessionEngine.js — the monotonic pick ledger + derived draft state (ADR-021).
// Observations from underdogParser merge here; everything the assistant and the
// Live Activity show is *derived*: remaining = pool − ledger − inferred-gone,
// picks-until-turn = snake math from the (confirmed or inferred) slot.
// Pure JS — no React Native imports (Node fixture tests run this directly).

import {
  roundForOverall, pickInRoundForOverall, slotForOverall, nextOverallForSlot, overallsForSlot,
} from './snake.js';
import { usernameMatches, matchAbbrevPlayer } from './playerMatcher.js';
import { PLAYOFF_SCHEDULE } from './playoffSchedule.js';

// ---- Draft-room presence (TASK-336) ----
// Screen kinds that prove the capture is looking at the Underdog draft room.
// 'unknown' is out-of-room evidence (UD home, other apps, the BBE app itself);
// 'self' never reaches ingest state (our own Live Activity overlays anything).
const IN_ROOM_KINDS = new Set(['board', 'players', 'queue', 'roster', 'detail', 'header', 'lobby']);
// Out-of-room flip requires this much silence after the last in-room frame
// (when the sustained-evidence path hasn't already flipped it).
const OUT_OF_ROOM_MS = 10000;

// ---- Candidate playoff-stack check (TASK-336, week list TASK-337) ----
// Week-list form of shared/utils/playoffStacks.js analyzeCandidatePlayoffStack —
// that module's extensionless './nflTeams' import doesn't resolve under Node
// (fixture tests / replay harness run this engine directly), and the glance
// only needs the qualifying weeks. Keep the pair rule in lockstep with the
// shared util: W17 (championship week) is the only week that admits RB on
// either side. Pool and pick teams are already abbreviations, matching the
// schedule keys.
const PLAYOFF_WEEKS = ['15', '16', '17'];
const PLAYOFF_PAIRS_DEFAULT = {
  QB: ['QB', 'WR', 'TE'], WR: ['QB', 'WR', 'TE'], TE: ['QB', 'WR'],
};
const PLAYOFF_PAIRS_W17 = {
  QB: ['QB', 'WR', 'TE', 'RB'], WR: ['QB', 'WR', 'TE', 'RB'],
  TE: ['QB', 'WR', 'RB'], RB: ['QB', 'WR', 'TE', 'RB'],
};

function candidatePlayoffWeeks(p, picks) {
  const team = (p.team || '').toUpperCase();
  if (!team || team === 'N/A') return [];
  const weeks = [];
  for (const week of PLAYOFF_WEEKS) {
    const allowed = (week === '17' ? PLAYOFF_PAIRS_W17 : PLAYOFF_PAIRS_DEFAULT)[p.position];
    if (!allowed) continue;
    const opp = PLAYOFF_SCHEDULE[team]?.[week];
    if (!opp) continue;
    for (const mine of picks) {
      if ((mine.team || '').toUpperCase() !== opp) continue; // same-team = S flag
      if (allowed.includes(mine.position)) { weeks.push(week); break; }
    }
  }
  return weeks;
}

/** "Marvin Harrison Jr." -> "Harrison"; suffixes stripped, final token kept. */
function lastNameOf(name) {
  const parts = String(name).trim()
    .replace(/\s+(Jr|Sr|II|III|IV|V)\.?$/i, '')
    .split(/\s+/);
  return parts[parts.length - 1] || String(name);
}

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
 *   rosterIndexMap Map(canonical -> Set(entryId)) from the synced portfolio,
 *                feeds the correlation column (TASK-337)
 */
export function createDraftSession(cfg) {
  const teams = cfg.teams || 12;
  const rounds = cfg.rounds || 18;
  const pool = cfg.pool;
  const rankMap = cfg.rankMap || new Map();
  const exposureMap = cfg.exposureMap || new Map();
  const rosterIndexMap = cfg.rosterIndexMap || new Map();

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
    inRoom: null,             // null = no room seen yet; true/false after evidence
    lastInRoomAt: 0,          // epoch ms of the last in-room frame
    lastOutAt: 0,             // epoch ms of the last out-of-room frame
    outStreak: 0,             // consecutive out-of-room frames
    draftGen: 0,              // bumped per auto board reset (new-draft detection)
    newDraftStreak: 0,        // consecutive own-roster reads contradicting the ledger
  };

  const presence = () => (state.inRoom == null ? 'unseen' : state.inRoom ? 'in' : 'out');

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

  /**
   * Auto new-draft reset: drop every per-draft fact — ledger, availability
   * marks, slot evidence, pick position — while keeping the learned username
   * and room presence. The observation that triggered the reset is ingested
   * into the fresh state by the caller, so the new room's roster panel seeds
   * the new board in the same frame.
   */
  function resetForNewDraft() {
    state.manualSlot = null;
    state.anchoredSlot = null;
    state.anchorCandidate = null;
    state.inferredSlot = null;
    state.usernameCandidate = null;
    state.usernameSlots = new Map();
    state.tallies = new Map();
    state.slotConflict = false;
    state.currentPick = 1;
    state.observedStartPick = null;
    state.explicitPicksUntil = null;
    state.ledger = new Map();
    state.inferredGone = new Set();
    state.queue = new Set();
    state.wasOnClock = false;
    state.lastConfirmKey = null;
    state.newDraftStreak = 0;
    state.draftGen += 1;
  }

  /** Merge one parsed observation. Returns a summary for the sync log.
   *  nowMs drives the room-presence clock — the extension passes Date.now(),
   *  replay/tests pass the recorded frame time. */
  function ingest(obs, nowMs = Date.now()) {
    if (!obs) return null;
    // Our own Live Activity captured over the draft room — fully inert, no
    // state mutation at all (its target rows would resurrect drafted players).
    // Presence-neutral too: the expanded card can overlay any screen.
    if (obs.kind === 'self') {
      return {
        kind: 'self', newBoardPicks: 0, rowsMatched: 0, picksUntil: null,
        slotInferred: null, slotAnchored: null, myPickEvent: false, confirmPick: null,
        presence: presence(), presenceChanged: false,
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
      presence: null,
      presenceChanged: false,
      newDraft: false,
    };

    // ---- Room presence (TASK-336). In-room kinds refresh the presence clock;
    // 'unknown' frames are out evidence. Hysteresis: one glitchy frame never
    // flips an in-room session out — two distinct out frames or 10 s of
    // out-only evidence do. Entering (or re-entering) flips on a single frame.
    const wasInRoom = state.inRoom;
    if (IN_ROOM_KINDS.has(obs.kind) || obs.confirmCard) {
      state.inRoom = true;
      state.outStreak = 0;
      state.lastInRoomAt = nowMs;
    } else {
      state.outStreak++;
      state.lastOutAt = nowMs;
      if (state.inRoom === true
        && (state.outStreak >= 2 || nowMs - state.lastInRoomAt >= OUT_OF_ROOM_MS)) {
        state.inRoom = false;
      }
    }
    summary.presence = presence();
    summary.presenceChanged = wasInRoom !== state.inRoom;

    // ---- Auto new-draft detection (back-to-back slow drafts). The user's
    // OWN roster panel is ground truth for their picks: in the next draft
    // room, tapping their profile card opens a panel that contradicts the
    // held board — a different player at an overall we already hold, or
    // their picks mapping to a different slot while we hold a roster. Two
    // consecutive contradicting reads reset the board in place (one read is
    // OCR-glitch territory; the panel lingers across frames, so a real new
    // draft confirms within a second). Checked BEFORE the merges below so
    // conflicts compare against the previous draft's ledger, and the same
    // observation then seeds the fresh board. The manual reset in the app
    // remains as a fallback.
    let deferRosterMerge = false;
    if ((obs.rosterPicks || []).length && state.learnedUsername
      && obs.rosterOwner && usernameMatches(state.learnedUsername, obs.rosterOwner)) {
      const conflicts = obs.rosterPicks.filter((rp) => {
        const e = state.ledger.get(rp.overall);
        return e && e.src !== 'event' && e.player.canonical !== rp.player.canonical;
      }).length;
      const panelSlot = slotForOverall(obs.rosterPicks[0].overall, teams);
      const slotMoved = state.anchoredSlot != null && panelSlot !== state.anchoredSlot
        && myPicks().length > 0;
      if (conflicts >= 1 || slotMoved) {
        state.newDraftStreak++;
        if (state.newDraftStreak >= 2) {
          resetForNewDraft();
          summary.newDraft = true;
        } else {
          // Hold the contradicting picks out of the ledger until the second
          // read confirms — merging now could overwrite the very entry the
          // conflict is measured against.
          deferRosterMerge = true;
        }
      } else {
        state.newDraftStreak = 0;
      }
    }

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
    // Roster-panel picks are board-grade too: absolute overalls paired with
    // matched rows (TASK-336) — the one source that recovers picks no board
    // window ever showed (a mid-draft resume needs only a roster glance).
    // Card picks (a drafter card's completed-pick line, "1.6|6" over
    // "J. Smith-Njigba") merge the same way at a capped score, so a slow
    // draft's carousel keeps the roster bar honest without a board visit.
    for (const rp of [
      ...(deferRosterMerge ? [] : obs.rosterPicks || []),
      ...(obs.cardPicks || []),
    ]) {
      const existing = state.ledger.get(rp.overall);
      if (!existing || rp.score > existing.score) {
        if (!existing) summary.newBoardPicks++;
        state.ledger.set(rp.overall, {
          player: rp.player,
          round: roundForOverall(rp.overall, teams),
          pickInRound: pickInRoundForOverall(rp.overall, teams),
          score: rp.score, raw: rp.raw,
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

    // Players-tab availability, two inference passes over the visible window.
    // Marks accumulate across snapshots (each scroll window contributes what
    // it can see); a stale mark is cleared the moment the player is visible
    // again in any row. Rebuilding per-snapshot made the LAST scroll position
    // the only truth and left mid-draft resumes mostly unmarked.
    if (obs.availability) {
      const {
        topVisibleAdp, bottomVisibleAdp, positionsSeen, visibleCanonicals, unmatchedCount,
      } = obs.availability;
      const visible = new Set(visibleCanonicals);
      const posSet = new Set(positionsSeen);
      // The position guard protects against chip-filtered lists (a WR-only
      // view proves nothing about TEs) — but rows spanning ≥3 distinct
      // positions prove the list is unfiltered, and then the inference holds
      // for EVERY position. Keeping the guard there surfaced long-gone elite
      // TEs as top targets on a mid-draft resume whose visible window had no
      // TE row (debug 2026-07-15, TASK-329 scope item).
      const unfiltered = posSet.size >= 3;
      // (a) Window pass: the visible rows of the ADP-sorted list are
      // contiguous, so a pool player whose ADP falls strictly inside the
      // visible window and who isn't visible is drafted — valid at ANY scroll
      // position, which is what keeps targets honest for players drafted
      // mid-window (TASK-329). Skipped on garbled frames: an unmatched row is
      // a gap that would false-mark the players behind the misread name.
      if (Number.isFinite(bottomVisibleAdp) && (unmatchedCount ?? 0) < 2) {
        for (const p of pool.players) {
          if (!Number.isFinite(p.adp)) continue;
          if (p.adp <= topVisibleAdp + 0.05 || p.adp >= bottomVisibleAdp - 0.05) continue;
          if (!unfiltered && !posSet.has(p.position)) continue;
          if (visible.has(p.canonical)) continue;
          state.inferredGone.add(p.canonical);
        }
      }
      // (b) Below-top pass: everything below the top visible ADP that isn't
      // visible (and plays a position we could see) is gone. Only when the
      // list is plausibly at its top: a user-scrolled list is also clean and
      // ADP-sorted, but its top row says nothing about who's gone — trusting
      // it marked whole rounds of available players drafted (replay corpus,
      // TASK-328). currentPick has already ratcheted from carousel / ticker /
      // board evidence this frame, so compare against it.
      if (topVisibleAdp <= state.currentPick + 12) {
        for (const p of pool.players) {
          if (!Number.isFinite(p.adp) || p.adp >= topVisibleAdp - 0.05) continue;
          if (!unfiltered && !posSet.has(p.position)) continue;
          if (visible.has(p.canonical)) continue;
          state.inferredGone.add(p.canonical);
        }
      }
      // NOTE: availability deliberately does NOT ratchet currentPick — ADP is
      // not a pick number, and a slightly-scrolled list inflates the top-ADP
      // read. Position comes from the carousel, ticker, and board evidence.
    }

    if (obs.kind === 'queue') {
      state.queue = new Set(obs.queueNames);
    }
    // Any tab: visible available rows can clear stale inferred-gone marks —
    // except roster panels, whose rows are drafted players by definition
    // (an opponent's roster view would resurrect their picks, TASK-329).
    if (obs.kind !== 'roster') {
      for (const r of obs.rows) state.inferredGone.delete(r.player.canonical);
    }

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
          canonical: e.player.canonical,
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

  /** Average conditional probability P(candidate | each current pick) across
   *  the synced portfolio — the extension overlay's Corr column (port of
   *  draft-overlay.js computeCorrelation), keyed on rosterIndexMap. Null
   *  (blank cell) until a pick with portfolio presence lands. */
  function correlationPct(p, picks) {
    if (!rosterIndexMap.size || !picks.length) return null;
    const candRosters = rosterIndexMap.get(p.canonical);
    let sum = 0;
    let comparisons = 0;
    for (const mine of picks) {
      const pickRosters = mine.canonical ? rosterIndexMap.get(mine.canonical) : null;
      if (!pickRosters || !pickRosters.size) continue;
      let intersection = 0;
      if (candRosters && candRosters.size) {
        const [small, large] = pickRosters.size < candRosters.size
          ? [pickRosters, candRosters] : [candRosters, pickRosters];
        for (const id of small) if (large.has(id)) intersection++;
      }
      sum += intersection / pickRosters.size;
      comparisons++;
    }
    return comparisons > 0 ? Math.round((sum / comparisons) * 100) : null;
  }

  /** Six target lines "POS·Name·P·S·C·E" for the two-column Live Activity
   *  table (TASK-337): P = playoff-week game stack week(s), ascending, joined
   *  with "/" (never "·", the field separator); S = team stack with a current
   *  pick (QB involved); C = roster correlation %; E = portfolio exposure %.
   *  Blank fields stay empty between separators — Swift renders dashes and
   *  appends "%". Last names collide -> "F.Surname". */
  function buildTargets(picks) {
    const top = availablePlayers(12).slice(0, 6);
    const lastNames = top.map(p => lastNameOf(p.name));
    return top.map((p, i) => {
      let short = lastNames[i];
      if (lastNames.filter(n => n === short).length > 1) {
        short = `${p.name.trim()[0]}.${short}`;
      }
      let stack = '';
      for (const mine of picks) {
        if (mine.team === p.team && mine.team !== 'N/A' && (p.position === 'QB' || mine.position === 'QB')) {
          stack = 'S';
          break;
        }
      }
      const weeks = candidatePlayoffWeeks(p, picks).join('/');
      const corr = correlationPct(p, picks);
      const exp = exposureMap.get(p.canonical);
      const expStr = Number.isFinite(exp) ? String(Math.round(exp)) : '';
      return `${p.position}·${short}·${weeks}·${stack}·${corr ?? ''}·${expStr}`;
    });
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
    // Presence phases (TASK-336): capture is live but the screen isn't a
    // draft room. 'waiting' = never seen one yet; 'away' = left one, state held.
    else if (state.inRoom === false) phase = 'away';
    else if (state.inRoom == null) phase = 'waiting';
    else if (picksUntil === 0) phase = 'onClock';
    else if (picksUntil === 1) phase = 'onDeck';

    const round = roundForOverall(Math.min(state.currentPick, teams * rounds), teams);
    let headline;
    if (phase === 'armed') headline = 'Waiting for capture to start';
    else if (phase === 'done') headline = 'Draft complete';
    else if (phase === 'waiting') headline = 'Waiting to enter draft';
    else if (phase === 'away') {
      headline = state.ledger.size || state.inferredGone.size
        ? `Left draft room — R${round} · P${state.currentPick} held`
        : 'Left draft room';
    } else if (phase === 'onClock') headline = "You're on the clock!";
    else if (phase === 'onDeck') headline = "You're up next";
    else if (picksUntil > 0) headline = `Up in ${picksUntil} picks`;
    else headline = `Tracking · R${round} · P${state.currentPick}`;

    const counts = { QB: 0, RB: 0, WR: 0, TE: 0 };
    for (const p of picks) if (counts[p.position] != null) counts[p.position]++;

    // No target grid outside the room — nothing actionable to show there.
    const showTargets = phase === 'tracking' || phase === 'onClock' || phase === 'onDeck';
    const targets = showTargets ? buildTargets(picks) : [];

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
      gen: state.draftGen,
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
      inRoom: state.inRoom,
      inAt: state.lastInRoomAt,
      outAt: state.lastOutAt,
    };
  }

  /**
   * Merge a serialized snapshot into this session (union ledger, ratchet the
   * current pick, freshest header evidence wins). Unknown canonicals are
   * dropped rather than guessed. Accepts v1 (pre-anchor) and v2 snapshots.
   */
  function hydrate(data) {
    if (!data || (data.v !== 1 && data.v !== 2)) return false;
    // Draft generation (auto new-draft reset): a snapshot from a NEWER
    // generation wipes this session's per-draft state before merging — the
    // union merge below would otherwise resurrect the previous draft. A
    // snapshot from an OLDER generation predates a reset and is stale.
    const gen = data.gen || 0;
    if (gen > state.draftGen) {
      resetForNewDraft();
      state.draftGen = gen;
    } else if (gen < state.draftGen) {
      return false;
    }
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
    // Presence rides the snapshot so the app's panel reflects what the
    // extension sees. Freshest evidence wins (both sides stamp epoch ms).
    const dataEvidence = Math.max(data.inAt || 0, data.outAt || 0);
    if (data.inRoom !== undefined && data.inRoom !== null
      && dataEvidence >= Math.max(state.lastInRoomAt, state.lastOutAt)) {
      state.inRoom = data.inRoom;
      state.lastInRoomAt = Math.max(state.lastInRoomAt, data.inAt || 0);
      state.lastOutAt = Math.max(state.lastOutAt, data.outAt || 0);
    }
    state.syncCount = Math.max(state.syncCount, data.syncCount || 0);
    return true;
  }

  /** Time-based presence advance for frame-quiet stretches (TASK-336). Static
   *  screens produce no ingests — the extension's duplicate gate eats them —
   *  so a screen left static outside the room needs this nudge to flip
   *  presence to 'away'. Only fires when out evidence is newer than the last
   *  in-room frame: a *room* screen left static keeps presence 'in'. */
  function tick(nowMs = Date.now()) {
    const wasInRoom = state.inRoom;
    if (state.inRoom === true
      && state.lastOutAt > state.lastInRoomAt
      && nowMs - state.lastInRoomAt >= OUT_OF_ROOM_MS) {
      state.inRoom = false;
    }
    return { presence: presence(), presenceChanged: wasInRoom !== state.inRoom };
  }

  return {
    teams, rounds,
    ingest,
    tick,
    getDraftState,
    getGlance,
    serialize,
    hydrate,
    setManualSlot(s) { state.manualSlot = s || null; state.slotConflict = false; },
    getStatus() {
      return {
        slot: slot(),
        presence: presence(),
        inRoom: state.inRoom,
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
        draftGen: state.draftGen,
        myPicks: myPicks(),
      };
    },
  };
}
