<!-- Completed: 2026-03-30 | Commit: a52594e -->
# TASK-010: Add feature-level usage analytics

**Status:** Pending Approval
**Priority:** P2
**Feature:** FEAT-003

---

## Objective

Instrument 9 key user interactions with custom analytics events via Vercel Analytics `track()`, providing visibility into which features drive engagement — critical for pricing tier decisions and product prioritization.

## Verification Criteria

1. All 9 events appear in the Vercel Analytics dashboard (or are visible as network requests to `/_vercel/insights/event` in browser DevTools) when the corresponding actions are performed.
2. No event payload contains PII (no email addresses, user IDs, names, or roster-specific data).
3. All call sites import from `utils/analytics.js` — no direct `@vercel/analytics` imports outside that file.

## Verification Approach

1. Run `npm run build` from `best-ball-manager/` — must complete with no errors.
2. Run `npm run dev`, open the app in a browser, and open the Network tab filtered to `/_vercel/insights`.
3. Trigger each event manually and confirm a network request fires with the correct event name:
   - Switch between tabs → `tab_viewed` (with `tab` property)
   - Upload a roster CSV → `csv_uploaded`
   - Change ADP snapshot date → `adp_snapshot_loaded`
   - Open Draft Asst tab → `draft_session_started`
   - Expand a roster in Roster Viewer → `roster_viewed`
   - Complete a signup flow → `auth_signup`
   - Complete a login flow → `auth_login`
   - Click subscribe/upgrade on PlanPicker → `subscription_checkout_started`
   - Apply a promo code → `promo_code_applied` (with `success: true/false` property)
4. Grep `src/` for direct `@vercel/analytics` imports outside `utils/analytics.js` — expect zero results.

Steps 1 and 4 can be run by Claude. Steps 2–3 require the developer to confirm in the browser.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/utils/analytics.js` | Create | Thin wrapper exporting `trackEvent(name, props)` around Vercel's `track()` |
| `best-ball-manager/src/App.jsx` | Modify | Fire `tab_viewed` on tab switch, `csv_uploaded` after successful roster parse, `adp_snapshot_loaded` on ADP date change |
| `best-ball-manager/src/components/AuthModal.jsx` | Modify | Fire `auth_signup` after successful email signup, `auth_login` after successful email or Google login |
| `best-ball-manager/src/contexts/SubscriptionContext.jsx` | Modify | Fire `subscription_checkout_started` at the top of `redirectToCheckout` before the fetch |
| `best-ball-manager/src/components/PlanPicker.jsx` | Modify | Fire `promo_code_applied` after promo code validation resolves (pass `{ success: true/false }`) |
| `best-ball-manager/src/components/RosterViewer.jsx` | Modify | Fire `roster_viewed` when a roster card is expanded (`setExpandedEntry` called with a non-null value) |
| `best-ball-manager/src/components/DraftFlowAnalysis.jsx` | Modify | Fire `draft_session_started` on component mount (tab is gated, so mount = user entered the feature) |

## Implementation Approach

1. **Create `utils/analytics.js`:**
   ```js
   import { track } from '@vercel/analytics';
   export function trackEvent(name, props = {}) {
     track(name, props);
   }
   ```
   This is the only file that imports from `@vercel/analytics`. All other files import `trackEvent` from here.

2. **`App.jsx` — tab_viewed:**
   In the tab `onClick` handler (`onClick={() => setActiveTab(key)}`), add `trackEvent('tab_viewed', { tab: key })` before or after the state update.

3. **`App.jsx` — csv_uploaded:**
   In `handleRosterUpload` (line ~176), after successful parse and state update, add `trackEvent('csv_uploaded')`. Do not include filename or roster count to avoid leaking portfolio size.

4. **`App.jsx` — adp_snapshot_loaded:**
   Locate where the ADP snapshot selection changes (the date picker or snapshot selector). Fire `trackEvent('adp_snapshot_loaded')` on change. No date value in the payload.

5. **`AuthModal.jsx` — auth_signup / auth_login:**
   - After the `signUpWithEmail` call succeeds (no error), fire `trackEvent('auth_signup')`.
   - After `signInWithEmail` or `signInWithGoogle` succeeds, fire `trackEvent('auth_login')`.
   - No email or user ID in the payload.

6. **`SubscriptionContext.jsx` — subscription_checkout_started:**
   At the top of `redirectToCheckout` (after the guard checks), fire `trackEvent('subscription_checkout_started')` before the fetch. No price ID or promo code in the payload.

7. **`PlanPicker.jsx` — promo_code_applied:**
   After promo code validation resolves, fire `trackEvent('promo_code_applied', { success: !error })`. No promo code value in the payload.

8. **`RosterViewer.jsx` — roster_viewed:**
   In the roster card click handler (line ~785: `setExpandedEntry(isOpen ? null : roster.entry_id)`), fire `trackEvent('roster_viewed')` when expanding (`!isOpen`). No entry ID in the payload.

9. **`DraftFlowAnalysis.jsx` — draft_session_started:**
   Add a `useEffect(() => { trackEvent('draft_session_started'); }, [])` at the top of the component. Since the tab is feature-gated and lazy-loaded, mount is a reliable proxy for entering the draft assistant.

## Dependencies

None — Vercel Analytics is already integrated via `<Analytics />` in `App.jsx`.

---

*Approved by: <!-- developer name/initials and date once approved -->*
