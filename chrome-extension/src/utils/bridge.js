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
 * Writes portfolio entries to Supabase, replacing any existing rows for the user.
 * Entries must match the adapter interface Entry shape:
 *   { entryId, tournamentTitle, draftDate, players: [{name, position, team, pick, round}] }
 *
 * @param {Array} entries
 * @returns {Promise<{count: number}>}
 */
export async function writeEntries(entries) {
  if (!supabase) throw new Error('[BBM] Supabase not configured');
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('[BBM] Not authenticated');

  const userId = session.user.id;

  // Full replace: delete all existing rows for this user, then insert the new batch
  const { error: deleteError } = await supabase
    .from('extension_entries')
    .delete()
    .eq('user_id', userId);
  if (deleteError) throw deleteError;

  if (entries.length === 0) {
    await chrome.storage.local.set({ lastSync: Date.now(), entryCount: 0 });
    return { count: 0 };
  }

  const rows = entries.map(e => ({
    user_id: userId,
    entry_id: e.entryId,
    tournament: e.tournamentTitle ?? null,
    draft_date: e.draftDate ?? null,
    players: e.players ?? [],
    synced_at: new Date().toISOString(),
  }));

  const { error: insertError, count } = await supabase
    .from('extension_entries')
    .insert(rows, { count: 'exact' });
  if (insertError) throw insertError;

  await chrome.storage.local.set({ lastSync: Date.now(), entryCount: entries.length });
  return { count: count ?? entries.length };
}
