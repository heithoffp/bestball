# TASK-175: Block DraftKings keyboard shortcuts from hijacking extension sign-in inputs

**Status:** Approved
**Priority:** P3

---

## Objective
Prevent DraftKings page-level keyboard shortcuts (e.g. "e" → Entrants) from firing when the user types in the extension's sign-in email/password fields. The keypress events bubble from the extension's injected inputs up to DK's document-level handlers, opening panels that close the extension's sign-in UI.

## Verification Criteria
1. Typing in the email and password fields of the extension's confidence panel on a DraftKings page does not trigger DK keyboard shortcuts.
2. Extension builds successfully.
3. Enter key in the password field still triggers sign-in.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/content/draft-overlay.js` | Modify | Add `stopPropagation()` on keydown/keypress/keyup for `.bbm-auth-input` elements |

## Implementation Approach
After the auth input elements are created in `renderAuthSection()`, attach `stopPropagation()` listeners for `keydown`, `keypress`, and `keyup` events on all `.bbm-auth-input` elements. This prevents keyboard events from bubbling to DraftKings' document-level shortcut handlers while preserving normal input behavior and the Enter-to-submit handler.

## Dependencies
None

---
*Approved by: PH — 2026-04-08*
