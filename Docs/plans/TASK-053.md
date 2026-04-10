# TASK-053: Inter-roster similarity score — portfolio diversity metric

**Status:** Pending Approval
**Priority:** P3

---

## Objective
Add a "Roster Similarity" tab to ComboAnalysis that surfaces the most overlapping roster pairs in the portfolio. Answers the question "am I drafting the same team over and over?" — a concentration risk that per-player exposure percentages alone cannot reveal.

## Verification Criteria
1. A third tab button "Roster Similarity" appears in ComboAnalysis alongside Stack Profiles and QB Pairs.
2. Switching to the tab displays a ranked list of the most overlapping roster pairs, sorted by overlap count descending.
3. Each row shows: rank, both roster identifiers (shortened entry_id + tournament name), overlap count, and overlap percentage.
4. Clicking a row expands it to show the shared players as PlayerBadge components.
5. The "Min overlap" filter (reusing the existing minCount control) correctly filters out pairs below the threshold.
6. "Rosters →" navigation button on each roster in a pair navigates to RosterViewer filtered to that roster.
7. The #1 most overlapping pair is highlighted in gold, matching QB Pairs styling.
8. Empty state displays when no pairs meet the minCount threshold.
9. Help annotations are wired up for the new tab.
10. Performance: computation completes in <100ms for 500 rosters (measurable via browser DevTools Performance tab).

## Verification Approach
1. Run `npm run build` from `best-ball-manager/` — expect clean build with no errors.
2. Run `npm run lint` — expect no new lint warnings in ComboAnalysis.jsx.
3. Visual check (developer): load the app with roster data, switch to Combo Analysis → Roster Similarity tab. Confirm the ranked list renders with correct overlap counts. Expand a row and confirm shared players display correctly. Click "Rosters →" and confirm navigation works.
4. Performance check (developer): open browser DevTools Performance tab, record while switching to Roster Similarity tab with full portfolio data. Confirm computation time is under 100ms.

Steps 1-2 can be run by Claude. Steps 3-4 require the developer.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/ComboAnalysis.jsx` | Modify | Add Roster Similarity tab, similarityData useMemo, render section, help annotations, context-sensitive toolbar label |

## Implementation Approach

### Step 1: Add tab button
- Add `{ key: 'similarity', label: 'Roster Similarity' }` to the tab button group (line ~306-317).
- In `handleTabClick`, reset any similarity-specific state (expanded pairs set).

### Step 2: Add expandedPairs state
- New `useState(new Set())` for tracking which pair rows are expanded (keyed by `entryId1||entryId2`).
- Reset in `handleTabClick`.

### Step 3: Add similarityData useMemo
- Gate on `activeTab === 'similarity'` — return null otherwise (same lazy pattern as other tabs).
- Build roster summaries from the existing `rosters` memo: `{ entryId, tournamentTitle, playerSet: Set<name>, players: [{name, position}] }`.
  - `tournamentTitle` comes from `roster[0]?.tournamentTitle` (same pattern as RosterViewer).
- Nested loop over all pairs (i from 0 to N-1, j from i+1 to N-1).
- For each pair, count intersection: iterate smaller set, check `.has()` on larger set.
- Build shared player list with position info from the roster's player array.
- Filter pairs with `overlapCount >= minCount`.
- Sort by `overlapCount` descending, then by alphabetical entryId for stability.
- Take top 50 results.
- Return array of `{ roster1: {entryId, tournamentTitle}, roster2: {entryId, tournamentTitle}, overlapCount, overlapPct, sharedPlayers: [{name, position}] }`.
- `overlapPct` = `overlapCount / Math.min(roster1.size, roster2.size) * 100` (Jaccard-style, relative to smaller roster).

### Step 4: Add help annotations
- New `SIMILARITY_HELP_ANNOTATIONS` array with entries for the similarity description and row elements.
- Wire into `TabLayout` `helpAnnotations` prop when `activeTab === 'similarity'`.

### Step 5: Update toolbar label
- Change hardcoded "Min stacks" to a dynamic label: "Min stacks" for stacks tab, "Min count" for qbpairs, "Min overlap" for similarity.

### Step 6: Render similarity results
- Mirror the QB Pairs rendering pattern: ranked list with frequency fill bars.
- Each row:
  - Rank number (gold for #1).
  - Roster 1: shortened entry_id (first 8 chars) + tournament name in muted text.
  - "×" separator.
  - Roster 2: same format.
  - Overlap count (bold) + overlap % (muted).
  - "Rosters →" nav button for each roster (passes `{ entryIds: [entryId] }` to `onNavigateToRosters`).
- Expandable detail: on click, show shared players as `PlayerBadge` components, grouped by position (QB, RB, WR, TE).
- Empty state: "No roster pairs found with {minCount}+ shared players."

### Performance Notes
- For N=500 rosters with ~18 players each: 124,750 pairs × 18 set lookups = ~2.2M operations.
- JavaScript Set.has() is O(1). Total computation is well under 50ms on modern hardware.
- The `useMemo` dependency is `[rosters, activeTab, minCount]` — only recomputes on tab switch or filter change.
- No Web Workers, inverted indices, or other complexity needed.

## Dependencies
None

## Open Questions
None — the brute-force approach is the simplest and fast enough for the stated scale target.

---
*Approved by: <!-- developer name/initials and date once approved -->*
