# TASK-100: Draft overlay — floating logo button in bottom-left for configuration

**Status:** Approved
**Priority:** P3

---

## Objective

Inject a small, muted BBM icon (fixed, bottom-left) into every Underdog draft page.
Clicking it opens a compact inline panel with an overlay on/off toggle, giving users a way
to control the overlay without leaving the draft or opening the extension popup.

## UI/UX Guide Note

The guide prohibits "floating overlay panels during live drafts" — meaning data/analytics
panels that clutter the draft view. This feature is a configuration affordance, not a data
panel. The FAB is intentionally designed to be invisible at rest: low opacity, no gold accent,
no animation — it only reveals itself on hover. This is an accepted, narrow exception.

## Verification Criteria

1. On any `/draft/<id>` page, a `#bbm-fab` button is present in the bottom-left corner.
   At rest it is visually subtle (low opacity) — not a prominent element.
2. On hover, the FAB becomes clearly visible (opacity increases to 1).
3. Clicking the FAB opens `#bbm-panel` directly above it; clicking it again closes the panel.
4. The panel contains an "Overlay" toggle checkbox. Its checked state reflects the current
   `overlayEnabled` value from `chrome.storage.local`.
5. Unchecking the toggle removes all injected row cells and headers (same effect as toggling
   off via popup). Rechecking re-injects them.
6. After toggling via the FAB panel, opening the extension popup shows the overlay toggle in
   the same state (they share `chrome.storage.local`).
7. Clicking outside `#bbm-fab` / `#bbm-panel` closes the panel.
8. Pressing ESC while the panel is open closes the panel.
9. The FAB remains visible when the overlay is toggled off (so the user can re-enable it).
10. No visual regressions in existing row injection (Exp / Corr columns unaffected).

## Verification Approach

1. Build the extension: `cd chrome-extension && npm run build` — must complete with no errors.
2. Developer loads the unpacked extension in Chrome and navigates to a live Underdog draft page.
3. Developer confirms FAB is subtle at rest, clearly visible on hover.
4. Developer confirms: clicking FAB opens panel → panel shows "Overlay" toggle → toggling off
   removes Exp/Corr columns → toggling on restores them.
5. Developer confirms: clicking outside panel closes it; pressing ESC closes it.
6. Developer opens extension popup and confirms overlay toggle state matches the FAB panel state.

Step 1 is run by Claude. Steps 2–6 require the developer.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/content/draft-overlay.js` | Modify | Add FAB + panel injection, restructure style/lifecycle |

## Implementation Approach

### 1. Move `injectStyles()` from `startOverlay()` to `initDraftOverlay()`

Currently `injectStyles()` is called at the top of `startOverlay()`, and `removeStyles()` is
called from `stopOverlay()`. This would strip FAB styles when the overlay is toggled off.
Decouple styles from the overlay lifecycle:

- Call `injectStyles()` in `initDraftOverlay()` instead, unconditionally.
- Remove `injectStyles()` from `startOverlay()`.
- Remove `removeStyles()` from `stopOverlay()` — styles persist for the FAB's page lifetime.
- `removeStyles()` is called only from `removeFloatingButton()` (full page teardown).

### 2. FAB and panel CSS — added to `injectStyles()`

Design notes:
- FAB is 28×28px (small — less than half the size of a typical browser FAB).
- At rest: `opacity: 0.25` — nearly invisible, just a ghost in the corner.
- On hover: `opacity: 1` + subtle border brightens — reveals itself without animating in.
- No gold. No glow. Colors use design system token hex values hardcoded (CSS vars not
  available in injected context):
  - Background: `#0C1A30` (surface-1)
  - Border: `#1A2D50` (border-subtle), brightens to `#243A5C` (border-default) on hover
  - Panel text: `#E8E8E8` (text-primary), `#8A9BB5` (text-secondary)
- Transition: `opacity 120ms ease` (matches `--duration-fast` token).

