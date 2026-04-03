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
import { readEntries, readRankings } from '../utils/bridge.js';

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

// Portfolio data for metric computation
let playerIndexMap = new Map();  // lowerCasedName -> Set<rosterIndex>
let totalRosters = 0;
let currentPicks = [];           // [{name, position, round}, ...]
let picksObserver = null;

// Rankings data for tier break injection
let playerRankingsMap = new Map(); // lowerCasedName -> {rank, tierNum}
let sortObserver = null;

// Underdog selectors — verified against live DOM 2026-04-03.
const MY_PICKS_SELECTOR = '[class*="playerPickCell"]';
const PLAYER_NAME_IN_ROW_SELECTOR = '[class*="playerName"]';
const POSITION_SECTION_SELECTOR = '[class*="positionSection"]';
const POSITION_HEADER_SELECTOR = '[class*="positionHeader"]';

// Tier label/color tables — must match PlayerRankings.jsx
const TIER_LABELS = ['S','A+','A','A-','B+','B','B-','C+','C','C-','D+','D','D-','F'];
const TIER_BORDER_COLORS = {
  'S':  '#ffd700', 'A+': '#ef4444', 'A':  '#f87171', 'A-': '#fb923c',
  'B+': '#f59e0b', 'B':  '#eab308', 'B-': '#a3e635', 'C+': '#10b981',
  'C':  '#06b6d4', 'C-': '#3b82f6', 'D+': '#6366f1', 'D':  '#8b5cf6',
  'D-': '#a855f7', 'F':  '#6b7280',
};

function getTierLabel(tierNum) {
  const idx = Math.max(0, Math.min(tierNum - 1, TIER_LABELS.length - 1));
  return TIER_LABELS[idx];
}

function getTierBorderColor(tierNum) {
  return TIER_BORDER_COLORS[getTierLabel(tierNum)] || '#555';
}

/**
 * Returns true when the draft board is currently sorted by "My Rank".
 */
function isMyRankSort() {
  const sortBar = document.querySelector(SORT_BUTTONS_SELECTOR);
  if (!sortBar) return false;
  const buttons = sortBar.querySelectorAll('button, [role="button"]');
  for (const btn of buttons) {
    const text = btn.textContent?.trim().toLowerCase() ?? '';
    if (text !== 'my rank' && text !== 'my ranking') continue;
    if (
      btn.getAttribute('aria-pressed') === 'true' ||
      btn.getAttribute('aria-selected') === 'true' ||
      btn.getAttribute('data-active') === 'true' ||
      btn.classList.contains('active') ||
      btn.classList.contains('selected')
    ) return true;
  }
  return false;
}

/**
 * Check if the current page is an Underdog draft page.
 */
export function isDraftPage() {
  return /^\/draft\/[a-f0-9-]+/i.test(window.location.pathname);
}

/**
 * Load portfolio entries from Supabase and build the playerIndexMap.
 * Called once when the overlay starts. Re-sweeps rows when complete.
 */
async function loadPortfolioData() {
  try {
    const entries = await readEntries();
    totalRosters = entries.length;
    playerIndexMap = new Map();
    entries.forEach((entry, rosterIdx) => {
      (entry.players ?? []).forEach(p => {
        if (!p.name) return;
        const key = p.name.trim().toLowerCase();
        if (!playerIndexMap.has(key)) playerIndexMap.set(key, new Set());
        playerIndexMap.get(key).add(rosterIdx);
      });
    });
    console.log(`[BBM] Portfolio loaded: ${totalRosters} entries, ${playerIndexMap.size} players indexed`);
    sweepRows();
  } catch (err) {
    console.warn('[BBM] Could not load portfolio data:', err.message);
  }
}

/**
 * Load the user's saved PlayerRankings tier data from Supabase.
 * Builds playerRankingsMap for use in processRow().
 */
