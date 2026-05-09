import { supabase } from './supabase.js';

/**
 * Returns the current Supabase auth session, or null if not signed in.
 *
 * @returns {Promise<import('@supabase/supabase-js').Session|null>}
 */
export async function getAuthSession() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

/**
 * Signs in with email and password. Throws on failure.
 *
 * @param {string} email
 * @param {string} password
 * @returns {Promise<import('@supabase/supabase-js').Session>}
 */
export async function signIn(email, password) {
  if (!supabase) throw new Error('[BBM] Supabase not configured');
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

/**
 * Signs in with Google via chrome.identity OAuth flow.
 * Delegates to the background service worker for the popup, then sets the
 * Supabase session in this context with the returned tokens.
 *
 * @returns {Promise<import('@supabase/supabase-js').Session>}
 */
export async function signInWithGoogle() {
  if (!supabase) throw new Error('[BBM] Supabase not configured');
  const result = await chrome.runtime.sendMessage({ type: 'GOOGLE_OAUTH' });
  if (result.error) throw new Error(result.error);

  const { data, error } = await supabase.auth.setSession({
    access_token: result.access_token,
    refresh_token: result.refresh_token,
  });
  if (error) throw error;
  return data.session;
}

/**
 * Signs out the current user.
 *
 * @returns {Promise<void>}
 */
export async function signOut() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

/**
 * Fetches the current user's subscription tier from Supabase.
 * Uses the same derivation logic as the web app's SubscriptionContext.
 *
 * @returns {Promise<'pro'|'free'|null>} null on any error — caller should hide tier display
 */
export async function fetchTier() {
  try {
    if (!supabase) return null;
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const userId = session.user.id;

    const [subResult, profileResult] = await Promise.all([
      supabase
        .from('subscriptions')
        .select('status')
        .eq('user_id', userId)
        .in('status', ['active', 'trialing'])
        .limit(1)
        .maybeSingle(),
      supabase
        .from('profiles')
        .select('beta_expires_at')
        .eq('id', userId)
        .maybeSingle(),
    ]);

    const hasActiveSubscription = subResult.data?.status === 'active' || subResult.data?.status === 'trialing';
    const betaExpiresAt = profileResult.data?.beta_expires_at;
    const isBetaActive = betaExpiresAt ? new Date(betaExpiresAt) > new Date() : false;

    return (hasActiveSubscription || isBetaActive) ? 'pro' : 'free';
  } catch {
    return null;
  }
}

/**
 * Returns the set of entry_ids already stored in Supabase for the current user.
 * Used by incremental sync to skip re-fetching drafts already persisted.
 * Sourcing from Supabase (not chrome.storage) keeps this account-aware — when
 * the user switches Supabase identities, the new user's entry_ids are returned,
 * not stale IDs left in local storage by the previous session.
 *
 * @returns {Promise<string[]>}
 */
export async function readEntryIds() {
  if (!supabase) return [];
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return [];

  const { data, error } = await supabase
    .from('extension_entries')
    .select('entry_id')
    .eq('user_id', session.user.id);

  if (error) return [];
  return (data ?? []).map(r => r.entry_id);
}

/**
 * Reads portfolio entries from Supabase for the current authenticated user.
 * Returns entries in the same shape accepted by writeEntries().
 *
 * @returns {Promise<Array>}
 */
export async function readEntries() {
  if (!supabase) throw new Error('[BBM] Supabase not configured');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('[BBM] Not authenticated');

  const { data, error } = await supabase
    .from('extension_entries')
    .select('entry_id, tournament, slate_title, draft_date, players')
    .eq('user_id', session.user.id);

  if (error) throw error;
  return (data ?? []).map(row => ({
    entryId: row.entry_id,
    tournamentTitle: row.tournament,
    slateTitle: normalizeSlateTitle(row.slate_title ?? '', row.tournament),
    draftDate: row.draft_date,
    players: row.players ?? [],
  }));
}

/**
 * Re-bucket DK entries by tournament name when reading from Supabase. Older
 * syncs stamped every DK entry as "DK Pre-Draft"; this normalizer keeps slate
 * grouping correct without requiring a re-sync. Mirrors `deriveDkSlate` in
 * src/adapters/draftkings.js.
 */
function normalizeSlateTitle(slateTitle, tournamentTitle) {
  if (!slateTitle || !slateTitle.startsWith('DK')) return slateTitle;
  const tourn = (tournamentTitle || '').toLowerCase();
  return tourn.includes('early bird') ? 'DK Pre-Draft' : 'DK Post-Draft';
}

/**
 * Reads the user's saved PlayerRankings data from Supabase.
 * Returns an array of {name, rank, tierNum} in ranked order, or null if unavailable.
 *
 * @returns {Promise<Array<{name: string, rank: number, tierNum: number}>|null>}
 */
export async function readRankings() {
  if (!supabase) return null;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('user_rankings')
    .select('rankings')
    .eq('user_id', session.user.id)
    .maybeSingle();
  if (error || !data) return null;
  return data.rankings ?? null;
}

function entryToRow(userId, e) {
  return {
    user_id: userId,
    entry_id: e.entryId,
    tournament: e.tournamentTitle ?? null,
    slate_title: e.slateTitle ?? null,
    draft_date: e.draftDate ?? null,
    players: e.players ?? [],
    synced_at: new Date().toISOString(),
  };
}

/**
 * Writes portfolio entries to Supabase for the current user.
 *
 * Accepts two shapes:
 *   - Legacy / full-replace: an Entry[] array. Deletes the platform's previous
 *     rows (tracked in chrome.storage) and inserts the provided set.
 *   - Incremental: { newEntries, currentDraftIds }. Upserts newEntries by
 *     (user_id, entry_id), and deletes only the previously-stored ids that
 *     are no longer present in currentDraftIds (drafts the user withdrew from).
 *
 * Entry shape: { entryId, tournamentTitle, slateTitle, draftDate, players }
 *
 * @param {Array | {newEntries: Array, currentDraftIds: string[]}} input
 * @param {{ platform?: string }} [options]
 * @returns {Promise<{count: number}>}
 */
export async function writeEntries(input, { platform } = {}) {
  if (!supabase) throw new Error('[BBM] Supabase not configured');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('[BBM] Not authenticated');

  const userId = session.user.id;
  const isIncremental = !Array.isArray(input);

  if (isIncremental) {
    if (!platform) throw new Error('[BBM] Incremental writeEntries requires platform');

    const { newEntries = [], currentDraftIds = [] } = input;
    const storageKey = `${platform}_entry_ids`;
    const stored = await new Promise(r => chrome.storage.local.get([storageKey], r));
    const previousIds = stored[storageKey] ?? [];

    const currentSet = new Set(currentDraftIds.map(String));
    const staleIds   = previousIds.filter(id => !currentSet.has(String(id)));

    if (staleIds.length > 0) {
      const { error } = await supabase
        .from('extension_entries')
        .delete()
        .eq('user_id', userId)
        .in('entry_id', staleIds);
      if (error) throw error;
    }

    if (newEntries.length > 0) {
      const rows = newEntries.map(e => entryToRow(userId, e));
      const { error } = await supabase
        .from('extension_entries')
        .upsert(rows, { onConflict: 'user_id,entry_id' });
      if (error) throw error;
    }

    const totalCount = currentDraftIds.length;
    await new Promise((resolve) => chrome.storage.local.set({
      lastSync:                       Date.now(),
      entryCount:                     totalCount,
      [`${platform}_entry_ids`]:      currentDraftIds.map(String),
      [`${platform}_lastSync`]:       Date.now(),
      [`${platform}_entryCount`]:     totalCount,
    }, () => resolve()));
    return { count: totalCount };
  }

  // Legacy full-replace path
  const entries = input;

  if (platform) {
    const storageKey = `${platform}_entry_ids`;
    const stored = await new Promise(r => chrome.storage.local.get([storageKey], r));
    const previousIds = stored[storageKey] ?? [];

    if (previousIds.length > 0) {
      const { error: deleteError } = await supabase
        .from('extension_entries')
        .delete()
        .eq('user_id', userId)
        .in('entry_id', previousIds);
      if (deleteError) throw deleteError;
    } else if (platform === 'underdog') {
      const { error: deleteError } = await supabase
        .from('extension_entries')
        .delete()
        .eq('user_id', userId);
      if (deleteError) throw deleteError;
    }
  } else {
    const { error: deleteError } = await supabase
      .from('extension_entries')
      .delete()
      .eq('user_id', userId);
    if (deleteError) throw deleteError;
  }

  if (entries.length === 0) {
    const emptyUpdate = { lastSync: Date.now(), entryCount: 0 };
    if (platform) {
      emptyUpdate[`${platform}_lastSync`] = Date.now();
      emptyUpdate[`${platform}_entryCount`] = 0;
    }
    await new Promise((resolve) => chrome.storage.local.set(emptyUpdate, () => resolve()));
    return { count: 0 };
  }

  const rows = entries.map(e => entryToRow(userId, e));

  const { error: insertError, count } = await supabase
    .from('extension_entries')
    .upsert(rows, { onConflict: 'user_id,entry_id', count: 'exact' });
  if (insertError) throw insertError;

  const update = { lastSync: Date.now(), entryCount: entries.length };
  if (platform) {
    update[`${platform}_entry_ids`] = entries.map(e => e.entryId);
    update[`${platform}_lastSync`] = Date.now();
    update[`${platform}_entryCount`] = entries.length;
  }
  await new Promise((resolve) => chrome.storage.local.set(update, () => resolve()));
  return { count: count ?? entries.length };
}
