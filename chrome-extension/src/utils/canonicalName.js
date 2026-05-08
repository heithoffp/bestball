/**
 * Canonical player name key for cross-source matching.
 * Strips generational suffixes (Jr., Sr., II–V), removes periods from
 * initials (D.J. → DJ), normalizes whitespace, and lowercases.
 *
 * Mirrors best-ball-manager/src/utils/helpers.js. Kept self-contained so the
 * extension does not cross-import from the web app package.
 *
 * Use for map keys and comparisons — NOT for display.
 */
const SUFFIX_RE = /\s+(jr\.?|sr\.?|ii|iii|iv|v)\s*$/i;

export function canonicalName(name = '') {
  return String(name)
    .trim()
    .replace(/^"|"$/g, '')
    .replace(SUFFIX_RE, '')
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
