import { supabase } from './supabaseClient';

/**
 * Reads portfolio entries synced from the Chrome extension for the given user.
 * Returns an array of Entry objects matching the adapter interface shape.
 *
 * @param {string} userId
 * @returns {Promise<Array<{entryId: string, tournamentTitle: string|null, draftDate: string|null, players: Array, syncedAt: string}>>}
 */
export async function readExtensionEntries(userId) {
  if (!supabase || !userId) return [];

  const { data, error } = await supabase
    .from('extension_entries')
    .select('entry_id, tournament, draft_date, players, synced_at')
    .eq('user_id', userId)
    .order('synced_at', { ascending: false });

  if (error) throw error;

  return (data ?? []).map(row => ({
    entryId: row.entry_id,
    tournamentTitle: row.tournament,
    draftDate: row.draft_date,
    players: row.players,
    syncedAt: row.synced_at,
  }));
}
