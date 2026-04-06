/**
 * Adapter Registry
 *
 * Maintains the list of registered platform adapters and resolves
 * which adapter (if any) handles a given URL. Adding a new platform
 * means creating an adapter file and registering it here.
 */

import underdogAdapter from './underdog.js';
import draftkingsAdapter from './draftkings.js';

/** @type {import('./interface.js').PlatformAdapter[]} */
const adapters = [
  underdogAdapter,
  draftkingsAdapter,
];

/**
 * Returns the adapter that matches the given URL, or null.
 * @param {string} url
 * @returns {import('./interface.js').PlatformAdapter|null}
 */
export function getAdapterForUrl(url) {
  return adapters.find((adapter) => adapter.isMatch(url)) ?? null;
}
