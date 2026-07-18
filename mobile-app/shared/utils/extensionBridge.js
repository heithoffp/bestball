import { supabase } from './supabaseClient';
import { normalizePosition } from './helpers';

/**
 * Re-bucket DK entries into Pre-Draft / Post-Draft slates from the tournament
 * name. Older syncs stamped every DK entry as "DK Pre-Draft"; this normalizer
 * keeps slate grouping correct without requiring a re-sync. Mirrors
 * `deriveDkSlate` in chrome-extension/src/adapters/draftkings.js.
 */
function normalizeSlateTitle(slateTitle, tournamentTitle) {
  if (!slateTitle || !slateTitle.startsWith('DK')) return slateTitle;
  const tourn = (tournamentTitle || '').toLowerCase();
  return tourn.includes('early bird') ? 'DK Pre-Draft' : 'DK Post-Draft';
}

/**
 * Map a raw extension_entries row to the Entry shape consumers use.
 * Exported so the delta-sync path (entriesCache.js, ADR-030) maps its rows
 * identically — including the DK slate normalization above.
 */
export function mapEntryRow(row) {
  return {
    entryId: row.entry_id,
    tournamentTitle: row.tournament,
    slateTitle: normalizeSlateTitle(row.slate_title ?? null, row.tournament),
    draftDate: row.draft_date,
    players: row.players,
    syncedAt: row.synced_at,
  };
}

/**
 * Reads portfolio entries synced from the Chrome extension for the given user.
 * Returns an array of Entry objects matching the adapter interface shape.
 *
 * Paginated: PostgREST caps un-ranged selects at 1000 rows, so a single
 * select silently truncates portfolios past 1000 entries.
 *
 * @param {string} userId
 * @returns {Promise<Array<{entryId: string, tournamentTitle: string|null, slateTitle: string|null, draftDate: string|null, players: Array, syncedAt: string}>>}
 */
export async function readExtensionEntries(userId) {
  if (!supabase || !userId) return [];

  const PAGE = 1000;
  const entries = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('extension_entries')
      .select('entry_id, tournament, slate_title, draft_date, players, synced_at')
      .eq('user_id', userId)
      .order('synced_at', { ascending: false })
      .range(from, from + PAGE - 1);

    if (error) throw error;
    entries.push(...(data ?? []).map(mapEntryRow));
    if (!data || data.length < PAGE) break;
  }
  return entries;
}

/**
 * Deletes a single synced roster from `extension_entries` for the given user.
 * Scoped to `(user_id, entry_id)`; RLS additionally restricts deletes to the
 * caller's own rows. Throws on error so callers can surface it.
 *
 * Note: this is not durable against a still-live draft — the extension's
 * incremental sync re-fetches any draft absent from `extension_entries` that
 * still exists on the platform (see chrome-extension bridge.js). Thrown-out /
 * invalid drafts no longer appear in the platform's draft list, so once
 * deleted they stay gone.
 *
 * @param {string} userId
 * @param {string} entryId
 * @returns {Promise<void>}
 */
export async function deleteExtensionEntry(userId, entryId) {
  if (!supabase || !userId || !entryId) {
    throw new Error('[BBM] deleteExtensionEntry requires supabase + userId + entryId');
  }
  const { error } = await supabase
    .from('extension_entries')
    .delete()
    .eq('user_id', userId)
    .eq('entry_id', entryId);
  if (error) throw error;
}

/**
 * Converts extension Entry objects into the flat roster row shape
 * expected by processLoadedData's rosterRows parameter.
 *
 * @param {Array<{entryId: string, tournamentTitle: string|null, slateTitle: string|null, draftDate: string|null, players: Array, syncedAt: string}>} entries
 * @returns {Array<{name, position, team, entry_id, pick, round, pickedAt, tournamentTitle, slateTitle}>}
 */
export function convertEntriesToRosterRows(entries) {
  const rows = [];
  for (const entry of entries) {
    for (const player of (entry.players ?? [])) {
      rows.push({
        name: player.name?.trim().replace(/\s+/g, ' ') || 'Unknown',
        position: normalizePosition(player.position),
        team: player.team || 'N/A',
        entry_id: entry.entryId,
        pick: Number(player.pick) || 0,
        round: player.round ?? (player.pick > 0 ? Math.ceil(player.pick / 18) : '-'),
        pickedAt: entry.draftDate || null,
        tournamentTitle: entry.tournamentTitle || null,
        slateTitle: entry.slateTitle || null,
      });
    }
  }
  return rows.filter(p => p.name !== 'Unknown');
}
