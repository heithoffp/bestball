# TASK-233: Fix DK roster panel virtualization breaking correlation/stack on scroll

**Status:** Approved
**Priority:** P2

---

## Objective
Stop DraftKings overlay correlation values and stack pills from collapsing when the user scrolls the roster panel. The current implementation reads picks from a virtualized table (react-base-table), so off-screen rows are unmounted and treated as removed picks. Fix by changing the picks accumulator to additively merge observed picks during a draft session, never shrinking the list while on the same draft page.

## Verification Criteria
1. On a live DK best-ball draft page with at least 8 picks made (enough that the roster panel overflows), scrolling the roster panel up and down does **not** change any reported correlation values on the player list.
2. On the same draft state, scrolling the roster panel up and down does **not** cause stack pills on the player list to appear or disappear.
3. Round numbers reported in the overlay (used for round-tagged correlation) match the actual round in which each player was drafted — confirmed by spot-checking 3 picks against the DK draft history. No off-by-N caused by virtualization.
4. Navigating from one live draft to another in the same browser session results in `currentPicks` being reset for the new draft — verified by drafting a player on Draft B and confirming correlation reflects only Draft B's picks (no carryover from Draft A).
5. Underdog behavior is unchanged — UD draft overlay correlation/stack pills behave identically to today.
6. No console errors from the extension during a draft session with scrolling.

## Verification Approach
1. **Static check.** Run `cd chrome-extension && npm run lint` (or the equivalent if no lint script — `node --check src/adapters/draftkings.js src/content/draft-overlay.js`). Must exit clean.
2. **Manual — DK roster panel scroll (developer step).** Load the unpacked extension at the current branch. Open a live DK best-ball draft with the roster panel partially scrolled. Observe a portfolio player on the player list who is correlated to a roster pick currently scrolled off-screen. Scroll up and down repeatedly; confirm the correlation value and stack pill remain stable across scrolls.
3. **Manual — round accuracy (developer step).** Pick 3 players already drafted, note their actual round per DK's own roster panel, then check the round used by the overlay (visible via the correlation tooltip if applicable, or by logging `currentPicks` in DevTools console: `bbmDebug.getCurrentPicks?.()` — add this debug hook in implementation step 6 if it does not exist). Confirm rounds match.
4. **Manual — draft-to-draft reset (developer step).** Navigate from one draft URL to another. Confirm correlation values on Draft B do not include any Draft A picks. (Quick check: a player on Draft A's roster who is NOT on Draft B's roster should have 0% correlation in Draft B.)
5. **Manual — Underdog regression (developer step).** Open a live UD best-ball draft. Confirm correlation and stack pills work as they did before. (Underdog code path is the fallback branch in `resolveCurrentPicks` and should not be touched by this change.)
6. **Manual — no console errors (developer step).** Open DevTools on both DK and UD draft pages. Confirm no errors emitted by `[BBM]` prefix during normal use including scrolling.

