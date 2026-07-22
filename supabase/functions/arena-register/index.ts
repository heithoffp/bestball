// arena-register — auto-registration ingestion for the opt-out Arena (ADR-014 /
// TASK-288, scoped by ADR-032 / TASK-359).
//
// ADR-032 narrows the Arena pool to the featured tournament (owned BBM7) only.
// This function now writes ONLY owned, featured teams into arena_teams:
//   - owned teams: source='owned', user_id = caller, dedup (user_id, entry_id, platform),
//                  and ONLY if the snapshot belongs to the featured tournament.
//
// Non-featured owned teams are rejected (counted in ownedRejected). Board teams are
// no longer ingested at all — the board block was removed and any boardTeams the
// client still submits are ignored (counted in boardRejected for response-shape
// stability). Claim-on-sync (ADR-016) was removed too: with no board rows in the
// pool there is nothing to claim.
//
// Integrity:
//   - Private-beta gate (ADR-015): only allowlisted authenticated accounts (403 else).
//   - Featured-only write gate (ADR-032): isFeaturedSnapshot mirrors the migration-016
//     generated column, so the write path and the query path agree on the pool scope.
//   - Account-level enrollment (ADR-016): new owned rows honor the caller's
//     arena_user_prefs.enrolled switch (missing row = enrolled).
//   - Rating columns are never written here — they keep their server defaults and
//     change only via arena-vote.
//
// Board-row schema is retained but dormant (ADR-032): this function no longer writes
// source='board' rows.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  betaGate,
  corsHeaders,
  getClientIp,
  inMemoryRateLimit,
  isFeaturedSnapshot,
  json,
  MAX_OWNED_TEAMS_PER_USER,
  RATE_LIMIT_REGISTERS_PER_MIN,
  RATE_LIMIT_WINDOW_MS,
} from "../_shared/arena.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SB_SERVICE_ROLE_KEY);

const MAX_TEAMS = 2000; // per-request batch cap — the client batches large portfolios
                        // (a heavy account yields many owned teams).

interface OwnedTeam {
  entryId: string;
  platform: string;
  draftId?: string | null;
  snapshot: unknown;
}
interface BoardTeam {
  boardEntryRef: string;
  userId?: string | null;
  platform: string;
  draftId: string;
  snapshot: unknown;
}

const VALID_PLATFORMS = new Set(["underdog", "draftkings"]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  // Anti-abuse (TASK-311 #1): cheap per-IP throttle before any work. Registration
  // does real DB writes, so cap request volume from a single source.
  const ip = getClientIp(req);
  if (!inMemoryRateLimit(`register:${ip}`, RATE_LIMIT_REGISTERS_PER_MIN, RATE_LIMIT_WINDOW_MS)) {
    console.warn(`[arena-register] ip rate limited ip=${ip}`);
    return json({ error: "rate_limited" }, 429);
  }

  // Private-beta gate (ADR-015). Registration is always account-scoped, so an
  // unauthenticated caller is rejected regardless of beta_mode — but with the
  // RIGHT error (TASK-311 #4): during beta the door is closed (beta_closed); once
  // public it is merely an auth requirement (auth_required), not a beta message.
  const gate = await betaGate(req, SUPABASE_URL, SUPABASE_ANON_KEY, createClient, supabaseAdmin);
  if (!gate.voterId) {
    return gate.betaMode
      ? json({ error: "beta_closed" }, 403)
      : json({ error: "auth_required" }, 401);
  }
  if (!gate.allowed) {
    return json({ error: "beta_closed" }, 403);
  }
  const voterId = gate.voterId;

  let body: { ownedTeams?: OwnedTeam[]; boardTeams?: BoardTeam[] };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const ownedIn = (body.ownedTeams ?? []).filter(
    (t) => t && t.entryId && VALID_PLATFORMS.has(t.platform) && t.snapshot,
  );
  // Featured-only write gate (ADR-032): only teams belonging to the featured
  // tournament (BBM7) enter the pool. Non-featured teams are dropped here and
  // counted in ownedRejected so the response still accounts for the whole batch.
  const ownedFeatured = ownedIn.filter((t) => isFeaturedSnapshot(t.snapshot));
  const boardIn = (body.boardTeams ?? []).filter(
    (t) => t && t.boardEntryRef && t.draftId && VALID_PLATFORMS.has(t.platform) && t.snapshot,
  );
  if (ownedIn.length + boardIn.length > MAX_TEAMS) {
    return json({ error: "too_many_teams" }, 413);
  }

  let ownedWritten = 0;
  const ownedRejected = ownedIn.length - ownedFeatured.length; // non-featured dropped
  // Board teams are no longer ingested (ADR-032) — the pool is owned-BBM7 only.
  // Anything a client still submits is ignored; report it as rejected for
  // response-shape stability. ownedClaimed stays 0 (claim-on-sync removed: with no
  // board rows in the pool there is nothing to claim).
  const boardWritten = 0;
  const boardRejected = boardIn.length;
  const ownedClaimed = 0;

  // ── Owned teams (featured only) ────────────────────────────────────────────
  // Insert-new-only: existing teams keep their frozen snapshot (cheap re-runs — no
  // per-row UPDATE storm across a large portfolio).
  if (ownedFeatured.length > 0) {
    const { data: existing, error: selErr } = await supabaseAdmin
      .from("arena_teams")
      .select("entry_id, platform")
      .eq("user_id", voterId)
      .eq("source", "owned");
    if (selErr) {
      console.error("[arena-register] owned select failed:", selErr);
      return json({ error: "owned_select_failed" }, 500);
    }
    const seen = new Set<string>();
    for (const r of existing ?? []) seen.add(`${r.entry_id}::${r.platform}`);

    // Durable per-user owned-team ceiling (TASK-311 #1): reject a batch that would
    // push the account past MAX_OWNED_TEAMS_PER_USER. Checked against the LIVE count
    // so it holds across the client's sequential batches, not just per request.
    if ((existing?.length ?? 0) + ownedFeatured.length > MAX_OWNED_TEAMS_PER_USER) {
      console.warn(`[arena-register] owned quota exceeded voter=${voterId} existing=${existing?.length ?? 0}`);
      return json({ error: "owned_quota_exceeded" }, 429);
    }

    // Account-level enrollment switch (ADR-016): missing pref row = enrolled.
    const { data: pref } = await supabaseAdmin
      .from("arena_user_prefs")
      .select("enrolled")
      .eq("user_id", voterId)
      .maybeSingle();
    const enrolledDefault = pref?.enrolled ?? true;

    const toInsert: Record<string, unknown>[] = [];
    for (const t of ownedFeatured) {
      const k = `${t.entryId}::${t.platform}`;
      if (seen.has(k)) continue; // already registered
      seen.add(k); // also dedupe within this batch
      toInsert.push({
        user_id: voterId,
        entry_id: t.entryId,
        platform: t.platform,
        source: "owned",
        draft_id: t.draftId ?? t.entryId,
        display_snapshot: t.snapshot,
        enrolled: enrolledDefault,
      });
    }
    if (toInsert.length > 0) {
      const { error } = await supabaseAdmin.from("arena_teams").insert(toInsert);
      if (error) {
        console.error("[arena-register] owned insert failed:", error);
        return json({ error: "owned_insert_failed" }, 500);
      }
      ownedWritten += toInsert.length;
    }
  }

  console.log(`[arena-register] voter=${voterId} owned=${ownedWritten} ownedRejected=${ownedRejected} board=${boardWritten} boardRejected=${boardRejected}`);
  return json({ ownedWritten, ownedClaimed, ownedRejected, boardWritten, boardRejected }, 200);
});
