# TASK-231: Gate extension overlay behind Pro subscription

**Status:** Approved
**Priority:** P2

---

## Objective
Make the Chrome extension's in-draft row overlay (Exp / Corr columns, tier-break badges, current-pick correlation popup) a Pro-only feature. Non-Pro users (free, unauthenticated, or tier-fetch failed) keep the FAB and sync flow but see no draft-row injections, a disabled "Overlay" toggle in the FAB panel, and an "Upgrade to Pro" call-to-action that opens the web app's PlanPicker.

## Verification Criteria

1. **Pro user (active subscription, beta, or comp):** Loading a draft page on Underdog or DraftKings injects Exp/Corr columns and tier badges into player rows exactly as today. The FAB panel shows the Overlay toggle as enabled and interactive. No "Upgrade" button appears.
2. **Signed-in Free user:** Loading a draft page on either platform injects **no** Exp/Corr columns, **no** tier badges, and registers **no** correlation popup. The FAB and panel still render. The Overlay toggle in the panel renders disabled (greyed out, `cursor: not-allowed`, with a lock icon and tooltip "Pro feature"). An "Upgrade to Pro" button appears in the auth section. Clicking it opens `https://bestballexposures.com/?upgrade=1` in a new tab, and that URL auto-opens the PlanPicker modal on the web app.
3. **Unauthenticated user:** Same as Free — overlay rows not injected, toggle disabled, "Upgrade to Pro" button visible in the panel above the sign-in form. Clicking it opens the same URL.
4. **Tier transition mid-session:** A signed-in Free user who completes upgrade (subscription becomes active in Supabase) will, on their next FAB-panel open OR next draft-page navigation, see the gating lift — overlay injections resume, toggle re-enables, Upgrade button disappears. (No realtime subscription needed; re-checks on panel open and on URL change are sufficient.)
5. **No regression to sync:** Free users can still sign in, sync entries via the panel's "Sync Now" button, and have entries written to Supabase. Gating affects only the in-draft row overlay UI.
6. **No console errors** on draft pages for any tier.

## Verification Approach

Manual verification across the four user states. All steps require the developer running a local extension build against the production Supabase + a draft page.

**Automated steps (Claude runs):**
1. `cd chrome-extension && npm run build` — confirm clean build with no Vite errors.
2. `cd best-ball-manager && npm run lint && npm run build` — confirm the web-app side still lints and builds after the URL-param handler is added.

**Manual steps (developer runs):**
3. Load the unpacked extension `chrome-extension/dist/` in Chrome.
4. **Pro state:** Sign in as a known Pro account. Open an Underdog draft and a DraftKings draft. Confirm Exp/Corr columns + tier badges render. Confirm the FAB panel's Overlay toggle is enabled and toggling it on/off works.
5. **Free state:** Sign in as a known Free account (or grant a test account no subscription / no beta). Repeat draft-page checks. Confirm no row injections appear, the Overlay toggle is visually disabled and not interactive, and the "Upgrade to Pro" button appears. Click it — confirm a new tab opens `https://bestballexposures.com/?upgrade=1` AND the PlanPicker modal launches automatically.
6. **Unauthenticated state:** Sign out. Open a draft page. Confirm no row injections, disabled toggle, and "Upgrade to Pro" button visible above the sign-in form. Click it — confirm same auto-launch behavior.
7. **Upgrade-lift transition:** While signed in as a Free account on a draft page, run `node scripts/grant-pro.mjs <email>` (or insert a row in `subscriptions` with status active). Close and re-open the FAB panel. Confirm the toggle re-enables, the Upgrade button disappears, and Exp/Corr columns appear on the rows (may require a URL revisit / soft reload — acceptable).
8. **Sync regression check:** As a Free user, click "Sync Now". Confirm entries write successfully (toast shows `Synced N entries`).
9. DevTools console — confirm no red errors across all four states.

Developer must confirm each manual step before TASK-231 is marked Verified.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/content/draft-overlay.js` | Modify | Track `tier` state, refresh on auth/panel-open/URL-change; short-circuit row injection + correlation popup when tier !== 'pro'; render disabled Overlay toggle + lock badge + Upgrade button when non-Pro; sweep & remove existing overlay artifacts on tier change. |
| `chrome-extension/src/content/draft-overlay.js` (styles) | Modify | Add CSS for `.bbm-panel-row.disabled`, lock badge next to toggle label, `.bbm-upgrade-btn` styling (matches existing `.bbm-btn` palette but with the gold-accent border used in `.bbm-auth-tier.pro`). |
| `best-ball-manager/src/App.jsx` | Modify | On mount, read `URLSearchParams` for `upgrade=1`; if present and user is signed in (or after sign-in completes), call `openPlanPicker()` and strip the param via `history.replaceState` so refresh doesn't re-trigger. |
| `chrome-extension/CHANGELOG.md` | Modify | Add 1.0.10 entry noting the gate. |
| `chrome-extension/manifest.json` | Modify | Bump version to `1.0.10`. |
| `chrome-extension/package.json` | Modify | Bump version to `1.0.10` to keep parity. |

No new files. No supabase migrations.

## Implementation Approach

### Extension side (`draft-overlay.js`)

1. **Tier state.** Add a module-level `let currentTier = null;` ('pro' | 'free' | null). Add a helper `async function refreshTier()` that calls `fetchTier()` (already imported from `bridge.js`) and stores the result, then calls `applyTierGate()`.

2. **Gating helper `applyTierGate()`.**
   - Computes `const isPro = currentTier === 'pro';`.
   - If `!isPro` and the overlay is currently injected on rows: call `clearAllInjections()` (existing pattern at lines ~1168) to strip Exp/Corr columns, tier badges, and dispose the correlation popup. Stop row + sort + picks observers so we don't re-inject.
   - If `isPro` and we're on a draft page: re-arm by calling `startOverlay()` (idempotent guard already present).
   - Re-render the panel by calling `renderAuthSection()` and `renderOverlayRow()` (new helper, see below).

3. **`renderOverlayRow()` helper.** Currently the Overlay row is hard-coded in `injectFloatingButton()`'s panel HTML. Extract its rendering into a function called both at panel-injection time and on tier change. Two branches:
   - **Pro:** existing checkbox + label, fully interactive.
   - **Non-Pro:** label dimmed, lock icon (`🔒` inline SVG matching brand gold `#E8BF4A`), checkbox replaced by a non-interactive disabled checkbox (`disabled` attr + `pointer-events: none`), wrapper `title="Pro feature — upgrade to use the overlay"`. Force `enabled = false` internally so even if tier was previously pro the rows stay clean.

