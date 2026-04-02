<!-- Completed: 2026-04-02 | Commit: pending -->
# TASK-046: Draft overlay scaffold

**Status:** Approved
**Priority:** P2

---

## Objective

Build the content script and inline injection system that augments Underdog's live draft player list with portfolio context (exposure %, roster count). The injected elements must survive react-virtualized row recycling, feel native to Underdog's UI, and be togglable. No advisory logic — data display only per ADR-002.

## Verification Criteria

1. On `https://app.underdogfantasy.com/draft/{uuid}`, each visible player row in the draft board shows an injected inline element with placeholder portfolio data (e.g., "3/12 rosters | 25%").
2. Scrolling the virtualized player list correctly updates injected content as rows are recycled — no stale data, no double-injection, no missing injections on newly visible rows.
3. The overlay is togglable via the extension popup (on/off toggle persisted in `chrome.storage.local`). When off, no elements are injected.
4. Injected elements visually match Underdog's dark theme — same font family, appropriate sizing, no layout disruption to existing row content (row height remains 57px).
5. The overlay does not inject on non-draft pages (e.g., `/completed`, `/lobby`).
6. Extension builds successfully with `npm run build` in `chrome-extension/`.

## Verification Approach

1. Run `cd chrome-extension && npm run build` — must complete with no errors.
2. Load the built extension in Chrome (`chrome://extensions` → Load unpacked → `dist/`).
3. Navigate to a live or mock Underdog draft page. Verify injected elements appear in each player row.
4. Scroll the player list up and down rapidly — verify no double-injected elements (check for duplicate `[data-bbm-injected]` on any row), no stale content, and consistent injection on all visible rows.
5. Open the extension popup, toggle the overlay off. Verify all injected elements are removed. Toggle back on — verify they reappear.
6. Navigate to `https://app.underdogfantasy.com/completed` — verify no injection occurs.
7. Steps 2-6 require the developer (browser interaction with a live Underdog session).

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/content/draft-overlay.js` | Create | Draft page detection, MutationObserver on virtualized list, inline injection/cleanup logic |
| `chrome-extension/src/content/draft-overlay.css` | Create | Styles for injected elements matching Underdog dark theme |
| `chrome-extension/src/adapters/underdog.js` | Modify | Implement `getInjectionTarget()` and `getPlayerRows()` methods using stable selectors |
| `chrome-extension/src/content/content.js` | Modify | Wire up draft-overlay activation when on a draft page |
| `chrome-extension/src/popup/popup.html` | Modify | Add overlay on/off toggle switch |
| `chrome-extension/src/popup/popup.js` | Modify | Handle toggle state, persist to `chrome.storage.local`, message content script |
| `chrome-extension/manifest.json` | Modify | Add `draft-overlay.css` to content script resources if needed |

## Implementation Approach

### 1. Draft page detection

In `content.js`, detect draft pages by checking `window.location.pathname` against `/draft/` prefix. Only activate draft overlay logic on matching pages. Use existing adapter pattern — add an `isDraftPage()` method to the Underdog adapter.

### 2. Underdog adapter — implement stubs

In `underdog.js`:
- `getInjectionTarget()`: Return the virtualized list container using `document.querySelector('[role="grid"]')` (HIGH stability selector).
- `getPlayerRows()`: Return all currently rendered player rows via `document.querySelectorAll('[data-testid="player-cell-wrapper"]')`.
- Add `isDraftPage()`: Return `true` if pathname starts with `/draft/`.

### 3. Draft overlay core (`draft-overlay.js`)

**Initialization:**
- Check `chrome.storage.local` for `overlayEnabled` flag (default: `true`).
- Wait for the virtualized list container to appear (use existing `ReconnectingObserver` targeting `[role="grid"]`).
- Once found, begin the injection loop.

**Injection logic:**
- Query all `[data-testid="player-cell-wrapper"]` rows in the list container.
- For each row:
  - If `row.hasAttribute('data-bbm-injected')`, check if `data-id` matches the stored player ID. If different (row was recycled), update the injected content. If same, skip.
  - If no `data-bbm-injected` attribute, create and inject the overlay element.
- The injected element is a small `<span>` appended to the `[class*="rightSide"]` container (next to ADP/Proj stats), styled to look like a native stat column.
- Set `data-bbm-injected` and `data-bbm-player-id` attributes on the row.

**Handling virtualized recycling:**
- Attach a `MutationObserver` to the inner scroll container (`ReactVirtualized__Grid__innerScrollContainer`) watching for `childList` changes (rows added/removed) and `attributes` changes on child divs (position updates when rows are recycled).
- On mutation, re-run the injection sweep on all visible rows.
- Use `requestAnimationFrame` to batch rapid mutations (debounce).

**Placeholder data:**
- For now, injected elements show static placeholder text: "-- | --%"
- The `data-id` attribute on each row provides the player UUID for future data lookup.

### 4. Styles (`draft-overlay.css`)

- **Theme-adaptive colors:** Do not hardcode text colors. Instead, inherit from the surrounding Underdog UI by using `color: inherit` with reduced `opacity` (e.g., `0.6`) for a muted secondary-text look. This works correctly in both Underdog's dark and light themes.
- If `color: inherit` doesn't produce good contrast in both themes, fall back to reading the computed color of an existing stat value element (`[class*="statValue"]`) and applying it to injected elements.
- `background: transparent`, `font-family: inherit`, `font-size: 11px`.
- Injected element sits inline within the rightSide container, using `flex-shrink: 0` and a fixed width (~60px) to avoid layout shift.
- No change to row height (57px must be preserved).

### 5. Toggle mechanism

- Add a toggle switch to `popup.html` labeled "Draft Overlay" with an on/off state.
- `popup.js` reads/writes `overlayEnabled` in `chrome.storage.local`.
- On toggle change, send a message to the active tab's content script: `{ type: 'TOGGLE_OVERLAY', enabled: boolean }`.
- `draft-overlay.js` listens for this message. When disabled, remove all `[data-bbm-injected]` elements and disconnect the observer. When enabled, re-initialize.
- On page load, `draft-overlay.js` reads the stored flag before initializing.

### 6. Cleanup

- When navigating away from a draft page (detected via URL change or page unload), disconnect all observers and remove injected elements.
- The `ReconnectingObserver`'s built-in disconnect handles observer cleanup.

## Dependencies

- TASK-042 (extension scaffold) — Done
- ADR-002 (Mirror Not Advisor) — overlay shows data only, no scoring

## Open Questions

- **Player ID mapping:** The `data-id` on Underdog rows is an Underdog-internal UUID. Mapping this to our portfolio data (which uses `stableId()` based on player names) will require a name-based lookup from the injected row's player name text. This mapping is out of scope for TASK-046 (placeholder data only) but is a known integration point for the data-wiring task.

---
*Approved by: PH — 2026-04-02*
