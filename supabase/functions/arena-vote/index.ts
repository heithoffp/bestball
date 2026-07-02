// arena-vote — validates a pairing token and records a vote, applying the
// server-computed Elo update (ADR-013 / TASK-281). Accepts guests
// (verify_jwt = false). Integrity controls (all load-bearing):
//   - token: HMAC-verified, unexpired, team ids + voter identity come from the
//            signed payload (client cannot retarget the vote);
//   - single-use / dedupe: arena_matches.pairing_id is UNIQUE — a replayed token
//            hits the constraint and is rejected;
//   - self-vote: a logged-in voter cannot vote on a matchup containing their own
//            team (also pre-excluded at pairing time);
//   - guest cap: guest votes count EQUALLY toward Elo but only the first
//            GUEST_VOTE_CAP per guest id are counted (TASK-285 decision).
// Clients NEVER write rating columns — only this function (service_role) does.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  betaGate,
  corsHeaders,
  getClientIp,
  GUEST_VOTE_CAP,
  hashClientIp,
  inMemoryRateLimit,
  json,
  N_PROVISIONAL,
  RATE_LIMIT_VOTES_PER_MIN,
  RATE_LIMIT_WINDOW_MS,
  resolveVoter,
  updatedElo,
  verifyToken,
} from "../_shared/arena.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const ARENA_TOKEN_SECRET = Deno.env.get("ARENA_TOKEN_SECRET")!;

const supabaseAdmin = createClient(SUPABASE_URL, SB_SERVICE_ROLE_KEY);

interface TeamRow {
  id: string;
  user_id: string | null; // null for ownerless board teams (ADR-014)
  elo: number;
  matches: number;
  wins: number;
  losses: number;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Anti-abuse (TASK-285): cheap per-IP throttle before any work.
  const ip = getClientIp(req);
  if (!inMemoryRateLimit(`vote:${ip}`, RATE_LIMIT_VOTES_PER_MIN, RATE_LIMIT_WINDOW_MS)) {
    console.warn(`[arena-vote] ip rate limited ip=${ip}`);
    return json({ error: "rate_limited" }, 429);
  }

  // Private-beta gate (ADR-015): only allowlisted authenticated accounts may vote
  // while beta_mode is true. Guest voting (TASK-285) is suspended during beta.
  const gate = await betaGate(req, SUPABASE_URL, SUPABASE_ANON_KEY, createClient, supabaseAdmin);
  if (!gate.allowed) {
    return json({ error: "beta_closed" }, 403);
  }

  let body: { token?: string; winner?: string; guestId?: string | null };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const { token, winner } = body;
  if (!token || (winner !== "a" && winner !== "b")) {
    return json({ error: "token and winner ('a'|'b') are required" }, 400);
  }

  // 1. Verify the signed token (signature + expiry). Team ids + voter come from it.
  let payload;
  try {
    payload = await verifyToken(token, ARENA_TOKEN_SECRET);
  } catch (e) {
    console.warn(`[arena-vote] invalid token: ${(e as Error).message}`);
    return json({ error: "invalid_token", detail: (e as Error).message }, 401);
  }

  // 2. Resolve the live caller and bind it to the token's intended voter.
  const { voterId, isGuest } = await resolveVoter(req, SUPABASE_URL, SUPABASE_ANON_KEY, createClient);
  if (payload.voter && payload.voter !== voterId) {
    // Token was minted for a different (or any) authenticated user.
    return json({ error: "token_voter_mismatch" }, 401);
  }
  // For guests the cap is keyed by the guest id baked into the token at pair time
  // (tamper-proof), falling back to the body only if absent.
  const guestId = isGuest ? (payload.guest ?? body.guestId ?? null) : null;

  // TASK-311 #3: a guest with no guest id cannot be durably capped by that key. The
  // client always sends one; a missing id is an anomalous/scripted caller, so reject
  // rather than record uncountable junk rows in arena_matches.
  if (isGuest && !guestId) {
    console.warn("[arena-vote] guest vote missing guestId — rejected");
    return json({ error: "guest_id_required" }, 400);
  }

