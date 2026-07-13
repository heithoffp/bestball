// arenaSnapshot.js — builds the anonymized display snapshot for an Arena team
// (ADR-013 / TASK-284). The snapshot is self-contained so the voting card and
// pairing function never need live roster data or any owner identity.
//
// Two producers:
//   - buildEnrollableTeams(rosterData) — the user's OWN teams, from in-memory rows.
//   - buildBoardTeams(board, ownKey)   — the other 11 pod rosters (ADR-014 / TASK-288),
//     from a draft_boards_admin board, excluding the user's own seat.

// Explicit .js extensions: this module (and its two deps) is pure ESM with no
// Vite-isms, and scripts/arena-backfill-pool.mjs imports it directly under Node,
// which refuses extensionless specifiers. Keep this chain Node-loadable.
import { classifyRosterPath } from './rosterArchetypes.js';
import { calcCLV } from './clvHelpers.js';

function normName(s) {
  return (s || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Position normalization, PINNED to normalizePosition in ./helpers.js (kept local
// so this Node-loadable chain stays free of helpers.js's data imports). Two-way
// players can sync with a defensive designation (e.g. Travis Hunter arrives as CB
// on some platforms); the fantasy-relevant position is WR.
function normalizePos(raw) {
  const pos = String(raw || '').trim().toUpperCase();
  if (pos === 'CB') return 'WR';
  return pos || 'N/A';
}

// Frozen stored snapshots can predate position normalization (a board pick synced
// as CB). Remap at display time: player positions plus the posSnap chip counts.
// Returns the input object untouched when nothing needs remapping, so memoized
// consumers keep their referential stability.
export function normalizeSnapshotPositions(snapshot) {
  const players = snapshot?.players;
  const posSnap = snapshot?.posSnap;
  const isCB = (p) => String(p?.position || '').trim().toUpperCase() === 'CB';
  const hasCB = (Array.isArray(players) && players.some(isCB)) || (posSnap && posSnap.CB);
  if (!hasCB) return snapshot;
  const nextPlayers = (players || []).map((p) => (isCB(p) ? { ...p, position: 'WR' } : p));
  const nextPosSnap = { ...(posSnap || {}) };
  if (nextPosSnap.CB) {
    nextPosSnap.WR = (nextPosSnap.WR || 0) + nextPosSnap.CB;
    delete nextPosSnap.CB;
  }
  return { ...snapshot, players: nextPlayers, posSnap: nextPosSnap };
}

// A pick whose player lookup failed at sync time carries the extension's
// "Unknown (<appearanceId>)" fallback instead of a real name (see normalizePick
// in chrome-extension/src/injected/underdog-bridge.js). A snapshot built from
// such picks is useless in a blind matchup — voters see UUIDs — so degraded
// rosters are kept OUT of the Arena pool entirely. Any single unresolved pick
// disqualifies the team: the failure mode is a missing lookup table, which
// degrades most of the roster at once, and a partially-anonymous card would
// skew votes against that team unfairly.
const UNRESOLVED_NAME_RE = /^unknown\s*\(/i;

/** True when any pick in the list is missing a real player name. */
export function hasUnresolvedPlayers(players) {
  return (players || []).some((p) => {
    const name = ((typeof p === 'string' ? p : p?.name) || '').trim();
    return !name || UNRESOLVED_NAME_RE.test(name);
  });
}

function round1(n) {
  return n == null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10;
}

// Build a name -> latest-ADP (pick number) lookup from the processed master player
// list. Board teams (the other 11 pod rosters) carry no per-pick ADP, so their CLV
// is computed against this lookup at registration time. Returns a function so callers
// stay agnostic to the underlying map; missing names resolve to null.
export function buildAdpLookup(masterPlayers) {
  const map = new Map();
  (masterPlayers || []).forEach((p) => {
    const adp = Number(p?.adpPick);
    if (p?.name && Number.isFinite(adp)) map.set(normName(p.name), adp);
  });
  return (name) => map.get(normName(name)) ?? null;
}

// Recompute CLV for a stored snapshot against the VIEWER's current ADP at display
// time. This is the source of truth for what the voting card shows: snapshots are
// registered insert-new-only (arena-register), so a team's stored CLV can be stale or
// absent (it predates the CLV feature). Computing live from the viewer's masterPlayers
// — every snapshot already carries each pick's number — makes CLV appear for every
// team without any re-registration. Falls back to the stored value when a name can't
// be resolved; returns the snapshot untouched when no lookup is available.
export function enrichSnapshotCLV(snapshot, adpLookup) {
  snapshot = normalizeSnapshotPositions(snapshot);
  if (!snapshot || typeof adpLookup !== 'function') return snapshot;
  let resolvedAny = false;
  const players = (snapshot.players || []).map((p) => {
    const adp = adpLookup(p.name);
    const clv = calcCLV(p.pick, adp);
    if (clv == null) return p; // keep whatever the stored snapshot had (may be null)
    resolvedAny = true;
    return { ...p, adp: round1(adp), clv: round1(clv) };
  });
  if (!resolvedAny) return snapshot;
  const clvVals = players.map((p) => p.clv).filter((v) => v != null);
  const avgCLV = clvVals.length
    ? round1(clvVals.reduce((a, b) => a + b, 0) / clvVals.length)
    : (snapshot.avgCLV ?? null);
  return { ...snapshot, players, avgCLV };
}

// Display-time enrichment for the voting card / leaderboard expansion: recomputed
// CLV (see enrichSnapshotCLV) plus per-player projected points and their team total,
// resolved against the viewer's projection map. Projections are never stored in the
// snapshot — like CLV they are computed fresh so every pool team gets them, however
// long ago it was registered. projLookup: (name) => seasonPoints|null.
//
// projTotalFn (optional): (players, snapshot) => teamSeasonPoints. When provided it
// computes the TEAM total the same lineup-aware way the Rosters page does — only a
// starting lineup scores, byes cost what they actually cost, surplus QBs don't inflate
// (see computeRosterOutlook). It's injected rather than imported so this module stays
// free of helpers.js's data imports and Node-loadable for arena-backfill-pool.mjs.
// When absent, the team total falls back to the naive per-player sum.
export function enrichSnapshotDisplay(snapshot, adpLookup, projLookup, projTotalFn = null) {
  const withCLV = enrichSnapshotCLV(snapshot, adpLookup);
  if (!withCLV || typeof projLookup !== 'function') return withCLV;
  let resolved = 0;
  const players = (withCLV.players || []).map((p) => {
    const proj = projLookup(p.name);
    if (proj == null || !Number.isFinite(proj)) return p;
    resolved += 1;
    return { ...p, proj: round1(proj) };
  });
  if (resolved === 0) return withCLV;
  // The team total is only honest when (nearly) the whole roster resolved — a
  // partial total would rig the tape's Proj Pts comparison against the side with
  // more unresolved names. Per-player values still show whatever resolved.
  const projTotal = resolved >= players.length * 0.8
    ? round1(
        typeof projTotalFn === 'function'
          ? projTotalFn(players, withCLV)
          : players.reduce((sum, p) => sum + (p.proj || 0), 0),
      )
    : null;
  return { ...withCLV, players, projTotal };
}

// Stored platform values are 'underdog' | 'draftkings' (see migration 011).
function derivePlatform(players) {
  const fromAdp = players.find(
    (p) => p.adpPlatform === 'underdog' || p.adpPlatform === 'draftkings',
  )?.adpPlatform;
  if (fromAdp) return fromAdp;
  const slate = players[0]?.slateTitle || '';
  return slate.startsWith('DK') ? 'draftkings' : 'underdog';
}

// Board picks carry no per-player ADP/platform hint, so derive from the slate title
// (DK boards are tagged "DK …", UD boards "UD …" — see the extension board capture).
function platformFromSlate(slateTitle) {
  return (slateTitle || '').startsWith('DK') ? 'draftkings' : 'underdog';
}

// Normalized fingerprint of a roster's players, used to match the syncing user's own
// seat within a captured board so it is not re-registered as a board team.
export function playerNameKey(players) {
  return (players || [])
    .map((p) => (p.name || '').trim().replace(/\s+/g, ' ').toLowerCase())
    .filter(Boolean)
    .sort()
    .join('|');
}

// Build the anonymized snapshot from a roster's picks (already pick-sorted).
// `adpLookup` (optional) resolves a name -> latest ADP for picks that carry no ADP
// of their own (board teams); owned-team rows already have `latestADP`, which wins.
// `draftedAtOverride` (optional) is stamped on when the picks themselves carry no
// timestamp — board picks have none, but they share a draft (and so a draft date)
// with the syncing user's own entry for that same draftId.
function buildSnapshot(sorted, platform, tournamentTitle, slateTitle, adpLookup, draftedAtOverride = null) {
  // Normalize positions up front (CB → WR) so the snapshot, its posSnap counts,
  // and the archetype classification all agree.
  const picks = sorted.map((p) => ({ ...p, position: normalizePos(p.position) }));

  const posSnap = picks.reduce((acc, p) => {
    acc[p.position] = (acc[p.position] || 0) + 1;
    return acc;
  }, {});

  const players = picks.map((p) => {
    const rowAdp = Number(p.latestADP);
    const adp = Number.isFinite(rowAdp) ? rowAdp : (adpLookup ? adpLookup(p.name) : null);
    const clv = calcCLV(p.pick, adp);
    return {
      name: p.name,
      position: p.position,
      team: p.team,
      pick: p.pick,
      round: p.round,
      adp: round1(adp),
      clv: round1(clv),
    };
  });

  const clvVals = players.map((p) => p.clv).filter((v) => v != null);
  const avgCLV = clvVals.length
    ? round1(clvVals.reduce((a, b) => a + b, 0) / clvVals.length)
    : null;

  // Draft date: earliest pick timestamp, kept as a plain date. Owned rosters carry
  // pickedAt from the extension sync; board picks have no timestamps, so board
  // snapshots simply omit the field (the UI shows the date only when present).
  const times = sorted
    .map((p) => (p.pickedAt ? new Date(p.pickedAt).getTime() : NaN))
    .filter((t) => Number.isFinite(t));
  const draftedAt = times.length
    ? new Date(Math.min(...times)).toISOString().slice(0, 10)
    : (draftedAtOverride || null);

  return {
    players,
    posSnap,
    path: classifyRosterPath(picks),
    count: picks.length,
    platform,
    tournamentTitle: tournamentTitle || null,
    slateTitle: slateTitle || null,
    avgCLV,
    draftedAt,
  };
}

/**
 * Group flat roster rows by entry and build one enrollable team per entry.
 * @param {Array} rosterData flat rows: {name, position, team, entry_id, pick, round, latestADP, ...}
 * @param {Array} [masterPlayers] processed master list, used as an ADP fallback for CLV
 * @returns {Array<{entryId, platform, count, avgCLV, tournamentTitle, slateTitle, snapshot}>}
 */
export function buildEnrollableTeams(rosterData, masterPlayers) {
  const adpLookup = buildAdpLookup(masterPlayers);
  const map = {};
  (rosterData || []).forEach((p) => {
    const id = p.entry_id || 'Unknown';
    (map[id] ||= []).push(p);
  });

  return Object.entries(map)
    .filter(([id]) => id && id !== 'Unknown')
    .filter(([, players]) => !hasUnresolvedPlayers(players))
    .map(([entryId, players]) => {
      const sorted = [...players].sort((a, b) => (a.pick || 0) - (b.pick || 0));
      const platform = derivePlatform(sorted);
      const snapshot = buildSnapshot(
        sorted,
        platform,
        sorted[0]?.tournamentTitle || null,
        sorted[0]?.slateTitle || null,
        adpLookup,
      );
      return {
        entryId,
        platform,
        count: sorted.length,
        avgCLV: snapshot.avgCLV,
        tournamentTitle: snapshot.tournamentTitle,
        slateTitle: snapshot.slateTitle,
        snapshot,
      };
    })
    .sort((a, b) => (a.tournamentTitle || '').localeCompare(b.tournamentTitle || ''));
}

/**
 * Build anonymized board teams (the other 11 pod rosters) from a captured board.
 * Groups the board's picks by draftEntryId, drops the seat matching the syncing
 * user's own roster (ownKey), and returns one registerable board team per remaining
 * seat. Owner identity (UD draftEntryId/userId) is carried for server-side dedup
 * only — it is never placed in the anonymized snapshot.
 *
 * @param {{draftId: string, slateTitle: string|null, picks: Array}} board
 * @param {string} ownKey playerNameKey() of the user's own roster for this draft
 * @param {(name: string) => number|null} [adpLookup] master-list ADP fallback for CLV
 * @param {string|null} [tournamentTitle] the pod's tournament, known from the syncing
 *   user's own entry in the same draft — board picks carry no tournament of their own,
 *   and the featured-tournament scoping (BBM7) matches on it
 * @param {string|null} [draftedAt] the pod's draft date (YYYY-MM-DD), known from the
 *   syncing user's own entry in the same draft — board picks carry no pick timestamps
 *   of their own, but every seat in a draft is drafted simultaneously, so the owning
 *   user's draft date applies to the whole pod
 * @returns {Array<{boardEntryRef: string, userId: string|null, platform: string, draftId: string, snapshot: object}>}
 */
export function buildBoardTeams(board, ownKey, adpLookup, tournamentTitle = null, draftedAt = null) {
  if (!board || !Array.isArray(board.picks) || board.picks.length === 0) return [];
  const platform = platformFromSlate(board.slateTitle);

  const seats = {};
  for (const pk of board.picks) {
    const ref = pk.draftEntryId != null ? String(pk.draftEntryId) : null;
    if (!ref || !pk.name) continue; // skip empty/unresolved picks
    (seats[ref] ||= { userId: pk.userId != null ? String(pk.userId) : null, picks: [] }).picks.push(pk);
  }

  const out = [];
  for (const [ref, seat] of Object.entries(seats)) {
    const sorted = [...seat.picks].sort((a, b) => (a.pick || 0) - (b.pick || 0));
    if (ownKey && playerNameKey(sorted) === ownKey) continue; // the user's own seat
    if (hasUnresolvedPlayers(sorted)) continue; // degraded capture — not pool-worthy
    out.push({
      boardEntryRef: ref,
      userId: seat.userId,
      platform,
      draftId: String(board.draftId),
      snapshot: buildSnapshot(sorted, platform, tournamentTitle || null, board.slateTitle || null, adpLookup, draftedAt),
    });
  }
  return out;
}