4. **Upgrade button.** Add `renderUpgradeCta()` that injects a button into `#bbm-auth-section` (below the Account toggle, above sync controls when signed in; above sign-in form when signed out) when `currentTier !== 'pro'`. Button is `<a target="_blank" rel="noopener" href="https://bestballexposures.com/?upgrade=1">Upgrade to Pro</a>` styled as a button (gold gradient matching the FAB logo accent). Modify `renderAuthSection()` to call `renderUpgradeCta()` after rendering.

5. **Where to refresh tier.**
   - On `initDraftOverlay()` after auth-section first render → `refreshTier()`.
   - On successful `handleSignIn` / `handleGoogleSignIn` → `refreshTier()` after `renderAuthSection()`.
   - On `handleSignOut` → set `currentTier = null` and call `applyTierGate()`.
   - On FAB panel open (existing `fab.addEventListener('click'...)` already triggers `renderAuthSection`) → also `refreshTier()` so a Pro upgrade reflects on next open.
   - On URL change to a draft page in `handleUrlChange()` → `refreshTier()` before `startOverlay()`.

6. **Row-injection short-circuit.** In `sweepRows()` (the main injection entry point — confirmed by the `clearAllInjections` pattern), early-return when `currentTier !== 'pro'`. Same for `processRow()`, `startPicksObserver()`, and the correlation-popup creation in `createCorrPopup()`. Belt-and-braces: also early-return inside `startOverlay()` when non-Pro so observers never start.

7. **Storage / `overlayEnabled` flag interaction.** Preserve the existing user preference. When tier flips back to Pro, restore the prior `overlayEnabled` value (we don't overwrite it; the disabled toggle is purely visual). When non-Pro, in-memory `enabled = false` overrides regardless of stored value.

### Web app side (`App.jsx`)

8. **URL-param auto-launch.** In the existing top-level `App` component, add a `useEffect` that runs once after `user` and `openPlanPicker` are available:

```js
useEffect(() => {
  const params = new URLSearchParams(window.location.search);
  if (params.get('upgrade') !== '1') return;
  // Strip the param so refresh/back doesn't re-trigger
  params.delete('upgrade');
  const newSearch = params.toString();
  window.history.replaceState({}, '', window.location.pathname + (newSearch ? `?${newSearch}` : ''));
  openPlanPicker();
}, [user, openPlanPicker]);
```

If the user arrives signed-out, `openPlanPicker()` should still open the modal — the PlanPicker itself handles redirect-to-auth on checkout attempt (verify quickly before committing; if it doesn't, gate the call behind `user` being present and ask the AuthModal to open first). Initial reading suggests `openPlanPicker` just sets a flag, so it should be safe either way.

### Versioning & changelog

9. Bump `chrome-extension/manifest.json` and `chrome-extension/package.json` to `1.0.10`. Add a CHANGELOG entry: "1.0.10 — In-draft row overlay (exposure %, correlation, tier badges) is now Pro-only. Free users keep sync and access the upgrade flow from the FAB panel."

### Edge cases

- **`fetchTier()` returns `null` (network / Supabase down):** Treat as non-Pro. The user can sign in / retry. Acceptable failure mode — we don't want to leak the overlay if we can't confirm Pro.
- **User signs out while overlay is rendering rows:** `handleSignOut` already clears caches; we additionally null `currentTier` and call `applyTierGate()` to strip injections.
- **Race between `startOverlay()` and first tier fetch:** `startOverlay()` short-circuits when `currentTier !== 'pro'`, then `refreshTier()` re-arms it once resolved. No flash of overlay before gating because the initial value is `null`, not `'pro'`.

### Out of scope

- Server-side enforcement (RLS on `extension_entries` already gates the data; the row overlay is purely client-side UX and we treat the gate as UX-tier, not security).
- Auto-PlanPicker triggering from inside the extension popup or content script — only via the web-app URL.
- Tier caching with TTL — fetches are cheap (one round-trip on panel open / page nav). Can be added later if it becomes a problem.

## Dependencies
None. ADR-001 (Stripe / Supabase subscription model) already defines tier derivation; `fetchTier()` in `bridge.js` already mirrors it.

## Resolved Decisions
1. Tournament Filter section is hidden for non-Pro users (collapsed/hidden along with the row overlay).
2. Analytics ping on Upgrade click is deferred to a follow-up task.

---
*Approved by: <!-- pending -->*