  // IP hash (TASK-285 hybrid): a salted, non-reversible base64url handle for the
  // caller's IP, used as a SECOND durable key alongside guestId so a guest who
  // rotates guestId per vote can't reset the cap or the rate limit. Empty for an
  // unknown IP (then only guestId keys apply). Stored on the match row.
  const ipHash = isGuest ? await hashClientIp(ip, ARENA_TOKEN_SECRET) : "";

  // 2b. Durable per-voter vote-rate limit (TASK-285) — the load-bearing limiter
  // (gates state mutation; survives cold starts unlike the in-memory IP check).
  // Authed callers key on user id ONLY (so shared-NAT users aren't throttled as a
  // group); guests key on guestId OR ipHash (either hitting the limit blocks).
  const rlClauses = voterId
    ? [`voter_id.eq.${voterId}`]
    : [`voter_guest_id.eq.${guestId}`, ...(ipHash ? [`voter_ip_hash.eq.${ipHash}`] : [])];
  {
    const since = new Date(Date.now() - RATE_LIMIT_WINDOW_MS).toISOString();
    const { count, error: rlErr } = await supabaseAdmin
      .from("arena_matches")
      .select("id", { count: "exact", head: true })
      .gte("created_at", since)
      .or(rlClauses.join(","));
    if (rlErr) {
      console.error("[arena-vote] rate check failed:", rlErr);
      return json({ error: "rate_check_failed" }, 500);
    }
    if ((count ?? 0) >= RATE_LIMIT_VOTES_PER_MIN) {
      console.warn(`[arena-vote] voter rate limited voter=${voterId ?? guestId}`);
      return json({ error: "rate_limited" }, 429);
    }
  }

  // 3. Load both teams (service_role) for owner check + current Elo.
  const { data: teamRows, error: teamErr } = await supabaseAdmin
    .from("arena_teams")
    .select("id, user_id, elo, matches, wins, losses")
    .in("id", [payload.a, payload.b]);
  if (teamErr) {
    console.error("arena-vote team load failed:", teamErr);
    return json({ error: "team_load_failed" }, 500);
  }
  const teamA = (teamRows as TeamRow[] | null)?.find((t) => t.id === payload.a);
  const teamB = (teamRows as TeamRow[] | null)?.find((t) => t.id === payload.b);
  if (!teamA || !teamB) return json({ error: "team_not_found" }, 404);

  // 4. Self-vote exclusion.
  if (voterId && (teamA.user_id === voterId || teamB.user_id === voterId)) {
    console.warn(`[arena-vote] self-vote blocked voter=${voterId}`);
    return json({ error: "self_vote" }, 403);
  }

  const winnerTeam = winner === "a" ? teamA : teamB;
  const loserTeam = winner === "a" ? teamB : teamA;

  // 5. Decide whether this vote counts toward Elo. Authenticated: always. Guest:
  // only the first GUEST_VOTE_CAP counted votes per guest PER UTC CALENDAR DAY
  // (keyed on guestId OR the IP hash) count; the rest are recorded but not
  // counted. Guests with no id were already rejected above, so a guest here
  // always has at least the guestId key.
  let counted = true;
  if (isGuest) {
    // Hybrid cap (TASK-285, day-scoped): count this guest's prior COUNTED votes
    // since the start of the current UTC day, across BOTH durable keys (guestId
    // OR ipHash). Rotating the guestId no longer resets the cap because the
    // shared ipHash still accumulates. Over the cap → recorded but not counted;
    // the client surfaces that as a "sign in to keep counting" nudge.
    const capClauses = [`voter_guest_id.eq.${guestId}`, ...(ipHash ? [`voter_ip_hash.eq.${ipHash}`] : [])];
    const utcDayStart = new Date();
    utcDayStart.setUTCHours(0, 0, 0, 0);
    const { count, error: cntErr } = await supabaseAdmin
      .from("arena_matches")
      .select("id", { count: "exact", head: true })
      .eq("counted", true)
      .gte("created_at", utcDayStart.toISOString())
      .or(capClauses.join(","));
    if (cntErr) {
      console.error("arena-vote guest count failed:", cntErr);
      return json({ error: "guest_count_failed" }, 500);
    }
    counted = (count ?? 0) < GUEST_VOTE_CAP;
    if (!counted) console.log(`[arena-vote] guest cap reached guest=${guestId} (recorded, not counted)`);
  }

