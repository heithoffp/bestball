/**
 * Draft Overlay — Inline Injection
 *
 * Detects Underdog draft pages and injects portfolio context (exposure %,
 * roster count) directly into each player row in the virtualized list.
 * Handles react-virtualized row recycling via MutationObserver.
 *
 * Per ADR-002: data display only — no scoring, ranking, or recommendations.
 *
 * @see docs/plans/TASK-046.md
 */

import { createReconnectingObserver } from '../utils/observer.js';

const GRID_SELECTOR = '[role="grid"]';
const ROW_SELECTOR = '[data-testid="player-cell-wrapper"]';
const RIGHT_SIDE_SELECTOR = '[class*="rightSide"]';
const STAT_CELL_SELECTOR = '[class*="statCell"]';
const SORT_BUTTONS_SELECTOR = '[class*="playerListSortButtons"]';
const INJECTED_ATTR = 'data-bbm-injected';
const PLAYER_ID_ATTR = 'data-bbm-player-id';
const HEADER_INJECTED_ATTR = 'data-bbm-headers-injected';

let gridObserver = null;
let enabled = true;
let rafId = null;

/**
 * Check if the current page is an Underdog draft page.
 */
export function isDraftPage() {
  return /^\/draft\/[a-f0-9-]+/i.test(window.location.pathname);
}

/**
 * Create the inline elements injected into a player row.
 * Two columns: Exp (exposure %) and Corr (correlation).
 * Uses inherited color + reduced opacity for theme-adaptive styling.
 */
function createOverlayElements() {
  const exp = document.createElement('div');
  exp.className = 'bbm-inline-overlay bbm-stat-cell';
  exp.textContent = '--%';

  // Corr cell is a hover trigger wrapping the value + popup
  const corr = document.createElement('div');
  corr.className = 'bbm-inline-overlay bbm-stat-cell bbm-corr-trigger';

  const corrValue = document.createElement('span');
  corrValue.className = 'bbm-corr-value';
  corrValue.textContent = '--';

  const popup = document.createElement('div');
  popup.className = 'bbm-corr-popup';
  popup.innerHTML =
    '<div class="bbm-corr-popup-title">Roster Overlap</div>' +
    '<div class="bbm-corr-popup-empty">No draft data yet</div>';

  corr.appendChild(corrValue);
  corr.appendChild(popup);

  return [exp, corr];
}

/**
 * Inject or update the overlay on a single player row.
 * Inserts Exp and Corr columns to the left of ADP and Proj.
 */
function processRow(row) {
  const playerId = row.getAttribute('data-id');
  if (!playerId) return;

  const existing = row.getAttribute(INJECTED_ATTR);
  if (existing === playerId) return; // already injected for this player

  // Row was recycled — remove old injections if present
  row.querySelectorAll('.bbm-inline-overlay').forEach(el => el.remove());

  const rightSide = row.querySelector(RIGHT_SIDE_SELECTOR);
  if (!rightSide) return;

  // Insert before the first native stat cell (ADP)
  const firstStatCell = rightSide.querySelector(STAT_CELL_SELECTOR);
  const [exp, corr] = createOverlayElements();

  if (firstStatCell) {
    rightSide.insertBefore(corr, firstStatCell);
    rightSide.insertBefore(exp, corr);
  } else {
    rightSide.prepend(exp, corr);
  }

  row.setAttribute(INJECTED_ATTR, playerId);
  row.setAttribute(PLAYER_ID_ATTR, playerId);
}

/**
 * Inject Exp and Corr headers, absolutely positioned to align with
 * the row stat cells rather than the sort bar's flex children.
 *
 * The sort bar and player rows share the same right edge but have
 * different total content widths (sort bar has a "My rank" button
 * with no corresponding row cell; rows have a chevron icon with no
 * corresponding header). Absolute positioning from the right edge
 * sidesteps this structural mismatch.
 */
function injectHeaders() {
  const sortBar = document.querySelector(SORT_BUTTONS_SELECTOR);
  if (!sortBar || sortBar.hasAttribute(HEADER_INJECTED_ATTR)) return;

  // Measure actual cell positions from a rendered row to stay robust
  // against future layout changes
  const sampleRow = document.querySelector(ROW_SELECTOR);
  if (!sampleRow) return; // no rows yet — will retry on next sweep

  const rightSide = sampleRow.querySelector(RIGHT_SIDE_SELECTOR);
  if (!rightSide) return;

  const sortBarRect = sortBar.getBoundingClientRect();
  const rightSideRect = rightSide.getBoundingClientRect();

  // Find BBM stat cells (first two children of rightSide are ours)
  const bbmCells = rightSide.querySelectorAll('.bbm-stat-cell');
  if (bbmCells.length < 2) return;

  const expRect = bbmCells[0].getBoundingClientRect();
  const corrRect = bbmCells[1].getBoundingClientRect();

  // Calculate right offsets relative to the sort bar's right edge
  const barRight = sortBarRect.right;
  const expRight = barRight - expRect.right;
  const corrRight = barRight - corrRect.right;

  // Make sort bar a positioning context
  sortBar.style.position = 'relative';

  const expHeader = document.createElement('span');
  expHeader.className = 'bbm-header-label';
  expHeader.textContent = 'Exp';
  expHeader.style.right = `${expRight}px`;
  expHeader.style.width = `${expRect.width}px`;

  const corrHeader = document.createElement('span');
  corrHeader.className = 'bbm-header-label';
  corrHeader.textContent = 'Corr';
  corrHeader.style.right = `${corrRight}px`;
  corrHeader.style.width = `${corrRect.width}px`;

  sortBar.appendChild(expHeader);
  sortBar.appendChild(corrHeader);
  sortBar.setAttribute(HEADER_INJECTED_ATTR, 'true');
}