```css
/* FAB — muted config button, bottom-left */
#bbm-fab {
  position: fixed;
  bottom: 14px;
  left: 14px;
  z-index: 10000;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: #0C1A30;
  border: 1px solid #1A2D50;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  opacity: 0.25;
  transition: opacity 120ms ease, border-color 120ms ease;
  box-shadow: 0 1px 4px rgba(0,0,0,0.4);
}
#bbm-fab:hover {
  opacity: 1;
  border-color: #243A5C;
}

/* Configuration panel — compact, only on demand */
#bbm-panel {
  display: none;
  position: fixed;
  bottom: 50px;
  left: 14px;
  z-index: 10000;
  background: #0C1A30;
  border: 1px solid #243A5C;
  border-radius: 8px;
  padding: 10px 14px;
  min-width: 160px;
  box-shadow: 0 6px 20px rgba(0,0,0,0.5);
  font-size: 12px;
  color: #E8E8E8;
}
#bbm-panel.open {
  display: block;
}
.bbm-panel-title {
  font-size: 9px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #8A9BB5;
  margin-bottom: 8px;
}
.bbm-panel-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.bbm-panel-label {
  font-size: 12px;
  font-weight: 600;
  color: #E8E8E8;
}
#bbm-overlay-toggle {
  cursor: pointer;
  width: 14px;
  height: 14px;
  accent-color: #E8BF4A;
}
```

### 3. `injectFloatingButton()`

```js
function injectFloatingButton() {
  if (document.getElementById('bbm-fab')) return;

  const fab = document.createElement('button');
  fab.id = 'bbm-fab';
  fab.title = 'Best Ball Manager';
  // Small BBM circle icon — muted white, no gold
  fab.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="8" cy="8" r="7" stroke="rgba(255,255,255,0.6)" stroke-width="1.2"/>
    <text x="8" y="11.5" text-anchor="middle" font-family="monospace" font-size="5.5" font-weight="700" fill="rgba(255,255,255,0.7)">BBM</text>
  </svg>`;

  const panel = document.createElement('div');
  panel.id = 'bbm-panel';
  panel.innerHTML = `
    <div class="bbm-panel-title">Best Ball Manager</div>
    <div class="bbm-panel-row">
      <label class="bbm-panel-label" for="bbm-overlay-toggle">Overlay</label>
      <input type="checkbox" id="bbm-overlay-toggle" />
    </div>
  `;

  const toggle = panel.querySelector('#bbm-overlay-toggle');
  toggle.checked = enabled;

  fab.addEventListener('click', (e) => {
    e.stopPropagation();
    panel.classList.toggle('open');
  });

  toggle.addEventListener('change', () => {
    enabled = toggle.checked;
    chrome.storage.local.set({ overlayEnabled: enabled });
    if (enabled) {
      startOverlay();
    } else {
      stopOverlay();
    }
  });

  document.body.appendChild(fab);
  document.body.appendChild(panel);
}
```

### 4. `removeFloatingButton()`

```js
function removeFloatingButton() {
  document.getElementById('bbm-fab')?.remove();
  document.getElementById('bbm-panel')?.remove();
  removeStyles();
}
```

### 5. Click-outside and ESC in `initDraftOverlay()`

```js
document.addEventListener('click', () => {
  document.getElementById('bbm-panel')?.classList.remove('open');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.getElementById('bbm-panel')?.classList.remove('open');
  }
});
```

The FAB click handler uses `e.stopPropagation()` to prevent the document listener from
immediately closing the panel on the same click that opened it.

### 6. Updated `initDraftOverlay()`

```js
export function initDraftOverlay() {
  if (!isDraftPage()) return;

  chrome.storage.local.get(['overlayEnabled'], (result) => {
    enabled = result.overlayEnabled !== false;

    injectStyles();
    injectFloatingButton();

    if (enabled) startOverlay();

    document.addEventListener('click', () => {
      document.getElementById('bbm-panel')?.classList.remove('open');
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        document.getElementById('bbm-panel')?.classList.remove('open');
      }
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.type !== 'TOGGLE_OVERLAY') return;
    enabled = message.enabled;
    const toggle = document.getElementById('bbm-overlay-toggle');
    if (toggle) toggle.checked = enabled;
    if (enabled) {
      startOverlay();
    } else {
      stopOverlay();
    }
  });
}
```

### 7. Clean up `startOverlay()` and `stopOverlay()`

- Remove `injectStyles()` from `startOverlay()`.
- Remove `removeStyles()` from `stopOverlay()`.

## Dependencies

- TASK-096 — Live draft overlay (Done)

## Open Questions

- **z-index risk:** Underdog may have fixed modals above z-index 10000 that clip the FAB.
  Acceptable risk — bump the value in a follow-up if observed.
- **Popup sync:** The popup reads `overlayEnabled` on open so it stays in sync without a
  message. The existing `TOGGLE_OVERLAY` listener handles the popup→page direction.

---
*Approved by: <!-- developer name/initials and date once approved -->*
