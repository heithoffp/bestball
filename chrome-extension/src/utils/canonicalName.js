/**
 * Canonical player name key for cross-source matching.
 * Strips generational suffixes (Jr., Sr., II–V), removes periods from
 * initials (D.J. → DJ), normalizes whitespace, lowercases, and finally
 * reconciles known cross-platform renames via the alias map (ADR-012).
 *
 * Mirrors best-ball-manager/src/utils/helpers.js + playerAliases.js. Kept
 * self-contained so the extension does not cross-import from the web app
 * package — the NAME_ALIASES map below must be kept in sync with
 * best-ball-manager/src/utils/playerAliases.js.
 *
 * Use for map keys and comparisons — NOT for display.
 */
const SUFFIX_RE = /\s+(jr\.?|sr\.?|ii|iii|iv|v)\s*$/i;

// Full-name alias map — keys/values are canonicalized full names. The value is
// the form synced rosters use. See ADR-012. Keep in sync with the web app's
// playerAliases.js.
const NAME_ALIASES = {
  // Underdog renamed Kenneth -> Kenny in the 2026-06-25 ADP snapshot.
  'kenny gainwell': 'kenneth gainwell',
};

export function canonicalName(name = '') {
  const canonical = String(name)
    .trim()
    .replace(/^"|"$/g, '')
    .replace(SUFFIX_RE, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return NAME_ALIASES[canonical] || canonical;
}