/**
 * Remove injected headers.
 */
function removeHeaders() {
  document.querySelectorAll('.bbm-header-label').forEach(el => el.remove());
  document.querySelectorAll(`[${HEADER_INJECTED_ATTR}]`).forEach(el => {
    el.removeAttribute(HEADER_INJECTED_ATTR);
  });
}

/**
 * Sweep all visible player rows and inject/update overlays.
 * Debounced via requestAnimationFrame.
 */
function sweepRows() {
  if (rafId) return; // already scheduled
  rafId = requestAnimationFrame(() => {
    rafId = null;
    if (!enabled) return;
    injectHeaders();
    const rows = document.querySelectorAll(ROW_SELECTOR);
    rows.forEach(processRow);
  });
}

/**
 * Remove all injected overlay elements and headers from the page.
 */
function removeAllOverlays() {
  document.querySelectorAll('.bbm-inline-overlay').forEach(el => el.remove());
  document.querySelectorAll(`[${INJECTED_ATTR}]`).forEach(row => {
    row.removeAttribute(INJECTED_ATTR);
    row.removeAttribute(PLAYER_ID_ATTR);
  });
  removeHeaders();
}

/**
 * Inject the overlay stylesheet into the page.
 */
function injectStyles() {
  if (document.getElementById('bbm-overlay-styles')) return;

  const style = document.createElement('style');
  style.id = 'bbm-overlay-styles';
  style.textContent = `
    .bbm-stat-cell {
      color: inherit;
      opacity: 0.6;
      font-family: inherit;
      font-size: 11px;
      white-space: nowrap;
      flex-shrink: 0;
      width: 40px;
      text-align: center;
      padding: 0 2px;
      pointer-events: none;
    }
    .bbm-stat-cell + .bbm-stat-cell {
      margin-left: 12px;
    }

    /* Corr cell is hoverable */
    .bbm-corr-trigger {
      pointer-events: auto;
      cursor: default;
      position: relative;
    }
    .bbm-corr-trigger:hover {
      opacity: 1;
    }

    /* Correlation popup — hidden by default, shown on hover */
    .bbm-corr-popup {
      display: none;
      position: absolute;
      right: 0;
      top: 100%;
      margin-top: 4px;
      background: var(--bg-primary, #1a1a2e);
      border: 1px solid var(--border-color, #333);
      border-radius: 8px;
      padding: 8px 0;
      z-index: 9999;
      min-width: 220px;
      max-width: 300px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      white-space: normal;
      text-align: left;
      opacity: 1;
    }
    .bbm-corr-trigger:hover .bbm-corr-popup {
      display: block;
    }
    .bbm-corr-popup-title {
      padding: 0 12px 6px;
      font-size: 10px;
      color: inherit;
      opacity: 0.5;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    .bbm-corr-popup-empty {
      padding: 4px 12px;
      font-size: 12px;
      color: inherit;
      opacity: 0.4;
      font-style: italic;
    }

    /* Rows for when real data is wired in */
    .bbm-corr-popup-row {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 12px;
    }
    .bbm-corr-popup-pos {
      font-size: 10px;
      font-weight: 900;
      padding: 1px 4px;
      border-radius: 3px;
      min-width: 22px;
      text-align: center;
    }
    .bbm-corr-popup-name {
      font-size: 12px;
      font-weight: 600;
      flex: 1;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bbm-corr-popup-bar {
      width: 40px;
      height: 5px;
      background: rgba(128, 128, 128, 0.3);
      border-radius: 3px;
      overflow: hidden;
      flex-shrink: 0;
    }
    .bbm-corr-popup-bar-fill {
      height: 100%;
      border-radius: 3px;
    }
    .bbm-corr-popup-pct {
      font-size: 11px;
      font-weight: 700;
      font-family: monospace;
      min-width: 28px;
      text-align: right;
    }

    .bbm-header-label {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      color: inherit;
      opacity: 0.5;
      font-family: inherit;
      font-size: 11px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      text-align: center;
      padding: 0 2px;
      pointer-events: none;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Remove the overlay stylesheet.
 */
function removeStyles() {
  document.getElementById('bbm-overlay-styles')?.remove();
}

/**
 * Start observing the virtualized grid and injecting overlays.
 */
function startOverlay() {
  if (gridObserver) return; // already running

  injectStyles();

  gridObserver = createReconnectingObserver({
    targetSelector: GRID_SELECTOR,
    onMutation: sweepRows,
    onReconnect: () => {
      console.log('[BBM] Draft grid reconnected — re-sweeping rows');
      sweepRows();
    },
  });

  // Initial sweep once the grid is available
  sweepRows();
}

/**
 * Stop observing and clean up all injected content.
 */
function stopOverlay() {
  if (gridObserver) {
    gridObserver.disconnect();
    gridObserver = null;
  }
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  removeAllOverlays();
  removeStyles();
}

/**
 * Initialize the draft overlay system.
 * Called from content.js when on an Underdog page.
 */
export function initDraftOverlay() {
  if (!isDraftPage()) return;

  console.log('[BBM] Draft page detected — initializing overlay');

  // Read persisted toggle state
  chrome.storage.local.get(['overlayEnabled'], (result) => {
    enabled = result.overlayEnabled !== false; // default to true
    if (enabled) {
      startOverlay();
    }
  });

  // Listen for toggle messages from popup
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== 'TOGGLE_OVERLAY') return;
    enabled = message.enabled;
    if (enabled) {
      startOverlay();
    } else {
      stopOverlay();
    }
  });
}
