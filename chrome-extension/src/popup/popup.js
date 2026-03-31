/**
 * Popup Script
 *
 * Reads stored state and updates the popup UI. Future: handles auth
 * flow via Supabase (TASK-043).
 */

async function updateStatus() {
  const connectionEl = document.getElementById('connection-status');
  const platformEl = document.getElementById('platform-status');
  const syncEl = document.getElementById('sync-status');

  // Check if current tab is on a supported platform
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.url) {
      const hostname = new URL(tab.url).hostname;
      if (hostname.includes('underdogfantasy.com')) {
        platformEl.textContent = 'Underdog';
      } else if (hostname.includes('draftkings.com')) {
        platformEl.textContent = 'DraftKings';
      }
    }
  } catch {
    // Tab query can fail in some contexts — ignore
  }

  // Read stored sync state
  try {
    const stored = await chrome.storage.local.get(['lastSync', 'entryCount']);
    if (stored.lastSync) {
      const date = new Date(stored.lastSync);
      syncEl.textContent = date.toLocaleDateString();
    }
    if (stored.entryCount) {
      connectionEl.textContent = `${stored.entryCount} entries`;
    }
  } catch {
    // Storage not available — leave defaults
  }
}

updateStatus();
