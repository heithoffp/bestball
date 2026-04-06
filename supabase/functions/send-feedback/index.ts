const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY")!;
const DEVELOPER_EMAIL = Deno.env.get("DEVELOPER_EMAIL")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const VALID_TYPES = ["Bug", "Suggestion", "Other"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  let body: { type?: string; message?: string; userEmail?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { type, message, userEmail } = body;

  if (!type || !VALID_TYPES.includes(type)) {
    return new Response(JSON.stringify({ error: "Invalid type" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (!message || message.trim().length === 0) {
    return new Response(JSON.stringify({ error: "Message is required" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (message.length > 1000) {
    return new Response(JSON.stringify({ error: "Message exceeds 1000 characters" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const senderDisplay = userEmail?.trim() || "anonymous";
  const html = `
    <div style="font-family: sans-serif; max-width: 600px;">
      <h2 style="color: #060E1F;">New Feedback — Best Ball Portfolio Manager</h2>
      <table style="width: 100%; border-collapse: collapse;">
        <tr>
          <td style="padding: 8px 0; color: #666; width: 120px;"><strong>Type</strong></td>
          <td style="padding: 8px 0;">${type}</td>
        </tr>
        <tr>
          <td style="padding: 8px 0; color: #666;"><strong>From</strong></td>
          <td style="padding: 8px 0;">${senderDisplay}</td>
        </tr>
      </table>
      <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 16px 0;" />
      <p style="white-space: pre-wrap; color: #1a1a1a;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
    </div>
  `;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "Feedback <noreply@bestballexposures.com>",
      to: [DEVELOPER_EMAIL],
      subject: `[Feedback] ${type} — Best Ball Portfolio Manager`,
      html,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error("Resend error:", err);
    return new Response(JSON.stringify({ error: "Failed to send feedback" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
