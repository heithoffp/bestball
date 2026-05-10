import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Bypass supabase's default navigator.locks-based token-refresh lock. In
// Firefox content scripts, `globalThis.navigator` is Xray-wrapped from the
// page compartment, and `navigator.locks.request(...)` returns a Promise the
// content sandbox can't `.then` on ("Permission denied to access property
// 'then'"). Each tab's content script has its own supabase client and there's
// no concurrent refresh to serialize, so a no-op lock is safe here.
const noOpLock = async (_name, _acquireTimeout, fn) => fn();

// Use chrome.storage.local as the auth storage backend.
// localStorage is unavailable in extension contexts (popup, service worker).
export const supabase = (url && key)
  ? createClient(url, key, {
      auth: {
        // Callback form (not Promise form) is required for Firefox: in content
        // scripts, Promises returned by chrome.* APIs live in the privileged
        // extension compartment, and Firefox's Xray vision blocks the content
        // sandbox from accessing `.then` on them ("Permission denied to access
        // property 'then'"). Wrapping the callback in a sandbox-owned Promise
        // sidesteps the cross-compartment block. Chromium accepts both forms.
        storage: {
          getItem: (k) => new Promise((resolve) => chrome.storage.local.get(k, (r) => resolve(r[k] ?? null))),
          setItem: (k, v) => new Promise((resolve) => chrome.storage.local.set({ [k]: v }, () => resolve())),
          removeItem: (k) => new Promise((resolve) => chrome.storage.local.remove(k, () => resolve())),
        },
        lock: noOpLock,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
