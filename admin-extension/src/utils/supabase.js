import { createClient } from '@supabase/supabase-js';

// Service-role key bundled at build time. This extension is loaded unpacked
// in the developer's browser only — the key is never shipped to customers.
// See ADR-008.
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const noOpLock = async (_n, _t, fn) => fn();

export const supabase = (url && key)
  ? createClient(url, key, {
      auth: {
        storage: {
          getItem: (k) => new Promise((r) => chrome.storage.local.get(k, (v) => r(v[k] ?? null))),
          setItem: (k, v) => new Promise((r) => chrome.storage.local.set({ [k]: v }, () => r())),
          removeItem: (k) => new Promise((r) => chrome.storage.local.remove(k, () => r())),
        },
        lock: noOpLock,
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    })
  : null;
