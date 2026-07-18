// src/utils/draftBoards.js
// Read access to admin-scraped Underdog draft boards (draft_boards_admin).
// Interim data source for the Roster Viewer board view (TASK-240): boards the
// developer scraped via the admin extension, keyed by UD draft id — which is
// the same id stored as entry_id on extension-synced rosters. Replaced by
// participant-authorized capture (ADR-009) in a future task.
//
// All reads fail soft: guests and users without the RLS grant simply see no
// board affordances.

import { supabase } from './supabaseClient';
import { cacheGetMany, cachePutMany } from './modelCache';

// Captured boards are immutable once written (upsert is last-writer-wins but
// a pod never re-drafts), so each board is cached on device permanently and
// fetched at most once (ADR-030). Bump the version to force a refetch if
// boards are ever re-scraped with corrected data.
const BOARD_CACHE_VERSION = 1;
const boardCacheKey = (draftId) => `board:v${BOARD_CACHE_VERSION}:${draftId}`;

/**
 * Fetch the set of draft ids that have a usable (player-named) board.
 * Boards from the pre-fix scraper hold null player names and are excluded —
 * they render as an empty grid and should not surface a button.
 *
 * Paginated: PostgREST caps un-ranged selects at 1000 rows, and the boards
 * table grew past that — a single select silently dropped newer boards and
 * their Board buttons vanished. Mirrors fetchAllBoards in realDraftData.js.
 *
 * @returns {Promise<Set<string>>}
 */
export async function fetchAvailableBoardIds() {
  if (!supabase) return new Set();
  const PAGE = 1000;
  const ids = new Set();
  try {
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from('draft_boards_admin')
        .select('draft_id, first_pick_name:picks->0->>name')
        .order('draft_id')
        .range(from, from + PAGE - 1);
      if (error || !data) break;
      for (const r of data) {
        if (r.first_pick_name != null) ids.add(String(r.draft_id));
      }
      if (data.length < PAGE) break;
    }
  } catch {
    // fail soft — no board affordances
  }
  return ids;
}

/**
 * Fetch many stored boards at once for Arena auto-registration (ADR-014 /
 * TASK-288). Under ADR-016 every draft_boards_admin source is Arena-eligible
 * (admin-scraped included — ADR-014's guardrail #3 is retired), so there is no
 * source filter. Chunked `IN` queries keep each response sane.
 *
 * @param {string[]} draftIds
 * @returns {Promise<Array<{draftId, slateTitle, entryCount, rounds, picks}>>}
 */
export async function fetchDraftBoards(draftIds) {
  if (!supabase || !draftIds?.length) return [];
  const allIds = [...new Set(draftIds.map(String))];

  // Device cache first (ADR-030): only ids never seen here hit the network.
  const cachedBoards = await cacheGetMany(allIds.map(boardCacheKey));
  const cached = [];
  const ids = [];
  allIds.forEach((id, i) => {
    if (cachedBoards[i]) cached.push(cachedBoards[i]);
    else ids.push(id);
  });
  if (ids.length === 0) return cached;

  const CHUNK = 50;
  const chunks = [];
  for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
  // Chunks fetch in parallel — the browser's per-host connection cap is the
  // throttle, so a big portfolio costs ~one round-trip, not chunks-many.
  const responses = await Promise.all(chunks.map(chunk =>
    supabase
      .from('draft_boards_admin')
      .select('draft_id, slate_title, entry_count, rounds, picks')
      .in('draft_id', chunk)
      .then(res => res, () => ({ data: null, error: true })) // best-effort per chunk
  ));
  const out = [];
  for (const { data, error } of responses) {
    if (error || !data) continue;
    for (const d of data) {
      out.push({
        draftId: String(d.draft_id),
        slateTitle: d.slate_title ?? null,
        entryCount: d.entry_count ?? 12,
        rounds: d.rounds ?? Math.ceil((d.picks?.length ?? 0) / (d.entry_count ?? 12)),
        picks: d.picks ?? [],
      });
    }
  }
  // Persist newly fetched boards. Known-bad boards (pre-fix scraper, null
  // player names) are NOT cached — if they're re-captured server-side the
  // fix should reach the device.
  cachePutMany(
    out.filter(b => b.picks?.[0]?.name != null)
       .map(b => [boardCacheKey(b.draftId), b])
  ).catch(() => { /* fail soft */ });
  return [...cached, ...out];
}

// ── User-board fetch, cached per session ─────────────────────────────────────

const _userBoardsCache = new Map(); // ids signature → Promise<boards>

/**
 * Fetch the user's usable captured boards directly by entry id — cached per
 * session so the Roster Viewer and the app-level prewarm share one fetch.
 * Replaces the old two-stage flow (page ALL board ids, then fetch the
 * intersection): asking for the user's ids directly returns exactly the
 * boards that exist, in one parallel round of chunked queries.
 *
 * Boards from the pre-fix scraper hold null player names and are filtered
 * out — they render as an empty grid and must not surface a Board button.
 *
 * @param {Array<string>} draftIds - the portfolio's entry ids
 * @returns {Promise<Array<{draftId, slateTitle, entryCount, rounds, picks}>>}
 */
export function fetchUserBoardsOnce(draftIds) {
  const ids = [...new Set((draftIds ?? []).map(String))].sort();
  const sig = ids.join('|');
  let promise = _userBoardsCache.get(sig);
  if (!promise) {
    promise = fetchDraftBoards(ids).then(boards => boards.filter(b => b.picks?.[0]?.name != null));
    _userBoardsCache.set(sig, promise);
    if (_userBoardsCache.size > 4) _userBoardsCache.delete(_userBoardsCache.keys().next().value);
  }
  return promise;
}

/**
 * Fetch one full draft board.
 *
 * @param {string} draftId
 * @returns {Promise<{draftId: string, slateTitle: string|null, entryCount: number, rounds: number, picks: Array<{pick: number, round: number|null, slot: number|null, draftEntryId: string, userId: string, name: string|null, position: string|null, team: string|null}>}|null>}
 */
export async function fetchDraftBoard(draftId) {
  if (!supabase || !draftId) return null;
  try {
    const { data, error } = await supabase
      .from('draft_boards_admin')
      .select('draft_id, slate_title, entry_count, rounds, picks')
      .eq('draft_id', draftId)
      .maybeSingle();
    if (error || !data) return null;
    return {
      draftId: String(data.draft_id),
      slateTitle: data.slate_title ?? null,
      entryCount: data.entry_count ?? 12,
      rounds: data.rounds ?? Math.ceil((data.picks?.length ?? 0) / (data.entry_count ?? 12)),
      picks: data.picks ?? [],
    };
  } catch {
    return null;
  }
}
