// arenaBeta.js — frontend gate for the Best Ball Arena private beta (ADR-015).
//
// While the Arena is in private beta, only allowlisted accounts may see it. This
// module decides whether to show the Arena tab + /arena route so a non-allowlisted
// user never lands on a feature they can't use. It is a CONVENIENCE gate only — the
// real boundary is server-side (the arena-* Edge Functions return 403 and RLS hides
// arena_teams from non-allowlisted JWTs). Keep this allowlist in sync with
// arena_config.beta_allowlist (the server source of truth).
//
// Reuses authorPreview.normalizeEmail so "+tag" variants
// (heithoff.patrick+beta@gmail.com) normalize to the same base address.

import { normalizeEmail } from './authorPreview';

// Normalized (lowercased, +tag-stripped) emails allowed into the Arena beta.
const BETA_EMAILS = new Set([
  'heithoff.patrick@gmail.com',
]);

/** True when this signed-in email is allowed to see the Arena during the private beta. */
export function isArenaBetaUser(email) {
  return BETA_EMAILS.has(normalizeEmail(email));
}
