#!/usr/bin/env node
/**
 * rotate-apple-secret.mjs — Rotate the Apple Sign-In OAuth client secret (TASK-347).
 *
 * Apple requires the client secret (an ES256 JWT signed with the Sign in with
 * Apple .p8 key) to be regenerated at most every 6 months; if it lapses, the
 * ADR-029 web OAuth flow (web app + Chrome extension Apple sign-in) fails.
 * This script mints a fresh secret and PATCHes it into the Supabase Auth
 * provider config via the Management API. Native mobile signInWithIdToken
 * does not use this secret and is unaffected.
 *
 * Usage:
 *   node scripts/rotate-apple-secret.mjs                 # rotate
 *   node scripts/rotate-apple-secret.mjs --dry-run       # mint + preflight only, no PATCH
 *   node scripts/rotate-apple-secret.mjs --print-secret  # local only: print the minted JWT
 *                                                        # for manual dashboard paste
 *
 * Env (repo-root .env.local locally, GitHub secrets in CI — see
 * docs/Apple_Secret_Rotation_Runbook.md):
 *   APPLE_SIGNIN_KEY_P8    full PEM contents of the Sign in with Apple .p8 key
 *   APPLE_SIGNIN_KEY_ID    the key's 10-char id
 *   APPLE_SERVICES_ID      the web Services ID (required explicitly — no default,
 *                          so a misnamed secret fails loudly, never rotates the
 *                          wrong client)
 *   SUPABASE_ACCESS_TOKEN  Supabase personal access token (sbp_...)
 *   APPLE_TEAM_ID          optional, defaults to WNGNQ89YJ2
 *   SUPABASE_PROJECT_REF   optional, defaults to cwjorshxkbbxjvhqxdlh
 *
 * SECURITY: runs in a public repo's Actions logs. No code path — including
 * error paths — may print the .p8, the minted JWT, the access token, or any
 * raw API response body. Errors print fixed strings, variable NAMES, and HTTP
 * status codes only. (Client IDs are public identifiers and safe to log.)
 *
 * NOTE: errors terminate via exitCode + throw, never process.exit() — a
 * force-exit right after a fetch trips a libuv assertion on Windows Node.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');

// Optional locally, absent-but-harmless in CI (no install step there).
try {
  const { config: loadEnv } = await import('dotenv');
  loadEnv({ path: join(repoRoot, '.env.local') });
} catch {
  /* dotenv not installed (CI) — env comes from the workflow */
}

const dryRun = process.argv.includes('--dry-run');
const printSecret = process.argv.includes('--print-secret');

class ExitError extends Error {}

function fail(msg, code = 1) {
  console.error(`error: ${msg}`);
  process.exitCode = code;
  throw new ExitError(msg);
}

function requireEnv(name) {
  const v = process.env[name];
  if (!v || !v.trim()) fail(`missing required environment variable: ${name}`);
  return v.trim();
}

// Apple caps exp at iat + 15_777_000s (6 months) measured by Apple's clock.
// ~5.5 months leaves margin for skew; the monthly cron makes the shortfall moot.
const SECRET_TTL_SECONDS = 14_400_000;
const CLOCK_SKEW_BACKDATE_SECONDS = 60;

// ---- ES256 client-secret JWT (same WebCrypto recipe as
// supabase/functions/live-activity-relay/index.ts — WebCrypto's raw r||s
// ECDSA output is exactly the JWS ES256 signature format, no library needed) ----

function b64url(data) {
  return Buffer.from(data).toString('base64url');
}

function pemToDer(pem) {
  const body = pem.replace(/-----(BEGIN|END)[A-Z ]+-----/g, '').replace(/\s+/g, '');
  return new Uint8Array(Buffer.from(body, 'base64'));
}

async function mintClientSecret({ p8, keyId, teamId, servicesId }) {
  let key;
  try {
    key = await crypto.subtle.importKey(
      'pkcs8',
      pemToDer(p8),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['sign'],
    );
  } catch {
    fail('APPLE_SIGNIN_KEY_P8 is not a valid PKCS8 P-256 private key (paste the full .p8 PEM contents)');
  }
  const enc = new TextEncoder();
  const iat = Math.floor(Date.now() / 1000) - CLOCK_SKEW_BACKDATE_SECONDS;
  const exp = iat + SECRET_TTL_SECONDS;
  const header = b64url(enc.encode(JSON.stringify({ alg: 'ES256', kid: keyId })));
  const claims = b64url(enc.encode(JSON.stringify({
    iss: teamId,
    iat,
    exp,
    aud: 'https://appleid.apple.com',
    sub: servicesId,
  })));
  const unsigned = `${header}.${claims}`;
  const sig = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    key,
    enc.encode(unsigned),
  );
  return { jwt: `${unsigned}.${b64url(new Uint8Array(sig))}`, exp };
}

// ---- Supabase Management API ----

