<!-- Completed: 2026-03-29 | Commit: pending -->
# TASK-023: Add visual indicator for demo/sample data mode

**Status:** Pending Approval
**Priority:** P2

---

## Objective
When the app displays bundled sample data (not user-uploaded data), show a persistent banner across all tabs making this obvious, with a prompt to upload real data.

## Verification Criteria
1. When no user data exists (fresh load), a banner appears at the top of the content area indicating sample data is displayed.
2. The banner includes a call-to-action that triggers the roster upload flow.
3. After uploading real data, the banner disappears.
4. The banner is visible on all tabs, not just Dashboard.
5. The banner does NOT show when there is no data at all (empty state) — only when sample roster data is actively rendered.

## Verification Approach
1. Run `npm run build` from `best-ball-manager/` — must succeed with no errors.
2. Developer manually tests: load app with no stored data — banner should appear only if sample roster data is rendered. Upload a roster CSV — banner should disappear.
3. Navigate between tabs while in demo mode — banner should persist on each tab.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/App.jsx` | Modify | Add `isUsingDemoData` state, set it in load paths, render banner above tab content |
| `best-ball-manager/src/index.css` | Modify | Add banner styles (uses existing CSS variable system) |

## Implementation Approach
1. Add `const [isUsingDemoData, setIsUsingDemoData] = useState(false)` in App.jsx.
2. Set `setIsUsingDemoData(true)` at the end of `loadFromAssets()` and `setIsUsingDemoData(false)` at the end of `loadFromStorage()`.
3. Render a banner in App.jsx above the tab content area when `isUsingDemoData && rosterData.length > 0`.
4. Banner content: info icon + "You're viewing sample data." + "Upload your rosters" label wrapping a hidden file input for direct upload.
5. Style using existing CSS variables for visual consistency.

## Design Discussion (2026-03-29)
Developer and Claude discussed whether bundled demo roster data is necessary for the first-run experience. Conclusion: **demo data is not the right approach** for this audience. Reasons:
- Best-ball drafters are savvy — they know what they signed up for
- Fake portfolios don't demonstrate the "mirror" value (the value is in *your* portfolio)
- Maintaining realistic demo data is ongoing work; stale demo data looks worse than none
- Risk of confusing users ("is this my data?")

**Recommendation for FEAT-012 (First-Run Experience):** Invest in strong empty states per tab showing *what you'll see* (preview/wireframe) with clear upload CTAs, rather than bundled sample data.

## Dependencies
None — the app already distinguishes between `loadFromAssets` and `loadFromStorage` code paths.

---
*Approved by: PH — 2026-03-29*
