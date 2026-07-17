// Client-posted Apple purchase sync (ADR-028 / TASK-344).
//
// App Store Server Notifications (apple-notifications) are the durable source of
// truth, but they can lag the purchase by seconds-to-minutes — too slow for the
// "buy on iPhone, see Pro on the website" moment, and they don't fire on a plain
// Restore. So right after a StoreKit 2 purchase (or a restore), the app posts its
// verified transaction JWS here; we verify the same signature Apple would, confirm
// the transaction's appAccountToken matches the authenticated caller, and upsert
// the identical row shape. The notification later reconciles the same row by
// originalTransactionId — idempotent either way.
//
// Auth mirrors create-checkout-session / delete-account: JWT via an anon client,
// writes via the service-role admin client.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAndDecode } from "../_shared/appleJws.ts";
import {
  appleSubscriptionRow,
  type SubStatus,
} from "../_shared/appleSubscription.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SB_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return json({ error: "Missing authorization header" }, 401);
  }

  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
  if (authError || !user) {
    return json({ error: "Unauthorized" }, 401);
  }

  let transactionJws: string | undefined;
  try {
    transactionJws = (await req.json())?.transactionJws;
  } catch {
    return json({ error: "Invalid body" }, 400);
  }
  if (!transactionJws) {
    return json({ error: "transactionJws is required" }, 400);
  }

  // Verify the transaction's Apple signature — the client cannot be trusted to
  // assert entitlement on its own.
  let transaction: any;
  try {
    transaction = await verifyAndDecode(transactionJws);
  } catch (err) {
    console.error("sync-apple-purchase verification failed:", err);
    return json({ error: "Invalid transaction" }, 400);
  }

  // The transaction must belong to the caller. The client sets appAccountToken to
  // the Supabase user id at purchase; reject anything that doesn't match so one
  // user can't claim another's (or a replayed) transaction.
  if (transaction.appAccountToken !== user.id) {
    return json({ error: "Transaction does not belong to this account" }, 403);
  }

  // Trust the receipt's own expiry: active while unexpired, else expired.
  const expired =
    typeof transaction.expiresDate === "number" &&
    transaction.expiresDate <= Date.now();
  const status: SubStatus = expired ? "expired" : "active";
  const row = appleSubscriptionRow(transaction, status);

  if (!row) {
    return json({ error: "Transaction missing originalTransactionId" }, 400);
  }

  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(row, { onConflict: "apple_original_transaction_id" });

  if (error) {
    console.error("Error upserting synced Apple purchase:", error);
    return json({ error: "Database error" }, 500);
  }

  return json({ status }, 200);
});
