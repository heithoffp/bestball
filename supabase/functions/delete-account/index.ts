import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;
const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY");

const supabaseAdmin = createClient(SUPABASE_URL, SB_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", {
      status: 405,
      headers: corsHeaders,
    });
  }

  // Verify JWT and extract user
  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Missing authorization header" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user }, error: authError } = await supabaseClient.auth.getUser();

  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Cancel any live Stripe subscriptions before deleting the rows — otherwise
  // the deleted account keeps billing with no portal access to stop it.
  if (STRIPE_SECRET_KEY) {
    const { data: subs } = await supabaseAdmin
      .from("subscriptions")
      .select("stripe_subscription_id, status")
      .eq("user_id", user.id);
    for (const sub of subs ?? []) {
      if (!sub.stripe_subscription_id) continue;
      if (!["active", "trialing", "past_due"].includes(sub.status)) continue;
      const response = await fetch(
        `https://api.stripe.com/v1/subscriptions/${encodeURIComponent(sub.stripe_subscription_id)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
        }
      );
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        // Already-canceled/missing subscriptions are fine; anything else must
        // block deletion so the user isn't left billed with no account.
        if (body?.error?.code !== "resource_missing") {
          return new Response(
            JSON.stringify({ error: "Could not cancel your subscription. Please try again or contact support." }),
            { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }
  }

  // Delete public schema data before removing the auth user
  await supabaseAdmin.from("subscriptions").delete().eq("user_id", user.id);
  await supabaseAdmin.from("profiles").delete().eq("id", user.id);

  const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(user.id);

  if (deleteError) {
    return new Response(JSON.stringify({ error: deleteError.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
