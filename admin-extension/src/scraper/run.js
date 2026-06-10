/**
 * Admin scraper run loop. ADR-008 binding constraints:
 *  - Base inter-request delay ≥ 2000 ms with ±500 ms jitter.
 *  - At most 50 fetches per run.
 *  - Idempotent — skip already-cached draft IDs.
 *  - 429/5xx: double delay, retry once, halt run.
 *  - 401/403: halt run, persist disabled flag, surface to popup.
 *  - Whitelist-only: skip non-allowlisted slate titles.
 *
 * Discovery is bounded: draft IDs come only from extension_entries.
 * Tournament-leaderboard crawling is explicitly out of scope.
 */

import { supabase } from '../utils/supabase.js';
import { isWhitelisted } from './whitelist.js';
import { normalizeDraft } from './normalizePick.js';

const BASE_DELAY_MS = 2000;
const JITTER_MS = 500;
const MAX_PER_RUN = 50;
const CANDIDATE_FETCH_LIMIT = 250; // pull headroom so whitelist filter still yields enough

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = () => Math.random() * (2 * JITTER_MS) - JITTER_MS;

// ── Slate reference data (appearances / players / teams) ─────────────────────
// UD picks carry only appearance_id; resolving player identity requires the
// slate's appearances + players from the stats API (no auth header needed —
// mirrors the customer extension's ensureSlateLoaded). Cached per run.

const slateRefs = { appearances: {}, players: {}, teams: {}, loadedSlates: new Set(), scoringTypeId: null };

