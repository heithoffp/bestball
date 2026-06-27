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
//   - Guardrail #3: a board team is registered ONLY if its draft_id has a
//     draft_boards_admin row with source='extension' (participant-authorized capture);
//     residual admin-scraped or fabricated boards are refused.
//   - Rating columns are never written here — they keep their server defaults and
//     change only via arena-vote.
//
// Clients NEVER write board rows directly (no column grant + owner-only RLS scoped to
// source='owned'); this function is the only board-row writer.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { betaGate, corsHeaders, json } from "../_shared/arena.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const ARENA_TOKEN_SECRET = Deno.env.get("ARENA_TOKEN_SECRET")!;

const supabaseAdmin = createClient(SUPABASE_URL, SB_SERVICE_ROLE_KEY);

const MAX_TEAMS = 1000; // generous cap; a portfolio is far smaller

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

  // Private-beta gate (ADR-015).
  const gate = await betaGate(req, SUPABASE_URL, SUPABASE_ANON_KEY, createClient, supabaseAdmin);
  if (!gate.allowed || !gate.voterId) {
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
  let boardWritten = 0;
  let boardRejected = 0;

  // ── Owned teams ──────────────────────────────────────────────────────────
  if (ownedIn.length > 0) {
    // Which (entry_id, platform) already exist for this user? Update those, insert the rest.
    const { data: existing, error: selErr } = await supabaseAdmin
      .from("arena_teams")
      .select("id, entry_id, platform")
      .eq("user_id", voterId)
      .eq("source", "owned");
    if (selErr) {
      console.error("[arena-register] owned select failed:", selErr);
      return json({ error: "owned_select_failed" }, 500);
    }
    const existingById = new Map<string, string>(); // `${entry_id}::${platform}` -> row id
    for (const r of existing ?? []) existingById.set(`${r.entry_id}::${r.platform}`, r.id);

    const toInsert: Record<string, unknown>[] = [];
    for (const t of ownedIn) {
      const k = `${t.entryId}::${t.platform}`;
      const id = existingById.get(k);
      if (id) {
        const { error } = await supabaseAdmin
          .from("arena_teams")
          .update({
            display_snapshot: t.snapshot,
            draft_id: t.draftId ?? t.entryId,
            enrolled: true,
            updated_at: new Date().toISOString(),
          })
          .eq("id", id);
        if (!error) ownedWritten++;
      } else {
        toInsert.push({
          user_id: voterId,
          entry_id: t.entryId,
          platform: t.platform,
          source: "owned",
          draft_id: t.draftId ?? t.entryId,
          display_snapshot: t.snapshot,
          enrolled: true,
        });
      }
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
    // Guardrail #3: only register board teams whose pod was participant-captured
    // (draft_boards_admin.source='extension'). Refuse admin-scraped / fabricated.
    const draftIds = [...new Set(boardIn.map((t) => t.draftId))];
    const { data: okBoards, error: bErr } = await supabaseAdmin
      .from("draft_boards_admin")
      .select("draft_id")
      .in("draft_id", draftIds)
      .eq("source", "extension");
    if (bErr) {
      console.error("[arena-register] board verify failed:", bErr);
      return json({ error: "board_verify_failed" }, 500);
    }
    const allowedDrafts = new Set((okBoards ?? []).map((r) => String(r.draft_id)));

    const eligible = boardIn.filter((t) => allowedDrafts.has(String(t.draftId)));
    boardRejected = boardIn.length - eligible.length;
    if (boardRejected > 0) {
      console.log(`[arena-register] rejected ${boardRejected} board teams (no source='extension' board)`);
    }

    if (eligible.length > 0) {
      // Which board refs already exist? Update those, insert the rest.
      const refs = [...new Set(eligible.map((t) => t.boardEntryRef))];
      const { data: existing, error: selErr } = await supabaseAdmin
        .from("arena_teams")
        .select("id, board_entry_ref, platform")
        .eq("source", "board")
        .in("board_entry_ref", refs);
      if (selErr) {
        console.error("[arena-register] board select failed:", selErr);
        return json({ error: "board_select_failed" }, 500);
      }
      const existingById = new Map<string, string>(); // `${ref}::${platform}` -> row id
      for (const r of existing ?? []) existingById.set(`${r.board_entry_ref}::${r.platform}`, r.id);

      const toInsert: Record<string, unknown>[] = [];
      for (const t of eligible) {
        const k = `${t.boardEntryRef}::${t.platform}`;
        const id = existingById.get(k);
        if (id) {
          const { error } = await supabaseAdmin
            .from("arena_teams")
            .update({
              display_snapshot: t.snapshot,
              draft_id: t.draftId,
              enrolled: true,
              updated_at: new Date().toISOString(),
            })
            .eq("id", id);
          if (!error) boardWritten++;
        } else {
          toInsert.push({
            user_id: null,
            entry_id: null,
            platform: t.platform,
            source: "board",
            draft_id: t.draftId,
            board_entry_ref: t.boardEntryRef,
            board_user_hash: t.userId ? await hashUserId(String(t.userId)) : null,
            display_snapshot: t.snapshot,
            enrolled: true,
          });
        }
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

  console.log(`[arena-register] voter=${voterId} owned=${ownedWritten} board=${boardWritten} rejected=${boardRejected}`);
  return json({ ownedWritten, boardWritten, boardRejected }, 200);
});