Steps 1 is run by Claude. Steps 2–6 require the developer on a live draft (no automated test harness exists for live draft pages in this repo).

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/content/draft-overlay.js` | Modify | Change `resolveCurrentPicks` to additively merge picks (de-duped by canonical resolved key) instead of replacing the whole list. Reset state in `stopPicksObserver`. |
| `chrome-extension/src/adapters/draftkings.js` | Modify | In `getCurrentPicks()`, derive `round` from `aria-rowindex` when present (or other stable row-index attribute) instead of `idx + 1` over the visible-row subset. Update JSDoc to document the virtualization caveat. |
| `chrome-extension/CHANGELOG.md` | Modify | Add entry under the next release section noting the fix. |

(No interface contract changes — `getCurrentPicks` keeps the same signature.)

## Implementation Approach

### Background context to confirm during implementation
- The DK adapter's `getCurrentPicks` is invoked from `resolveCurrentPicks` (chrome-extension/src/content/draft-overlay.js:703-734) on every body mutation, RAF-debounced.
- `stopPicksObserver` (chrome-extension/src/content/draft-overlay.js:763-773) already resets `currentPicks = []` and is called by `stopOverlay`, which fires on SPA navigation off a draft page (around line 2120). So draft-to-draft reset is already wired — we just need to make sure any new state we add is also cleared there.

### Step 1 — Adjust `getCurrentPicks` in DK adapter
- Inspect a live DK roster row in DevTools to confirm whether `aria-rowindex` is set on `[role="row"].BaseTable__row`. react-base-table normally sets it, but verify before depending on it. Fall back to `data-row-index` or any DK-specific attribute if `aria-rowindex` is absent.
- Change `round: idx + 1` to read the row-index attribute (1-based) when available; otherwise fall back to `idx + 1` but **flag** that this row may have an unreliable round by setting `round: null` (and let the consumer treat null as "round unknown — keep the previously-recorded round").
- Update JSDoc on `getCurrentPicks` to note that the returned list is the *visible subset* of a virtualized table and is intended to be consumed by an accumulator on the caller side.

### Step 2 — Convert `resolveCurrentPicks` to an accumulator (chrome-extension/src/content/draft-overlay.js:703)
- Introduce a module-scoped map `pickRegistry = new Map()` keyed by the resolved canonical pick key (the lowercase canonical name produced by `resolvePlayerKey`), valued by `{ name, position, round }`.
- On each invocation: build `currentVisiblePicks` exactly as today (resolving names via `resolvePlayerKey`), but instead of comparing length/identity and replacing `currentPicks`, iterate `currentVisiblePicks` and:
  - If a pick's resolved key is **not** in `pickRegistry`, add it.
  - If a pick's resolved key **is** in `pickRegistry`, update its `round` only when the existing stored round is `null` or `0` and the newly-observed round is a positive integer. Otherwise leave it untouched.
- Rebuild `currentPicks` from `pickRegistry` values in stable insertion order (Map preserves insertion order, which approximates draft order well enough for stack/correlation; round number is the authoritative ordering signal for any downstream code that needs it).
- Compute `changed` against the *previous* `currentPicks` array (by length and member key-set). Only call `sweepRows()` when the registry actually grew or a `round` was filled in for a previously-unknown pick.

### Step 3 — Reset accumulator on draft change
- Clear `pickRegistry` inside `stopPicksObserver` alongside `currentPicks = []`. Because `stopOverlay` → `stopPicksObserver` fires on SPA navigation off a draft page (and the SPA navigation handler re-calls `startOverlay` on the new draft), this is the single chokepoint for reset.
- Add a brief comment at the registry definition citing why the accumulator exists (one short line: "DK virtualizes the roster panel — see TASK-233"). No multi-line doc block.

### Step 4 — Defensive: confirm Underdog code path is untouched
- The fallback branch (`else` at draft-overlay.js:713-724) builds picks from `[class*="playerPickCell"]` and uses `idx + 1` for round. UD's pick cell list is not virtualized — verify visually in DevTools that all picks are rendered regardless of scroll. If they are, leave UD's path alone; the accumulator will still operate on its output but will be a no-op since the full picks list is always present.
- If UD is *also* virtualized (unlikely based on user report — UD is not affected by this bug), document the finding and stop; do not extend the fix to UD without a separate confirmation.

### Step 5 — Edge case: pick removed from roster
- DK best-ball drafts do not permit removing a pick mid-draft, so the accumulator's monotonic growth is correct for the lifetime of one draft. If a user somehow ends up on a stale draft state (e.g., reconnecting after a network drop and DK reorders the roster), `stopOverlay`/`startOverlay` on any navigation will reset state.
- Do **not** add complex reconciliation logic to handle pick removal — the cost (complexity, false positives on transient DOM states) exceeds the benefit (a scenario that does not occur in best-ball play).

### Step 6 — Optional debug hook (only if it makes verification practical)
- If verification steps 2–6 will be easier with a console-accessible inspector, expose `window.__bbmDebug = { getCurrentPicks: () => [...currentPicks], getRegistry: () => [...pickRegistry.entries()] }` inside a `try/catch` so it never fails in production. Gate it behind `manifest.json` having `"version_name"` containing `"dev"` or some equivalent — or just skip the hook and rely on visual scroll behavior + DK's own roster panel for verification.
- Default: skip unless needed; do not ship debug surface for its own sake.

### Step 7 — Update CHANGELOG
- Append a one-line entry under the next unreleased section: "Fix DK overlay correlation/stack disappearing when scrolling the roster panel (virtualization bug)."

### Step 8 — Manual verification
- Per the Verification Approach. Do not mark Done until the developer confirms the manual steps.

## Dependencies
None.

## Open Questions

### Phase 2 follow-on (recommended as a separate task)
The durable fix is to read picks from `api.draftkings.com/drafts/v1/{contestId}/entries/{userContestId}/draftStatus?format=json` — the same endpoint already used by `getEntries()` for completed-contest sync (chrome-extension/src/adapters/draftkings.js:185-216). On the live-draft page we would need:
- A way to derive `contestId` and `userContestId` from the live-draft URL or embedded page state (the sync flow parses these from `/mycontests` HTML, which is not directly available on the draft page).
- Polling cadence (likely event-driven via the existing picks mutation observer, with a low-frequency timer fallback).
- Decision on whether to keep the DOM accumulator as a fallback for transient API failures, or remove it entirely.

This is intentionally **out of scope** for TASK-233 because the contestId/userContestId discovery on the live page is an unknown that warrants its own investigation. Suggest filing as a new task after this one ships, with title "DK live-draft picks via draftStatus API (durable replacement for DOM accumulator)".

### Investigation needed during implementation
- Confirm `aria-rowindex` is set on DK BaseTable rows (Step 1). If not, decide whether to ship with `round: null` for unknown rounds, or fall back to position-in-visible-set with a known caveat.

---
*Approved by: <!-- developer name/initials and date once approved -->*
