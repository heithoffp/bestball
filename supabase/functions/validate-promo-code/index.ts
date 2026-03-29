const STRIPE_SECRET_KEY = Deno.env.get("STRIPE_SECRET_KEY")!;

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

  const { code } = await req.json();

  if (!code || typeof code !== "string") {
    return new Response(JSON.stringify({ valid: false, error: "Code is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Look up the promotion code in Stripe
  const response = await fetch(
    `https://api.stripe.com/v1/promotion_codes?code=${encodeURIComponent(code)}&active=true&limit=1`,
    {
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      },
    }
  );
  const data = await response.json();

  if (!data.data?.length) {
    return new Response(JSON.stringify({ valid: false, error: "Invalid or expired code" }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const promo = data.data[0];
  const coupon = promo.coupon;

  // Build discount description
  let discountLabel: string;
  if (coupon.percent_off) {
    discountLabel = `${coupon.percent_off}% off`;
  } else if (coupon.amount_off) {
    const dollars = (coupon.amount_off / 100).toFixed(0);
    discountLabel = `$${dollars} off`;
  } else {
    discountLabel = "Discount applied";
  }

  return new Response(JSON.stringify({
    valid: true,
    promoId: promo.id,
    discountLabel,
    percentOff: coupon.percent_off || null,
    amountOff: coupon.amount_off || null,
  }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
