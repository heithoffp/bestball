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
import { readEntries, readRankings, getAuthSession, signIn, signInWithGoogle, signOut, fetchTier } from '../utils/bridge.js';
import { canonicalName } from '../utils/canonicalName.js';
import playoffSchedule from '../data/playoff-schedule-2026.json';
import {
  analyzeByeRainbow,
  getEliminatorFlags,
} from '../utils/eliminatorModel.js';

// Playoff weeks rendered on the candidate row (TASK-232).
const PLAYOFF_WEEKS = ['15', '16', '17'];

// Meaningful best-ball game-stack pairs (candidate pos -> rostered opposing positions).
// W15/W16 follow the conservative rule: RB excluded (not a game-stack asset in best ball),
// TE excludes TE so TE<->TE pairings never qualify.
// W17 is championship week and relaxes the filter to include RB on both sides, since any
// opposing-game correlation matters more in the final week.
const MEANINGFUL_GAME_PAIRS_DEFAULT = Object.freeze({
  QB: new Set(['QB', 'WR', 'TE']),
  WR: new Set(['QB', 'WR', 'TE']),
  TE: new Set(['QB', 'WR']),
});
const MEANINGFUL_GAME_PAIRS_W17 = Object.freeze({
  QB: new Set(['QB', 'WR', 'TE', 'RB']),
  WR: new Set(['QB', 'WR', 'TE', 'RB']),
  TE: new Set(['QB', 'WR', 'RB']),
  RB: new Set(['QB', 'WR', 'TE', 'RB']),
});
function pairsForWeek(week) {
  return week === '17' ? MEANINGFUL_GAME_PAIRS_W17 : MEANINGFUL_GAME_PAIRS_DEFAULT;
}

const INJECTED_ATTR = 'data-bbm-injected';
const PLAYER_ID_ATTR = 'data-bbm-player-id';
const HEADER_INJECTED_ATTR = 'data-bbm-headers-injected';

let adapter = null;
let corrPopupPortal = null; // Single shared popup, appended to document.body

let gridObserver = null;
let enabled = true;
// Eliminator Mode (TASK-270, ADR-011) — additive overlay layer, default off, persisted.
// When off the overlay behaves exactly as before. Gated to Pro like the row overlay.
let eliminatorEnabled = false;
let rafId = null;
let lastUrl = window.location.href;
let wasOnDraftPage = false;

// Portfolio data for metric computation
let playerIndexMap = new Map();  // canonicalName -> Set<rosterIndex>
let playerTeamMap = new Map();   // canonicalName -> team abbreviation (portfolio-derived)
let playerPositionMap = new Map(); // canonicalName -> position
// TASK-275: live-draft team map sourced from the page bridge's reference data.
// Covers every player in the current draft's slate — including freshly-drafted
// players not yet in the synced portfolio — so the Eliminator bye window can
// resolve their bye weeks. Takes precedence over playerTeamMap for live picks.
let draftTeamMap = new Map();     // canonicalName -> team abbreviation (live draft)
let draftTeamsRequested = false;  // guard: fetch the live map once per draft
let abbreviatedNameMap = new Map(); // "j. jefferson" -> canonicalName (for DK-style abbreviated display)
let totalRosters = 0;
let currentPicks = [];           // [{name, position, round}, ...]
// DK virtualizes the roster panel — see TASK-233. Accumulate observed picks
// across scroll-driven mutations so the visible-subset reads never shrink the
// set. Keyed by canonicalName so dedup is stable across abbreviated/full names.
let pickRegistry = new Map();    // canonicalName -> {name, position, round}
let picksObserver = null;
let picksRafId = null; // RAF debounce for picks observer

// Rankings data for tier break injection
let playerRankingsMap = new Map(); // lowerCasedName -> {rank, tierNum}
let tierStartRanks = new Set();    // ranks where a new tier begins (badge shown here only)
let sortObserver = null;

// Confidence panel state (TASK-106)
let loadState = 'idle'; // 'idle' | 'loading' | 'ready' | 'error'
let loadError = null;   // string | null

// Sync callback — injected from content.js so the overlay can trigger entry scraping
let syncCallback = null;

// Subscription tier state (TASK-231) — 'pro' | 'free' | null (unknown/error)
// Row injection, correlation popup, tournament filter, and the Overlay toggle are
// gated to 'pro'. Initial value `null` ensures we never flash the overlay before
// confirming Pro on first load.
let currentTier = null;

const UPGRADE_URL = 'https://bestballexposures.com/?upgrade=1';

// Tournament filter state (TASK-107)
// Shape mirrors web app's TournamentMultiSelect: slateGroups = [{slate, tournaments[]}]
// selectedTournaments = Set<tournamentTitle> — empty means all entries used
let slateGroups = [];
let allEntries = [];            // cached raw entries; re-filter in memory on filter changes
let selectedTournaments = new Set();
let expandedSlates = new Set(); // slate names currently expanded in the filter panel

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

// --- Confidence panel helpers (TASK-106) ---

function resolveErrorMessage(err) {
  const msg = err?.message ?? '';
  if (msg.includes('Not authenticated') || msg.includes('JWT')) return 'Session expired — sign in again';
  if (msg.includes('fetch') || msg.includes('network') || msg.includes('NetworkError')) return 'Connection lost — tap to retry';
  return 'Load failed — tap to retry';
}

function formatRelativeTime(ms) {
  const secs = Math.floor((Date.now() - ms) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

async function updatePanelStatus() {
  const dot = document.querySelector('.bbm-status-dot');
  const label = document.querySelector('.bbm-status-label');
  const syncLine = document.querySelector('.bbm-panel-sync-line');
  if (!dot || !label || !syncLine) return;

  const session = await getAuthSession();

  let dotColor, labelText;
  if (!session) {
    dotColor = '#F59E0B';
    labelText = 'Not signed in';
  } else if (loadState === 'loading') {
    dotColor = '#6B7280';
    labelText = 'Loading portfolio\u2026';
  } else if (loadState === 'error') {
    dotColor = '#EF4444';
    labelText = loadError ?? 'Load failed \u2014 tap to retry';
  } else {
    dotColor = '#10B981';
    labelText = 'Connected';
  }

  dot.style.background = dotColor;
  label.textContent = labelText;

  const statusRow = document.querySelector('.bbm-panel-status');
  if (statusRow) statusRow.style.cursor = loadState === 'error' ? 'pointer' : 'default';

  if (loadState === 'loading') {
    syncLine.textContent = 'Fetching entries\u2026';
    return;
  }

  if (!session) {
    syncLine.textContent = '\u2014';
    return;
  }

  chrome.storage.local.get(
    ['lastSync', 'entryCount', 'underdog_lastSync', 'underdog_entryCount', 'draftkings_lastSync', 'draftkings_entryCount'],
    (result) => {
      const parts = [];
      if (result.underdog_lastSync) {
        parts.push(`UD: ${result.underdog_entryCount ?? 0} \u00b7 ${formatRelativeTime(result.underdog_lastSync)}`);
      }
      if (result.draftkings_lastSync) {
        parts.push(`DK: ${result.draftkings_entryCount ?? 0} \u00b7 ${formatRelativeTime(result.draftkings_lastSync)}`);
      }
      if (parts.length > 0) {
        syncLine.textContent = parts.join('  |  ');
      } else if (result.lastSync) {
        // Legacy fallback: no per-platform data yet
        syncLine.textContent = `${result.entryCount ?? 0} entries \u00b7 synced ${formatRelativeTime(result.lastSync)}`;
      } else {
        syncLine.textContent = 'Not yet synced';
      }
    }
  );
}

// --- Tournament filter helpers (TASK-107) ---

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function titleCase(str) {
  return String(str ?? '').replace(/\b\w/g, c => c.toUpperCase());
}

function renderTournamentFilter() {
  const container = document.getElementById('bbm-tournament-filter');
  if (!container) return;

  if (slateGroups.length === 0) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';
  container.innerHTML = slateGroups.map((g, si) => {
    const isExpanded = expandedSlates.has(g.slate);
    return `
      <div class="bbm-filter-slate-group${isExpanded ? ' bbm-expanded' : ''}" data-si="${si}">
        <div class="bbm-filter-slate-row">
          <label class="bbm-filter-slate-label-wrap">
            <input type="checkbox" class="bbm-filter-check bbm-filter-slate-check" data-si="${si}" />
            <span class="bbm-filter-slate-label">${escapeHtml(g.slate)}</span>
          </label>
          <button type="button" class="bbm-filter-expand" data-si="${si}">${isExpanded ? '\u25bc' : '\u25b6'}</button>
        </div>
        <div class="bbm-filter-tournaments">
          ${g.tournaments.map((t, ti) => `
            <label class="bbm-filter-tournament-row">
              <input type="checkbox" class="bbm-filter-check bbm-filter-tournament-check"
                data-si="${si}" data-ti="${ti}"
                ${selectedTournaments.has(t) ? 'checked' : ''} />
              <span class="bbm-filter-tournament-label">${escapeHtml(t)}</span>
            </label>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');

  // Set slate checkbox checked/indeterminate states
  container.querySelectorAll('.bbm-filter-slate-check').forEach(cb => {
    const { tournaments } = slateGroups[parseInt(cb.dataset.si)];
    const n = tournaments.filter(t => selectedTournaments.has(t)).length;
    cb.checked = n === tournaments.length;
    cb.indeterminate = n > 0 && n < tournaments.length;
  });

  // Expand/collapse toggle
  container.querySelectorAll('.bbm-filter-expand').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const g = slateGroups[parseInt(btn.dataset.si)];
      if (expandedSlates.has(g.slate)) {
        expandedSlates.delete(g.slate);
      } else {
        expandedSlates.add(g.slate);
      }
      renderTournamentFilter(); // re-render to reflect new expanded state
    });
  });

  // Slate toggle — add/remove all its tournaments
  container.querySelectorAll('.bbm-filter-slate-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const { tournaments } = slateGroups[parseInt(cb.dataset.si)];
      const allChecked = tournaments.every(t => selectedTournaments.has(t));
      if (allChecked) {
        tournaments.forEach(t => selectedTournaments.delete(t));
      } else {
        tournaments.forEach(t => selectedTournaments.add(t));
      }
      chrome.storage.local.set({ tournamentFilter: [...selectedTournaments] });
      applyPortfolioFilter();
    });
  });

  // Tournament toggle
  container.querySelectorAll('.bbm-filter-tournament-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const t = slateGroups[parseInt(cb.dataset.si)].tournaments[parseInt(cb.dataset.ti)];
      if (cb.checked) { selectedTournaments.add(t); } else { selectedTournaments.delete(t); }
      chrome.storage.local.set({ tournamentFilter: [...selectedTournaments] });
      applyPortfolioFilter();
    });
  });
}

/**
 * Re-filter allEntries using selectedTournaments, rebuild playerIndexMap, sweep rows.
 * Called on filter changes — no Supabase round-trip needed.
 */
