import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICE_ROLE_KEY = Deno.env.get("SB_SERVICE_ROLE_KEY")!;

const supabaseAdmin = createClient(SUPABASE_URL, SB_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

async function stripeRequest(path: string, body: Record<string, string>) {
  const response = await fetch(`https://api.stripe.com/v1${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams(body).toString(),
  });
  return response.json();
}

Deno.serve(async (req) => {
  // Handle CORS preflight
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

  const { priceId, successUrl, cancelUrl, trialDays, promoCode } = await req.json();

  if (!priceId) {
    return new Response(JSON.stringify({ error: "priceId is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Check for existing Stripe customer
  let stripeCustomerId: string | null = null;
  const { data: existingSub } = await supabaseAdmin
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .single();

  if (existingSub?.stripe_customer_id) {
    stripeCustomerId = existingSub.stripe_customer_id;
  }

  // Build checkout session params
  const params: Record<string, string> = {
    "mode": "subscription",
    "line_items[0][price]": priceId,
    "line_items[0][quantity]": "1",
    "success_url": successUrl || `${req.headers.get("origin") || "http://localhost:5173"}?checkout=success`,
    "cancel_url": cancelUrl || `${req.headers.get("origin") || "http://localhost:5173"}?checkout=canceled`,
    "metadata[user_id]": user.id,
    "subscription_data[metadata][user_id]": user.id,
  };

  if (trialDays && Number.isInteger(trialDays) && trialDays > 0) {
    params["subscription_data[trial_period_days]"] = String(trialDays);
  }

  // Promo code handling: resolve code to Stripe promotion_code ID, or allow manual entry
  if (promoCode && typeof promoCode === "string") {
    const promoLookup = await fetch(
      `https://api.stripe.com/v1/promotion_codes?code=${encodeURIComponent(promoCode)}&active=true&limit=1`,
      {
        headers: {
          Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        },
      }
    );
    const promoData = await promoLookup.json();
    if (promoData.data?.length > 0) {
      params["discounts[0][promotion_code]"] = promoData.data[0].id;
    } else {
      // Code not found — still allow manual entry on Stripe's page
      params["allow_promotion_codes"] = "true";
    }
  } else {
    params["allow_promotion_codes"] = "true";
  }

  if (stripeCustomerId) {
    params["customer"] = stripeCustomerId;
  } else {
    params["customer_email"] = user.email!;
  }

  const session = await stripeRequest("/checkout/sessions", params);

  if (session.error) {
    return new Response(JSON.stringify({ error: session.error.message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ url: session.url }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
