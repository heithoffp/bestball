import { supabase } from '../utils/supabase.js';

const $ = (id) => document.getElementById(id);

async function refresh() {
  const state = await new Promise((r) =>
    chrome.storage.local.get(
      ['bbe_admin_auth', 'bbe_admin_last_run', 'scraper_disabled_until_manual_reenable'],
      r,
    ),
  );

  // Token state
  if (state.bbe_admin_auth?.token) {
    const age = Math.round((Date.now() - state.bbe_admin_auth.capturedAt) / 1000);
    $('token-state').innerHTML = `<span class="ok">✓ captured</span> (${age}s ago)`;
  } else {
    $('token-state').innerHTML = `<span class="err">✗ missing</span> — open UD and sign in`;
  }

  // Disabled banner
  if (state.scraper_disabled_until_manual_reenable) {
    $('disabled-banner').classList.remove('hidden');
    $('disabled-reason').textContent = String(state.scraper_disabled_until_manual_reenable);
    $('run-btn').disabled = true;
  } else {
    $('disabled-banner').classList.add('hidden');
    $('run-btn').disabled = false;
  }

  // Supabase state + cached count
  if (!supabase) {
    $('supabase-state').innerHTML = `<span class="err">✗ not configured</span>`;
    $('cached-count').textContent = '—';
  } else {
    try {
      const { count, error } = await supabase
        .from('draft_boards_admin')
        .select('draft_id', { count: 'exact', head: true });
      if (error) throw error;
      $('supabase-state').innerHTML = `<span class="ok">✓ connected</span>`;
      $('cached-count').textContent = String(count ?? 0);
    } catch (e) {
      $('supabase-state').innerHTML = `<span class="err">✗ ${e.message}</span>`;
      $('cached-count').textContent = '—';
    }
  }

  // Last run summary
  const lr = state.bbe_admin_last_run;
  if (lr) {
    const when = new Date(lr.ts).toLocaleString();
    $('last-run').textContent =
      `${when} — fetched ${lr.fetched}, errors ${lr.errors}` +
      (lr.halted ? `, halted: ${lr.halted}` : '');
  }
}

$('run-btn').addEventListener('click', async () => {
  $('run-btn').disabled = true;
  $('status').textContent = 'Running…';
  try {
    const result = await chrome.runtime.sendMessage({ type: 'run_now' });
    $('status').textContent = JSON.stringify(result, null, 2);
  } catch (e) {
    $('status').textContent = `Error: ${e.message}`;
  }
  $('run-btn').disabled = false;
  refresh();
});

$('reenable-btn').addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'reenable_scraper' });
  refresh();
});

refresh();
setInterval(refresh, 3000);
