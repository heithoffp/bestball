import { supabase } from './supabaseClient';

/**
 * Reads portfolio entries synced from the Chrome extension for the given user.
 * Returns an array of Entry objects matching the adapter interface shape.
 *
 * @param {string} userId
 * @returns {Promise<Array<{entryId: string, tournamentTitle: string|null, slateTitle: string|null, draftDate: string|null, players: Array, syncedAt: string}>>}
 */
export async function readExtensionEntries(userId) {
  if (!supabase || !userId) return [];

  const { data, error } = await supabase
    .from('extension_entries')
    .select('entry_id, tournament, slate_title, draft_date, players, synced_at')
    .eq('user_id', userId)
    .order('synced_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map(row => ({
    entryId: row.entry_id,
    tournamentTitle: row.tournament,
    slateTitle: row.slate_title ?? null,
    draftDate: row.draft_date,
    players: row.players,
    syncedAt: row.synced_at,
  }));
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
        position: player.position || 'N/A',
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
