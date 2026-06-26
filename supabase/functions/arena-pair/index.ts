// arena-pair — issues a blind head-to-head matchup + a signed single-use pairing
// token (ADR-013 / TASK-281). Accepts guests (verify_jwt = false). Selects a
// COMPARABLE matchup (same platform, nearby Elo) from the eligible pool and
// EXCLUDES the caller's own teams. Returns only anonymized display snapshots —
// no owner identity, no Elo — so voting is blind.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  corsHeaders,
  ELO_WINDOW,
  json,
  type PairingPayload,
  POOL_SAMPLE_LIMIT,
  resolveVoter,
  signToken,
  TOKEN_TTL_SECONDS,
} from "../_shared/arena.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const ARENA_TOKEN_SECRET = Deno.env.get("ARENA_TOKEN_SECRET")!;

const supabaseAdmin = createClient(SUPABASE_URL, SB_SERVICE_ROLE_KEY);

interface PoolTeam {
  id: string;
  user_id: string;
  platform: string;
  elo: number;
  matches: number;
  display_snapshot: unknown;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let body: { guestId?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine (guest with no id yet)
  }

  const { voterId, isGuest } = await resolveVoter(req, SUPABASE_URL, SUPABASE_ANON_KEY, createClient);
  const guestId = isGuest ? (body.guestId ?? null) : null;

  // Eligibility mode governs the pool. opt_in (launch default): enrolled teams only.
  const { data: cfg } = await supabaseAdmin
    .from("arena_config")
    .select("arena_eligibility_mode")
    .eq("id", true)
    .single();
  const mode = cfg?.arena_eligibility_mode ?? "opt_in";

  // Pull a bounded eligible sample, biased toward teams with the FEWEST matches so
  // provisional teams converge quickly. Exclude the caller's own teams.
  let query = supabaseAdmin
    .from("arena_teams")
    .select("id, user_id, platform, elo, matches, display_snapshot")
    .order("matches", { ascending: true })
    .limit(POOL_SAMPLE_LIMIT);
  if (mode === "opt_in") query = query.eq("enrolled", true);
  if (voterId) query = query.neq("user_id", voterId);

  const { data: pool, error } = await query;
  if (error) {
    console.error("arena-pair pool query failed:", error);
    return json({ error: "pool_query_failed" }, 500);
  }

  const teams = (pool ?? []) as PoolTeam[];
  if (teams.length < 2) {
    return json({ pairing: null, reason: "insufficient_pool" }, 200);
  }

  // Pick team A from the lowest-matches third (these are sorted ascending) so
  // newer teams get exposure, then pick a comparable opponent B.
  const headSize = Math.max(2, Math.ceil(teams.length / 3));
  const head = teams.slice(0, headSize);
  const teamA = head[Math.floor(Math.random() * head.length)];

  // Candidate opponents: same platform, different owner, not team A.
  const candidates = teams.filter(
    (t) => t.id !== teamA.id && t.platform === teamA.platform && t.user_id !== teamA.user_id,
  );
  if (candidates.length === 0) {
    return json({ pairing: null, reason: "insufficient_pool" }, 200);
  }

  // Prefer opponents within ELO_WINDOW; fall back to the single nearest by Elo.
  const within = candidates.filter((t) => Math.abs(t.elo - teamA.elo) <= ELO_WINDOW);
  let teamB: PoolTeam;
  if (within.length > 0) {
    teamB = within[Math.floor(Math.random() * within.length)];
  } else {
    teamB = candidates.reduce((best, t) =>
      Math.abs(t.elo - teamA.elo) < Math.abs(best.elo - teamA.elo) ? t : best
    );
  }

  // Randomize left/right so position carries no signal.
  const [first, second] = Math.random() < 0.5 ? [teamA, teamB] : [teamB, teamA];

  const pairingId = crypto.randomUUID();
  const payload: PairingPayload = {
    pid: pairingId,
    a: first.id,
    b: second.id,
    voter: voterId,
    guest: guestId,
    exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
  };
  const token = await signToken(payload, ARENA_TOKEN_SECRET);

  return json({
    pairing: {
      pairing_id: pairingId,
      token,
      team_a: { id: first.id, display_snapshot: first.display_snapshot },
      team_b: { id: second.id, display_snapshot: second.display_snapshot },
    },
  }, 200);
});
