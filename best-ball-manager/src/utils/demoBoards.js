// src/utils/demoBoards.js
// Synthetic draft boards for demo mode.
//
// Real boards live in draft_boards_admin behind an authenticated-only RLS
// policy, so guests exploring the demo would see an all-dash Adv % column and
// no Board buttons — the pod-exact advance model (utils/podAdvance.js) has
// nothing to chew on. This module fabricates a full 12-team snake board around
// each demo roster: the user's seat replays their actual picks, and the other
// 11 seats draft plausible opponents from the bundled Underdog ADP snapshot —
// near-ADP selections with seeded jitter plus light roster-construction
// guardrails (positional minimums and caps) so every synthetic team fields a
// startable lineup.
//
// Generation is deterministic per entry id (same seeded mulberry32 the advance
// model uses), so the Adv % column, the Board modal, and every revisit of the
// demo show the identical board and the identical odds.

import { canonicalName, normalizePosition } from './helpers.js';
import { teamAbbrev } from './nflTeams.js';

// ── Deterministic RNG (mirrors advanceModel.js, which keeps its own private) ──

function hashSeed(str = '') {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Construction guardrails ───────────────────────────────────────────────────

/** Every synthetic team must reach these by the end of the draft. */
const MIN_COUNTS = { QB: 2, RB: 4, WR: 5, TE: 2 };
/** ...and never exceed these (no 6-QB comedy rosters). */
const MAX_COUNTS = { QB: 3, RB: 9, WR: 10, TE: 3 };
/** Candidate window: how far down the ADP board a seat will reach. */
const PICK_WINDOW = 6;
/** Geometric weighting — chance to stop at each candidate in ADP order. */
const TAKE_PROB = 0.45;

const ENTRY_COUNT = 12;

/**
 * Build the opponent player pool from Underdog ADP snapshot rows
 * (`adpByPlatform.underdog.latestRows`), sorted by ADP.
 */
function buildPool(latestRows) {
  const pool = [];
  for (const row of latestRows) {
    const name = `${row.firstName || ''} ${row.lastName || ''}`.trim().replace(/\s+/g, ' ');
    const position = normalizePosition(row.slotName || row.position);
    const adp = parseFloat(row.adp);
    if (!name || !MIN_COUNTS[position] || !Number.isFinite(adp)) continue;
    pool.push({ name, position, team: teamAbbrev(row.teamName || row.team) || null, adp });
  }
  pool.sort((a, b) => a.adp - b.adp);
  return pool;
}

/** Snake-draft slot for an overall pick number. */
function slotForPick(pick, entryCount) {
  const round = Math.ceil(pick / entryCount);
  const idx = (pick - 1) % entryCount;
  return round % 2 === 1 ? idx + 1 : entryCount - idx;
}

/**
 * Generate one synthetic board around a demo roster.
 *
 * @param {{entry_id: string, tournamentTitle?: string|null,
 *          players: Array<{name: string, position: string, team?: string, pick: number}>}} roster
 * @param {Array<object>} pool - buildPool() output (not mutated)
 * @returns {{draftId: string, slateTitle: string|null, entryCount: number,
 *            rounds: number, picks: Array<object>}|null}
 */
function generateBoard(roster, pool) {
  const userPicks = [...(roster.players || [])]
    .filter(p => Number.isFinite(p.pick) && p.pick > 0)
    .sort((a, b) => a.pick - b.pick);
  if (userPicks.length === 0) return null;

  const rounds = userPicks.length;
  const userSlot = slotForPick(userPicks[0].pick, ENTRY_COUNT);
  const rng = mulberry32(hashSeed(String(roster.entry_id)));

  const taken = new Set(userPicks.map(p => canonicalName(p.name)));
  const available = pool.filter(p => !taken.has(canonicalName(p.name)));
  const counts = {};
  const picks = [];
  let userIdx = 0;

  for (let pick = 1; pick <= rounds * ENTRY_COUNT; pick++) {
    const round = Math.ceil(pick / ENTRY_COUNT);
    const slot = slotForPick(pick, ENTRY_COUNT);

    if (slot === userSlot) {
      // The user's seat replays their real roster in pick order (their stored
      // pick numbers can drift from the synthetic grid; the seat is what matters).
      const p = userPicks[Math.min(userIdx++, userPicks.length - 1)];
      picks.push({
        pick, round, slot,
        name: p.name,
        position: normalizePosition(p.position),
        team: p.team && p.team !== 'N/A' ? teamAbbrev(p.team) : null,
      });
      continue;
    }

    const c = (counts[slot] ??= { QB: 0, RB: 0, WR: 0, TE: 0 });
    const roundsLeft = rounds - round + 1;
    const unmet = Object.entries(MIN_COUNTS)
      .reduce((s, [pos, min]) => s + Math.max(0, min - c[pos]), 0);
    const mustFillNeeds = unmet >= roundsLeft;
    const posOk = (pos) => {
      if (c[pos] == null || c[pos] >= MAX_COUNTS[pos]) return false;
      return mustFillNeeds ? c[pos] < MIN_COUNTS[pos] : true;
    };

    // Best-available window in ADP order, filtered to eligible positions;
    // geometric weighting keeps most picks near ADP with believable reaches.
    const candidates = [];
    for (let i = 0; i < available.length && candidates.length < PICK_WINDOW; i++) {
      if (posOk(available[i].position)) candidates.push(i);
    }
    if (candidates.length === 0) {
      for (let i = 0; i < available.length && candidates.length < PICK_WINDOW; i++) {
        candidates.push(i);
      }
      if (candidates.length === 0) return null; // pool exhausted — bail
    }
    let choice = candidates.length - 1;
    for (let k = 0; k < candidates.length; k++) {
      if (rng() < TAKE_PROB) { choice = k; break; }
    }
    const sel = available.splice(candidates[choice], 1)[0];
    c[sel.position] += 1;
    picks.push({ pick, round, slot, name: sel.name, position: sel.position, team: sel.team });
  }

  return {
    draftId: String(roster.entry_id),
    // Carries the tournament name, mirroring real boards' slate_title — this
    // is what advanceStructureFor reads (Big/Little Board → 3 of 12).
    slateTitle: roster.tournamentTitle || 'Demo Best Ball',
    entryCount: ENTRY_COUNT,
    rounds,
    picks,
  };
}

/**
 * Generate synthetic boards for every demo roster. Shape matches
 * utils/draftBoards.js fetchDraftBoards() output, so downstream consumers
 * (podAdvance, DraftBoardModal) can't tell the difference.
 *
 * @param {Array<{entry_id: string, tournamentTitle?: string|null, players: Array}>} rosters
 * @param {Array<object>} latestRows - `adpByPlatform.underdog.latestRows`
 * @returns {Array<{draftId, slateTitle, entryCount, rounds, picks}>}
 */
export function generateDemoBoards(rosters = [], latestRows = []) {
  const pool = buildPool(latestRows);
  if (pool.length < ENTRY_COUNT * 15) return []; // no usable ADP snapshot
  const boards = [];
  for (const roster of rosters) {
    const board = generateBoard(roster, pool);
    if (board) boards.push(board);
  }
  return boards;
}
