// headshotName.js — the shared name normalizer for the player-headshot map.
// Pure ESM with no imports so BOTH sides of the pipeline can load it:
//   - scripts/build-headshot-map.mjs (Node) keys the generated map with it
//   - src/utils/headshots.js (browser) keys lookups with it
// Keeping one implementation is what makes build-time keys and display-time
// lookups agree; do not fork this logic into either consumer.

const SUFFIX_RE = /\s+(jr|sr|ii|iii|iv|v)\.?$/i;

/**
 * Normalize a player name to its headshot-map key.
 * "Marvin Harrison Jr." and "marvin harrison" both -> "marvin harrison".
 */
export function headshotNameKey(name = '') {
  return String(name)
    .trim()
    .replace(SUFFIX_RE, '')
    .replace(/[.'’]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