function applyPortfolioFilter() {
  const filtered = selectedTournaments.size === 0
    ? allEntries
    : allEntries.filter(e => selectedTournaments.has(e.tournamentTitle));

  // Player team + position are slate-INDEPENDENT reference data: a player's NFL team
  // and position are the same in every tournament. Build them from ALL synced rosters,
  // not the slate-filtered set, so the Eliminator bye window can resolve a live pick's
  // bye even when the selected slate has few/no completed drafts (TASK-277). The live
  // bridge map (draftTeamMap, TASK-275) is the primary source; this is the fallback.
  playerTeamMap = new Map();
  playerPositionMap = new Map();
  allEntries.forEach(entry => {
    (entry.players ?? []).forEach(p => {
      if (!p.name) return;
      const key = canonicalName(p.name);
      if (!key) return;
      if (p.team && !playerTeamMap.has(key)) playerTeamMap.set(key, p.team);
      if (p.position && !playerPositionMap.has(key)) playerPositionMap.set(key, p.position);
    });
  });

  // Exposure data (roster membership, pick samples, total count) IS slate-specific —
  // it reflects only the tournaments the user has selected.
  totalRosters = filtered.length;
  playerIndexMap = new Map();
  abbreviatedNameMap = new Map();
  // Per-player pick samples for ambiguous-abbrev tiebreak (e.g., Bijan vs Brian Robinson)
  const pickSamplesByKey = new Map();
  filtered.forEach((entry, rosterIdx) => {
    (entry.players ?? []).forEach(p => {
      if (!p.name) return;
      const key = canonicalName(p.name);
      if (!key) return;
      if (!playerIndexMap.has(key)) playerIndexMap.set(key, new Set());
      playerIndexMap.get(key).add(rosterIdx);
      const pickNum = Number(p.pick);
      if (Number.isFinite(pickNum) && pickNum > 0) {
        if (!pickSamplesByKey.has(key)) pickSamplesByKey.set(key, []);
        pickSamplesByKey.get(key).push(pickNum);
      }
    });
  });

  function medianPick(key) {
    const arr = pickSamplesByKey.get(key);
    if (!arr || arr.length === 0) return null;
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  // Build abbreviated name reverse-lookup: "j jefferson" → "justin jefferson"
  // Handles DK-style abbreviated display names (first initial + last name).
  // Ambiguous abbreviations store candidate arrays for DOM-based disambiguation.
  // Key uses canonical form (no periods) so last names with embedded periods
  // like "St. Brown" match the lookup, which also routes through canonicalName.
  for (const fullName of playerIndexMap.keys()) {
    const parts = fullName.split(/\s+/);
    if (parts.length < 2) continue;
    const firstInitial = parts[0][0];
    const lastName = parts.slice(1).join(' ');
    const abbrev = `${firstInitial} ${lastName}`;
    if (abbreviatedNameMap.has(abbrev)) {
      const existing = abbreviatedNameMap.get(abbrev);
      const candidate = {
        fullName,
        position: playerPositionMap.get(fullName)?.toUpperCase() ?? null,
        team: playerTeamMap.get(fullName)?.toUpperCase() ?? null,
        medianPick: medianPick(fullName),
      };
      if (typeof existing === 'string') {
        // Convert first entry to array, add second candidate
        abbreviatedNameMap.set(abbrev, [
          {
            fullName: existing,
            position: playerPositionMap.get(existing)?.toUpperCase() ?? null,
            team: playerTeamMap.get(existing)?.toUpperCase() ?? null,
            medianPick: medianPick(existing),
          },
          candidate,
        ]);
      } else if (Array.isArray(existing)) {
        existing.push(candidate);
      }
    } else {
      abbreviatedNameMap.set(abbrev, fullName);
    }
  }

  renderTournamentFilter();
  sweepRows();
}

// --- Tier gate helpers (TASK-231) ---

/**
 * Re-fetch tier from Supabase and reapply the gate. Safe to call repeatedly;
 * `fetchTier()` returns null on any error so we fail closed (non-Pro UI).
 */
async function refreshTier() {
  currentTier = await fetchTier();
  applyTierGate();
}

/**
 * Apply or lift Pro gating across the panel and draft-row injections.
 * - Pro: re-arm overlay on draft pages, enable toggle, hide upgrade CTA,
 *   show tournament filter section.
 * - Non-Pro (free, signed-out, or fetch-failed): strip row injections,
 *   stop observers, disable the toggle, show upgrade CTA, hide filter.
 */
function applyTierGate() {
  const isPro = currentTier === 'pro';

  // Overlay toggle row
  const overlayRow = document.getElementById('bbm-overlay-row');
  const toggle = document.getElementById('bbm-overlay-toggle');
  if (overlayRow && toggle) {
    if (isPro) {
      overlayRow.classList.remove('bbm-locked');
      overlayRow.removeAttribute('title');
      toggle.disabled = false;
      toggle.checked = enabled;
    } else {
      overlayRow.classList.add('bbm-locked');
      overlayRow.setAttribute('title', 'Pro feature — upgrade to use the overlay');
      toggle.disabled = true;
      toggle.checked = false;
    }
  }

  // Eliminator Mode toggle row — Pro-gated like the overlay row (TASK-270)
  const elimRow = document.getElementById('bbm-eliminator-row');
  const elimToggle = document.getElementById('bbm-eliminator-toggle');
  if (elimRow && elimToggle) {
    if (isPro) {
      elimRow.classList.remove('bbm-locked');
      elimRow.removeAttribute('title');
      elimToggle.disabled = false;
      elimToggle.checked = eliminatorEnabled;
    } else {
      elimRow.classList.add('bbm-locked');
      elimRow.setAttribute('title', 'Pro feature — upgrade to use Eliminator Mode');
      elimToggle.disabled = true;
      elimToggle.checked = false;
    }
  }

  // Tournament filter section — meaningless without the row overlay
  const filterWrap = document.getElementById('bbm-filter-wrap');
  if (filterWrap) {
    filterWrap.style.display = isPro ? '' : 'none';
  }

  // Upgrade CTA
  renderUpgradeCta();

  // Draft-row injections
  if (isPro) {
    if (adapter?.isDraftPage?.() && enabled && !gridObserver) {
      startOverlay();
    } else {
      // Overlay already running (or disabled) — still reconcile Eliminator UI.
      applyEliminatorMode();
    }
  } else {
    // Tear down any active injections / observers
    if (gridObserver || sortObserver || picksObserver) {
      stopOverlay();
    } else {
      // Even without observers, scrub any leftover injected DOM
      removeAllOverlays();
    }
    // Eliminator Mode is Pro-only — remove its window/badges for non-Pro.
    removeEliminatorWindow();
    document.querySelectorAll('.bbm-eliminator-badge').forEach(el => el.remove());
  }
}

/**
 * Render (or clear) the "Upgrade to Pro" CTA inside the FAB panel.
 * Shown when tier is not 'pro' (free, signed-out, or unknown).
 */
function renderUpgradeCta() {
  const container = document.getElementById('bbm-upgrade-cta');
  if (!container) return;
  if (currentTier === 'pro') {
    container.innerHTML = '';
    container.style.display = 'none';
    return;
  }
  container.style.display = 'block';
  container.innerHTML = `
    <a href="${UPGRADE_URL}" target="_blank" rel="noopener noreferrer" class="bbm-upgrade-btn">
      <span class="bbm-upgrade-icon" aria-hidden="true">★</span>
      Upgrade to Pro
    </a>
    <div class="bbm-upgrade-sub">Unlock the in-draft overlay</div>
  `;
}

// --- Auth panel helpers (TASK-129) ---

/**
 * Render (or re-render) the auth section of the FAB panel.
 * Shows a sign-in form when unauthenticated; shows email, tier, sync, and sign-out when authenticated.
 */
async function renderAuthSection() {
  const container = document.getElementById('bbm-auth-section');
  if (!container) return;

  const session = await getAuthSession();

  if (!session) {
    container.innerHTML = `
      <div class="bbm-account-toggle" id="bbm-account-toggle">
        <span class="bbm-account-toggle-label">Account</span>
        <span class="bbm-account-chevron" style="transform:rotate(180deg)">&#9660;</span>
      </div>
      <div class="bbm-account-body" id="bbm-account-body" style="display:block">
        <button id="bbm-google-btn" class="bbm-btn bbm-btn-google">
          <svg width="16" height="16" viewBox="0 0 48 48" style="flex-shrink:0"><path fill="#4285F4" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/><path fill="#34A853" d="M6.3 14.7l7 5.1C15 15.6 19.1 12 24 12c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 16.3 2 9.7 7.3 6.3 14.7z"/><path fill="#FBBC05" d="M24 46c5.4 0 10.3-1.8 14.1-5l-6.9-5.7C29.1 37 26.7 38 24 38c-6 0-10.6-3.9-12.3-9.2l-7 5.4C8.1 41 15.4 46 24 46z"/><path fill="#EA4335" d="M46 24c0-1.3-.2-2.7-.5-4H24v8.5h11.8c-1 3-3 5.4-5.8 7l6.9 5.7C41 37.5 46 31.5 46 24z"/></svg>
          Sign in with Google
        </button>
        <div class="bbm-auth-divider"><span>or</span></div>
        <input type="email" id="bbm-auth-email" class="bbm-auth-input" placeholder="Email" autocomplete="email" />
        <input type="password" id="bbm-auth-password" class="bbm-auth-input" placeholder="Password" autocomplete="current-password" />
        <button id="bbm-sign-in-btn" class="bbm-btn">Sign In</button>
        <div id="bbm-auth-error" class="bbm-auth-error" style="display:none"></div>
      </div>
    `;
    container.querySelector('#bbm-account-toggle').addEventListener('click', toggleAccountSection);
    container.querySelector('#bbm-google-btn').addEventListener('click', handleGoogleSignIn);
    container.querySelector('#bbm-sign-in-btn').addEventListener('click', handleSignIn);
    // Stop keyboard events from bubbling to the host page (e.g. DK interprets "e" as "Entrants" shortcut)
    for (const input of container.querySelectorAll('.bbm-auth-input')) {
      for (const evt of ['keydown', 'keypress', 'keyup']) {
        input.addEventListener(evt, (e) => e.stopPropagation());
      }
    }
    container.querySelector('#bbm-auth-password').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') handleSignIn();
    });
  } else {
    const tier = await fetchTier();
    const tierHtml = tier
      ? `<span class="bbm-auth-tier ${tier}">${tier === 'pro' ? 'Pro' : 'Free'}</span>`
      : '';
    container.innerHTML = `
      <div class="bbm-account-toggle" id="bbm-account-toggle">
        <span class="bbm-account-toggle-label">Account</span>
        <span class="bbm-account-chevron">&#9660;</span>
      </div>
      <div class="bbm-account-body" id="bbm-account-body" style="display:none">
        <div class="bbm-auth-user">${escapeHtml(session.user.email)}</div>
        ${tierHtml}
        <button id="bbm-sign-out-btn" class="bbm-btn bbm-btn-secondary">Sign Out</button>
      </div>
      <button id="bbm-sync-btn" class="bbm-btn" style="margin-top:6px">Sync Now</button>
      <div id="bbm-sync-progress" class="bbm-sync-progress bbm-progress-indeterminate" style="display:none">
        <div class="bbm-progress-label">Discovering entries\u2026</div>
        <div class="bbm-progress-bar-wrap"><div class="bbm-progress-bar-fill"></div></div>
      </div>
      <div id="bbm-sync-result" class="bbm-sync-result" style="display:none"></div>
    `;
    container.querySelector('#bbm-account-toggle').addEventListener('click', toggleAccountSection);
    container.querySelector('#bbm-sync-btn').addEventListener('click', handleSync);
    container.querySelector('#bbm-sign-out-btn').addEventListener('click', handleSignOut);
  }
}

