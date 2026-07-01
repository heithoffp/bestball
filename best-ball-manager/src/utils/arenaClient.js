// arenaClient.js — browser-side client for the Best Ball Arena (ADR-013).
//
// Voting (pair/vote) goes through the Edge Functions; leaderboard + enrollment are
// direct Supabase reads/writes governed by RLS. Clients NEVER write rating columns
// (the column-scoped grants in migration 011 make elo/matches/etc. unreachable),
// so enrollment only ever sets enrolled + display_snapshot on the owner's own rows.

import { supabase } from './supabaseClient';
import { FEATURED_TOURNAMENT } from './arenaFeatured';

const FUNCTIONS_URL = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`
  : null;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// The Arena needs a deployed backend (Edge Functions + Supabase). When env is
// absent (e.g. local guest dev), the UI degrades to a friendly "warming up" state.
export const ARENA_AVAILABLE = !!(FUNCTIONS_URL && ANON_KEY && supabase);

const GUEST_ID_KEY = 'bbe_arena_guest_id';

// A stable-ish guest id so the server can apply the per-guest vote cap. Easily
// reset by the user — server-side IP rate limiting is the real backstop.
export function getGuestId() {
  if (typeof localStorage === 'undefined') return null;
  let id = localStorage.getItem(GUEST_ID_KEY);
  if (!id) {
    id = (typeof crypto !== 'undefined' && crypto.randomUUID)
      ? crypto.randomUUID()
      : `g_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(GUEST_ID_KEY, id);
  }
  return id;
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
      body: JSON.stringify({ guestId: getGuestId() }),
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
    body: JSON.stringify({ token, winner, guestId: getGuestId() }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error(data.error || 'vote_failed'), { status: res.status, data });
  }
  return data;
}

/**
 * Leaderboard — teams ranked by Elo. Under opt-out (ADR-014) every registered team
 * is shown by default, so there is no `enrolled` filter; visibility is governed by
 * RLS (during the private beta, allowlisted accounts only — ADR-015).
 * @param {{platform?: 'all'|'underdog'|'draftkings', tournament?: 'featured'|'all', limit?: number}} opts
 */
export async function getLeaderboard({ platform = 'all', tournament = 'all', limit = 200 } = {}) {
  if (!supabase) return [];
  let q = supabase
    .from('arena_teams')
    .select('id, platform, elo, wins, losses, matches, provisional, display_snapshot, user_id')
    .order('elo', { ascending: false })
    .limit(limit);
  if (platform !== 'all') q = q.eq('platform', platform);
  if (tournament === 'featured') q = q.or(FEATURED_TOURNAMENT.orFilter);
  const { data, error } = await q;
  if (error) throw error;
  return data ?? [];
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
 * Enroll (or re-enroll + refresh snapshot) one of the user's own teams.
 * Uses explicit select-then-insert/update (NOT upsert) to respect the
 * column-scoped grants: INSERT may set only (user_id, entry_id, platform,
 * display_snapshot, enrolled); UPDATE only (display_snapshot, enrolled, updated_at).
 */
export async function enrollTeam({ entryId, platform, snapshot }) {
  if (!supabase) throw new Error('unavailable');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');

  const { data: existing, error: selErr } = await supabase
    .from('arena_teams')
    .select('id')
    .match({ user_id: user.id, entry_id: entryId, platform })
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    const { error } = await supabase
      .from('arena_teams')
      .update({ display_snapshot: snapshot, enrolled: true, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('arena_teams')
      .insert({ user_id: user.id, entry_id: entryId, platform, display_snapshot: snapshot, enrolled: true });
    if (error) throw error;
  }
}

/** Unenroll — removes the team from the pool + leaderboard but keeps its Elo history. */
export async function unenrollTeam({ entryId, platform }) {
  if (!supabase) throw new Error('unavailable');
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('not_authenticated');
  const { error } = await supabase
    .from('arena_teams')
    .update({ enrolled: false, updated_at: new Date().toISOString() })
    .match({ user_id: user.id, entry_id: entryId, platform });
  if (error) throw error;
}
