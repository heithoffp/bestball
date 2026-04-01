import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Use chrome.storage.local as the auth storage backend.
// localStorage is unavailable in extension contexts (popup, service worker).
export const supabase = (url && key)
  ? createClient(url, key, {
      auth: {
        storage: {
          getItem: (k) => chrome.storage.local.get(k).then(r => r[k] ?? null),
          setItem: (k, v) => chrome.storage.local.set({ [k]: v }),
          removeItem: (k) => chrome.storage.local.remove(k),
        },
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: false,
      },
    })
  : null;
