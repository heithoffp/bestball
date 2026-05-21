/**
 * Slate-title allowlist for admin scraping. Per ADR-008, only persist boards
 * for explicitly-allowed *public-tournament* slate types. Default deny.
 *
 * Match is case-insensitive prefix — UD often appends round/wave suffixes
 * (e.g., "Best Ball Mania VII — Wave 12").
 *
 * **Confirm this list against `select distinct slate_title from extension_entries`
 * before each new scraper deployment.** Adding a new entry requires confirming
 * the slate is public (visible to any authenticated UD account).
 */
export const SLATE_TITLE_ALLOWLIST = [
  'BBM',
  'Best Ball Mania',
  'Smash Bros',
  'Eliminator',
  'Pomeranian',
  'The Big Board',
  'Puppy',
  'Kitten',
];

export function isWhitelisted(slateTitle) {
  if (!slateTitle) return false;
  const t = String(slateTitle).toLowerCase();
  return SLATE_TITLE_ALLOWLIST.some((w) => t.startsWith(w.toLowerCase()));
}
