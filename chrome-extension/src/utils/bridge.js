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
    slateTitle: row.slate_title ?? '',
    draftDate: row.draft_date,
    players: row.players ?? [],
  }));
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

/**
 * Writes portfolio entries to Supabase for the current user.
 * When `platform` is provided, only deletes that platform's previous entries
 * (tracked via chrome.storage), leaving other platforms' entries untouched.
 * When `platform` is omitted, falls back to full-replace (legacy behavior).
 *
 * Entries must match the adapter interface Entry shape:
 *   { entryId, tournamentTitle, draftDate, players: [{name, position, team, pick, round}] }
 *
 * @param {Array} entries
 * @param {{ platform?: string }} [options]
 * @returns {Promise<{count: number}>}
 */
export async function writeEntries(entries, { platform } = {}) {
  if (!supabase) throw new Error('[BBM] Supabase not configured');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('[BBM] Not authenticated');

  const userId = session.user.id;

  if (platform) {
    // Per-platform scoped delete: only remove this platform's previous entries.
    // Previous entry IDs are stored in chrome.storage so we can clean up stale entries
    // (e.g. drafts the user left) without touching other platforms' rows.
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
      // Migration path: first sync under new per-platform mode for Underdog.
      // No stored IDs yet, so fall back to full replace to avoid duplicates.
      const { error: deleteError } = await supabase
        .from('extension_entries')
        .delete()
        .eq('user_id', userId);
      if (deleteError) throw deleteError;
    }
  } else {
    // Legacy full-replace (no platform specified)
    const { error: deleteError } = await supabase
      .from('extension_entries')
      .delete()
      .eq('user_id', userId);
    if (deleteError) throw deleteError;
  }

  if (entries.length === 0) {
    await chrome.storage.local.set({ lastSync: Date.now(), entryCount: 0 });
    return { count: 0 };
  }

  const rows = entries.map(e => ({
    user_id: userId,
    entry_id: e.entryId,
    tournament: e.tournamentTitle ?? null,
    slate_title: e.slateTitle ?? null,
    draft_date: e.draftDate ?? null,
    players: e.players ?? [],
    synced_at: new Date().toISOString(),
  }));

  const { error: insertError, count } = await supabase
    .from('extension_entries')
    .insert(rows, { count: 'exact' });
  if (insertError) throw insertError;

  const update = { lastSync: Date.now(), entryCount: entries.length };
  if (platform) update[`${platform}_entry_ids`] = entries.map(e => e.entryId);
  await chrome.storage.local.set(update);
  return { count: count ?? entries.length };
}
