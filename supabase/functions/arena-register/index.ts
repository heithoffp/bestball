// arena-register — auto-registration ingestion for the opt-out Arena (ADR-014 /
// TASK-288). On Arena load, the client submits anonymized snapshots for the user's
// OWN teams and for the participant-captured BOARD teams (the other 11 pod rosters).
// This service_role function writes them into arena_teams:
//   - owned teams: source='owned', user_id = caller, dedup (user_id, entry_id, platform)
//   - board teams: source='board', user_id = NULL, dedup (board_entry_ref, platform);
//                  the raw UD draftEntryId + a salted hash of the UD userId are stored
//                  in service-role-only columns (never client-readable, guardrail #1).
//
// Integrity:
//   - Private-beta gate (ADR-015): only allowlisted authenticated accounts (403 else).
//   - Board existence check: a board team is registered only if its draft_id exists
//     in draft_boards_admin — ANY source ('extension' or 'admin_scraper'; ADR-016
//     retired ADR-014's guardrail #3). Fabricated draft ids are still refused.
//   - Claim-on-sync (ADR-016): an incoming owned team that matches an existing
//     ownerless board row (exact board_entry_ref, else per-draft roster fingerprint)
//     CLAIMS that row — it converts to source='owned' under the caller, keeping its
//     Elo history — instead of inserting a duplicate.
//   - Account-level enrollment (ADR-016): new owned rows honor the caller's
//     arena_user_prefs.enrolled switch (missing row = enrolled).
//   - Rating columns are never written here — they keep their server defaults and
//     change only via arena-vote (claims deliberately leave them untouched).
//
// Clients NEVER write board rows directly (no column grant + owner-only RLS scoped to
// source='owned'); this function is the only board-row writer.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  betaGate,
  corsHeaders,
  getClientIp,
  inMemoryRateLimit,
  json,
  MAX_OWNED_TEAMS_PER_USER,
  playerNameKey,
  RATE_LIMIT_REGISTERS_PER_MIN,
  RATE_LIMIT_WINDOW_MS,
} from "../_shared/arena.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const ARENA_TOKEN_SECRET = Deno.env.get("ARENA_TOKEN_SECRET")!;

const supabaseAdmin = createClient(SUPABASE_URL, SB_SERVICE_ROLE_KEY);

const MAX_TEAMS = 2000; // per-request batch cap — the client batches large portfolios
                        // (a heavy account yields thousands of owned + board teams).

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