function toggleAccountSection() {
  const body = document.getElementById('bbm-account-body');
  const chevron = document.querySelector('.bbm-account-chevron');
  if (!body) return;
  const isOpen = body.style.display !== 'none';
  body.style.display = isOpen ? 'none' : 'block';
  if (chevron) chevron.style.transform = isOpen ? '' : 'rotate(180deg)';
}

async function handleGoogleSignIn() {
  const btn = document.getElementById('bbm-google-btn');
  const errorEl = document.getElementById('bbm-auth-error');
  if (!btn) return;

  btn.disabled = true;
  if (errorEl) errorEl.style.display = 'none';

  try {
    await signInWithGoogle();
    await refreshTier();
    await renderAuthSection();
    loadPortfolioData();
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message ?? 'Google sign-in failed';
      errorEl.style.display = 'block';
    }
    if (btn) btn.disabled = false;
  }
}

async function handleSignIn() {
  const email = document.getElementById('bbm-auth-email')?.value.trim();
  const password = document.getElementById('bbm-auth-password')?.value;
  const btn = document.getElementById('bbm-sign-in-btn');
  const errorEl = document.getElementById('bbm-auth-error');
  if (!email || !password || !btn) return;

  btn.disabled = true;
  if (errorEl) errorEl.style.display = 'none';

  try {
    await signIn(email, password);
    await refreshTier();
    await renderAuthSection();
    loadPortfolioData();
  } catch (err) {
    if (errorEl) {
      errorEl.textContent = err.message ?? 'Sign in failed';
      errorEl.style.display = 'block';
    }
    if (btn) btn.disabled = false;
  }
}

async function handleSignOut() {
  await signOut();
  playerIndexMap = new Map();
  playerTeamMap = new Map();
  playerPositionMap = new Map();
  totalRosters = 0;
  allEntries = [];
  slateGroups = [];
  currentTier = null;
  await renderAuthSection();
  applyTierGate();
  updatePanelStatus();
}

async function handleSync() {
  const btn        = document.getElementById('bbm-sync-btn');
  const resultEl   = document.getElementById('bbm-sync-result');
  const progressEl = document.getElementById('bbm-sync-progress');
  if (!btn) return;

  btn.disabled = true;
  if (resultEl)   { resultEl.style.display = 'none'; resultEl.className = 'bbm-sync-result'; }
  if (progressEl) { progressEl.style.display = 'none'; }

  if (!syncCallback) {
    if (resultEl) {
      resultEl.textContent = adapter.syncPageErrorMessage;
      resultEl.classList.add('error');
      resultEl.style.display = 'block';
    }
    btn.disabled = false;
    return;
  }

  const progressLabel = progressEl?.querySelector('.bbm-progress-label');
  const progressFill  = progressEl?.querySelector('.bbm-progress-bar-fill');

  function onProgress(event) {
    if (event.source !== window || event.data?.type !== 'BBM_SYNC_PROGRESS') return;
    const { phase, done, total } = event.data;
    if (!progressEl) return;
    progressEl.style.display = 'block';
    if (phase === 'discovery') {
      progressEl.classList.add('bbm-progress-indeterminate');
      if (progressLabel) progressLabel.textContent = 'Discovering entries\u2026';
      if (progressFill)  progressFill.style.width  = '0%';
    } else if (phase === 'fetching') {
      progressEl.classList.remove('bbm-progress-indeterminate');
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      if (progressLabel) progressLabel.textContent = `Processing ${done} / ${total} entries\u2026`;
      if (progressFill)  progressFill.style.width  = pct + '%';
    } else if (phase === 'boards') {
      // TASK-260: backfilling draft boards for already-synced drafts.
      progressEl.classList.remove('bbm-progress-indeterminate');
      const pct = total > 0 ? Math.round((done / total) * 100) : 0;
      if (progressLabel) progressLabel.textContent = `Backfilling boards ${done} / ${total}\u2026`;
      if (progressFill)  progressFill.style.width  = pct + '%';
    }
  }

  window.addEventListener('message', onProgress);

  try {
    const { count, boardsRemaining = 0 } = await syncCallback();
    if (resultEl) {
      let msg = `Synced ${count} entries`;
      // TASK-260: more board-less drafts remain than one run can backfill.
      if (boardsRemaining > 0) {
        msg += ` — ${boardsRemaining} draft board${boardsRemaining === 1 ? '' : 's'} left to fill. `
             + `Reload the page and press Sync again to continue.`;
      }
      resultEl.textContent = msg;
      resultEl.style.display = 'block';
    }
    loadPortfolioData();
  } catch (err) {
    if (resultEl) {
      const msg = err.message ?? 'Sync failed';
      resultEl.textContent = msg.includes('Could not establish connection')
        ? adapter.syncPageErrorMessage
        : msg;
      resultEl.classList.add('error');
      resultEl.style.display = 'block';
    }
  } finally {
    window.removeEventListener('message', onProgress);
    if (progressEl) progressEl.style.display = 'none';
    if (btn) btn.disabled = false;
  }
}

/**
 * Fetch portfolio entries from Supabase, build slateGroups, then apply the
 * active tournament filter. Re-sweeps rows when complete.
 *
 * Filter changes call applyPortfolioFilter() directly — no re-fetch needed.
 */
async function loadPortfolioData() {
  loadState = 'loading';
  updatePanelStatus();
  try {
    allEntries = await readEntries();

    // Build slateGroups — same shape as web app's TournamentMultiSelect
    const slateMap = new Map();
    allEntries.forEach(e => {
      if (!e.tournamentTitle) return;
      const slate = e.slateTitle || 'Other';
      if (!slateMap.has(slate)) slateMap.set(slate, new Set());
      slateMap.get(slate).add(e.tournamentTitle);
    });
    slateGroups = [...slateMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([slate, tourns]) => ({ slate, tournaments: [...tourns].sort() }));

    // Drop stale selected tournament titles
    const allTitles = new Set(slateGroups.flatMap(g => g.tournaments));
    const before = selectedTournaments.size;
    selectedTournaments = new Set([...selectedTournaments].filter(t => allTitles.has(t)));
    // Default: all checked — if nothing is selected after pruning, select everything
    if (selectedTournaments.size === 0) allTitles.forEach(t => selectedTournaments.add(t));
    if (selectedTournaments.size !== before) {
      chrome.storage.local.set({ tournamentFilter: [...selectedTournaments] });
    }

    applyPortfolioFilter();
    loadState = 'ready';
    loadError = null;
  } catch (err) {
    loadState = 'error';
    loadError = resolveErrorMessage(err);
    console.warn('[BBM] Could not load portfolio data:', err.message);
  } finally {
    updatePanelStatus();
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

    // Compute which ranks start a new tier (tierNum differs from the previous entry)
    tierStartRanks = new Set();
    for (let i = 1; i < rankings.length; i++) {
      if (rankings[i].tierNum !== rankings[i - 1].tierNum) {
        tierStartRanks.add(rankings[i].rank);
      }
    }
    sweepRows();
  } catch (err) {
    console.warn('[BBM] Could not load rankings data:', err.message);
  }
}

/**
 * Read current picks from the draft board's roster panel.
 * Uses adapter.getCurrentPicks() when available (DK), otherwise falls back
 * to the Underdog "my team" panel DOM traversal.
 * Resolves abbreviated names so correlation lookups work correctly.
 * Updates the currentPicks array and triggers a row re-sweep.
 */
function resolveCurrentPicks() {
  let picks;
  if (adapter.getCurrentPicks) {
    const raw = adapter.getCurrentPicks();
    if (!raw) return;
    picks = raw.map(p => ({
      name: resolvePlayerKey(p.name, { position: p.position, team: p.team }) ?? p.name,
      position: p.position,
      round: p.round,
    }));
  } else {
    picks = [];
    const pickEls = document.querySelectorAll(adapter.selectors.myPicksSelector);
    pickEls.forEach((el, idx) => {
      const nameEl = el.querySelector(adapter.selectors.playerNameInRowSelector);
      const section = el.closest(adapter.selectors.positionSectionSelector);
      const position = section?.querySelector(adapter.selectors.positionHeaderSelector)?.textContent?.trim() ?? '';
      const name = nameEl?.textContent?.trim();
      if (name) {
        picks.push({ name, position, round: idx + 1 });
      }
    });
  }

  // Accumulate into the registry: add new picks, fill in round when a later
  // observation supplies one that earlier did not, but never shrink the set.
  // Scroll-driven mutations on virtualized roster panels (DK) only ever expose
  // a subset of the roster, so replacing currentPicks with each observation
  // would drop off-screen picks from correlation/stack calculations.
  let registryChanged = false;
  picks.forEach(p => {
    const key = canonicalName(p.name);
    if (!key) return;
    const existing = pickRegistry.get(key);
    if (!existing) {
      pickRegistry.set(key, { name: p.name, position: p.position, round: p.round ?? null });
      registryChanged = true;
      return;
    }
    if ((existing.round == null || existing.round === 0) && p.round != null && p.round > 0) {
      existing.round = p.round;
      registryChanged = true;
    }
  });

  if (!registryChanged) return;

  currentPicks = [...pickRegistry.values()];
  sweepRows();
  if (eliminatorEnabled) updateEliminatorWindow();
}

/**
 * Debounced wrapper for resolveCurrentPicks. The picks MutationObserver fires
 * on every body mutation (timer ticks, animations, chat, pick events).
 * RAF-debouncing coalesces rapid-fire mutations into a single DOM query per
 * frame, preventing cumulative CPU overhead as the draft progresses.
 */
function schedulePicksResolve() {
  if (picksRafId) return;
  picksRafId = requestAnimationFrame(() => {
    picksRafId = null;
    resolveCurrentPicks();
  });
}

/**
 * Start a MutationObserver that watches for new picks in the draft board.
 */
function startPicksObserver() {
  if (picksObserver) return;
  picksObserver = new MutationObserver(schedulePicksResolve);
  picksObserver.observe(document.body, { childList: true, subtree: true });
  resolveCurrentPicks();
}

/**
 * Stop the picks observer and clear current picks state.
 */
function stopPicksObserver() {
  if (picksRafId) {
    cancelAnimationFrame(picksRafId);
    picksRafId = null;
  }
  if (picksObserver) {
    picksObserver.disconnect();
    picksObserver = null;
  }
  currentPicks = [];
  pickRegistry.clear();
  // TASK-275: drop the live-draft team map so a different draft re-fetches its own slate.
  draftTeamMap = new Map();
  draftTeamsRequested = false;
}

/**
 * Extract the player name from a row DOM element.
 * Returns null if no name element is found.
 *
 * @param {Element} row
 * @returns {string|null}
 */
