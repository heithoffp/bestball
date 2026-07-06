// arena-pair — issues a head-to-head matchup + a signed single-use pairing token
// (ADR-013 / TASK-281). Accepts guests (verify_jwt = false). Selects a COMPARABLE
// matchup (same platform, nearby Elo) from the eligible pool and EXCLUDES the
// caller's own teams. Returns anonymized display snapshots (no owner identity) plus
// each team's live elo + matches, so the client can render the rating change the
// instant a pick lands (server vote result stays authoritative). The matchup UI
// still hides the ratings until the voter picks — presentational blindness only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  betaGate,
  corsHeaders,
  ELO_WINDOW,
  FEATURED_TOURNAMENT_OR_FILTER,
  getClientIp,
  inMemoryRateLimit,
  json,
  type PairingPayload,
  POOL_SAMPLE_LIMIT,
  RATE_LIMIT_PAIRS_PER_MIN,
  RATE_LIMIT_WINDOW_MS,
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
  user_id: string | null; // null for ownerless board teams (ADR-014)
  platform: string;
  elo: number;
  matches: number;
  display_snapshot: unknown;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Anti-abuse (TASK-285): cheap per-IP throttle on pairing requests. Pairings
  // mutate no state, so this is a best-effort backstop against compute spam.
  const ip = getClientIp(req);
  if (!inMemoryRateLimit(`pair:${ip}`, RATE_LIMIT_PAIRS_PER_MIN, RATE_LIMIT_WINDOW_MS)) {
    console.warn(`[arena-pair] rate limited ip=${ip}`);
    return json({ error: "rate_limited" }, 429);
  }

  let body: { guestId?: string | null } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine (guest with no id yet)
  }

  // Private-beta gate (ADR-015): during beta_mode, only allowlisted authenticated
  // accounts may pair — guests and non-allowlisted users are turned away.
  const gate = await betaGate(req, SUPABASE_URL, SUPABASE_ANON_KEY, createClient, supabaseAdmin);
  if (!gate.allowed) {
    return json({ pairing: null, reason: "beta_closed" }, 403);
  }
  const { voterId, isGuest } = gate;
  const guestId = isGuest ? (body.guestId ?? null) : null;

  // Pull a bounded eligible sample, biased toward teams with the FEWEST matches so
  // provisional teams converge quickly. The caller's own teams are excluded IN THE
  // QUERY — filtering after the LIMIT starves the pool when the caller owns most of
  // the low-match sample (their own never-voted teams pin matches=0 and crowd out
  // every votable team). A plain `.neq("user_id", voterId)` would also drop board
  // rows (`NULL <> x` is NULL in Postgres), so the filter explicitly keeps NULLs.
  const fetchVotablePool = async () => {
    let query = supabaseAdmin
      .from("arena_teams")
      .select("id, user_id, platform, elo, matches, display_snapshot")
      .order("matches", { ascending: true })
      .limit(POOL_SAMPLE_LIMIT);
    // ADR-016: enrollment is account-level and `enrolled` is its materialized
    // per-row state, so the pool ALWAYS respects it. The old arena_config
    // arena_eligibility_mode flag is retired in place — the pool is opt-out
    // (everything in the database) minus unenrolled accounts.
    query = query.eq("enrolled", true);
    // Only BBM synced-user teams vote for now. Ownerless "board" rows (the other
    // pod rosters captured under ADR-014) stay in the database for when the pool is
    // expanded, but are excluded from the votable pool so voters only ever see teams
    // belonging to real synced accounts.
    query = query.eq("source", "owned");
    if (voterId) query = query.or(`user_id.is.null,user_id.neq.${voterId}`);
    // The Arena presents ONE tournament for now (BBM7): pairing is featured-only,
    // with no full-pool fallback — a non-BBM matchup would contradict every
    // BBM7-scoped surface in the UI. The rest of the database stays enrolled for
    // when more slates are presented.
    query = query.or(FEATURED_TOURNAMENT_OR_FILTER);

    const { data: pool, error } = await query;
    if (error) return { teams: null, error };
    // Defense-in-depth: re-apply the own-team exclusion in memory (keeps ownerless
    // board teams — only rows owned by the caller are removed).
    const teams = ((pool ?? []) as PoolTeam[]).filter(
      (t) => !voterId || t.user_id !== voterId,
    );
    return { teams, error: null };
  };

  // Select a matchup from a pool: team A from the lowest-matches third (the pool is
  // sorted ascending, so newer teams get exposure), then a comparable opponent B.
  // Returns null when the pool cannot produce a valid pair.
  const selectPair = (teams: PoolTeam[]): [PoolTeam, PoolTeam] | null => {
    if (teams.length < 2) return null;
    const headSize = Math.max(2, Math.ceil(teams.length / 3));
    const head = teams.slice(0, headSize);
    const teamA = head[Math.floor(Math.random() * head.length)];

    // Candidate opponents: same platform, not team A, and not the SAME real owner.
    // The owner check must ignore NULLs — board teams all have user_id = null, and
    // `null !== null` is false, which would wrongly treat every pair of board teams
    // as same-owner and exclude them. Only exclude when both are owned by one user.
    const candidates = teams.filter(
      (t) =>
        t.id !== teamA.id &&
        t.platform === teamA.platform &&
        !(t.user_id != null && teamA.user_id != null && t.user_id === teamA.user_id),
    );
    if (candidates.length === 0) return null;

    // Prefer opponents within ELO_WINDOW; fall back to the single nearest by Elo.
    const within = candidates.filter((t) => Math.abs(t.elo - teamA.elo) <= ELO_WINDOW);
    const teamB = within.length > 0
      ? within[Math.floor(Math.random() * within.length)]
      : candidates.reduce((best, t) =>
        Math.abs(t.elo - teamA.elo) < Math.abs(best.elo - teamA.elo) ? t : best);

    // Randomize left/right so position carries no signal.
    return Math.random() < 0.5 ? [teamA, teamB] : [teamB, teamA];
  };

  // Featured tournament only (TASK-301, tightened for the BBM7-only presentation):
  // when the featured pool can't produce a valid pair the caller gets
  // insufficient_pool — there is deliberately NO full-pool fallback, so a voter is
  // never shown a non-BBM matchup.
  const featured = await fetchVotablePool();
  if (featured.error) {
    console.error("arena-pair pool query failed:", featured.error);
    return json({ error: "pool_query_failed" }, 500);
  }
  const pair = selectPair(featured.teams ?? []);
  if (!pair) {
    return json({ pairing: null, reason: "insufficient_pool" }, 200);
  }
  const [first, second] = pair;

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
      team_a: { id: first.id, elo: first.elo, matches: first.matches, display_snapshot: first.display_snapshot },
      team_b: { id: second.id, elo: second.elo, matches: second.matches, display_snapshot: second.display_snapshot },
    },
  }, 200);
});