// Stable, non-reversible identity for a board roster's UD owner (for dedup/takedown).
// Salted with ARENA_TOKEN_SECRET so it cannot be reversed or correlated externally.
async function hashUserId(userId: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(ARENA_TOKEN_SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(userId)));
  let bin = "";
  for (let i = 0; i < sig.length; i++) bin += String.fromCharCode(sig[i]);
  return btoa(bin);
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
  const boardIn = (body.boardTeams ?? []).filter(
    (t) => t && t.boardEntryRef && t.draftId && VALID_PLATFORMS.has(t.platform) && t.snapshot,
  );
  if (ownedIn.length + boardIn.length > MAX_TEAMS) {
    return json({ error: "too_many_teams" }, 413);
  }

  let ownedWritten = 0;
  let ownedClaimed = 0;
  let boardWritten = 0;
  let boardRejected = 0;

  // ── Owned teams ──────────────────────────────────────────────────────────
  // Insert-new-only: existing teams keep their frozen snapshot (cheap re-runs — no
  // per-row UPDATE storm across a large portfolio). New teams first try to CLAIM a
  // matching ownerless board row (ADR-016) so a roster that entered the pool via a
  // captured board keeps its Elo history when its owner shows up.
  if (ownedIn.length > 0) {
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
    if ((existing?.length ?? 0) + ownedIn.length > MAX_OWNED_TEAMS_PER_USER) {
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

    // Claim candidates (TASK-296 #1): ONLY ownerless board rows reachable by an
    // EXACT seat ref. board_entry_ref is the raw UD draftEntryId — a service-role-only
    // column that is never client-readable (guardrail #1) — so a caller can only ever
    // match a board row whose UD id equals one of THEIR OWN entry ids (their own seat,
    // captured by a pod-mate). The removed draft_id + roster-fingerprint fallback
    // matched purely on client-readable data (draft_id + player names), which let any
    // authenticated user echo a VISIBLE board row to hijack it — steal its Elo, replace
    // its public snapshot. Cross-user fingerprint dedup now lives only in the trusted
    // backfill script (service_role over server-stored data, not client input). Using
    // .in() (not a hand-built or() string) also removes the quoting bug that mishandled
    // a value ending in a backslash (TASK-311 #2).
    const entryIdList = [...new Set(ownedIn.map((t) => String(t.entryId)))];
    const { data: candidates, error: candErr } = await supabaseAdmin
      .from("arena_teams")
      .select("id, platform, board_entry_ref")
      .eq("source", "board")
      .in("board_entry_ref", entryIdList);
    if (candErr) {
      console.error("[arena-register] claim candidate select failed:", candErr);
      return json({ error: "claim_select_failed" }, 500);
    }
    const openCandidates = [...(candidates ?? [])];

    const toInsert: Record<string, unknown>[] = [];
    for (const t of ownedIn) {
      const k = `${t.entryId}::${t.platform}`;
      if (seen.has(k)) continue; // already registered
      seen.add(k); // also dedupe within this batch

      // Claim only on exact UD seat ref (see above — the sole unforgeable match).
      const idx = openCandidates.findIndex(
        (c) => c.platform === t.platform && String(c.board_entry_ref) === String(t.entryId),
      );
      if (idx !== -1) {
        const [cand] = openCandidates.splice(idx, 1); // one claim per board row
        const { error: claimErr } = await supabaseAdmin
          .from("arena_teams")
          .update({
            user_id: voterId,
            entry_id: t.entryId,
            source: "owned",
            display_snapshot: t.snapshot, // owned snapshot carries tournamentTitle
            enrolled: enrolledDefault,
            updated_at: new Date().toISOString(),
            // elo/matches/wins/losses/provisional intentionally untouched;
            // board_entry_ref/board_user_hash kept for provenance/takedown.
          })
          .eq("id", cand.id);
        if (claimErr) {
          console.error("[arena-register] claim update failed:", claimErr);
          return json({ error: "claim_update_failed" }, 500);
        }
        ownedClaimed += 1;
        continue;
      }

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

  // ── Board teams ──────────────────────────────────────────────────────────
  if (boardIn.length > 0) {
    // Existence + CONTENT validation (TASK-296 #2). The pod must be a real stored
    // board (any source — ADR-016 retired the source='extension' restriction), AND
    // each board team's client-built snapshot must match the seat's REAL picks. The
    // function no longer trusts client snapshot content: a caller with a genuine
    // draft_id could otherwise submit an enrolled board row full of arbitrary
    // "player" strings (or a forged "Best Ball Mania" attribution) that enters the
    // blind pairing pool shown to every voter. We rebuild each pod's per-seat roster
    // fingerprint from draft_boards_admin.picks (server truth) and reject any team
    // whose players don't match; the slate title is taken from the stored board too.
    const draftIds = [...new Set(boardIn.map((t) => String(t.draftId)))];
    const { data: okBoards, error: bErr } = await supabaseAdmin
      .from("draft_boards_admin")
      .select("draft_id, slate_title, picks")
      .in("draft_id", draftIds);
    if (bErr) {
      console.error("[arena-register] board verify failed:", bErr);
      return json({ error: "board_verify_failed" }, 500);
    }

    interface BoardPick { draftEntryId?: unknown; name?: unknown }
    const boardMeta = new Map<string, { slateTitle: string | null; seatKeys: Map<string, string> }>();
    for (const b of okBoards ?? []) {
      const seatPicks = new Map<string, { name: unknown }[]>();
      for (const pk of ((b.picks ?? []) as BoardPick[])) {
        const ref = pk.draftEntryId != null ? String(pk.draftEntryId) : null;
        if (!ref) continue;
        let arr = seatPicks.get(ref);
        if (!arr) { arr = []; seatPicks.set(ref, arr); }
        arr.push({ name: pk.name });
      }
      const seatKeys = new Map<string, string>();
      for (const [ref, picks] of seatPicks) seatKeys.set(ref, playerNameKey(picks));
      boardMeta.set(String(b.draft_id), {
        slateTitle: (b.slate_title ?? null) as string | null,
        seatKeys,
      });
    }

    // Keep only teams whose pod exists AND whose player set matches the stored seat.
    const eligible: (BoardTeam & { trustedSlate: string | null })[] = [];
    let boardMismatched = 0;
    for (const t of boardIn) {
      const meta = boardMeta.get(String(t.draftId));
      if (!meta) continue; // pod not stored — folded into boardRejected below
      const trustedKey = meta.seatKeys.get(String(t.boardEntryRef));
      const clientKey = playerNameKey((t.snapshot as { players?: unknown })?.players);
      if (!trustedKey || !clientKey || trustedKey !== clientKey) {
        boardMismatched += 1;
        continue;
      }
      eligible.push({ ...t, trustedSlate: meta.slateTitle });
    }
    boardRejected = boardIn.length - eligible.length;
    if (boardRejected > 0) {
      console.log(`[arena-register] rejected ${boardRejected} board teams (${boardMismatched} content mismatch, rest unknown draft_id)`);
    }

    if (eligible.length > 0) {
      // Insert-new-only (same rationale as owned). Dedupe by board_entry_ref.
      const refs = [...new Set(eligible.map((t) => t.boardEntryRef))];
      const { data: existing, error: selErr } = await supabaseAdmin
        .from("arena_teams")
        .select("board_entry_ref, platform")
        .eq("source", "board")
        .in("board_entry_ref", refs);
      if (selErr) {
        console.error("[arena-register] board select failed:", selErr);
        return json({ error: "board_select_failed" }, 500);
      }
      const seen = new Set<string>();
      for (const r of existing ?? []) seen.add(`${r.board_entry_ref}::${r.platform}`);

      const toInsert: Record<string, unknown>[] = [];
      for (const t of eligible) {
        const k = `${t.boardEntryRef}::${t.platform}`;
        if (seen.has(k)) continue; // already registered
        seen.add(k); // also dedupe within this batch
        toInsert.push({
          user_id: null,
          entry_id: null,
          platform: t.platform,
          source: "board",
          draft_id: t.draftId,
          board_entry_ref: t.boardEntryRef,
          board_user_hash: t.userId ? await hashUserId(String(t.userId)) : null,
          // Slate title comes from the stored board (server truth), not the client.
          display_snapshot: t.trustedSlate
            ? { ...(t.snapshot as Record<string, unknown>), slateTitle: t.trustedSlate }
            : t.snapshot,
          enrolled: true,
        });
      }
      if (toInsert.length > 0) {
        const { error } = await supabaseAdmin.from("arena_teams").insert(toInsert);
        if (error) {
          console.error("[arena-register] board insert failed:", error);
          return json({ error: "board_insert_failed" }, 500);
        }
        boardWritten += toInsert.length;
      }
    }
  }

  console.log(`[arena-register] voter=${voterId} owned=${ownedWritten} claimed=${ownedClaimed} board=${boardWritten} rejected=${boardRejected}`);
  return json({ ownedWritten, ownedClaimed, boardWritten, boardRejected }, 200);
});