async function loadRankingsData() {
  try {
    const rankings = await readRankings();
    if (!rankings) return;
    playerRankingsMap = new Map(rankings.map(r => [r.name, { rank: r.rank, tierNum: r.tierNum }]));
    console.log(`[BBM] Rankings loaded: ${playerRankingsMap.size} players with tier data`);
    sweepRows();
  } catch (err) {
    console.warn('[BBM] Could not load rankings data:', err.message);
  }
}

/**
 * Read current picks from the Underdog "my team" panel.
 * Updates the currentPicks array and triggers a row re-sweep.
 */
function resolveCurrentPicks() {
  const pickEls = document.querySelectorAll(MY_PICKS_SELECTOR);
  const picks = [];
  pickEls.forEach((el, idx) => {
    const nameEl = el.querySelector(PLAYER_NAME_IN_ROW_SELECTOR);
    const section = el.closest(POSITION_SECTION_SELECTOR);
    const position = section?.querySelector(POSITION_HEADER_SELECTOR)?.textContent?.trim() ?? '';
    const name = nameEl?.textContent?.trim();
    if (name) {
      picks.push({ name, position, round: idx + 1 });
    }
  });
  // Only re-sweep if picks actually changed
  const changed =
    picks.length !== currentPicks.length ||
    picks.some((p, i) => p.name !== currentPicks[i]?.name);
  if (changed) {
    currentPicks = picks;
    sweepRows();
  }
}

/**
 * Start a MutationObserver that watches for new picks in the draft board.
 */
function startPicksObserver() {
  if (picksObserver) return;
  picksObserver = new MutationObserver(resolveCurrentPicks);
  picksObserver.observe(document.body, { childList: true, subtree: true });
  resolveCurrentPicks();
}

/**
 * Stop the picks observer and clear current picks state.
 */
function stopPicksObserver() {
  if (picksObserver) {
    picksObserver.disconnect();
    picksObserver = null;
  }
  currentPicks = [];
}

/**
 * Extract the player name from a row DOM element.
 * Returns null if no name element is found.
 *
 * @param {Element} row
 * @returns {string|null}
 */
function getPlayerNameFromRow(row) {
  const nameEl = row.querySelector(PLAYER_NAME_IN_ROW_SELECTOR);
  return nameEl?.textContent?.trim() ?? null;
}

/**
 * Compute portfolio exposure for a player name.
 * Returns a 0-100 percentage.
 *
 * @param {string} playerName
 * @returns {number}
 */
function computeExposure(playerName) {
  if (totalRosters === 0) return 0;
  const rosterSet = playerIndexMap.get(playerName.trim().toLowerCase());
  if (!rosterSet) return 0;
  return (rosterSet.size / totalRosters) * 100;
}

/**
 * Compute correlation score and per-pick breakdown for a player name.
 * Correlation = average conditional probability P(candidate | each current pick).
 *
 * @param {string} playerName
 * @returns {{ score: number, breakdown: Array<{name, position, round, pct}> }}
 */
function computeCorrelation(playerName) {
  const candidateRosters = playerIndexMap.get(playerName.trim().toLowerCase()) ?? new Set();
  const breakdown = [];
  let sumProb = 0;
  let comparisons = 0;

  currentPicks.forEach(pick => {
    const pickRosters = playerIndexMap.get(pick.name.trim().toLowerCase()) ?? new Set();
    if (pickRosters.size === 0) return;

    let intersection = 0;
    if (pickRosters.size < candidateRosters.size) {
      pickRosters.forEach(rid => { if (candidateRosters.has(rid)) intersection++; });
    } else {
      candidateRosters.forEach(rid => { if (pickRosters.has(rid)) intersection++; });
    }

    const prob = intersection / pickRosters.size;
    sumProb += prob;
    comparisons++;
    breakdown.push({
      name: pick.name,
      position: pick.position,
      round: pick.round,
      pct: Math.round(prob * 100),
    });
  });

  return {
    score: comparisons > 0 ? Math.round((sumProb / comparisons) * 100) : 0,
    breakdown,
  };
}

