// live-activity-relay — APNs relay for mobile Live Activity updates (EPIC-08,
// ADR-020 fallback topology). The BBE broadcast extension cannot reach
// ActivityKit (extensions never can), so it POSTs the derived glance
// ContentState here and we forward it to APNs as a `liveactivity` push.
//
// Security model: the ActivityKit push token IS the capability — an
// unguessable token that only routes to the caller's own Live Activity, and
// only while that activity is alive. We additionally require the publishable
// API key header, cap the payload size, and rate limit per token. Nothing but
// the derived glance JSON transits here — no frames, no credentials (ADR-019).
//
// Secrets (supabase secrets set NAME="..."):
//   APNS_AUTH_KEY   full PEM contents of the APNs .p8 auth key
//   APNS_KEY_ID     the key's 10-char id
//   APPLE_TEAM_ID   optional, defaults to WNGNQ89YJ2
//   APNS_BUNDLE_ID  optional, defaults to com.bestballexposures.app
//
// Deploy (manual, per project convention):
//   supabase functions deploy live-activity-relay
// config.toml sets verify_jwt = false — the extension authenticates with the
// publishable key; the push token scopes what a caller can affect.

const APNS_AUTH_KEY = Deno.env.get("APNS_AUTH_KEY") ?? "";
const APNS_KEY_ID = Deno.env.get("APNS_KEY_ID") ?? "";
const APPLE_TEAM_ID = Deno.env.get("APPLE_TEAM_ID") ?? "WNGNQ89YJ2";
const APNS_BUNDLE_ID = Deno.env.get("APNS_BUNDLE_ID") ?? "com.bestballexposures.app";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const APNS_PROD = "https://api.push.apple.com";
const APNS_SANDBOX = "https://api.sandbox.push.apple.com";
const JWT_TTL_MS = 45 * 60 * 1000; // Apple allows 20-60 min; refresh at 45
const RATE_LIMIT_PER_MIN = 40;
const MAX_STATE_BYTES = 3500; // stay under the 4 KB APNs content-state budget

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// ---- ES256 JWT (provider token) ----

let cachedJwt: { token: string; mintedAt: number } | null = null;
let cachedKey: CryptoKey | null = null;

function b64url(data: Uint8Array): string {
  let s = "";
  for (const b of data) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToDer(pem: string): Uint8Array {
  const body = pem.replace(/-----(BEGIN|END)[A-Z ]+-----/g, "").replace(/\s+/g, "");
  const raw = atob(body);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function signingKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;
  cachedKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToDer(APNS_AUTH_KEY),
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  return cachedKey;
}

async function apnsJwt(): Promise<string> {
  if (cachedJwt && Date.now() - cachedJwt.mintedAt < JWT_TTL_MS) return cachedJwt.token;
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: "ES256", kid: APNS_KEY_ID })));
  const claims = b64url(enc.encode(JSON.stringify({
    iss: APPLE_TEAM_ID,
    iat: Math.floor(Date.now() / 1000),
  })));
  const unsigned = `${header}.${claims}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    await signingKey(),
    enc.encode(unsigned),
  );
  const token = `${unsigned}.${b64url(new Uint8Array(sig))}`;
  cachedJwt = { token, mintedAt: Date.now() };
  return token;
}

// ---- rate limiting (per isolate; matches _shared/arena.ts semantics) ----

const rateBuckets = new Map<string, number[]>();
function rateLimited(key: string): boolean {
  const now = Date.now();
  const hits = (rateBuckets.get(key) ?? []).filter((t) => now - t < 60_000);
  if (hits.length >= RATE_LIMIT_PER_MIN) {
    rateBuckets.set(key, hits);
    return true;
  }
  hits.push(now);
  rateBuckets.set(key, hits);
  return false;
}

// ---- APNs delivery ----

async function sendPush(host: string, token: string, payload: unknown, priority: number) {
  // apns-expiration is a UNIX timestamp. A ~60s window (not 0 = "deliver now or
  // discard") lets a briefly-deferred push still land with fresh-enough state
  // instead of being dropped, while genuinely stale updates still expire (ADR-024).
  const expiration = Math.floor(Date.now() / 1000) + 60;
  return await fetch(`${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      "authorization": `bearer ${await apnsJwt()}`,
      "apns-topic": `${APNS_BUNDLE_ID}.push-type.liveactivity`,
      "apns-push-type": "liveactivity",
      "apns-priority": String(priority),
      "apns-expiration": String(expiration),
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  if (!APNS_AUTH_KEY || !APNS_KEY_ID) {
    return json({ error: "relay not configured (APNS_AUTH_KEY / APNS_KEY_ID secrets missing)" }, 503);
  }
  // Publishable-key gate — same key the app ships; keeps drive-by noise out.
  const apiKey = req.headers.get("apikey") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (ANON_KEY && apiKey !== ANON_KEY) return json({ error: "unauthorized" }, 401);

  let body: { token?: string; contentState?: Record<string, unknown>; priority?: number };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid JSON" }, 400);
  }

  const token = String(body.token ?? "");
  if (!/^[0-9a-f]{40,200}$/i.test(token)) return json({ error: "invalid token" }, 400);
  if (!body.contentState || typeof body.contentState !== "object") {
    return json({ error: "missing contentState" }, 400);
  }
  const stateJson = JSON.stringify(body.contentState);
  if (stateJson.length > MAX_STATE_BYTES) return json({ error: "contentState too large" }, 413);
  const priority = body.priority === 10 ? 10 : 5;
  if (rateLimited(token)) return json({ error: "rate limited" }, 429);

  const payload = {
    aps: {
      "timestamp": Math.floor(Date.now() / 1000),
      "event": "update",
      "content-state": body.contentState,
    },
  };

  // Dev builds run in the APNs sandbox environment; production in prod.
  // Try prod first, fall back on BadDeviceToken (wrong environment).
  let res = await sendPush(APNS_PROD, token, payload, priority);
  let env = "production";
  if (res.status === 400) {
    const text = await res.text();
    if (text.includes("BadDeviceToken")) {
      res = await sendPush(APNS_SANDBOX, token, payload, priority);
      env = "sandbox";
    } else {
      return json({ ok: false, apnsStatus: 400, reason: text }, 502);
    }
  }
  if (res.status !== 200) {
    const text = await res.text();
    return json({ ok: false, apnsStatus: res.status, env, reason: text }, 502);
  }
  return json({ ok: true, env });
});
