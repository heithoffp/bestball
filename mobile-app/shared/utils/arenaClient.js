// arenaClient.js — browser-side client for the Best Ball Arena (ADR-013).
//
// Voting (pair/vote) goes through the Edge Functions; leaderboard + enrollment are
// direct Supabase reads/writes governed by RLS. Clients NEVER write rating columns
// (the column-scoped grants in migration 011 make elo/matches/etc. unreachable),
// so enrollment only ever sets enrolled + display_snapshot on the owner's own rows.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabaseClient';
import { SUPABASE_FUNCTIONS_URL, SUPABASE_ANON_KEY } from '../config';

const FUNCTIONS_URL = SUPABASE_FUNCTIONS_URL;
const ANON_KEY = SUPABASE_ANON_KEY;

// The Arena needs a deployed backend (Edge Functions + Supabase). When env is
// absent (e.g. local guest dev), the UI degrades to a friendly "warming up" state.
export const ARENA_AVAILABLE = !!(FUNCTIONS_URL && ANON_KEY && supabase);

const GUEST_ID_KEY = 'bbe_arena_guest_id';

// A stable-ish guest id so the server can apply the per-guest vote cap. Easily
// reset by the user — server-side IP rate limiting is the real backstop.
// Async on mobile (AsyncStorage); an in-memory cache keeps repeat calls cheap.
let _guestId = null;
export async function getGuestId() {
  if (_guestId) return _guestId;
  try {
    let id = await AsyncStorage.getItem(GUEST_ID_KEY);
    if (!id) {
      id = (typeof crypto !== 'undefined' && crypto.randomUUID)
        ? crypto.randomUUID()
        : `g_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      await AsyncStorage.setItem(GUEST_ID_KEY, id);
    }
    _guestId = id;
    return id;
  } catch {
    _guestId = `g_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    return _guestId;
  }
}

async function functionHeaders() {
  const headers = { 'Content-Type': 'application/json', apikey: ANON_KEY };
  // The Supabase gateway requires a Bearer token; use the user's JWT when signed
  // in, else the public anon key (functions accept guests — verify_jwt = false).
  let token = ANON_KEY;
  if (supabase) {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) token = session.access_token;
  }
  headers.Authorization = `Bearer ${token}`;
  return headers;
}

/**
 * Fetch the next blind matchup.
 * @returns {Promise<{pairing: {pairing_id, token, team_a, team_b}|null, reason?: string}>}
 */
export async function getPairing() {
  if (!ARENA_AVAILABLE) return { pairing: null, reason: 'unavailable' };
  try {
    const res = await fetch(`${FUNCTIONS_URL}/arena-pair`, {
      method: 'POST',
      headers: await functionHeaders(),
      body: JSON.stringify({ guestId: await getGuestId() }),
    });
    if (!res.ok) return { pairing: null, reason: res.status === 429 ? 'rate_limited' : 'error' };
    return await res.json();
  } catch {
    return { pairing: null, reason: 'error' };
  }
}

/**
 * Submit a vote. winner is 'a' or 'b'.
 * @returns {Promise<{counted, winner, team_a, team_b}>}
 * @throws on failure (with .status and .data)
 */
