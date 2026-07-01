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

/**
 * Fetch the set of draft ids that have a usable (player-named) board.
 * Boards from the pre-fix scraper hold null player names and are excluded —
 * they render as an empty grid and should not surface a button.
 *
 * @returns {Promise<Set<string>>}
 */
export async function fetchAvailableBoardIds() {
  if (!supabase) return new Set();
  try {
    const { data, error } = await supabase
      .from('draft_boards_admin')
      .select('draft_id, first_pick_name:picks->0->>name');
    if (error) return new Set();
    return new Set(
      (data ?? [])
        .filter(r => r.first_pick_name != null)
        .map(r => String(r.draft_id))
    );
  } catch {
    return new Set();
  }
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
  const ids = [...new Set(draftIds.map(String))];
  const CHUNK = 50;
  const out = [];
  for (let i = 0; i < ids.length; i += CHUNK) {
    const { data, error } = await supabase
      .from('draft_boards_admin')
      .select('draft_id, slate_title, entry_count, rounds, picks')
      .in('draft_id', ids.slice(i, i + CHUNK));
    if (error || !data) continue; // best-effort
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
  return out;
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
