/**
 * Slate-title allowlist for admin scraping. Per ADR-008, only persist boards
 * for explicitly-allowed *public-tournament* slate types. Default deny.
 *
 * Match is case-insensitive prefix — entries are the full slate-title stem so
 * UD can append round/wave suffixes (e.g., "UD 2026 Season — Wave 12") and
 * still match. Confirmed against the live `extension_entries.slate_title`
 * values on 2026-06-09: real UD titles are prefixed "UD 2026 …", so the bare
 * tournament names used previously (e.g., "Eliminator") matched nothing.
 *
 * Deliberately excluded:
 *  - "UD 2026 World Cup" — soccer, not football.
 *  - "DK Pre-Draft" / "DK Post-Draft" — DraftKings; not fetchable from UD's
 *    API, and excluded for free by the "UD 2026 …" prefix.
 *
 * **Confirm this list against `select distinct slate_title from extension_entries`
 * before each new scraper deployment.** Adding a new entry requires confirming
 * the slate is a public football tournament (visible to any authenticated UD
 * account).
 */
export const SLATE_TITLE_ALLOWLIST = [
  'UD 2026 Season',           // Best Ball Mania (main season-long)
  'UD 2026 Superflex Season',
  'UD 2026 Eliminator Season',
  'UD 2026 Pre-Draft Best Ball',
];

export function isWhitelisted(slateTitle) {
  if (!slateTitle) return false;
  const t = String(slateTitle).toLowerCase();
  return SLATE_TITLE_ALLOWLIST.some((w) => t.startsWith(w.toLowerCase()));
}