async function managementRequest(url, token, method, body) {
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    fail(`${method} ${url} failed: network error`);
  }
  return res;
}

// Response bodies may contain provider secrets (redaction is undocumented) —
// parse them, log only whitelisted fields, never print the raw body.
async function readConfig(url, token, projectRef, label) {
  const res = await managementRequest(url, token, 'GET');
  if (!res.ok) {
    fail(
      `${label}: GET auth config returned HTTP ${res.status} — check that ` +
      'SUPABASE_ACCESS_TOKEN is a valid, unexpired personal access token with access to ' +
      `project ${projectRef}`,
    );
  }
  return res.json();
}

// external_apple_client_id holds ALL dashboard "Client IDs" as one
// comma-separated string (e.g. "com.bestballexposures.web,com.bestballexposures.app");
// the Services ID must be among them.
function checkAppleConfig(cfg, servicesId, label) {
  const clientIds = String(cfg.external_apple_client_id ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (!cfg.external_apple_enabled || clientIds.length === 0) {
    fail(
      `${label}: Apple provider is not configured in Supabase ` +
      '(external_apple_enabled/external_apple_client_id unset). Complete the TASK-345 dashboard ' +
      'setup (docs/migrations/029-social-signin-setup.md) before rotating.',
    );
  }
  if (!clientIds.includes(servicesId)) {
    fail(
      `${label}: APPLE_SERVICES_ID "${servicesId}" is not among the configured Apple client ids ` +
      `[${clientIds.join(', ')}] — refusing to rotate a secret for a different client. ` +
      'Fix the APPLE_SERVICES_ID secret or the Supabase config.',
    );
  }
  return clientIds;
}

// ---- main ----

async function main() {
  const p8 = requireEnv('APPLE_SIGNIN_KEY_P8');
  const keyId = requireEnv('APPLE_SIGNIN_KEY_ID');
  const servicesId = requireEnv('APPLE_SERVICES_ID');
  const teamId = (process.env.APPLE_TEAM_ID ?? 'WNGNQ89YJ2').trim();
  const projectRef = (process.env.SUPABASE_PROJECT_REF ?? 'cwjorshxkbbxjvhqxdlh').trim();
  const authConfigUrl = `https://api.supabase.com/v1/projects/${projectRef}/config/auth`;

  if (printSecret && (process.env.GITHUB_ACTIONS || process.env.CI)) {
    fail('--print-secret is for local manual-fallback use only; refusing to print a secret into CI logs');
  }

  const { jwt, exp } = await mintClientSecret({ p8, keyId, teamId, servicesId });
  const expIso = new Date(exp * 1000).toISOString();

  if (printSecret) {
    // Manual fallback path (e.g. Management API PATCH broken): paste this into
    // Supabase dashboard -> Authentication -> Providers -> Apple -> Secret Key.
    console.log(jwt);
    console.error(`(expires ${expIso} — paste into the Supabase dashboard Apple provider settings)`);
    return;
  }

  const token = requireEnv('SUPABASE_ACCESS_TOKEN');

  const preflight = await readConfig(authConfigUrl, token, projectRef, 'preflight');
  const clientIds = checkAppleConfig(preflight, servicesId, 'preflight');
  console.log(`preflight ok: Apple provider enabled for [${clientIds.join(', ')}]`);

  if (dryRun) {
    console.log(
      `dry run: minted client secret for team ${teamId}, services id ${servicesId}, ` +
      `expires ${expIso}. No changes made.`,
    );
    return;
  }

  // Send ONLY the secret — a partial PATCH leaves external_apple_client_id
  // (the full client-id list, including the native mobile bundle id)
  // untouched, so this job can never break mobile sign-in.
  const patch = await managementRequest(authConfigUrl, token, 'PATCH', { external_apple_secret: jwt });
  if (!patch.ok) {
    let apiMessage = '';
    try {
      apiMessage = ` (${(await patch.json()).message ?? 'no message'})`;
    } catch { /* body unreadable — status alone will have to do */ }
    fail(
      `PATCH auth config returned HTTP ${patch.status}${apiMessage}. Known gotcha: this endpoint ` +
      'can fail for projects using auth hooks (supabase/supabase#36861). Fallback: run ' +
      '`node scripts/rotate-apple-secret.mjs --print-secret` locally and paste the output into ' +
      'the Supabase dashboard Apple provider settings by hand (see docs/Apple_Secret_Rotation_Runbook.md).',
    );
  }

  const after = await readConfig(authConfigUrl, token, projectRef, 'post-rotation verify');
  checkAppleConfig(after, servicesId, 'post-rotation verify');

  console.log(`Rotated Apple client secret for ${servicesId}; expires ${expIso}`);
}

try {
  await main();
} catch (e) {
  if (!(e instanceof ExitError)) throw e;
  // fail() already printed the error and set process.exitCode; exiting
  // naturally here avoids the Windows libuv process.exit() assertion.
}
