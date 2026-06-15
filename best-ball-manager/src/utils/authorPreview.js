// Author-preview gate for unreleased blog content.
//
// A scheduled post (status: published with a future date — see blog.js `isLive`)
// is hidden from the public but visible to the post author on the live site so
// they can preview it in place. "Author" is decided purely by the logged-in
// email matching the allowlist below. This is a soft, client-side gate (the
// markdown still ships in the bundle, same posture as the Pro archive) — not a
// security boundary. Server-side enforcement is tracked under TASK-254.
//
// Pure module — no Vite/import.meta — so it is unit-testable and safe to reuse
// from Node scripts.

// Normalized (lowercased, +tag-stripped) emails allowed to preview scheduled posts.
// Add addresses here as needed.
const AUTHOR_EMAILS = new Set([
  'heithoff.patrick@gmail.com',
]);

/**
 * Canonicalize an email for allowlist comparison: lowercase and drop any
 * "+tag" suffix from the local part (so heithoff.patrick+beta@gmail.com and
 * heithoff.patrick@gmail.com normalize to the same address). Returns '' for
 * falsy or malformed input.
 */
export function normalizeEmail(email) {
  if (!email || typeof email !== 'string') return '';
  const lower = email.trim().toLowerCase();
  const at = lower.lastIndexOf('@');
  if (at <= 0) return '';
  const local = lower.slice(0, at);
  const domain = lower.slice(at + 1);
  const plus = local.indexOf('+');
  const base = plus === -1 ? local : local.slice(0, plus);
  if (!base || !domain) return '';
  return `${base}@${domain}`;
}

/** True when this email belongs to a blog author allowed to preview scheduled posts. */
export function isAuthorEmail(email) {
  return AUTHOR_EMAILS.has(normalizeEmail(email));
}