export async function submitVote({ token, winner }) {
  if (!ARENA_AVAILABLE) throw new Error('unavailable');
  const res = await fetch(`${FUNCTIONS_URL}/arena-vote`, {
    method: 'POST',
    headers: await functionHeaders(),
    body: JSON.stringify({ token, winner, guestId: await getGuestId() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error || 'vote_failed'), { status: res.status, data });
  }
  return data;
}

/**
 * Leaderboard — teams ranked by Elo. Scoped to synced-user teams (source='owned');
 * ownerless board rows are held back from the leaderboard for now. Under opt-out
 * (ADR-014/016) every registered team is shown by default; `enrolled=false` marks
 * accounts that flipped the account-level switch off (ADR-016), so those rows are
 * excluded everywhere.
 * Visibility is otherwise governed by RLS (during the private beta, allowlisted
 * accounts only — ADR-015).
 * Defaults to the featured (BBM7) scope while that's the whole presentation — a
 * call site must opt IN to the full pool, not accidentally fall into it.
 * Paginated via `.range()` (TASK-313) so the full pool is reachable, not just the
 * first page; `total` is the enrolled-team count under the active filters, for
 * building page controls.
 * The exact count is fetched once per (platform, tournament) per session and
 * cached (TASK-316) — pool membership changes rarely, and counting on every
 * page view forced a filtered scan per call. The cache clears when this client
 * changes pool membership (registration / enrollment flip).
 * @param {{platform?: 'all'|'underdog'|'draftkings', tournament?: 'featured'|'all', limit?: number, offset?: number}} opts
 * @returns {Promise<{rows: Array, total: number}>}
 */
const _lbTotals = new Map(); // `${platform}|${tournament}` → session-cached exact total

export async function getLeaderboard({ platform = 'all', tournament = 'featured', limit = 50, offset = 0 } = {}) {
  if (!supabase) return { rows: [], total: 0 };
  // Anon no longer has a column grant for user_id (TASK-296 #3 — a logged-out caller
  // could otherwise group arena_teams by user_id to reconstruct a whole account's
  // portfolio). Only request it when signed in, where it's needed to mark "your
  // team" on the board; selecting an ungranted column would 42501 for guests.
  const { data: { user } } = await supabase.auth.getUser();
  const cols = 'id, platform, elo, wins, losses, matches, provisional, display_snapshot'
    + (user ? ', user_id' : '');
  const totalKey = `${platform}|${tournament}`;
  const cachedTotal = _lbTotals.get(totalKey);
  let q = supabase
    .from('arena_teams')
    .select(cols, cachedTotal == null ? { count: 'exact' } : {})
    .eq('enrolled', true)
    // Only synced-user teams are shown for now; ownerless board rows are excluded.
    .eq('source', 'owned')
    .order('elo', { ascending: false })
    .range(offset, offset + limit - 1);
  if (platform !== 'all') q = q.eq('platform', platform);
  if (tournament === 'featured') q = q.eq('featured', true);
  const { data, error, count } = await q;
  if (error) throw error;
  if (cachedTotal == null) _lbTotals.set(totalKey, count ?? 0);
  return { rows: data ?? [], total: cachedTotal ?? count ?? 0 };
}

/**
 * Player / NFL-team search over the leaderboard pool. Each pattern is a SQL
 * ilike pattern (e.g. '%Ja\'Marr Chase%') matched against the snapshot's players
 * array serialized as text (display_snapshot->>players), and ALL patterns must
 * match (AND) — "the best team with X and Y". Results come back best Elo first,
 * capped at `limit`; `total` is the full match count for the summary line.
 * Same visibility rules as getLeaderboard (enrolled, owned, RLS, featured scope).
 * Note: snapshots store teams as the platform stored them (UD full names, DK
 * abbreviations) — callers build team patterns from the full name, which covers
 * the featured UD board.
 * @param {{patterns: string[], platform?: 'all'|'underdog'|'draftkings', tournament?: 'featured'|'all', limit?: number}} opts
 * @returns {Promise<{rows: Array, total: number}>}
 */
export async function searchLeaderboard({ patterns = [], platform = 'all', tournament = 'featured', limit = 50 } = {}) {
  if (!supabase) return { rows: [], total: 0 };
  // Same guest column rule as getLeaderboard — user_id is only granted (and only
  // needed, for the "You" tag) when signed in.
  const { data: { user } } = await supabase.auth.getUser();
  const cols = 'id, platform, elo, wins, losses, matches, provisional, display_snapshot'
    + (user ? ', user_id' : '');
  let q = supabase
    .from('arena_teams')
    .select(cols, { count: 'exact' })
    .eq('enrolled', true)
    .eq('source', 'owned')
    .order('elo', { ascending: false })
    .limit(limit);
  if (platform !== 'all') q = q.eq('platform', platform);
  if (tournament === 'featured') q = q.eq('featured', true);
  patterns.forEach((p) => { q = q.ilike('display_snapshot->>players', p); });
  const { data, error, count } = await q;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

/**
 * The viewer's highest-Elo team under the given filters (TASK-303). Returns null
 * for guests or when no team matches the filters.
 */
export async function getMyBestArenaTeam({ platform = 'all', tournament = 'featured' } = {}) {
  if (!supabase) return null;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  let q = supabase
    .from('arena_teams')
    .select('id, platform, elo, wins, losses, matches, provisional')
    .eq('user_id', user.id)
    .eq('enrolled', true)
    .order('elo', { ascending: false })
    .limit(1);
  if (platform !== 'all') q = q.eq('platform', platform);
  if (tournament === 'featured') q = q.eq('featured', true);
  const { data, error } = await q;
  if (error) throw error;
  return data?.[0] ?? null;
}

/**
 * True rank of an Elo value under the given filters (TASK-303): teams strictly
 * above it + 1, plus the total pool size. Two head-only count queries under the
 * same RLS the leaderboard reads with — no schema change, works past the 200-row
 * leaderboard page.
 */
export async function getArenaRank({ elo, platform = 'all', tournament = 'featured' } = {}) {
  if (!supabase || !Number.isFinite(elo)) return null;
  const build = () => {
    let q = supabase.from('arena_teams').select('id', { count: 'exact', head: true }).eq('enrolled', true).eq('source', 'owned');
    if (platform !== 'all') q = q.eq('platform', platform);
    if (tournament === 'featured') q = q.eq('featured', true);
    return q;
  };
  const [above, total] = await Promise.all([build().gt('elo', elo), build()]);
  if (above.error || total.error) throw (above.error || total.error);
  return { rank: (above.count ?? 0) + 1, total: total.count ?? 0 };
}

/**
 * Auto-register the user's own + participant-captured board teams into the opt-out
 * pool (ADR-014 / TASK-288). Goes through the arena-register Edge Function because
 * board rows are service-role-only. Beta-gated server-side (403 if not allowlisted).
 * @param {{ownedTeams: Array, boardTeams: Array}} payload
 * @returns {Promise<{ownedWritten, boardWritten, boardRejected}>}
 */
export async function registerArenaTeams({ ownedTeams = [], boardTeams = [] }) {
  if (!ARENA_AVAILABLE) return { ownedWritten: 0, boardWritten: 0, boardRejected: 0 };
  const res = await fetch(`${FUNCTIONS_URL}/arena-register`, {
    method: 'POST',
    headers: await functionHeaders(),
    body: JSON.stringify({ ownedTeams, boardTeams }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error || 'register_failed'), { status: res.status, data });
  }
  _lbTotals.clear(); // registration changes pool membership — refetch totals
  return data;
}

/**
 * Register a full portfolio in bounded batches. A heavy account produces thousands
 * of owned + board teams; a single request would blow the function's per-request cap
 * and the Edge Function body limit, so we split into sequential batches and sum the
 * results. Owned and board teams are batched separately for simplicity.
 * @param {{ownedTeams: Array, boardTeams: Array}} payload
 * @param {number} batchSize teams per request
 */
export async function registerAllArenaTeams({ ownedTeams = [], boardTeams = [] }, batchSize = 300) {
  const totals = { ownedWritten: 0, boardWritten: 0, boardRejected: 0, batches: 0 };
  if (!ARENA_AVAILABLE) return totals;

  const batches = [];
  for (let i = 0; i < ownedTeams.length; i += batchSize) {
    batches.push({ ownedTeams: ownedTeams.slice(i, i + batchSize), boardTeams: [] });
  }
  for (let i = 0; i < boardTeams.length; i += batchSize) {
    batches.push({ ownedTeams: [], boardTeams: boardTeams.slice(i, i + batchSize) });
  }

  for (const b of batches) {
    const r = await registerArenaTeams(b); // sequential — keeps each request small
    totals.ownedWritten += r.ownedWritten ?? 0;
    totals.boardWritten += r.boardWritten ?? 0;
    totals.boardRejected += r.boardRejected ?? 0;
    totals.batches += 1;
  }
  return totals;
}

/**
 * The Arena's private-beta switch (ADR-015). While true, only allowlisted accounts
 * may use the Arena; when the developer flips it false (TASK-310) the Arena is
 * public. Read from arena_config (client-readable per migration 012). Defaults to
 * true (closed) on any error so the client-side visibility gate fails closed.
 */
export async function getArenaBetaMode() {
  if (!supabase) return true;
  try {
    const { data, error } = await supabase
      .from('arena_config')
      .select('beta_mode')
      .eq('id', true)
      .single();
    if (error) return true;
    return data?.beta_mode ?? true;
  } catch {
    return true;
  }
}

/** The current user's arena rows (enrolled state + standings per entry). */
export async function getMyArenaTeams() {
  if (!supabase) return [];
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];
  const { data, error } = await supabase
    .from('arena_teams')
    .select('id, entry_id, platform, enrolled, elo, wins, losses, matches, provisional')
    .eq('user_id', user.id);
  if (error) throw error;
  return data ?? [];
}

/**
 * The user's account-level Arena enrollment state (ADR-016). A missing pref row
 * means enrolled — being in the Arena is the opt-out default.
 */
export async function getArenaEnrollment() {
  if (!supabase) return true;
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return true;
  const { data, error } = await supabase
    .from('arena_user_prefs')
    .select('enrolled')
    .eq('user_id', user.id)
    .maybeSingle();
  if (error) throw error;
  return data?.enrolled ?? true;
}

/**
 * Flip the account-level enrollment switch (ADR-016): persist the pref, then bulk-
 * apply it to every one of the user's arena_teams rows (RLS confines the update to
 * the caller's own source='owned' rows — board rows are untouchable). Uses explicit
 * select-then-insert/update (NOT upsert) to respect the column-scoped grants:
 * INSERT may set only (user_id, enrolled); UPDATE only (enrolled, updated_at).
 * Elo history is kept either way — unenrolling just leaves the pool + leaderboard.
 */
export async function setArenaEnrollment(enrolled) {
  if (!supabase) throw new Error('unavailable');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');

  const { data: existing, error: selErr } = await supabase
    .from('arena_user_prefs')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    const { error } = await supabase
      .from('arena_user_prefs')
      .update({ enrolled, updated_at: new Date().toISOString() })
      .eq('user_id', user.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('arena_user_prefs')
      .insert({ user_id: user.id, enrolled });
    if (error) throw error;
  }

  const { error: teamsErr } = await supabase
    .from('arena_teams')
    .update({ enrolled, updated_at: new Date().toISOString() })
    .eq('user_id', user.id);
  if (teamsErr) throw teamsErr;
  _lbTotals.clear(); // enrollment flip changes pool membership — refetch totals
}
