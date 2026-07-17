// App Store Server Notifications v2 endpoint (ADR-028 / TASK-344).
//
// Apple POSTs a signed notification here whenever a StoreKit subscription changes
// (initial buy, renewal, auto-renew toggle, expiry, refund, revoke). We verify the
// JWS chain, decode the embedded transaction, map it to a status, and upsert the
// shared `subscriptions` table keyed by the Apple originalTransactionId. This is
// the durable, cross-platform source of truth: once written, both the mobile app
// and the website read Pro from the same row. Configure this function's URL as the
// production AND sandbox notification URL in App Store Connect.
//
// Mirrors the structure of stripe-webhook (Deno.serve + service-role admin client),
// but trust comes from Apple's JWS signature (see _shared/appleJws.ts) rather than
// an HMAC secret.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { verifyAndDecode } from "../_shared/appleJws.ts";
import {
  appleSubscriptionRow,
  statusFromNotification,
} from "../_shared/appleSubscription.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SB_SERVICE_ROLE_KEY);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  // Apple sends { signedPayload: "<JWS>" }.
  let signedPayload: string | undefined;
  try {
    signedPayload = (await req.json())?.signedPayload;
  } catch {
    return new Response("Invalid body", { status: 400 });
  }
  if (!signedPayload) {
    return new Response("Missing signedPayload", { status: 400 });
  }

  // Verify + decode the notification, then the nested transaction/renewal JWS.
  let notification: any;
  let transaction: any;
  let renewalInfo: any = undefined;
  try {
    notification = await verifyAndDecode(signedPayload);
    const data = notification?.data;
    if (data?.signedTransactionInfo) {
      transaction = await verifyAndDecode(data.signedTransactionInfo);
    }
    if (data?.signedRenewalInfo) {
      renewalInfo = await verifyAndDecode(data.signedRenewalInfo);
    }
  } catch (err) {
    // A failed signature is the security boundary — reject, don't write.
    console.error("Apple notification verification failed:", err);
    return new Response("Invalid signature", { status: 400 });
  }

  if (!transaction) {
    // Some notification types (e.g. TEST) carry no transaction — ack so Apple
    // stops retrying, but there is nothing to persist.
    console.log("Apple notification without transaction:", notification?.notificationType);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const status = statusFromNotification(
    notification.notificationType,
    notification.subtype,
    transaction,
  );
  const row = appleSubscriptionRow(transaction, status, renewalInfo);

  if (!row) {
    // No appAccountToken means we can't map this to a Supabase user (e.g. a
    // purchase made before account linking). Ack and log rather than orphan a row.
    console.warn(
      "Apple notification could not be mapped to a user:",
      notification.notificationType,
      transaction.originalTransactionId,
    );
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Idempotent: Apple retries notifications, so conflate on the stable
  // originalTransactionId. created_at is left to its column default on insert.
  const { error } = await supabaseAdmin
    .from("subscriptions")
    .upsert(row, { onConflict: "apple_original_transaction_id" });

  if (error) {
    console.error("Error upserting Apple subscription:", error);
    return new Response("Database error", { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