async function statsFetch(auth, path) {
  const host = auth.statsHost || 'stats.underdogsports.com';
  const q = auth.statsParams ? `?${auth.statsParams}` : '';
  const res = await fetch(`https://${host}${path}${q}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`stats ${res.status}: ${path}`);
  return res.json();
}

async function ensureSlateLoaded(auth, slateId, log) {
  if (!slateId || slateRefs.loadedSlates.has(slateId)) return;
  slateRefs.loadedSlates.add(slateId);

  if (!slateRefs.scoringTypeId) {
    try {
      const data = await statsFetch(auth, '/v1/scoring_types');
      const nfl = data.scoring_types?.find((s) => s.sport_id === 'NFL');
      if (nfl) slateRefs.scoringTypeId = nfl.id;
    } catch (e) {
      log('warn', `scoring_types fetch failed: ${e.message}`);
    }
  }

  try {
    const data = await statsFetch(auth, `/v1/slates/${slateId}/players`);
    (data.players ?? []).forEach((p) => { slateRefs.players[p.id] = p; });
    (data.teams ?? []).forEach((t) => { slateRefs.teams[t.id] = t; });
  } catch (e) {
    log('warn', `slate players fetch failed for ${slateId}: ${e.message}`);
  }

  if (slateRefs.scoringTypeId) {
    try {
      const data = await statsFetch(auth, `/v1/slates/${slateId}/scoring_types/${slateRefs.scoringTypeId}/appearances`);
      (data.appearances ?? []).forEach((a) => { slateRefs.appearances[a.id] = a; });
    } catch (e) {
      log('warn', `slate appearances fetch failed for ${slateId}: ${e.message}`);
    }
  }
}

async function getAuth() {
  return new Promise((r) =>
    chrome.storage.local.get(['bbe_admin_auth', 'scraper_disabled_until_manual_reenable'], r),
  );
}

async function persistLastRun(summary) {
  return new Promise((r) =>
    chrome.storage.local.set({ bbe_admin_last_run: { ts: Date.now(), ...summary } }, r),
  );
}

async function setDisabled(reason) {
  return new Promise((r) =>
    chrome.storage.local.set({ scraper_disabled_until_manual_reenable: reason }, r),
  );
}

export async function runScraper({ onLog } = {}) {
  const log = (level, msg, extra) => {
    const line = `[${new Date().toISOString()}] ${level}: ${msg}`;
    console.log(line, extra ?? '');
    onLog?.({ level, msg, extra });
  };

  if (!supabase) {
    log('error', 'Supabase client not configured — set VITE_SUPABASE_URL and VITE_SUPABASE_SERVICE_ROLE_KEY');
    return { ok: false, reason: 'no-supabase' };
  }

  const state = await getAuth();
  if (state.scraper_disabled_until_manual_reenable) {
    log('warn', `Scraper disabled: ${state.scraper_disabled_until_manual_reenable}. Re-enable from popup.`);
    return { ok: false, reason: 'disabled' };
  }

  const auth = state.bbe_admin_auth;
  if (!auth?.token) {
    log('warn', 'No UD token captured yet — open app.underdogfantasy.com and sign in.');
    return { ok: false, reason: 'no-token' };
  }

  // 1. Candidate draft_ids (not already cached).
  // Repair mode: boards whose picks have no player names (pre-fix TASK-241
  // scrapes stored null names — see normalizePick.js) or that were seeded by
  // a non-scraper source (e.g. the TASK-240 mock_test review board) do NOT
  // count as cached, so they are re-fetched and overwritten with real data.
  const { data: cached, error: cachedErr } = await supabase
    .from('draft_boards_admin')
    .select('draft_id, source, first_pick_name:picks->0->>name');
  if (cachedErr) {
    log('error', `Supabase read draft_boards_admin failed: ${cachedErr.message}`);
    return { ok: false, reason: 'supabase-error' };
  }
  const cachedIds = new Set(
    (cached ?? [])
      .filter((r) => r.first_pick_name != null && r.source === 'admin_scraper')
      .map((r) => r.draft_id)
  );
  const repairable = (cached ?? []).length - cachedIds.size;
  if (repairable > 0) log('info', `${repairable} cached boards lack player names — queued for repair re-fetch`);

  const { data: candidates, error: candErr } = await supabase
    .from('extension_entries')
    .select('entry_id, slate_title')
    .not('slate_title', 'is', null)
    .limit(CANDIDATE_FETCH_LIMIT);
  if (candErr) {
    log('error', `Supabase read extension_entries failed: ${candErr.message}`);
    return { ok: false, reason: 'supabase-error' };
  }

  const seen = new Set();
  const queue = [];
  for (const row of candidates ?? []) {
    const id = String(row.entry_id);
    if (seen.has(id)) continue;
    seen.add(id);
    if (cachedIds.has(id)) {
      log('info', `skipped-already-cached ${id}`);
      continue;
    }
    if (!isWhitelisted(row.slate_title)) {
      log('info', `skipped-whitelist ${id} slate=${row.slate_title}`);
      continue;
    }
    queue.push({ id, slate_title: row.slate_title });
    if (queue.length >= MAX_PER_RUN) break;
  }

  log('info', `Run starting — ${queue.length} drafts to fetch (cache=${cachedIds.size}, candidates=${candidates?.length ?? 0})`);

  let delay = BASE_DELAY_MS;
  const summary = { fetched: 0, errors: 0, skipped_no_slots: 0, halted: null };

  for (const { id, slate_title } of queue) {
    await sleep(Math.max(0, delay + jitter()));

    let res;
    try {
      res = await fetch(`https://${auth.apiHost}/v2/drafts/${id}`, {
        headers: { Authorization: auth.token, Accept: 'application/json' },
      });
    } catch (e) {
      log('error', `error-network ${id}: ${e.message}`);
      summary.errors++;
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      log('error', `error-${res.status} ${id} — halting and disabling scraper`);
      await setDisabled(`Auth failure (${res.status}) at ${new Date().toISOString()}`);
      summary.halted = `auth-${res.status}`;
      break;
    }

    if (res.status === 429 || res.status >= 500) {
      log('warn', `error-${res.status} ${id} — doubling delay and retrying once`);
      delay = delay * 2;
      await sleep(delay + jitter());
      try {
        res = await fetch(`https://${auth.apiHost}/v2/drafts/${id}`, {
          headers: { Authorization: auth.token, Accept: 'application/json' },
        });
      } catch (e) {
        log('error', `error-network-retry ${id}: ${e.message} — halting run`);
        summary.errors++;
        summary.halted = `network-retry`;
        break;
      }
      if (!res.ok) {
        log('error', `retry-failed-${res.status} ${id} — halting run`);
        summary.errors++;
        summary.halted = `retry-${res.status}`;
        break;
      }
      // Don't reset delay — next run starts fresh at BASE_DELAY_MS.
    }

    if (!res.ok) {
      log('warn', `error-${res.status} ${id} — skipping`);
      summary.errors++;
      continue;
    }

    let body;
    try {
      body = await res.json();
    } catch (e) {
      log('error', `error-parse ${id}: ${e.message}`);
      summary.errors++;
      continue;
    }

    const draft = body.draft ?? body;
    await ensureSlateLoaded(auth, draft.slate_id ?? draft.slateId, log);
    const normalized = normalizeDraft(draft, slateRefs);
    if (!normalized) {
      log('warn', `skipped-unnormalizable ${id} — missing slots or unresolved player names (check stats reference data)`);
      summary.skipped_no_slots++;
      continue;
    }

    const { error: upsertErr } = await supabase
      .from('draft_boards_admin')
      .upsert({
        draft_id: id,
        slate_title,
        entry_count: normalized.entryCount,
        rounds: normalized.rounds,
        picks: normalized.picks,
        fetched_at: new Date().toISOString(),
      }, { onConflict: 'draft_id' });

    if (upsertErr) {
      log('error', `error-upsert ${id}: ${upsertErr.message}`);
      summary.errors++;
      continue;
    }

    log('info', `fetched ${id} (${normalized.picks.length} picks)`);
    summary.fetched++;
  }

  await persistLastRun(summary);
  log('info', `Run complete — fetched=${summary.fetched} errors=${summary.errors} no_slots=${summary.skipped_no_slots} halted=${summary.halted ?? 'no'}`);
  return { ok: true, summary };
}