/**
 * Update the metric values on an already-injected row without re-injecting elements.
 * Called when picks change and we need to refresh visible rows.
 *
 * @param {Element} row
 */
function updateRowMetrics(row) {
  const exp = row.querySelector('.bbm-stat-cell:not(.bbm-corr-trigger)');
  const corrTrigger = row.querySelector('.bbm-corr-trigger');
  if (!exp || !corrTrigger) return;

  const playerName = getPlayerNameFromRow(row);
  if (!playerName || totalRosters === 0) return;

  const expPct = computeExposure(playerName);
  exp.textContent = `${Math.round(expPct)}%`;

  const corrValue = corrTrigger.querySelector('.bbm-corr-value');
  const popup = corrTrigger.querySelector('.bbm-corr-popup');
  if (!corrValue || !popup) return;

  const { score, breakdown } = computeCorrelation(playerName);
  corrValue.textContent = `${score}%`;
  populateCorrPopup(popup, breakdown);

  applyTierBreak(row, playerName);
}

/**
 * Populate a correlation popup element with per-pick breakdown rows.
 *
 * @param {Element} popup
 * @param {Array<{name, position, round, pct}>} breakdown
 */
function populateCorrPopup(popup, breakdown) {
  if (breakdown.length === 0) {
    popup.innerHTML =
      '<div class="bbm-corr-popup-title">Roster Overlap</div>' +
      '<div class="bbm-corr-popup-empty">No picks yet</div>';
    return;
  }
  popup.innerHTML =
    '<div class="bbm-corr-popup-title">Roster Overlap</div>' +
    breakdown
      .map(
        b => `<div class="bbm-corr-popup-row">
          <span class="bbm-corr-popup-pos">${b.position}</span>
          <span class="bbm-corr-popup-name">${b.name}</span>
          <div class="bbm-corr-popup-bar">
            <div class="bbm-corr-popup-bar-fill" style="width:${b.pct}%;background:#3b82f6"></div>
          </div>
          <span class="bbm-corr-popup-pct">${b.pct}%</span>
        </div>`
      )
      .join('');
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
  if (existing === playerId) {
    // Row already injected for this player — refresh metrics in case picks changed
    updateRowMetrics(row);
    return;
  }

  // Row was recycled — remove old injections if present
  row.querySelectorAll('.bbm-inline-overlay').forEach(el => el.remove());
  row.querySelectorAll('.bbm-tier-badge').forEach(el => el.remove());
  row.removeAttribute('data-bbm-tier');

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

  const playerName = getPlayerNameFromRow(row);

  // Populate metrics if portfolio data is available
  if (totalRosters > 0 && playerName) {
    const expPct = computeExposure(playerName);
    exp.textContent = `${Math.round(expPct)}%`;

    const { score, breakdown } = computeCorrelation(playerName);
    const corrValue = corr.querySelector('.bbm-corr-value');
    const popup = corr.querySelector('.bbm-corr-popup');
    corrValue.textContent = `${score}%`;
    populateCorrPopup(popup, breakdown);
  }

  // Inject tier break indicator if sorted by My Rank and rankings data is available
  applyTierBreak(row, playerName);
}

/**
 * Apply (or remove) a tier break badge on a row based on current sort state and rankings data.
 *
 * @param {Element} row
 * @param {string|null} playerName
 */
