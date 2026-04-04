# TASK-130: Sync progress bar in FAB overlay panel

**Status:** Pending Approval
**Priority:** P3

---

## Objective

When the user clicks "Sync Now" in the FAB overlay panel, show a visual progress bar and label so they can track the sync in progress, rather than just seeing a disabled button and waiting blindly.

## Verification Criteria

1. Clicking "Sync Now" immediately shows "Discovering entries…" text and an indeterminate shimmer bar — the button is disabled while the bar is visible.
2. Once the total draft count is known, the label updates to "Processing N / M entries…" and the bar fills determinately as each draft is fetched.
3. When sync completes, the progress bar hides and the success text ("Synced X entries") appears as before.
4. When sync fails, the progress bar hides and the error message appears as before.
5. No regressions to sign-in, sign-out, error handling, or tournament filter behaviour.

## Verification Approach

1. Developer loads the extension on the Underdog completed entries page.
2. Developer opens the FAB panel, confirms they are signed in, and clicks "Sync Now".
3. Developer confirms:
   a. "Discovering entries…" label and shimmer bar appear immediately.
   b. Label transitions to "Processing N / M entries…" with a filling bar once drafts are enumerated.
   c. On completion the bar disappears and the success count line appears.
4. Developer retries after navigating away from the completed-entries page and confirms the error path still shows the correct message with no dangling progress bar.

Steps require the developer — Claude cannot execute a live browser test.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/injected/underdog-bridge.js` | Modify | Emit `BBM_SYNC_PROGRESS` postMessages at discovery start, fetching start, and after each draft processed |
| `chrome-extension/src/content/draft-overlay.js` | Modify | Add progress bar HTML to `renderAuthSection()`; add/remove `window` progress listener in `handleSync()`; add CSS to `injectStyles()` |

## Implementation Approach

### 1. `underdog-bridge.js` — emit progress messages

Inside `syncEntries()`:

**a. Discovery phase** — emit immediately after the token check, before the first API call:
```js
window.postMessage({ type: 'BBM_SYNC_PROGRESS', phase: 'discovery' }, '*');
```

**b. Fetching phase start** — after `draftMeta` is fully built (all slates, tournament rounds, and pages fetched), emit:
```js
window.postMessage({ type: 'BBM_SYNC_PROGRESS', phase: 'fetching', done: 0, total: draftMeta.length }, '*');
```

**c. Fetching increment** — inside the `draftMeta` loop, after a draft is successfully resolved and pushed to `entries` (or skipped), emit:
```js
window.postMessage({ type: 'BBM_SYNC_PROGRESS', phase: 'fetching', done: i + 1, total: draftMeta.length }, '*');
```
where `i` is the loop index. Emit on both success and continue (skip) paths so the bar always reaches 100% before `BBM_SYNC_RESULT` fires.

### 2. `draft-overlay.js` — progress bar HTML

In `renderAuthSection()`, replace the single `bbm-sync-result` div in the authenticated branch with two sibling elements:
```html
<div id="bbm-sync-progress" class="bbm-sync-progress bbm-progress-indeterminate" style="display:none">
  <div class="bbm-progress-label">Discovering entries…</div>
  <div class="bbm-progress-bar-wrap">
    <div class="bbm-progress-bar-fill"></div>
  </div>
</div>
<div id="bbm-sync-result" class="bbm-sync-result" style="display:none"></div>
```

### 3. `draft-overlay.js` — `handleSync()` progress listener

Before calling `syncCallback()`, register a `window` message listener:

```js
const progressEl = document.getElementById('bbm-sync-progress');
const progressLabel = progressEl?.querySelector('.bbm-progress-label');
const progressFill = progressEl?.querySelector('.bbm-progress-bar-fill');

function onProgress(event) {
  if (event.source !== window || event.data?.type !== 'BBM_SYNC_PROGRESS') return;
  const { phase, done, total } = event.data;

  if (!progressEl) return;
  progressEl.style.display = 'block';

  if (phase === 'discovery') {
    progressEl.classList.add('bbm-progress-indeterminate');
    if (progressLabel) progressLabel.textContent = 'Discovering entries\u2026';
    if (progressFill) progressFill.style.width = '0%';
  } else if (phase === 'fetching') {
    progressEl.classList.remove('bbm-progress-indeterminate');
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;
    if (progressLabel) progressLabel.textContent = `Processing ${done} / ${total} entries\u2026`;
    if (progressFill) progressFill.style.width = pct + '%';
  }
}

window.addEventListener('message', onProgress);
```

In `finally`, always remove the listener and hide the progress bar:
```js
window.removeEventListener('message', onProgress);
if (progressEl) progressEl.style.display = 'none';
```

The success/error result display path is unchanged — just show `resultEl` as before.

### 4. `draft-overlay.js` — CSS in `injectStyles()`

Add the following rules to the injected `<style>` block (place after `.bbm-sync-result.error`):

```css
.bbm-sync-progress {
  margin-bottom: 6px;
}
.bbm-progress-label {
  font-size: 10px;
  color: #8A9BB5;
  margin-bottom: 3px;
}
.bbm-progress-bar-wrap {
  width: 100%;
  height: 4px;
  background: #1a2d50;
  border-radius: 2px;
  overflow: hidden;
}
.bbm-progress-bar-fill {
  height: 100%;
  width: 0%;
  background: linear-gradient(90deg, #D4A843, #F0CC5B);
  border-radius: 2px;
  transition: width 0.2s ease;
}
@keyframes bbm-shimmer {
  0%   { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}
.bbm-progress-indeterminate .bbm-progress-bar-fill {
  width: 25%;
  animation: bbm-shimmer 1.4s ease-in-out infinite;
}
```

### Edge cases

- If `draftMeta` is empty (user has no best-ball slates), `total` will be 0 and `BBM_SYNC_RESULT` fires immediately — the bar will flash briefly then hide, which is acceptable.
- The `onProgress` listener is always removed in `finally`, so no memory leak if sync errors early before any progress messages are emitted.
- `progressEl` null checks throughout guard against re-renders that might have removed the element.

## Dependencies

None.

---
*Approved by: PH — 2026-04-04*
