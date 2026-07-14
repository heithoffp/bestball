// sessionEngine.js — the monotonic pick ledger + derived draft state (ADR-021).
// Observations from underdogParser merge here; everything the assistant and the
// Live Activity show is *derived*: remaining = pool − ledger − inferred-gone,
// picks-until-turn = snake math from the (confirmed or inferred) slot.
// Pure JS — no React Native imports (Node fixture tests run this directly).

import {
  roundForOverall, slotForOverall, nextOverallForSlot, overallsForSlot,
} from './snake.js';

/**
 * @param {object} cfg
 *   pool         required, from playerMatcher.buildPool()
 *   teams        default 12
 *   rounds       default 18
 *   slot         1..teams, or null -> inferred from "UP IN N PICKS" evidence
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
    inferredSlot: null,
    slotConflict: false,
    currentPick: 1,          // monotonic floor; only ratchets upward
    explicitPicksUntil: null, // last header reading (may go stale between syncs)
    ledger: new Map(),        // overall -> { player, round, pickInRound, score, raw }
    inferredGone: new Set(),  // canonicals implied gone by Players-tab availability
    queue: new Set(),         // canonicals seen on the Queue tab
    syncCount: 0,
    lastObs: null,
  };

  const slot = () => state.manualSlot || state.inferredSlot;

  function ratchetCurrentPick(candidate) {
    if (Number.isFinite(candidate) && candidate > state.currentPick) {
      state.currentPick = Math.min(candidate, teams * rounds + 1);
    }
  }

  /** Merge one parsed observation. Returns a summary for the sync log. */
  function ingest(obs) {
    if (!obs) return null;
    state.syncCount++;
    state.lastObs = obs;
    const summary = {
      kind: obs.kind,
      newBoardPicks: 0,
      rowsMatched: obs.rows.length,
      picksUntil: obs.picksUntil,
      slotInferred: null,
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
    if (state.ledger.size) {
      ratchetCurrentPick(Math.max(...state.ledger.keys()) + 1);
    }

    // Drafter cards show each opponent's *next* pick -> current = min visible − 1.
    if (obs.upcomingOveralls.length) {
      ratchetCurrentPick(Math.min(...obs.upcomingOveralls) - 1);
    }

    // Header "UP IN N PICKS" -> picks-until + (with current pick) slot inference.
    const picksUntil = obs.picksUntil ?? obs.picksAwayDivider;
    if (picksUntil != null) {
      state.explicitPicksUntil = picksUntil;
      const myNext = state.currentPick + picksUntil;
      if (myNext >= 1 && myNext <= teams * rounds) {
        const inferred = slotForOverall(myNext, teams);
        state.inferredSlot = inferred;
        summary.slotInferred = inferred;
        state.slotConflict = !!(state.manualSlot && state.manualSlot !== inferred);
      }
    }

    // Players-tab availability: everything below the top visible ADP that isn't
    // visible (and plays a position we could see) is gone. Rebuilt per snapshot.
    if (obs.availability) {
      const { topVisibleAdp, positionsSeen, visibleCanonicals } = obs.availability;
      const visible = new Set(visibleCanonicals);
      const posSet = new Set(positionsSeen);
      state.inferredGone = new Set();
      for (const p of pool.players) {
        if (!Number.isFinite(p.adp) || p.adp >= topVisibleAdp - 0.05) continue;
        if (!posSet.has(p.position)) continue;
        if (visible.has(p.canonical)) continue;
        state.inferredGone.add(p.canonical);
      }
      // Availability also bounds the current pick: if ~everyone under ADP a₀ is
      // gone, the draft has reached at least that depth.
      ratchetCurrentPick(Math.floor(topVisibleAdp) - 1);
    }

    if (obs.kind === 'queue') {
      state.queue = new Set(obs.queueNames);
    }
    // Any tab: visible available rows can clear stale inferred-gone marks.
    for (const r of obs.rows) state.inferredGone.delete(r.player.canonical);

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
    if (phase === 'armed') headline = 'Screenshot your draft to sync';
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
      v: 1,
      manualSlot: state.manualSlot,
      inferredSlot: state.inferredSlot,
      currentPick: state.currentPick,
      explicitPicksUntil: state.explicitPicksUntil,
      syncCount: state.syncCount,
      ledger: [...state.ledger.entries()].map(([overall, e]) => ({
        o: overall, c: e.player.canonical, r: e.round, p: e.pickInRound, s: e.score,
      })),
      inferredGone: [...state.inferredGone],
      queue: [...state.queue],
    };
  }

  /**
   * Merge a serialized snapshot into this session (union ledger, ratchet the
   * current pick, freshest header evidence wins). Unknown canonicals are
   * dropped rather than guessed.
   */
  function hydrate(data) {
    if (!data || data.v !== 1) return false;
    for (const e of data.ledger || []) {
      const player = pool.byCanonical.get(e.c);
      if (!player || !Number.isFinite(e.o)) continue;
      const existing = state.ledger.get(e.o);
      if (!existing || (e.s ?? 0) > existing.score) {
        state.ledger.set(e.o, {
          player, round: e.r, pickInRound: e.p, score: e.s ?? 0.5, raw: e.c,
        });
      }
    }
    ratchetCurrentPick(data.currentPick);
    if (data.explicitPicksUntil != null) state.explicitPicksUntil = data.explicitPicksUntil;
    if (data.inferredSlot != null) state.inferredSlot = data.inferredSlot;
    if (data.manualSlot != null && state.manualSlot == null) state.manualSlot = data.manualSlot;
    if (Array.isArray(data.inferredGone)) state.inferredGone = new Set(data.inferredGone);
    if (Array.isArray(data.queue)) state.queue = new Set(data.queue);
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
        manualSlot: state.manualSlot,
        inferredSlot: state.inferredSlot,
        slotConflict: state.slotConflict,
        currentPick: state.currentPick,
        round: roundForOverall(Math.min(state.currentPick, teams * rounds), teams),
        picksUntil: myNextOverall() != null ? Math.max(0, myNextOverall() - state.currentPick) : null,
        myNextPick: myNextOverall(),
        ledgerSize: state.ledger.size,
        inferredGone: state.inferredGone.size,
        queueSize: state.queue.size,
        syncCount: state.syncCount,
        myPicks: myPicks(),
      };
    },
  };
}
