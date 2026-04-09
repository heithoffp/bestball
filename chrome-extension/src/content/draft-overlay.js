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
import { readEntries, readRankings, getAuthSession, signIn, signOut, fetchTier } from '../utils/bridge.js';

const INJECTED_ATTR = 'data-bbm-injected';
const PLAYER_ID_ATTR = 'data-bbm-player-id';
const HEADER_INJECTED_ATTR = 'data-bbm-headers-injected';

let adapter = null;
let corrPopupPortal = null; // Single shared popup, appended to document.body

let gridObserver = null;
let enabled = true;
let rafId = null;
let lastUrl = window.location.href;
let wasOnDraftPage = false;

// Portfolio data for metric computation
let playerIndexMap = new Map();  // lowerCasedName -> Set<rosterIndex>
let playerTeamMap = new Map();   // lowerCasedName -> team abbreviation
let playerPositionMap = new Map(); // lowerCasedName -> position
let abbreviatedNameMap = new Map(); // "j. jefferson" -> "justin jefferson" (for DK-style names)
let totalRosters = 0;
let currentPicks = [];           // [{name, position, round}, ...]
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

  totalRosters = filtered.length;
  playerIndexMap = new Map();
  playerTeamMap = new Map();
  playerPositionMap = new Map();
  abbreviatedNameMap = new Map();
  filtered.forEach((entry, rosterIdx) => {
    (entry.players ?? []).forEach(p => {
      if (!p.name) return;
      const key = p.name.trim().toLowerCase();
      if (!playerIndexMap.has(key)) playerIndexMap.set(key, new Set());
      playerIndexMap.get(key).add(rosterIdx);
      if (p.team && !playerTeamMap.has(key)) playerTeamMap.set(key, p.team);
      if (p.position && !playerPositionMap.has(key)) playerPositionMap.set(key, p.position);
    });
  });

  // Build abbreviated name reverse-lookup: "j. jefferson" → "justin jefferson"
  // Handles DK-style abbreviated display names (first initial + last name).
  // Ambiguous abbreviations store candidate arrays for DOM-based disambiguation.
  for (const fullName of playerIndexMap.keys()) {
    const parts = fullName.split(/\s+/);
    if (parts.length < 2) continue;
    const firstInitial = parts[0][0];
    const lastName = parts.slice(1).join(' ');
    const abbrev = `${firstInitial}. ${lastName}`;
    if (abbreviatedNameMap.has(abbrev)) {
      const existing = abbreviatedNameMap.get(abbrev);
      const candidate = {
        fullName,
        position: playerPositionMap.get(fullName)?.toUpperCase() ?? null,
        team: playerTeamMap.get(fullName)?.toUpperCase() ?? null,
      };
      if (typeof existing === 'string') {
        // Convert first entry to array, add second candidate
        abbreviatedNameMap.set(abbrev, [
          {
            fullName: existing,
            position: playerPositionMap.get(existing)?.toUpperCase() ?? null,
            team: playerTeamMap.get(existing)?.toUpperCase() ?? null,
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
        <span class="bbm-account-chevron">&#9660;</span>
      </div>
      <div class="bbm-account-body" id="bbm-account-body" style="display:none">
        <input type="email" id="bbm-auth-email" class="bbm-auth-input" placeholder="Email" autocomplete="email" />
        <input type="password" id="bbm-auth-password" class="bbm-auth-input" placeholder="Password" autocomplete="current-password" />
        <button id="bbm-sign-in-btn" class="bbm-btn">Sign In</button>
        <div id="bbm-auth-error" class="bbm-auth-error" style="display:none"></div>
      </div>
    `;
    container.querySelector('#bbm-account-toggle').addEventListener('click', toggleAccountSection);
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
  sweepRows();
  await renderAuthSection();
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
    }
  }

  window.addEventListener('message', onProgress);

  try {
    const { count } = await syncCallback();
    if (resultEl) {
      resultEl.textContent = `Synced ${count} entries`;
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
      name: resolvePlayerKey(p.name, { position: p.position }) ?? p.name,
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
  const key = displayName.trim().toLowerCase();
  // Direct match (full name or already known)
  if (playerIndexMap.has(key)) return key;
  // Abbreviated name lookup ("j. jefferson" → "justin jefferson")
  const resolved = abbreviatedNameMap.get(key);
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
    const t = playerTeamMap.get(p.name.trim().toLowerCase());
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
  if (resolvedName) applyStackBadge(row, resolvedName);

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
    <hr class="bbm-panel-divider" />
    <div class="bbm-panel-row">
      <label class="bbm-panel-label" for="bbm-overlay-toggle">Overlay</label>
      <input type="checkbox" id="bbm-overlay-toggle" />
    </div>
    <hr class="bbm-panel-divider" />
    <div class="bbm-panel-status">
      <span class="bbm-status-dot"></span>
      <span class="bbm-status-label">\u2014</span>
    </div>
    <div class="bbm-panel-sync-line">\u2014</div>
    <hr class="bbm-panel-divider" />
    <div class="bbm-panel-title bbm-filter-title">Tournament Filter</div>
    <div id="bbm-tournament-filter" style="display:none"></div>
  `;

  const toggle = panel.querySelector('#bbm-overlay-toggle');
  toggle.checked = enabled;

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
    }
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
    if (enabled) startOverlay();
  } else if (wasOnDraft && !isOnDraft) {
    stopOverlay();
  } else if (wasOnDraft && isOnDraft) {
    stopOverlay();
    if (enabled) startOverlay();
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

  chrome.storage.local.get(['overlayEnabled', 'tournamentFilter'], (result) => {
    enabled = result.overlayEnabled !== false; // default to true
    selectedTournaments = new Set(result.tournamentFilter ?? []);

    wasOnDraftPage = adapter.isDraftPage();

    injectStyles();
    injectFloatingButton();
    watchNavigation();

    if (wasOnDraftPage && enabled) {
      startOverlay(); // startOverlay calls loadPortfolioData
    } else {
      // Not a draft page — still load data for panel status + tournament filter
      loadPortfolioData();
    }

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
      if (adapter.isDraftPage()) startOverlay();
    } else {
      stopOverlay();
    }
  });
}