function applyTierBreak(row, playerName) {
  // Remove any existing badge first (handles recycle + sort-change sweeps)
  row.querySelectorAll('.bbm-tier-badge').forEach(el => el.remove());
  row.removeAttribute('data-bbm-tier');

  if (!isMyRankSort() || playerRankingsMap.size === 0 || !playerName) return;

  const entry = playerRankingsMap.get(playerName.trim().toLowerCase());
  if (!entry) return;

  const { tierNum } = entry;
  row.setAttribute('data-bbm-tier', String(tierNum));

  // Tier 1 is the top — no divider needed above it
  if (tierNum <= 1) return;

  const color = getTierBorderColor(tierNum);
  const label = getTierLabel(tierNum);

  const badge = document.createElement('div');
  badge.className = 'bbm-tier-badge';
  badge.textContent = label;
  badge.style.borderTopColor = color;
  badge.style.color = color;
  row.style.position = 'relative';
  row.prepend(badge);
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
    const rows = document.querySelectorAll(ROW_SELECTOR);
    rows.forEach(processRow);
    injectHeaders(); // must run after processRow so BBM cells exist for measurement
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

    /* Tier break badge — straddles the top edge of the row */
    .bbm-tier-badge {
      position: absolute;
      left: 8px;
      top: 0;
      transform: translateY(-50%);
      font-size: 9px;
      font-weight: 800;
      letter-spacing: 0.06em;
      padding: 1px 5px;
      border-radius: 3px;
      border-top: 2px solid;
      background: rgba(0,0,0,0.6);
      pointer-events: none;
      white-space: nowrap;
      z-index: 2;
      line-height: 1.4;
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

    /* FAB — brand logo button, bottom-left. Whispers at rest, speaks on hover. */
    #bbm-fab {
      position: fixed;
      bottom: 14px;
      left: 14px;
      z-index: 10000;
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: transparent;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      opacity: 0.3;
      transition: opacity 120ms ease, filter 120ms ease;
    }
    #bbm-fab:hover {
      opacity: 1;
      filter: drop-shadow(0 0 8px rgba(232, 191, 74, 0.5));
    }

    /* Configuration panel — compact, only visible on demand */
    #bbm-panel {
      display: none;
      position: fixed;
      bottom: 50px;
      left: 14px;
      z-index: 10000;
      background: #0C1A30;
      border: 1px solid #243A5C;
      border-radius: 8px;
      padding: 10px 14px;
      min-width: 160px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.5);
      font-size: 12px;
      color: #E8E8E8;
    }
    #bbm-panel.open {
      display: block;
    }
    .bbm-panel-title {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #8A9BB5;
      margin-bottom: 8px;
    }
    .bbm-panel-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .bbm-panel-label {
      font-size: 12px;
      font-weight: 600;
      color: #E8E8E8;
    }
    #bbm-overlay-toggle {
      cursor: pointer;
      width: 14px;
      height: 14px;
      accent-color: #E8BF4A;
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
  loadPortfolioData();   // async — sweeps rows when data is ready
  loadRankingsData();    // async — sweeps rows when tier data is ready
  startPicksObserver();  // watches "my team" panel for new picks

  gridObserver = createReconnectingObserver({
    targetSelector: GRID_SELECTOR,
    onMutation: sweepRows,
    onReconnect: () => {
      console.log('[BBM] Draft grid reconnected — re-sweeping rows');
      sweepRows();
    },
  });

  // Observe sort bar for active-sort changes so tier badges update immediately
  const sortBarEl = document.querySelector(SORT_BUTTONS_SELECTOR);
  if (sortBarEl) {
    sortObserver = new MutationObserver(sweepRows);
    sortObserver.observe(sortBarEl, { attributes: true, subtree: true });
  }

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
  if (sortObserver) {
    sortObserver.disconnect();
    sortObserver = null;
  }
  if (rafId) {
    cancelAnimationFrame(rafId);
    rafId = null;
  }
  stopPicksObserver();
  removeAllOverlays();
}

/**
 * Inject the floating BBM config button and panel into the page.
 * Always injected regardless of overlay enabled state — user needs it to re-enable.
 */
