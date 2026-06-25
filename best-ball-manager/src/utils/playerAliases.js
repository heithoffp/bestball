// src/utils/playerAliases.js
//
// Explicit cross-platform name reconciliation (ADR-012).
//
// When a platform changes a player's DISPLAY name mid-season (e.g. Underdog's
// ADP feed switched "Kenneth Gainwell" -> "Kenny Gainwell" on 2026-06-25), the
// new name no longer matches rosters synced under the old name, and the player
// silently loses their ADP/projection/exposure grouping.
//
// canonicalName() is matched by NAME, not by a stable platform id (synced
// rosters carry no id — see ADR-012 for why id-based matching was deferred), so
// we reconcile known renames here with an explicit, full-name alias map.
//
// RULES (keep the merge exact and safe — canonicalName keys exposure % and
// stableId across ~31 callsites):
//   - Keys and values are FULL canonicalized names (output of canonicalName's
//     normalization), never first-name substitutions. This guarantees we can
//     never collapse two distinct players.
//   - The VALUE must be the form synced rosters use (the historical/legal name),
//     because that is the constant; the platform feed is what drifts.
//
// To add a rename: add one line `'<new canonical full name>': '<roster canonical full name>'`.

const NAME_ALIASES = {
  // Underdog renamed Kenneth -> Kenny in the 2026-06-25 ADP snapshot.
  'kenny gainwell': 'kenneth gainwell',
};

/**
 * Map an already-canonicalized name key through the alias table.
 * Returns the reconciled key, or the input unchanged when no alias exists.
 * @param {string} canonical - output of canonicalName's normalization steps
 * @returns {string}
 */
export function applyAlias(canonical) {
  return NAME_ALIASES[canonical] || canonical;
}
