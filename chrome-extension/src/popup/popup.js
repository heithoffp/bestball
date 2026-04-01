/**
 * Popup Script
 *
 * Handles auth state display and sign-in/sign-out via Supabase (TASK-043).
 */

import { getAuthSession, signIn, signOut, fetchTier } from '../utils/bridge.js';

const connectionEl = document.getElementById('connection-status');
const platformEl = document.getElementById('platform-status');
const syncEl = document.getElementById('sync-status');
const authForm = document.getElementById('auth-form');
const authInfo = document.getElementById('auth-info');
const authError = document.getElementById('auth-error');
const authUserEmail = document.getElementById('auth-user-email');
const authTier = document.getElementById('auth-tier');
const signInBtn = document.getElementById('sign-in-btn');
const signOutBtn = document.getElementById('sign-out-btn');
const emailInput = document.getElementById('auth-email');
const passwordInput = document.getElementById('auth-password');
const syncBtn = document.getElementById('sync-btn');
const syncResult = document.getElementById('sync-result');

function renderAuthInfo(session) {
  authForm.hidden = true;
  authInfo.hidden = false;
  authUserEmail.textContent = session.user.email;
  connectionEl.textContent = 'Connected';

  // Load tier badge async — email shows immediately while this resolves
  authTier.hidden = true;
  fetchTier().then(tier => {
    if (!tier) return;
    authTier.textContent = tier === 'pro' ? 'Pro' : 'Free';
    authTier.className = `tier-badge ${tier}`;
    authTier.hidden = false;
  });
}

function renderAuthForm() {
  authInfo.hidden = true;
  authForm.hidden = false;
  authError.hidden = true;
  authError.textContent = '';
  connectionEl.textContent = 'Not connected';
}

async function updateStatus() {
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
      syncEl.textContent = `${stored.entryCount} entries`;
    }
  } catch {
    // Storage not available — leave defaults
  }

  // Render auth state
  try {
    const session = await getAuthSession();
    if (session) {
      renderAuthInfo(session);
    } else {
      renderAuthForm();
    }
  } catch {
    renderAuthForm();
  }
}

signInBtn.addEventListener('click', async () => {
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  if (!email || !password) return;

  signInBtn.disabled = true;
  authError.hidden = true;

  try {
    const session = await signIn(email, password);
    renderAuthInfo(session);
  } catch (err) {
    authError.textContent = err.message ?? 'Sign in failed';
    authError.hidden = false;
  } finally {
    signInBtn.disabled = false;
  }
});

signOutBtn.addEventListener('click', async () => {
  await signOut();
  renderAuthForm();
});

syncBtn.addEventListener('click', async () => {
  syncBtn.disabled = true;
  syncResult.hidden = true;
  syncResult.className = 'sync-result';

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) throw new Error('No active tab found');

    const response = await chrome.tabs.sendMessage(tab.id, { type: 'SYNC_ENTRIES' });

    if (response.ok) {
      syncResult.textContent = `Synced ${response.count} entries`;
      // Update the last-sync display
      const stored = await chrome.storage.local.get(['lastSync', 'entryCount']);
      if (stored.entryCount) syncEl.textContent = `${stored.entryCount} entries`;
    } else {
      syncResult.textContent = response.error ?? 'Sync failed';
      syncResult.classList.add('error');
    }
  } catch (err) {
    const msg = err.message ?? 'Sync failed';
    syncResult.textContent = msg.includes('Could not establish connection')
      ? 'Navigate to your Underdog entries page first'
      : msg;
    syncResult.classList.add('error');
  } finally {
    syncResult.hidden = false;
    syncBtn.disabled = false;
  }
});

updateStatus();