  // 6. Compute Elo (only applied if counted).
  const eloABefore = Number(teamA.elo);
  const eloBBefore = Number(teamB.elo);
  let eloAAfter = eloABefore;
  let eloBAfter = eloBBefore;
  if (counted) {
    const winnerBefore = winner === "a" ? eloABefore : eloBBefore;
    const loserBefore = winner === "a" ? eloBBefore : eloABefore;
    const winnerAfter = updatedElo(winnerBefore, loserBefore, 1, winnerTeam.matches);
    const loserAfter = updatedElo(loserBefore, winnerBefore, 0, loserTeam.matches);
    eloAAfter = winner === "a" ? winnerAfter : loserAfter;
    eloBAfter = winner === "a" ? loserAfter : winnerAfter;
  }

  // 7. Insert the match FIRST — pairing_id UNIQUE claims this vote and rejects
  // replays atomically (23505). Elo before/after are stored on the row.
  const { error: insErr } = await supabaseAdmin.from("arena_matches").insert({
    pairing_id: payload.pid,
    team_a_id: teamA.id,
    team_b_id: teamB.id,
    winner_id: winnerTeam.id,
    voter_id: voterId,
    voter_is_guest: isGuest,
    voter_guest_id: guestId,
    voter_ip_hash: ipHash || null,
    counted,
    elo_a_before: eloABefore,
    elo_a_after: eloAAfter,
    elo_b_before: eloBBefore,
    elo_b_after: eloBAfter,
  });
  if (insErr) {
    if ((insErr as { code?: string }).code === "23505") {
      return json({ error: "already_voted" }, 409);
    }
    console.error("arena-vote insert failed:", insErr);
    return json({ error: "vote_insert_failed" }, 500);
  }

  // 8. Apply the Elo + W/L update to both teams (service_role). Only if counted.
  if (counted) {
    const winnerMatches = winnerTeam.matches + 1;
    const loserMatches = loserTeam.matches + 1;
    const updates = [
      supabaseAdmin.from("arena_teams").update({
        elo: winner === "a" ? eloAAfter : eloBAfter,
        matches: winnerMatches,
        wins: winnerTeam.wins + 1,
        provisional: winnerMatches < N_PROVISIONAL,
        updated_at: new Date().toISOString(),
      }).eq("id", winnerTeam.id),
      supabaseAdmin.from("arena_teams").update({
        elo: winner === "a" ? eloBAfter : eloAAfter,
        matches: loserMatches,
        losses: loserTeam.losses + 1,
        provisional: loserMatches < N_PROVISIONAL,
        updated_at: new Date().toISOString(),
      }).eq("id", loserTeam.id),
    ];
    const results = await Promise.all(updates);
    const updErr = results.find((r) => r.error)?.error;
    if (updErr) {
      // The match row is recorded; standings update failed. Surface it (a batch
      // Elo recompute is the ADR-013 fallback if this proves common).
      console.error("arena-vote standings update failed:", updErr);
      return json({ error: "standings_update_failed" }, 500);
    }
  }

  // Observability (TASK-285): one structured line per recorded vote for volume
  // tracking + anomaly spotting in the Supabase function logs.
  console.log(`[arena-vote] recorded pairing=${payload.pid} winner=${winner} counted=${counted} guest=${isGuest}`);

  return json({
    counted,
    winner,
    team_a: { before: eloABefore, after: eloAAfter, delta: eloAAfter - eloABefore },
    team_b: { before: eloBBefore, after: eloBAfter, delta: eloBAfter - eloBBefore },
  }, 200);
});