function getPlayerNameFromRow(row) {
  const nameEl = row.querySelector(adapter.selectors.playerNameInRowSelector);
  return nameEl?.textContent?.trim() ?? null;
}

/**
 * Resolve a display name (possibly abbreviated like "J. Jefferson") to the
 * canonical full name used in playerIndexMap. Returns the lowercased key
 * suitable for map lookups, or null if unresolvable.
 *
 * When an abbreviated name is ambiguous (multiple portfolio players share
 * the same first-initial + last-name), the optional second parameter enables
 * disambiguation. Pass a DOM row element (uses adapter.getPlayerContext) or
 * a {position, team} context object directly.
 *
 * @param {string} displayName
 * @param {Element|{position: string, team: string}} [rowOrContext] - DOM row or context for disambiguation
 * @returns {string|null}
 */
function resolvePlayerKey(displayName, rowOrContext) {
  if (!displayName) return null;
  const key = canonicalName(displayName);
  // Direct match (full name or already known)
  if (playerIndexMap.has(key)) return key;
  // Abbreviated name lookup ("j cook" → "james cook")
  // Both build and lookup route through canonicalName so embedded periods in
  // last names (e.g. "St. Brown") and the initial's period normalize identically.
  const abbrevKey = canonicalName(displayName);
  const resolved = abbreviatedNameMap.get(abbrevKey);
  if (typeof resolved === 'string') return resolved;

  // Ambiguous — try to disambiguate with context
  if (Array.isArray(resolved) && rowOrContext) {
    const ctx = (rowOrContext instanceof Element && adapter.getPlayerContext)
      ? adapter.getPlayerContext(rowOrContext)
      : rowOrContext;
    let candidates = resolved;
    if (ctx.position) {
      const pos = ctx.position.toUpperCase();
      const byPos = candidates.filter(c => c.position === pos);
      if (byPos.length === 1) return byPos[0].fullName;
      if (byPos.length > 1) candidates = byPos;
    }
    if (ctx.team) {
      const team = ctx.team.toUpperCase();
      const byTeam = candidates.filter(c => c.team === team);
      if (byTeam.length === 1) return byTeam[0].fullName;
      if (byTeam.length > 1) candidates = byTeam;
    }
    // ADP-proximity tiebreak: candidates share position+team (e.g., Bijan vs Brian Robinson).
    // Pick the candidate whose median portfolio pick is closest to the row's displayed ADP.
    if (candidates.length > 1 && Number.isFinite(ctx.adp)) {
      const withPicks = candidates.filter(c => Number.isFinite(c.medianPick));
      if (withPicks.length >= 1) {
        let best = withPicks[0];
        let bestDist = Math.abs(best.medianPick - ctx.adp);
        for (let i = 1; i < withPicks.length; i++) {
          const d = Math.abs(withPicks[i].medianPick - ctx.adp);
          if (d < bestDist) { best = withPicks[i]; bestDist = d; }
        }
        console.debug(`[BBM] ambig "${displayName}" rowADP=${ctx.adp} → ${best.fullName} (medianPick=${best.medianPick})`);
        return best.fullName;
      }
    }
    if (candidates.length > 1) {
      console.debug(`[BBM] ambig "${displayName}" unresolved`, { ctx, candidates: candidates.map(c => ({ full: c.fullName, pos: c.position, team: c.team, med: c.medianPick })) });
    }
  }

  return null;
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
  const key = resolvePlayerKey(playerName);
  if (!key) return 0;
  const rosterSet = playerIndexMap.get(key);
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
  const candidateKey = resolvePlayerKey(playerName);
  const candidateRosters = (candidateKey && playerIndexMap.get(candidateKey)) ?? new Set();
  const breakdown = [];
  let sumProb = 0;
  let comparisons = 0;

  currentPicks.forEach(pick => {
    const pickRosters = playerIndexMap.get(canonicalName(pick.name)) ?? new Set();
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
  // Resolve once with row context (handles abbreviated name disambiguation)
  const resolvedName = resolvePlayerKey(playerName, row) ?? playerName;

  const expPct = computeExposure(resolvedName);
  exp.textContent = `${Math.round(expPct)}%`;

  const corrValue = corrTrigger.querySelector('.bbm-corr-value');
  const popup = corrTrigger.querySelector('.bbm-corr-popup');
  if (!corrValue || !popup) return;

  const { score, breakdown } = computeCorrelation(resolvedName);
  corrValue.textContent = `${score}%`;
  populateCorrPopup(popup, breakdown);

  applyStackBadge(row, resolvedName);
  applyPlayoffStackBadge(row, resolvedName);
  applyEliminatorBadge(row, resolvedName);

  applyTierBreak(row, resolvedName);
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
          <span class="bbm-corr-popup-name">${titleCase(b.name)}</span>
          <div class="bbm-corr-popup-bar">
            <div class="bbm-corr-popup-bar-fill" style="width:${b.pct}%;background:#3b82f6"></div>
          </div>
          <span class="bbm-corr-popup-pct">${b.pct}%</span>
        </div>`
      )
      .join('');
}

/**
 * Inject (or refresh) the stack pill inline after the player name element.
 * Removes any existing pill first to handle pick changes and row recycles.
 *
 * @param {Element} row
 * @param {string} playerName
 */
function applyStackBadge(row, playerName) {
  row.querySelectorAll('.bbm-stack-pill').forEach(el => el.remove());

  const info = analyzeStackOverlay(playerName);
  if (!info) return;

  const positionRow = row.querySelector(adapter.selectors.stackPillTargetSelector);
  if (!positionRow) return;

  const pill = document.createElement('span');
  pill.className = 'bbm-stack-pill bbm-inline-overlay';
  pill.textContent = info.type;
  pill.style.color = info.color;
  pill.style.borderColor = info.color;
  pill.style.background = `${info.color}1A`;
  positionRow.appendChild(pill);
}

/**
 * Analyze stack relationship between a draft candidate and current picks.
 * Uses playerTeamMap and playerPositionMap built from portfolio data.
 *
 * @param {string} playerName
 * @returns {{ type: string, color: string }|null}
 */
function analyzeStackOverlay(playerName) {
  const key = resolvePlayerKey(playerName);
  if (!key) return null;
  const team = playerTeamMap.get(key);
  const pos = playerPositionMap.get(key);
  if (!team || !pos || currentPicks.length === 0) return null;

  const teammates = currentPicks.filter(p => {
    const t = playerTeamMap.get(canonicalName(p.name));
    return t && t === team;
  });
  if (teammates.length === 0) return null;

  const qbs = teammates.filter(p => p.position === 'QB');
  const wrs = teammates.filter(p => p.position === 'WR');
  const tes = teammates.filter(p => p.position === 'TE');
  const rbs = teammates.filter(p => p.position === 'RB');

  if (pos === 'QB' && (wrs.length > 0 || tes.length > 0 || rbs.length > 0)) {
    return { type: (wrs.length + tes.length + rbs.length) >= 2 ? 'QB MULTI' : 'QB STACK', color: '#BF44EF' };
  }
  if ((pos === 'WR' || pos === 'TE' || pos === 'RB') && qbs.length > 0) {
    return { type: (wrs.length + tes.length + rbs.length) >= 1 ? 'QB MULTI' : 'QB STACK', color: '#BF44EF' };
  }
  if (pos === 'WR' && wrs.length >= 1) return { type: `WR \u00D7${wrs.length + 1}`, color: '#F59E0B' };
  if (pos === 'TE' && tes.length >= 1) return { type: `TE \u00D7${tes.length + 1}`, color: '#3B82F6' };
  if (pos === 'RB' && rbs.length >= 1) return { type: `RB \u00D7${rbs.length + 1}`, color: '#10B981' };
  if (pos === 'RB' && (wrs.length > 0 || tes.length > 0)) return { type: 'TEAM', color: '#8A9BB5' };
  if ((pos === 'WR' || pos === 'TE') && rbs.length > 0) return { type: 'TEAM', color: '#8A9BB5' };

  return null;
}

/**
 * Analyze playoff-week (W15/16/17) game-stack correlations between the candidate
 * and the user's already-rostered picks in the active draft.
 *
 * Game stack = candidate and rostered pick are on opposing teams playing each other
 * in the given playoff week, AND the position pair is meaningful in best ball
 * (see MEANINGFUL_GAME_PAIRS). Same-team teammates are intentionally excluded
 * because they're already represented by the standard stack pill.
 *
 * @param {string} playerName
 * @returns {{ count: number, weeks: Array<{ week: string, entries: Array<{name,position,team,opp}> }>}|null}
 */
function analyzePlayoffStackOverlay(playerName) {
  const key = resolvePlayerKey(playerName);
  if (!key) return null;
  const candidateTeam = playerTeamMap.get(key);
  const candidatePos = playerPositionMap.get(key);
  if (!candidateTeam || !candidatePos || currentPicks.length === 0) return null;

  const weeks = [];
  let count = 0;

  PLAYOFF_WEEKS.forEach(week => {
    const qualifyingOpps = pairsForWeek(week)[candidatePos];
    if (!qualifyingOpps) return; // Candidate position not eligible this week (e.g. RB outside W17)

    const opp = playoffSchedule[candidateTeam]?.[week];
    if (!opp) return; // bye or missing — silently skip

    const entries = [];
    currentPicks.forEach(pick => {
      const pickKey = canonicalName(pick.name);
      const pickTeam = playerTeamMap.get(pickKey);
      const pickPos = playerPositionMap.get(pickKey);
      if (!pickTeam || !pickPos) return;
      if (pickTeam === candidateTeam) return; // Same-team — covered by stack pill
      if (pickTeam !== opp) return; // Not in this game
      // Confirm reciprocal schedule entry too, when present
      const pickOpp = playoffSchedule[pickTeam]?.[week];
      if (pickOpp && pickOpp !== candidateTeam) return;
      if (!qualifyingOpps.has(pickPos)) return; // Position pair not meaningful

      entries.push({
        name: pick.name,
        position: pickPos,
        team: pickTeam,
        opp: candidateTeam,
      });
    });

    if (entries.length > 0) {
      weeks.push({ week, entries });
      count += entries.length;
    }
  });

  if (count === 0) return null;
  return { count, weeks };
}

/**
 * Inject (or refresh) the playoff game-stack pill inline after the standard stack
 * pill. Rendered only when the candidate has at least one qualifying game-stack
 * correlation in W15/16/17. Pro-gated as a belt-and-braces check; the row-injection
 * path is already gated upstream (TASK-231).
 *
 * @param {Element} row
 * @param {string} playerName
 */
function applyPlayoffStackBadge(row, playerName) {
  // Suppressed in Eliminator Mode — W15/16/17 playoff stacks are irrelevant to weekly survival
  // (mirrors the website's TASK-269 behavior).
  const info = (currentTier === 'pro' && !eliminatorEnabled) ? analyzePlayoffStackOverlay(playerName) : null;
  const sig = info ? JSON.stringify(info) : '';
  const existing = row.querySelector('.bbm-playoff-pill');

  // No-op when the payload is unchanged — avoids tearing down the pill mid-hover
  // on every sweepRows / updateRowMetrics tick.
  if (existing && existing._playoffSig === sig) return;

  if (existing) {
    if (corrPopupPortal && existing._ownsPortal) {
      corrPopupPortal.style.display = 'none';
    }
    existing.remove();
  }

  if (!info) return;

  const positionRow = row.querySelector(adapter.selectors.stackPillTargetSelector);
  if (!positionRow) return;

  const pill = document.createElement('span');
  pill.className = 'bbm-playoff-pill bbm-inline-overlay';
  if (info.weeks.length === 1) {
    const w = info.weeks[0];
    pill.innerHTML = `<span class="bbm-playoff-chip bbm-playoff-w${w.week}">W${w.week}<span class="bbm-playoff-chip-count">${w.entries.length}</span></span>`;
  } else {
    const weekLabel = info.weeks.map(w => w.week).join('/');
    pill.innerHTML = `<span class="bbm-playoff-chip bbm-playoff-multi">W${weekLabel}<span class="bbm-playoff-chip-count">${info.count}</span></span>`;
  }
  pill._playoffPayload = info;
  pill._playoffSig = sig;
  positionRow.appendChild(pill);
  attachPlayoffPopupHandlers(pill);
}

/**
 * Build the playoff-popup HTML from an analyzePlayoffStackOverlay payload.
 * Reuses the shared correlation-popup portal but with playoff-specific content.
 *
 * @param {{count:number, weeks:Array<{week:string,entries:Array<{name,position,team,opp}>}>}} payload
 * @returns {string}
 */
function buildPlayoffPopupHtml(payload) {
  const sections = payload.weeks.map(group => {
    const rows = group.entries.map(e => `
      <div class="bbm-corr-popup-row">
        <span class="bbm-corr-popup-pos">${e.position}</span>
        <span class="bbm-corr-popup-name">${titleCase(e.name)}</span>
        <span class="bbm-playoff-popup-matchup">${e.team} @ ${e.opp}</span>
      </div>`).join('');
    return `<div class="bbm-playoff-popup-week bbm-playoff-w${group.week}">Week ${group.week}</div>${rows}`;
  }).join('');
  return `<div class="bbm-corr-popup-title">Playoff Game Stacks</div>${sections}`;
}

/**
 * Wire mouseenter/mouseleave on the playoff pill to render the shared portal popup.
 * Mirrors the pattern used by the Corr cell at createOverlayElements().
 */
function attachPlayoffPopupHandlers(pill) {
  pill.addEventListener('mouseenter', () => {
    if (!pill._playoffPayload) return;
    ensureCorrPopupPortal();
    corrPopupPortal.innerHTML = buildPlayoffPopupHtml(pill._playoffPayload);
    const rect = pill.getBoundingClientRect();
    corrPopupPortal.style.left = `${Math.max(8, rect.right - 280)}px`;
    corrPopupPortal.style.top = `${rect.bottom + 4}px`;
    corrPopupPortal.style.display = 'block';
    pill._ownsPortal = true;
  });
  pill.addEventListener('mouseleave', () => {
    pill._ownsPortal = false;
    if (corrPopupPortal) corrPopupPortal.style.display = 'none';
  });
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
  corr.appendChild(popup); // source popup — stays hidden, used as data source

  // Show portal popup on hover (portaled to document.body to escape overflow/stacking)
  corr.addEventListener('mouseenter', () => {
    ensureCorrPopupPortal();
    corrPopupPortal.innerHTML = popup.innerHTML;
    const rect = corr.getBoundingClientRect();
    corrPopupPortal.style.left = `${Math.max(8, rect.right - 280)}px`;
    corrPopupPortal.style.top = `${rect.bottom + 4}px`;
    corrPopupPortal.style.display = 'block';
  });
  corr.addEventListener('mouseleave', () => {
    if (corrPopupPortal) corrPopupPortal.style.display = 'none';
  });

  return [exp, corr];
}

/**
 * Lazily create the shared correlation popup portal on document.body.
 * This element lives outside DK's BaseTable hierarchy so it escapes
 * overflow clipping, will-change stacking contexts, and event capture.
 */
function ensureCorrPopupPortal() {
  if (corrPopupPortal && document.body.contains(corrPopupPortal)) return;
  corrPopupPortal = document.createElement('div');
  corrPopupPortal.className = 'bbm-corr-popup';
  corrPopupPortal.id = 'bbm-corr-popup-portal';
  corrPopupPortal.style.cssText = 'display: none; position: fixed; z-index: 10001;';
  document.body.appendChild(corrPopupPortal);
}

/**
 * Inject or update the overlay on a single player row.
 * Inserts Exp and Corr columns to the left of ADP and Proj.
 * Injects a stack pill inline after the player name element when applicable.
 */
function processRow(row) {
  const playerId = adapter.getRowId?.(row) ?? row.getAttribute('data-id');
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

  // Each adapter decides where Exp/Corr cells go via getInjectionPoint().
  const { parent: insertParent, before: refNode } = adapter.getInjectionPoint?.(row) ?? {};
  if (!insertParent) return;

  const [exp, corr] = createOverlayElements();

  if (refNode) {
    insertParent.insertBefore(exp, refNode);
    insertParent.insertBefore(corr, refNode);
  } else {
    insertParent.append(exp, corr);
  }

  // Adapter may need to reposition cells after insertion (e.g. DK absolute positioning)
  if (adapter.postInjectRow) {
    adapter.postInjectRow(row, exp, corr);
  }

  row.setAttribute(INJECTED_ATTR, playerId);
  row.setAttribute(PLAYER_ID_ATTR, playerId);

  const playerName = getPlayerNameFromRow(row);
  // Resolve once with row context (handles abbreviated name disambiguation)
  const resolvedName = resolvePlayerKey(playerName, row) ?? playerName;

  // Populate metrics if portfolio data is available
  if (totalRosters > 0 && resolvedName) {
    const expPct = computeExposure(resolvedName);
    exp.textContent = `${Math.round(expPct)}%`;

    const { score, breakdown } = computeCorrelation(resolvedName);
    const corrValue = corr.querySelector('.bbm-corr-value');
    const popup = corr.querySelector('.bbm-corr-popup');
    corrValue.textContent = `${score}%`;
    populateCorrPopup(popup, breakdown);
  }

  // Inject stack pill inline after player name
  if (resolvedName) {
    applyStackBadge(row, resolvedName);
    applyPlayoffStackBadge(row, resolvedName);
  }

  // Eliminator Mode badge (same-position bye clash only) — annotate only (TASK-273)
  applyEliminatorBadge(row, resolvedName);

  // Inject tier break indicator if sorted by My Rank and rankings data is available
  applyTierBreak(row, resolvedName);
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

  if (!adapter.isMyRankSort() || playerRankingsMap.size === 0 || !playerName) return;

  const resolvedKey = resolvePlayerKey(playerName);
  const entry = playerRankingsMap.get(resolvedKey ?? playerName.trim().toLowerCase());
  if (!entry) return;

  const { tierNum, rank } = entry;
  row.setAttribute('data-bbm-tier', String(tierNum));

  // Only show a badge on the first player of each tier
  if (!tierStartRanks.has(rank)) return;

  const color = getTierBorderColor(tierNum);
  const label = getTierLabel(tierNum);

  const badge = document.createElement('div');
  badge.className = 'bbm-tier-badge';
  badge.style.color = color;
  badge.innerHTML = `<span class="bbm-tier-pill">${label}</span>`;
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
  const sortBar = document.querySelector(adapter.selectors.sortButtonsSelector);
  if (!sortBar) return;

  // Lazily wire the sort observer — startOverlay() may have run before the sort
  // bar appeared in the DOM, leaving sortObserver null.
  if (!sortObserver) {
    sortObserver = new MutationObserver(sweepRows);
    sortObserver.observe(sortBar, { attributes: true, subtree: true });
  }

  if (sortBar.hasAttribute(HEADER_INJECTED_ATTR)) return;

  // Adapter-specific header injection (DK uses proper gridcells)
  if (adapter.injectHeaderCells) {
    adapter.injectHeaderCells(sortBar);
    sortBar.setAttribute(HEADER_INJECTED_ATTR, 'true');
    return;
  }

  // Default: absolute-positioned labels (Underdog)
  // Measure actual cell positions from a rendered row to stay robust
  // against future layout changes
  const sampleRow = document.querySelector(adapter.selectors.rowSelector);
  if (!sampleRow) return; // no rows yet — will retry on next sweep

  const sortBarRect = sortBar.getBoundingClientRect();

  // Find BBM stat cells — may be inside a rightSide container (Underdog)
  // or direct children of the row (DK)
  const bbmCells = sampleRow.querySelectorAll('.bbm-stat-cell');
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
    if (currentTier !== 'pro') return; // TASK-231: row overlay is Pro-only
    // Use adapter.getPlayerRows() when available (e.g. DK scopes to player list only,
    // excluding roster panel and picks panel BaseTables)
    const rows = adapter.getPlayerRows?.() ?? document.querySelectorAll(adapter.selectors.rowSelector);
    rows.forEach(processRow);
    injectHeaders(); // must run after processRow so BBM cells exist for measurement
  });
}

/**
 * Remove all injected overlay elements and headers from the page.
 */
function removeAllOverlays() {
  document.querySelectorAll('.bbm-inline-overlay').forEach(el => el.remove());
  document.querySelectorAll('.bbm-tier-badge').forEach(el => el.remove());
  document.querySelectorAll('[data-bbm-tier]').forEach(el => el.removeAttribute('data-bbm-tier'));
  document.querySelectorAll(`[${INJECTED_ATTR}]`).forEach(row => {
    row.removeAttribute(INJECTED_ATTR);
    row.removeAttribute(PLAYER_ID_ATTR);
  });
  removeHeaders();
  if (corrPopupPortal) {
    corrPopupPortal.remove();
    corrPopupPortal = null;
  }
}

/**
 * Inject the overlay stylesheet into the page.
 */
function injectStyles() {
  if (document.getElementById('bbm-overlay-styles')) return;

  const style = document.createElement('style');
  style.id = 'bbm-overlay-styles';
  style.textContent = `
    /* DK: allow overlay cells to overflow fixed-width rows (scoped to rows, not scroll container) */
    .BaseTable__row {
      overflow: visible !important;
    }

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

    /* Correlation popup — hidden by default, shown via JS mouseenter/mouseleave */
    .bbm-corr-popup {
      display: none;
      background: var(--bg-primary, #1a1a2e);
      color: #E8E8E8;
      border: 1px solid var(--border-color, #333);
      border-radius: 8px;
      padding: 8px 0;
      z-index: 10001;
      min-width: 220px;
      max-width: 300px;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
      white-space: normal;
      text-align: left;
      opacity: 1;
    }
    .bbm-corr-popup-title {
      padding: 0 12px 6px;
      font-size: 10px;
      color: #E8E8E8;
      opacity: 0.5;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.05em;
    }
    .bbm-corr-popup-empty {
      padding: 4px 12px;
      font-size: 12px;
      color: #E8E8E8;
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

    /* Stack pill — inline after player name, only visible when stacking */
    .bbm-stack-pill {
      display: inline-block;
      vertical-align: middle;
      margin-left: 6px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 1px 5px;
      border-radius: 20px;
      border: 1px solid;
      line-height: 1.5;
      white-space: nowrap;
      pointer-events: none;
      opacity: 0.85;
    }

    /* Playoff game-stack pill (TASK-232) — container for per-week chips colored
       bronze/silver/gold (W15/W16/W17) to differentiate weeks at a glance.
       Interactive (hover opens the shared correlation popup with playoff-grouped
       contents). */
    .bbm-playoff-pill {
      display: inline-flex;
      vertical-align: middle;
      align-items: center;
      gap: 3px;
      margin-left: 4px;
      line-height: 1.5;
      white-space: nowrap;
      cursor: default;
    }
    .bbm-playoff-chip {
      display: inline-flex;
      align-items: center;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 1px 5px;
      border-radius: 20px;
      border: 1px solid currentColor;
      background: rgba(255, 255, 255, 0.04);
      opacity: 0.95;
    }
    .bbm-playoff-chip-count {
      display: inline-block;
      margin-left: 4px;
      color: currentColor;
      font-weight: 800;
      text-align: center;
    }
    /* W15 bronze, W16 silver, W17 gold for single-week chips and popup
       section headers. Multi-week collapses to a single red pill (so the
       red signals "spans multiple playoff weeks" at a glance). */
    .bbm-playoff-w15 { color: #CD7F32; }
    .bbm-playoff-w16 { color: #C9CED6; }
    .bbm-playoff-w17 { color: #FFD700; }
    .bbm-playoff-multi { color: #EF4444; }

    .bbm-playoff-popup-week {
      margin-top: 8px;
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      opacity: 0.95;
    }
    .bbm-playoff-popup-week:first-child {
      margin-top: 4px;
    }
    .bbm-playoff-popup-matchup {
      font-size: 10px;
      font-weight: 600;
      letter-spacing: 0.04em;
      color: inherit;
      opacity: 0.65;
      margin-left: auto;
      white-space: nowrap;
    }

    /* Tier break — full-width divider with centered pill label */
    .bbm-tier-badge {
      position: absolute;
      left: 0;
      right: 0;
      top: -7px;
      display: flex;
      align-items: center;
      gap: 6px;
      pointer-events: none;
      z-index: 0;
      padding: 0 10px;
    }
    .bbm-tier-badge::before,
    .bbm-tier-badge::after {
      content: '';
      flex: 1;
      height: 1px;
      background: currentColor;
      opacity: 0.35;
    }
    .bbm-tier-pill {
      font-size: 8px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      padding: 2px 6px;
      border-radius: 3px;
      background: #0C1A30;
      border: 1px solid currentColor;
      color: inherit;
      white-space: nowrap;
      line-height: 1.5;
      flex-shrink: 0;
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

    /* Auth section (TASK-129) */
    #bbm-auth-section { margin: 6px 0; }

    .bbm-account-toggle {
      display: flex;
      justify-content: space-between;
      align-items: center;
      cursor: pointer;
      padding: 3px 0;
      user-select: none;
    }
    .bbm-account-toggle-label {
      font-size: 10px;
      color: #8A9BB5;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
    }
    .bbm-account-chevron {
      font-size: 9px;
      color: #5a6a80;
      transition: transform 0.15s;
      line-height: 1;
    }
    .bbm-account-body { padding-top: 6px; }

    .bbm-auth-input {
      width: 100%;
      background: #0F2040;
      border: 1px solid #243A5C;
      border-radius: 4px;
      color: #E8E8E8;
      font-size: 11px;
      padding: 5px 7px;
      margin-bottom: 4px;
      box-sizing: border-box;
      outline: none;
    }
    .bbm-auth-input:focus { border-color: #E8BF4A; }

    .bbm-btn {
      width: 100%;
      background: #E8BF4A;
      color: #0C1A30;
      border: none;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      padding: 5px 0;
      cursor: pointer;
      margin-bottom: 4px;
    }
    .bbm-btn:hover { background: #F0CC5B; }
    .bbm-btn:disabled { opacity: 0.5; cursor: default; }

    .bbm-btn-secondary {
      background: transparent;
      color: #8A9BB5;
      border: 1px solid #243A5C;
    }
    .bbm-btn-secondary:hover { color: #E8E8E8; border-color: #8A9BB5; }

    .bbm-btn-google {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: #fff;
      color: #3c4043;
      font-weight: 600;
    }
    .bbm-btn-google:hover { background: #f1f3f4; }

    .bbm-auth-divider {
      display: flex;
      align-items: center;
      gap: 8px;
      margin: 6px 0;
      font-size: 9px;
      color: #5A6E8A;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .bbm-auth-divider::before,
    .bbm-auth-divider::after {
      content: '';
      flex: 1;
      height: 1px;
      background: #243A5C;
    }

    .bbm-auth-user {
      font-size: 11px;
      color: #C0CCE0;
      margin-bottom: 4px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .bbm-auth-tier {
      display: inline-block;
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      padding: 1px 5px;
      border-radius: 3px;
      margin-bottom: 6px;
      background: #1C3A5E;
      color: #8A9BB5;
    }
    .bbm-auth-tier.pro { background: #2A3A10; color: #A3C447; }

    .bbm-auth-error {
      font-size: 10px;
      color: #EF4444;
      margin-top: 2px;
    }
    .bbm-sync-result {
      font-size: 10px;
      color: #10B981;
      margin-bottom: 4px;
    }
    .bbm-sync-result.error { color: #EF4444; }

    .bbm-sync-progress { margin-bottom: 6px; }
    .bbm-progress-label {
      font-size: 10px;
      color: #8A9BB5;
      margin-bottom: 3px;
    }
    .bbm-progress-bar-wrap {
      width: 100%;
      height: 4px;
      background: #1a2d50;
      border-radius: 2px;
      overflow: hidden;
    }
    .bbm-progress-bar-fill {
      height: 100%;
      width: 0%;
      background: linear-gradient(90deg, #D4A843, #F0CC5B);
      border-radius: 2px;
      transition: width 0.2s ease;
    }
    @keyframes bbm-shimmer {
      0%   { transform: translateX(-100%); }
      100% { transform: translateX(400%); }
    }
    .bbm-progress-indeterminate .bbm-progress-bar-fill {
      width: 25%;
      animation: bbm-shimmer 1.4s ease-in-out infinite;
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
      min-width: 210px;
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

    /* TASK-231: locked overlay row (non-Pro) */
    .bbm-lock-icon {
      display: none;
      margin-left: 5px;
      font-size: 11px;
      vertical-align: -1px;
      filter: grayscale(1) brightness(1.3);
      opacity: 0.7;
    }
    #bbm-overlay-row.bbm-locked {
      opacity: 0.5;
      cursor: not-allowed;
    }
    #bbm-overlay-row.bbm-locked .bbm-panel-label {
      pointer-events: none;
    }
    #bbm-overlay-row.bbm-locked .bbm-lock-icon {
      display: inline;
    }
    #bbm-overlay-row.bbm-locked #bbm-overlay-toggle {
      pointer-events: none;
      cursor: not-allowed;
    }

    /* TASK-231: Upgrade-to-Pro CTA */
    #bbm-upgrade-cta {
      margin: 8px 0 4px;
    }
    .bbm-upgrade-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      width: 100%;
      padding: 7px 10px;
      border-radius: 6px;
      background: linear-gradient(135deg, #D4A843 0%, #F0CC5B 50%, #E8BF4A 100%);
      color: #0C1A30;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      text-decoration: none;
      border: 1px solid #B8911E;
      box-shadow: 0 1px 4px rgba(232, 191, 74, 0.25);
      box-sizing: border-box;
      transition: filter 120ms ease, transform 120ms ease;
    }
    .bbm-upgrade-btn:hover {
      filter: brightness(1.08);
      transform: translateY(-1px);
    }
    .bbm-upgrade-icon {
      font-size: 13px;
      line-height: 1;
    }
    .bbm-upgrade-sub {
      font-size: 10px;
      color: #8A9BB5;
      text-align: center;
      margin-top: 4px;
    }

    /* Confidence panel — status and sync lines (TASK-106) */
    .bbm-panel-divider {
      border: none;
      border-top: 1px solid #243A5C;
      margin: 8px 0;
    }
    .bbm-panel-status {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-top: 4px;
    }
    .bbm-status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      flex-shrink: 0;
      background: #6B7280;
    }
    .bbm-status-label {
      font-size: 11px;
      color: #C0CCE0;
    }
    .bbm-panel-sync-line {
      font-size: 10px;
      color: #8A9BB5;
      margin-top: 3px;
      padding-left: 12px;
    }

    /* Tournament filter (TASK-107) — hierarchical: slate → tournament */
    .bbm-filter-title {
      margin-top: 6px;
      margin-bottom: 4px;
    }
    #bbm-tournament-filter {
      max-height: 140px;
      overflow-y: auto;
    }
    .bbm-filter-check {
      cursor: pointer;
      accent-color: #E8BF4A;
      flex-shrink: 0;
      width: 12px;
      height: 12px;
    }
    .bbm-filter-slate-group {
      border-bottom: 1px solid #1E3054;
    }
    .bbm-filter-slate-group:last-child {
      border-bottom: none;
    }
    .bbm-filter-slate-row {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 3px 0;
    }
    .bbm-filter-slate-label-wrap {
      display: flex;
      align-items: center;
      gap: 5px;
      flex: 1;
      cursor: pointer;
      min-width: 0;
    }
    .bbm-filter-slate-label {
      font-size: 9px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #8A9BB5;
    }
    .bbm-filter-expand {
      background: none;
      border: none;
      color: #8A9BB5;
      font-size: 7px;
      padding: 0 2px;
      cursor: pointer;
      flex-shrink: 0;
      line-height: 1;
    }
    .bbm-filter-tournaments {
      display: none;
    }
    .bbm-filter-slate-group.bbm-expanded .bbm-filter-tournaments {
      display: block;
    }
    .bbm-filter-tournament-row {
      display: flex;
      align-items: center;
      gap: 5px;
      padding: 2px 0 2px 14px;
      cursor: pointer;
    }
    .bbm-filter-tournament-label {
      font-size: 11px;
      color: #C0CCE0;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    /* ---- Eliminator Mode (TASK-270) ---- */
    #bbm-eliminator-toggle {
      cursor: pointer;
      width: 14px;
      height: 14px;
      accent-color: #E8BF4A;
    }
    #bbm-eliminator-row.bbm-locked {
      opacity: 0.5;
      cursor: not-allowed;
    }
    #bbm-eliminator-row.bbm-locked .bbm-panel-label {
      pointer-events: none;
    }
    #bbm-eliminator-row.bbm-locked .bbm-lock-icon {
      display: inline;
    }
    #bbm-eliminator-row.bbm-locked #bbm-eliminator-toggle {
      pointer-events: none;
      cursor: not-allowed;
    }

    /* Per-candidate Eliminator badge — inline pill after player name (mirrors stack pill) */
    .bbm-eliminator-badge {
      display: inline-block;
      vertical-align: middle;
      margin-left: 6px;
      font-size: 9px;
      font-weight: 700;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      padding: 1px 5px;
      border-radius: 20px;
      border: 1px solid;
      line-height: 1.5;
      white-space: nowrap;
      pointer-events: auto;
      cursor: help;
      opacity: 0.9;
    }

    /* Floating Eliminator window — persistent draft companion, bottom-right.
       Below the FAB panel / popups (z 10000/10001) so it never occludes them. */
    #bbm-eliminator-window {
      position: fixed;
      bottom: 14px;
      right: 14px;
      z-index: 9998;
      width: 232px;
      max-height: 70vh;
      overflow-y: auto;
      background: #0C1A30;
      border: 1px solid #243A5C;
      border-radius: 8px;
      padding: 10px 12px;
      box-shadow: 0 6px 20px rgba(0,0,0,0.5);
      font-family: inherit;
      font-size: 12px;
      color: #E8E8E8;
    }
    .bbm-elim-header {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 8px;
      cursor: move;
      user-select: none;
    }
    .bbm-elim-grip {
      color: #5A6B85;
      font-size: 12px;
      line-height: 1;
    }
    .bbm-elim-title {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #E8BF4A;
    }
    #bbm-eliminator-window.bbm-elim-dragging {
      opacity: 0.92;
      box-shadow: 0 10px 28px rgba(0,0,0,0.6);
    }

    .bbm-elim-bye-row {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 3px;
    }
    .bbm-elim-bye-pos {
      width: 22px;
      font-weight: 700;
      color: #C0CCE0;
    }
    .bbm-elim-bye-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 3px;
    }
    .bbm-elim-bye-chip {
      font-size: 9px;
      font-weight: 700;
      padding: 1px 5px;
      border-radius: 20px;
      border: 1px solid #2c4366;
      color: #C0CCE0;
      background: rgba(44,67,102,0.3);
      white-space: nowrap;
      cursor: help;
    }
    .bbm-elim-bye-premium { border-color: #E8BF4A; color: #F0CC5B; background: rgba(232,191,74,0.12); }
    .bbm-elim-bye-strong  { border-color: #10B981; color: #34D399; background: rgba(16,185,129,0.12); }
    .bbm-elim-bye-shared  { border-color: #3B82F6; color: #60A5FA; background: rgba(59,130,246,0.12); }
    .bbm-elim-bye-early   { border-color: #EF4444; color: #F87171; background: rgba(239,68,68,0.12); }
    .bbm-elim-empty {
      font-size: 11px;
      color: #8A9BB5;
      font-style: italic;
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
  if (currentTier !== 'pro') return; // TASK-231: row overlay is Pro-only
  loadPortfolioData();   // async — re-loads on each draft entry so filter/metrics stay fresh
  loadRankingsData();    // async — sweeps rows when tier data is ready
  startPicksObserver();  // watches "my team" panel for new picks

  gridObserver = createReconnectingObserver({
    targetSelector: adapter.selectors.gridSelector,
    onMutation: sweepRows,
    onReconnect: () => {
      sweepRows();
    },
  });

  // Observe sort bar for active-sort changes so tier badges update immediately
  const sortBarEl = document.querySelector(adapter.selectors.sortButtonsSelector);
  if (sortBarEl) {
    sortObserver = new MutationObserver(sweepRows);
    sortObserver.observe(sortBarEl, { attributes: true, subtree: true });
  }

  // Initial sweep once the grid is available
  sweepRows();

  // Bring up Eliminator Mode UI if it was left enabled.
  applyEliminatorMode();
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
  // Keep the picks observer alive when Eliminator Mode is on (and Pro) so its floating
  // window still tracks roster shape / byes even while the row overlay is toggled off.
  if (!(eliminatorEnabled && currentTier === 'pro')) stopPicksObserver();
  removeAllOverlays();
}

// ---------------------------------------------------------------------------
// Eliminator Mode (TASK-270, ADR-011)
//
// A self-contained vanilla port of the web app's Eliminator Mode (ADR-010). Adds,
// when enabled: (1) a small DRAGGABLE floating window showing the bye rainbow only —
// bye week(s) per position, no roster-shape tracker, warnings, or playbook (TASK-270
// refinement); (2) a per-candidate row badge for the same-position bye clash only
// (TASK-273 dropped the curated-fade and late-W13/14-bye pills). Playoff-stack
// (W15/16/17) badges are suppressed while Eliminator is on. The board is annotated,
// never reordered.
//
// Picks carry no team (resolveCurrentPicks → {name, position, round}); team is resolved
// from playerTeamMap (portfolio-derived). Where team is unknown, the bye-clash
// annotation is omitted (the model tracks unknownByeCount).
// ---------------------------------------------------------------------------

/**
 * Current picks enriched with a team abbreviation (null when unknown).
 * Prefers the live-draft team map (covers all slate players); falls back to
 * portfolio-derived teams for anything the bridge couldn't resolve (TASK-275).
 */
function picksWithTeam() {
  return currentPicks.map(p => {
    const key = canonicalName(p.name);
    return {
      name: p.name,
      position: p.position,
      team: draftTeamMap.get(key) || playerTeamMap.get(key) || null,
    };
  });
}

/**
 * TASK-275: fetch the live-draft player→team map from the page bridge (Underdog)
 * and populate draftTeamMap. Best-effort and fire-and-forget — runs once per draft
 * (guarded by draftTeamsRequested), refreshing the bye window once teams land.
 */
async function loadDraftTeamMap() {
  if (draftTeamsRequested || !adapter?.getDraftPlayerTeams) return;
  draftTeamsRequested = true;
  try {
    const list = await adapter.getDraftPlayerTeams();
    const next = new Map();
    (list ?? []).forEach(({ name, team }) => {
      const key = canonicalName(name);
      if (key && team && !next.has(key)) next.set(key, String(team).toUpperCase());
    });
    if (next.size > 0) {
      draftTeamMap = next;
      if (eliminatorEnabled) updateEliminatorWindow();
    }
  } catch {
    // best-effort — the overlay falls back to portfolio-derived teams
  }
}

/** Build the bye-rainbow rows: one per position, each a row of bye-week chips. Bye weeks only —
 *  no warnings/notes (TASK-270 refinement). Chips with shared byes carry the player list for the
 *  hover popup wired by attachByeChipHovers(). */
function buildElimByeHtml(rainbow) {
  if (!rainbow.summary.length) {
    return '<div class="bbm-elim-empty">No byes tracked yet</div>';
  }
  return rainbow.summary.map(s => {
    const chips = s.weeks.map(w => {
      const count = w.players.length > 1 ? `×${w.players.length}` : '';
      const playersAttr = escapeHtml(w.players.join('|'));
      return `<span class="bbm-elim-bye-chip bbm-elim-bye-${w.tier}"`
        + ` data-bye-players="${playersAttr}" data-bye-week="${w.week}" data-bye-pos="${escapeHtml(s.position)}"`
        + ` title="${escapeHtml(w.players.join(', '))}">W${w.week}${count}</span>`;
    }).join('');
    return `<div class="bbm-elim-bye-row"><span class="bbm-elim-bye-pos">${s.position}</span><span class="bbm-elim-bye-chips">${chips}</span></div>`;
  }).join('');
}

/**
 * Wire a hover popup on any element listing player names. Reuses the shared correlation-popup
 * portal so it escapes the draft board's overflow/stacking contexts. Used by both the window's
 * bye chips and the per-candidate BYE×n row badge (a native title alone is unreliable on the
 * draft page — TASK-270 feedback).
 *
 * @param {Element} el            the hover anchor
 * @param {string}  titleText     popup heading
 * @param {string[]} players      player names to list
 */
function attachByePopup(el, titleText, players) {
  el.addEventListener('mouseenter', () => {
    ensureCorrPopupPortal();
    const rows = players.map(n =>
      `<div class="bbm-corr-popup-row"><span class="bbm-corr-popup-name">${escapeHtml(titleCase(n))}</span></div>`
    ).join('');
    corrPopupPortal.innerHTML = `<div class="bbm-corr-popup-title">${escapeHtml(titleText)}</div>${rows}`;
    const rect = el.getBoundingClientRect();
    corrPopupPortal.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - 220))}px`;
    corrPopupPortal.style.top = `${rect.bottom + 4}px`;
    corrPopupPortal.style.display = 'block';
  });
  el.addEventListener('mouseleave', () => {
    if (corrPopupPortal) corrPopupPortal.style.display = 'none';
  });
}

/** Wire a hover popup on each window bye chip listing the players sharing that position's bye. */
function attachByeChipHovers(container) {
  container.querySelectorAll('.bbm-elim-bye-chip').forEach(chip => {
    const playersRaw = chip.getAttribute('data-bye-players');
    if (!playersRaw) return;
    const week = chip.getAttribute('data-bye-week');
    const pos = chip.getAttribute('data-bye-pos');
    attachByePopup(chip, `${pos} · Week ${week} bye`, playersRaw.split('|'));
  });
}

/** Make the Eliminator window draggable by its header; persist the position to chrome.storage. */
function makeEliminatorWindowDraggable(win, handle) {
  let startX = 0, startY = 0, originLeft = 0, originTop = 0, dragging = false;

  const onMove = (e) => {
    if (!dragging) return;
    const left = Math.max(0, Math.min(originLeft + (e.clientX - startX), window.innerWidth - win.offsetWidth));
    const top = Math.max(0, Math.min(originTop + (e.clientY - startY), window.innerHeight - win.offsetHeight));
    win.style.left = `${left}px`;
    win.style.top = `${top}px`;
  };
  const onUp = () => {
    if (!dragging) return;
    dragging = false;
    win.classList.remove('bbm-elim-dragging');
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
    chrome.storage.local.set({ eliminatorWindowPos: { left: win.style.left, top: win.style.top } });
  };
  handle.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    const rect = win.getBoundingClientRect();
    // Pin to explicit left/top (the default uses bottom/right) before dragging.
    win.style.left = `${rect.left}px`;
    win.style.top = `${rect.top}px`;
    win.style.right = 'auto';
    win.style.bottom = 'auto';
    originLeft = rect.left;
    originTop = rect.top;
    startX = e.clientX;
    startY = e.clientY;
    dragging = true;
    win.classList.add('bbm-elim-dragging');
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    e.preventDefault();
  });
}

/** Create the floating Eliminator window (idempotent): a draggable bye-rainbow widget. */
function createEliminatorWindow() {
  if (document.getElementById('bbm-eliminator-window')) return;
  const win = document.createElement('div');
  win.id = 'bbm-eliminator-window';
  win.innerHTML = `
    <div class="bbm-elim-header" id="bbm-elim-drag">
      <span class="bbm-elim-grip" aria-hidden="true">⠿</span>
      <span class="bbm-elim-title">Eliminator · Byes</span>
    </div>
    <div id="bbm-elim-bye"></div>
  `;
  document.body.appendChild(win);

  // Restore a previously dragged position, if any.
  chrome.storage.local.get(['eliminatorWindowPos'], (res) => {
    const pos = res.eliminatorWindowPos;
    if (pos && pos.left && pos.top && document.body.contains(win)) {
      win.style.left = pos.left;
      win.style.top = pos.top;
      win.style.right = 'auto';
      win.style.bottom = 'auto';
    }
  });

  makeEliminatorWindowDraggable(win, win.querySelector('#bbm-elim-drag'));
  updateEliminatorWindow();
}

/** Refresh the Eliminator window's bye-rainbow content from current picks. */
function updateEliminatorWindow() {
  const win = document.getElementById('bbm-eliminator-window');
  if (!win) return;
  const rainbow = analyzeByeRainbow(picksWithTeam());
  const byeEl = win.querySelector('#bbm-elim-bye');
  byeEl.innerHTML = buildElimByeHtml(rainbow);
  attachByeChipHovers(byeEl);
}

/** Remove the floating Eliminator window. */
function removeEliminatorWindow() {
  document.getElementById('bbm-eliminator-window')?.remove();
}

/**
 * Reconcile Eliminator UI with current state. Self-guarding: shows the window + per-row
 * badges only when Eliminator is enabled, on a draft page, and Pro; otherwise tears them down.
 * Safe to call redundantly (all sub-steps are idempotent).
 */
function applyEliminatorMode() {
  const onDraft = !!adapter?.isDraftPage?.();
  if (eliminatorEnabled && onDraft && currentTier === 'pro') {
    createEliminatorWindow();
    startPicksObserver();        // idempotent — feeds the window even if the row overlay is off
    loadDraftTeamMap();          // TASK-275: resolve live-draft teams (once per draft)
    updateEliminatorWindow();
    if (enabled) sweepRows();    // per-row Eliminator badges only when the row overlay is active
  } else {
    removeEliminatorWindow();
    document.querySelectorAll('.bbm-eliminator-badge').forEach(el => el.remove());
    // Re-sweep so playoff-stack badges (suppressed while Eliminator was on) are restored.
    if (enabled && currentTier === 'pro') sweepRows();
  }
}

/**
 * Inject (or refresh) the per-candidate Eliminator badge on a row: the same-position
 * bye clash only (TASK-273 dropped the macro-fade and premium late-bye pills). Annotates
 * only — never reorders the board.
 *
 * @param {Element} row
 * @param {string|null} playerName  resolved (portfolio) name when available, else the display name
 */
function applyEliminatorBadge(row, playerName) {
  row.querySelectorAll('.bbm-eliminator-badge').forEach(el => el.remove());
  if (!eliminatorEnabled || !playerName) return;

  const key = resolvePlayerKey(playerName);
  const canon = canonicalName(playerName);
  const candidate = {
    name: playerName,
    position: (key && playerPositionMap.get(key)) || null,
    // Prefer the live-draft team map; fall back to portfolio-derived teams (TASK-275).
    team: draftTeamMap.get(canon) || (key && playerTeamMap.get(key)) || null,
  };
  const flags = getEliminatorFlags(candidate, picksWithTeam());
  if (!flags) return;

  const pills = [];
  if (flags.byeClash) {
    // `popup` drives a hover popup listing the rostered players this candidate would share a bye
    // with (a native title alone is unreliable on the draft page — TASK-270 feedback).
    pills.push({
      text: `BYE×${flags.byeClash.players.length + 1}`,
      color: '#F59E0B',
      title: `Same-position bye collision (Week ${flags.byeClash.week}) with ${flags.byeClash.players.join(', ')} — breaks the rainbow`,
      popup: {
        title: `${candidate.position || ''} · shares Week ${flags.byeClash.week} bye`.trim(),
        players: flags.byeClash.players,
      },
    });
  }
  if (pills.length === 0) return;

  const target = row.querySelector(adapter.selectors.stackPillTargetSelector);
  if (!target) return;
  pills.forEach(p => {
    const pill = document.createElement('span');
    pill.className = 'bbm-eliminator-badge bbm-inline-overlay';
    pill.textContent = p.text;
    pill.style.color = p.color;
    pill.style.borderColor = p.color;
    pill.style.background = `${p.color}1A`;
    pill.title = p.title;
    if (p.popup) attachByePopup(pill, p.popup.title, p.popup.players);
    target.appendChild(pill);
  });
}

/**
 * Inject the floating BBM config button and panel into the page.
 * Always injected regardless of overlay enabled state — user needs it to re-enable.
 */
function injectFloatingButton() {
  if (document.getElementById('bbm-fab')) return;

  const fab = document.createElement('button');
  fab.id = 'bbm-fab';
  fab.title = 'Best Ball Exposures';
  fab.innerHTML = `<svg width="36" height="36" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Best Ball Exposures">
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
    <div class="bbm-panel-title">Best Ball Exposures</div>
    <div id="bbm-auth-section"></div>
    <div id="bbm-upgrade-cta" style="display:none"></div>
    <hr class="bbm-panel-divider" />
    <div class="bbm-panel-row" id="bbm-overlay-row">
      <label class="bbm-panel-label" for="bbm-overlay-toggle">
        Overlay
        <span class="bbm-lock-icon" aria-hidden="true">\u{1F512}</span>
      </label>
      <input type="checkbox" id="bbm-overlay-toggle" />
    </div>
    <div class="bbm-panel-row" id="bbm-eliminator-row">
      <label class="bbm-panel-label" for="bbm-eliminator-toggle">
        Eliminator Mode
        <span class="bbm-lock-icon" aria-hidden="true">\u{1F512}</span>
      </label>
      <input type="checkbox" id="bbm-eliminator-toggle" />
    </div>
    <hr class="bbm-panel-divider" />
    <div class="bbm-panel-status">
      <span class="bbm-status-dot"></span>
      <span class="bbm-status-label">\u2014</span>
    </div>
    <div class="bbm-panel-sync-line">\u2014</div>
    <div id="bbm-filter-wrap">
      <hr class="bbm-panel-divider" />
      <div class="bbm-panel-title bbm-filter-title">Tournament Filter</div>
      <div id="bbm-tournament-filter" style="display:none"></div>
    </div>
  `;

  const toggle = panel.querySelector('#bbm-overlay-toggle');
  toggle.checked = enabled;

  const elimToggle = panel.querySelector('#bbm-eliminator-toggle');
  elimToggle.checked = eliminatorEnabled;

  // Retry on error state click
  const statusRow = panel.querySelector('.bbm-panel-status');
  statusRow.addEventListener('click', () => {
    if (loadState === 'error') loadPortfolioData();
  });

  // Prevent clicks inside the panel from bubbling to the document close listener
  panel.addEventListener('click', (e) => e.stopPropagation());

  // stopPropagation prevents the document click listener from closing
  // the panel on the same click that opened it
  fab.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('open');
    if (panel.classList.contains('open')) {
      renderAuthSection();
      updatePanelStatus();
      // Re-check tier on every open so a freshly-completed upgrade is reflected
      // without requiring a page reload (TASK-231).
      refreshTier();
    }
  });

  toggle.addEventListener('change', () => {
    // Non-Pro users can't engage the toggle — the input is `disabled` and the
    // label has pointer-events:none, but guard defensively in case the change
    // event fires via keyboard or assistive tech.
    if (currentTier !== 'pro') {
      toggle.checked = false;
      return;
    }
    enabled = toggle.checked;
    chrome.storage.local.set({ overlayEnabled: enabled });
    if (enabled) {
      startOverlay();
    } else {
      stopOverlay();
    }
  });

  elimToggle.addEventListener('change', () => {
    // Pro-gated like the overlay toggle; guard defensively against keyboard/AT events.
    if (currentTier !== 'pro') {
      elimToggle.checked = false;
      return;
    }
    eliminatorEnabled = elimToggle.checked;
    chrome.storage.local.set({ eliminatorEnabled });
    applyEliminatorMode();
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
  removeEliminatorWindow();
  removeStyles();
}

/**
 * Handle a URL change: start or stop the overlay based on whether the new
 * URL is a draft page. Handles all three transition types:
 *   lobby → draft  : startOverlay()
 *   draft → lobby  : stopOverlay()
 *   draft → draft  : stopOverlay() then startOverlay() (resets picks state)
 */
function handleUrlChange() {
  const currentUrl = window.location.href;
  if (currentUrl === lastUrl) return;

  const wasOnDraft = wasOnDraftPage;
  lastUrl = currentUrl;
  wasOnDraftPage = adapter.isDraftPage();
  const isOnDraft = wasOnDraftPage;

  if (!wasOnDraft && isOnDraft) {
    refreshTier().then(() => { if (enabled && currentTier === 'pro') startOverlay(); applyEliminatorMode(); });
  } else if (wasOnDraft && !isOnDraft) {
    stopOverlay();
    // Leaving the draft — tear down the Eliminator window and release picks.
    removeEliminatorWindow();
    stopPicksObserver();
  } else if (wasOnDraft && isOnDraft) {
    stopOverlay();
    refreshTier().then(() => { if (enabled && currentTier === 'pro') startOverlay(); applyEliminatorMode(); });
  }
}

/**
 * Poll window.location.href for URL changes and call handleUrlChange on each
 * transition. Content scripts run in an isolated world — patching
 * history.pushState in a content script only affects the content script's
 * wrapper and does not intercept calls made by the page's JavaScript (React
 * Router). window.location is shared across worlds and reflects SPA navigation
 * correctly, so polling is the reliable approach here.
 *
 * Called once from initDraftOverlay().
 */
function watchNavigation() {
  setInterval(() => {
    if (window.location.href !== lastUrl) handleUrlChange();
  }, 300);

  // Also catch browser back/forward navigation, which fires popstate.
  window.addEventListener('popstate', handleUrlChange);
}

/**
 * Initialize the BBM overlay system.
 * Called from content.js on any supported platform page.
 *
 * The FAB is injected on every page so users have a config surface
 * pre-draft and during draft. Row injection (startOverlay) only runs
 * on actual draft pages where the player grid exists.
 */
export function initDraftOverlay(platformAdapter, onSync = null) {
  adapter = platformAdapter;
  syncCallback = onSync;

  chrome.storage.local.get(['overlayEnabled', 'tournamentFilter', 'eliminatorEnabled'], (result) => {
    enabled = result.overlayEnabled !== false; // default to true
    eliminatorEnabled = result.eliminatorEnabled === true; // default to false (TASK-270)
    selectedTournaments = new Set(result.tournamentFilter ?? []);

    wasOnDraftPage = adapter.isDraftPage();

    injectStyles();
    injectFloatingButton();
    watchNavigation();

    // Resolve tier before any overlay decision. startOverlay() and sweepRows()
    // both early-return on non-Pro, so calling them before the tier resolves
    // is safe; refreshTier() will re-arm them when Pro is confirmed.
    refreshTier().then(() => {
      if (wasOnDraftPage && enabled && currentTier === 'pro') {
        startOverlay();
      } else {
        loadPortfolioData();
      }
      // Reconcile Eliminator UI for the case the row overlay is off but Eliminator is on.
      applyEliminatorMode();
    });

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
    if (currentTier !== 'pro' && message.enabled) return; // TASK-231: ignore enable from popup for non-Pro
    enabled = message.enabled;
    const toggle = document.getElementById('bbm-overlay-toggle');
    if (toggle) toggle.checked = enabled;
    if (enabled) {
      if (adapter.isDraftPage()) startOverlay();
    } else {
      stopOverlay();
    }
    applyEliminatorMode();
  });
}