function injectFloatingButton() {
  if (document.getElementById('bbm-fab')) return;

  const fab = document.createElement('button');
  fab.id = 'bbm-fab';
  fab.title = 'Best Ball Manager';
  fab.innerHTML = `<svg width="36" height="36" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Best Ball Manager">
    <defs>
      <linearGradient id="bb-gold" x1="10" y1="10" x2="38" y2="38" gradientUnits="userSpaceOnUse">
        <stop offset="0%"   stop-color="#F0CC5B"/>
        <stop offset="50%"  stop-color="#D4A843"/>
        <stop offset="100%" stop-color="#E8BF4A"/>
      </linearGradient>
      <linearGradient id="bb-bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stop-color="#0C1A30"/>
        <stop offset="100%" stop-color="#060E1F"/>
      </linearGradient>
    </defs>
    <circle cx="24" cy="24" r="24" fill="url(#bb-bg)"/>
    <circle cx="24" cy="24" r="22.5" fill="none" stroke="url(#bb-gold)" stroke-width="2"/>
    <circle cx="24" cy="24" r="14" fill="none" stroke="#E8BF4A" stroke-width="0.5" opacity="0.18"/>
    <circle cx="24" cy="24" r="14" fill="none" stroke="url(#bb-gold)" stroke-width="3.5" stroke-linecap="round" stroke-dasharray="18 7 10 7 23 7 8 7.96" transform="rotate(-90 24 24)"/>
    <circle cx="24" cy="24" r="2.5" fill="url(#bb-gold)"/>
  </svg>`;

  const panel = document.createElement('div');
  panel.id = 'bbm-panel';
  panel.innerHTML = `
    <div class="bbm-panel-title">Best Ball Manager</div>
    <div class="bbm-panel-row">
      <label class="bbm-panel-label" for="bbm-overlay-toggle">Overlay</label>
      <input type="checkbox" id="bbm-overlay-toggle" />
    </div>
  `;

  const toggle = panel.querySelector('#bbm-overlay-toggle');
  toggle.checked = enabled;

  // stopPropagation prevents the document click listener from closing
  // the panel on the same click that opened it
  fab.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('open');
  });

  toggle.addEventListener('change', () => {
    enabled = toggle.checked;
    chrome.storage.local.set({ overlayEnabled: enabled });
    if (enabled) {
      startOverlay();
    } else {
      stopOverlay();
    }
  });

  document.body.appendChild(fab);
  document.body.appendChild(panel);
}

/**
 * Remove the floating button, panel, and all styles.
 * Called only on full page teardown — not on overlay toggle-off.
 */
function removeFloatingButton() {
  document.getElementById('bbm-fab')?.remove();
  document.getElementById('bbm-panel')?.remove();
  removeStyles();
}

/**
 * Initialize the BBM overlay system.
 * Called from content.js on any supported platform page.
 *
 * The FAB is injected on every page so users have a config surface
 * pre-draft and during draft. Row injection (startOverlay) only runs
 * on actual draft pages where the player grid exists.
 */
export function initDraftOverlay() {
  console.log('[BBM] Initializing on Underdog page');

  chrome.storage.local.get(['overlayEnabled'], (result) => {
    enabled = result.overlayEnabled !== false; // default to true

    injectStyles();
    injectFloatingButton();

    // Row overlay only meaningful on draft pages
    if (isDraftPage() && enabled) startOverlay();

    // Close panel when clicking outside the FAB/panel
    document.addEventListener('click', () => {
      document.getElementById('bbm-panel')?.classList.remove('open');
    });

    // Close panel on ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.getElementById('bbm-panel')?.classList.remove('open');
      }
    });
  });

  // Listen for toggle messages from popup — sync FAB checkbox to match
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== 'TOGGLE_OVERLAY') return;
    enabled = message.enabled;
    const toggle = document.getElementById('bbm-overlay-toggle');
    if (toggle) toggle.checked = enabled;
    if (enabled) {
      if (isDraftPage()) startOverlay();
    } else {
      stopOverlay();
    }
  });
}
