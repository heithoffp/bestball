<!-- Completed: 2026-03-31 | Commit: 67f5908 -->
# TASK-042: Chrome extension scaffold

**Status:** Approved
**Priority:** P1

---

## Objective

Set up the Chrome extension project shell — manifest v3, Vite build pipeline, background service worker, popup stub, content script, and the Platform Adapter Interface that enables cross-platform support. This is the foundation all subsequent extension tasks (TASK-043 through TASK-047) build on. Informed by the Chrome Extension Systems Model (`docs/systems-model/subsystems/chrome-extension-model.md`).

## Verification Criteria

1. Extension loads unpacked in Chrome (chrome://extensions, Developer mode) without errors or warnings.
2. Clicking the extension icon opens the popup showing "Best Ball Manager" title and placeholder auth status text.
3. Navigating to any `underdogfantasy.com` page logs `[BBM] Content script loaded on Underdog` to the console.
4. Platform Adapter Interface is defined in `src/adapters/interface.js` with JSDoc type definitions for all contract methods: `isMatch(url)`, `getEntries()`, `getDraftState()`, `getInjectionTarget()`, `getStyles()`, `getPlayerRows()`.
5. Underdog adapter stub in `src/adapters/underdog.js` implements all interface methods (returning placeholder values or throwing "not implemented").
6. MutationObserver utility in `src/utils/observer.js` exports a reusable `createReconnectingObserver()` function.
7. `npm run build` in `chrome-extension/` produces a `dist/` directory containing a valid, loadable extension.
8. `npm run dev` starts a dev server with HMR for the extension.

## Verification Approach

1. Run `cd chrome-extension && npm install && npm run build` — confirm it completes without errors and `dist/` contains `manifest.json`.
2. Inspect `dist/manifest.json` to confirm manifest v3 structure: `manifest_version: 3`, `permissions`, `host_permissions`, `background.service_worker`, `content_scripts` array.
3. Read `src/adapters/interface.js` and confirm all 6 interface methods are documented with JSDoc types.
4. Read `src/adapters/underdog.js` and confirm it implements all 6 interface methods.
5. Read `src/utils/observer.js` and confirm it exports `createReconnectingObserver`.
6. Read `src/background.js` and confirm it imports the adapter registry and has URL-matching logic.
7. **Developer step:** Load the extension unpacked in Chrome from `chrome-extension/dist/`, click the extension icon to verify the popup, and navigate to underdogfantasy.com to verify the console log.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/package.json` | Create | Node package with Vite + CRXJS dependencies |
| `chrome-extension/vite.config.js` | Create | Vite config with CRXJS plugin for manifest v3 |
| `chrome-extension/manifest.json` | Create | Chrome extension manifest v3 with Underdog host permissions |
| `chrome-extension/src/background.js` | Create | Service worker stub — URL detection, adapter routing |
| `chrome-extension/src/popup/popup.html` | Create | Minimal popup markup — title, status placeholder |
| `chrome-extension/src/popup/popup.js` | Create | Popup logic stub — placeholder status display |
| `chrome-extension/src/popup/popup.css` | Create | Lightweight popup styling — minimal, clean |
| `chrome-extension/src/content/content.js` | Create | Content script — logs injection, imports adapter |
| `chrome-extension/src/adapters/interface.js` | Create | Platform Adapter Interface with JSDoc contract |
| `chrome-extension/src/adapters/underdog.js` | Create | Underdog adapter stub implementing interface |
| `chrome-extension/src/adapters/registry.js` | Create | Adapter registry — maps URL patterns to adapters |
| `chrome-extension/src/utils/observer.js` | Create | Reusable MutationObserver with auto-reconnect |

## Implementation Approach

### 1. Project setup

Create `chrome-extension/` at repo root. Initialize `package.json` with:
- `@crxjs/vite-plugin` for Chrome extension Vite integration
- `vite` as build tool
- Scripts: `dev` (Vite dev with HMR), `build` (production build)

Create `vite.config.js` importing CRXJS plugin and pointing to `manifest.json`.

### 2. Manifest v3

Create `manifest.json` with:
- `manifest_version: 3`
- `name: "Best Ball Manager"`
- `version: "0.1.0"`
- `permissions: ["storage", "activeTab"]`
- `host_permissions: ["https://underdogfantasy.com/*"]`
- `background.service_worker` pointing to `src/background.js`
- `content_scripts` array matching `https://underdogfantasy.com/*` loading `src/content/content.js`
- `action.default_popup` pointing to `src/popup/popup.html`

### 3. Platform Adapter Interface (`src/adapters/interface.js`)

Define the contract using JSDoc `@typedef` and `@callback` annotations. This is the key architectural artifact from the systems model (finding F-003). The interface defines:

```
PlatformAdapter {
  isMatch(url: string): boolean
    — Returns true if this adapter handles the given URL

  getEntries(): Promise<Entry[]>
    — Scrapes roster/entry data from the platform's entries page
    — Entry: { entryId, players: [{name, position, team, pick, round}], tournamentTitle, draftDate }

  getDraftState(): DraftState
    — Reads current live draft state from the DOM
    — DraftState: { currentPick, currentRound, draftSlot, availablePlayers: [{name, position, team, adp}], myPicks: [{name, position, round}] }

  getInjectionTarget(): Element | null
    — Returns the DOM element where the overlay should be injected
    — Must return a stable parent that survives React re-renders

  getStyles(): object
    — Returns platform-specific CSS properties (font-family, font-size, colors)
    — Overlay uses these to blend in with the native site (finding F-001)

  getPlayerRows(): NodeList | Element[]
    — Returns the DOM elements representing individual player rows on the draft board
    — Used for inline annotation injection
}
```

### 4. Underdog adapter stub (`src/adapters/underdog.js`)

Implements `PlatformAdapter` with all 6 methods. Each method either:
- Returns a sensible placeholder (e.g., `isMatch` checks for `underdogfantasy.com`)
- Throws `new Error('Not implemented — see TASK-044/046')` for scraping methods

`isMatch()` is the only method with real logic — it checks the URL hostname.

### 5. Adapter registry (`src/adapters/registry.js`)

Array of registered adapters. Exports `getAdapterForUrl(url)` which iterates adapters and returns the first where `isMatch(url)` returns true, or null.

### 6. Background service worker (`src/background.js`)

Stub that:
- Listens for `chrome.tabs.onUpdated` events
- Calls `getAdapterForUrl(tab.url)` to detect supported platforms
- Logs which adapter matched (or "no adapter" for unsupported URLs)
- Future: will route messages to the correct adapter

### 7. Content script (`src/content/content.js`)

Minimal script that:
- Logs `[BBM] Content script loaded on Underdog` to console
- Imports and identifies the correct adapter via the registry
- Sets up the MutationObserver base (from `utils/observer.js`) watching for DOM changes

### 8. Popup (`src/popup/`)

Vanilla HTML/JS — no framework:
- `popup.html`: Simple markup with extension name, version, placeholder status text ("Not connected"), and a placeholder login area
- `popup.js`: Reads chrome.storage for any stored state, updates status text
- `popup.css`: Minimal clean styling — system fonts, compact layout, dark/neutral theme

### 9. MutationObserver utility (`src/utils/observer.js`)

Exports `createReconnectingObserver({ targetSelector, onMutation, onReconnect })`:
- Finds the target element by selector
- Creates a MutationObserver watching for `childList` and `subtree` changes
- If the target element is removed from DOM (React re-render), polls briefly to find it again and re-attaches
- Calls `onReconnect()` when re-attachment succeeds so the adapter can re-inject UI

This addresses finding F-009 from the systems model.

## Dependencies

None.

## Open Questions

- CRXJS v2 (beta) supports manifest v3 natively. If stability is an issue, fallback to manual Vite config with `rollup-plugin-chrome-extension`. Will evaluate during implementation and note if a switch is needed.
- Exact `host_permissions` for DraftKings TBD — not needed for this task (Underdog only).

---
*Approved by: <!-- developer name/initials and date once approved -->*
