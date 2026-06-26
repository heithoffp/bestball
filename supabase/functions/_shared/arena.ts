// Shared helpers for the Best Ball Arena Edge Functions (ADR-013 / TASK-281).
//
// arena-pair issues a signed, single-use pairing token; arena-vote verifies it,
// computes Elo, and records the match. Both run in Deno on Supabase Edge Functions
// and must accept GUEST (unauthenticated) callers — see supabase/config.toml
// (verify_jwt = false for both functions). Integrity is load-bearing per ADR-013.

// ---------------------------------------------------------------------------
// Tunable constants (the guest-vote sub-decision from TASK-285 is resolved here:
// guest votes count EQUALLY toward Elo, but only the first GUEST_VOTE_CAP of them
// per guest are counted; the rest are recorded with counted = false).
// ---------------------------------------------------------------------------
export const N_PROVISIONAL = 10; // a team's first N matches use the higher K
export const K_PROVISIONAL = 40;
export const K_STABLE = 20;
export const GUEST_VOTE_CAP = 5; // counted votes allowed per guest id
export const TOKEN_TTL_SECONDS = 600; // pairing token lifetime (10 min)
export const ELO_WINDOW = 200; // preferred Elo distance for a "comparable" opponent
export const POOL_SAMPLE_LIMIT = 200; // max eligible teams pulled for in-memory matchmaking

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Elo
// ---------------------------------------------------------------------------
export function expectedScore(ratingFor: number, ratingAgainst: number): number {
  return 1 / (1 + Math.pow(10, (ratingAgainst - ratingFor) / 400));
}

export function kFactor(matches: number): number {
  return matches < N_PROVISIONAL ? K_PROVISIONAL : K_STABLE;
}

// Returns the new rating after a single match. score = 1 win, 0 loss.
export function updatedElo(rating: number, opponent: number, score: number, matches: number): number {
  const expected = expectedScore(rating, opponent);
  return rating + kFactor(matches) * (score - expected);
}

// ---------------------------------------------------------------------------
// Signed single-use pairing token (HMAC-SHA256, stateless).
// Format: base64url(payloadJSON) + "." + base64url(hmac). The team ids and voter
// identity live INSIDE the signed payload so the client cannot tamper with which
// teams a vote applies to or who it is attributed to. Single-use is enforced at
// vote time by the unique constraint on arena_matches.pairing_id.
// ---------------------------------------------------------------------------
export interface PairingPayload {
  pid: string; // pairing_id (uuid)
  a: string; // team_a_id
  b: string; // team_b_id
  voter: string | null; // authenticated user id, or null for guest
  guest: string | null; // client guest id (localStorage), or null for authed
  exp: number; // unix seconds
}

function bytesToB64url(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlToBytes(s: string): Uint8Array {
  const padded = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(padded);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function importHmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function signToken(payload: PairingPayload, secret: string): Promise<string> {
  const payloadB64 = bytesToB64url(new TextEncoder().encode(JSON.stringify(payload)));
  const key = await importHmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payloadB64)));
  return `${payloadB64}.${bytesToB64url(sig)}`;
}

// Throws on malformed / bad signature / expired token.
export async function verifyToken(token: string, secret: string): Promise<PairingPayload> {
  const dot = token.indexOf(".");
  if (dot < 1) throw new Error("malformed_token");
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  const key = await importHmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    b64urlToBytes(sigB64),
    new TextEncoder().encode(payloadB64),
  );
  if (!valid) throw new Error("bad_signature");
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64))) as PairingPayload;
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("expired_token");
  }
  return payload;
}

// Resolve the caller's identity from the request. Returns an authenticated user id
// when a valid JWT is present, otherwise treats the caller as a guest. Never throws —
// a missing/invalid token simply means "guest".
export async function resolveVoter(
  req: Request,
  supabaseUrl: string,
  anonKey: string,
  createClient: (url: string, key: string, opts?: unknown) => any,
): Promise<{ voterId: string | null; isGuest: boolean }> {
  const authHeader = req.headers.get("authorization");
  // The Supabase gateway forwards the anon apikey as a Bearer token for guests, so
  // a present header does not guarantee a user — always confirm via getUser().
  if (!authHeader) return { voterId: null, isGuest: true };
  try {
    const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await client.auth.getUser();
    if (user?.id) return { voterId: user.id, isGuest: false };
  } catch {
    // fall through to guest
  }
  return { voterId: null, isGuest: true };
}
