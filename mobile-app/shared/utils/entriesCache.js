// entriesCache.js — on-device cache of the user's extension_entries portfolio
// (ADR-030, mobile-only). Launch renders from this cache immediately; a
// background pass then pulls only rows with synced_at past the cached cursor
// (the extension bumps synced_at on every upsert, so the delta catches adds
// AND edits) plus a lightweight entry_id list to reconcile deletions.
//
// Stored as a JSON file via expo-file-system (not AsyncStorage): a large
// portfolio serializes to multiple MB, which is file territory. The file is
// keyed by user id inside the payload — a mismatched or corrupt file is
// treated as a miss and deleted, never served.
import { File, Paths } from 'expo-file-system';
import { supabase } from './supabaseClient';
import { mapEntryRow } from './extensionBridge';

const CACHE_VERSION = 1;
const CACHE_FILENAME = `bbe-entries-cache-v${CACHE_VERSION}.json`;
const PAGE = 1000; // PostgREST caps un-ranged selects at 1000 rows

function cacheFile() {
  return new File(Paths.document, CACHE_FILENAME);
}

/** Latest synced_at across the cached entries — the delta cursor. */
function cursorOf(entries) {
  let max = null;
  for (const e of entries) {
    if (e.syncedAt && (max === null || e.syncedAt > max)) max = e.syncedAt;
  }
  return max;
}

/**
 * Read the cached portfolio for a user. Returns { entries, cursor } or null
 * on any miss condition: no file, version/user mismatch, or corrupt JSON
 * (corrupt files are deleted so they can't wedge future launches).
 *
 * @param {string} userId
 * @returns {{ entries: Array, cursor: string|null }|null}
 */
export function readEntriesCache(userId) {
  if (!userId) return null;
  const file = cacheFile();
  try {
    if (!file.exists) return null;
    const payload = JSON.parse(file.text());
    if (payload?.version !== CACHE_VERSION || payload?.userId !== userId
        || !Array.isArray(payload.entries)) {
      return null;
    }
    return { entries: payload.entries, cursor: payload.cursor ?? cursorOf(payload.entries) };
  } catch {
    try { file.delete(); } catch { /* already gone */ }
    return null;
  }
}

/**
 * Persist the portfolio for a user. Fail-soft: a write failure just means the
 * next launch pays the full fetch again.
 *
 * @param {string} userId
 * @param {Array} entries - mapped entries (readExtensionEntries shape)
 */
export function writeEntriesCache(userId, entries) {
  if (!userId || !Array.isArray(entries)) return;
  const file = cacheFile();
  try {
    const payload = { version: CACHE_VERSION, userId, cursor: cursorOf(entries), entries };
    if (!file.exists) file.create();
    file.write(JSON.stringify(payload));
  } catch {
    /* fail soft */
  }
}

/** Remove the cache (sign-out / account deletion). */
export function clearEntriesCache() {
  try {
    const file = cacheFile();
    if (file.exists) file.delete();
  } catch {
    /* fail soft */
  }
}

/**
 * Pure merge of a cached portfolio with a delta fetch and the live id list.
 * Upserts delta entries by entryId, drops cached entries whose id is no
 * longer live (deletions), and keeps the newest-first ordering the full
 * fetch produces. Exported for direct node testing (no expo imports needed
 * beyond module load).
 *
 * @param {Array} cached - cached entries
 * @param {Array} delta - freshly fetched entries (synced_at > cursor)
 * @param {Set<string>|null} liveIds - all entry_ids currently in the table,
 *   or null when the id fetch failed (skip deletion reconciliation)
 * @returns {{ entries: Array, changed: boolean }}
 */
export function mergeEntries(cached, delta, liveIds) {
  const byId = new Map(cached.map(e => [e.entryId, e]));
  let changed = false;
  for (const e of delta) {
    const prev = byId.get(e.entryId);
    if (!prev || prev.syncedAt !== e.syncedAt) changed = true;
    byId.set(e.entryId, e);
  }
  if (liveIds) {
    for (const id of [...byId.keys()]) {
      if (!liveIds.has(id)) {
        byId.delete(id);
        changed = true;
      }
    }
  }
  if (!changed) return { entries: cached, changed: false };
  const entries = [...byId.values()].sort((a, b) =>
    (b.syncedAt ?? '').localeCompare(a.syncedAt ?? ''));
  return { entries, changed: true };
}

// Paginated fetch of rows newer than the cursor, mapped to entry shape.
async function fetchDelta(userId, cursor) {
  const out = [];
  for (let from = 0; ; from += PAGE) {
    let query = supabase
      .from('extension_entries')
      .select('entry_id, tournament, slate_title, draft_date, players, synced_at')
      .eq('user_id', userId)
      .order('synced_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (cursor) query = query.gt('synced_at', cursor);
    const { data, error } = await query;
    if (error) throw error;
    out.push(...(data ?? []).map(mapEntryRow));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// Paginated fetch of just the live entry_id set (~bytes per row) so deletions
// made from any client since the cache was written can be reconciled.
async function fetchLiveIds(userId) {
  const ids = new Set();
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('extension_entries')
      .select('entry_id')
      .eq('user_id', userId)
      .order('entry_id')
      .range(from, from + PAGE - 1);
    if (error) throw error;
    for (const r of (data ?? [])) ids.add(r.entry_id);
    if (!data || data.length < PAGE) break;
  }
  return ids;
}

/**
 * Background refresh of a cache hit: delta query + id-list reconciliation in
 * parallel, merged locally. Fails soft to the cached entries — a refresh
 * failure must never take down a portfolio that already rendered.
 *
 * @param {string} userId
 * @param {{ entries: Array, cursor: string|null }} cached
 * @returns {Promise<{ entries: Array, changed: boolean }>}
 */
export async function refreshEntries(userId, cached) {
  if (!supabase || !userId) return { entries: cached.entries, changed: false };
  try {
    const [delta, liveIds] = await Promise.all([
      fetchDelta(userId, cached.cursor),
      fetchLiveIds(userId).catch(() => null), // reconcile is best-effort
    ]);
    return mergeEntries(cached.entries, delta, liveIds);
  } catch {
    return { entries: cached.entries, changed: false };
  }
}
