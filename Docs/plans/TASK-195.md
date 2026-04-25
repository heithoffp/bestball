# TASK-195: Player Rankings — Compare Mode (UD vs DK side-by-side)

**Status:** Approved
**Priority:** P3

---

## Objective
Add a "Compare" mode to the PlayerRankings tab that displays Underdog (half-PPR) and DraftKings (full-PPR) rankings as two synchronized side-by-side virtualized columns with an SVG curve canvas between them connecting each player's UD-rank position to their DK-rank position, surfacing where the two scoring contexts agree and disagree. Includes a low-friction cross-list edit workflow that proposes mirrored placement in the opposite column whenever a player is reordered.

## Verification Criteria
- A new "Compare" button appears in the platform toggle row alongside "Underdog Rankings" and "DraftKings Rankings" on viewports ≥ 900px. The toggle is always visible regardless of which platforms have saved rankings.
- Selecting "Compare" renders two virtualized columns (UD left, DK right) with column headers showing platform name + rank-source label ("Saved" or "ADP fallback").
- An SVG canvas between the columns draws Bézier curves from each player's left-column row Y-position to the same player's right-column row Y-position.
- Curve stroke uses a linear gradient from UD purple (`#bf44ef`) to DK green (chosen brand-faithful green; documented in CSS).
- Curve thickness scales with `|Δrank|` — thin for agreement, bolder for disagreement (formula: `1 + min(8, |Δrank|/5)`).
- Synchronized scrolling is on by default; both columns scroll together. A toggle in the Compare header breaks/restores the lock.
- Hovering a row in either column highlights the connecting curve at full opacity, dims other curves to ~25%, highlights the counterpart row, and shows a `+/−N` delta badge near the curve midpoint.
- Search input filters and highlights matching players in both columns simultaneously; if exactly one player matches, both columns scroll to keep that player centered.
- Position filter (Overall · QB · RB · WR · TE) applies symmetrically to both columns.
- A "Movers ≥ N" slider (range 0–50, default 0) hides player rows and curves where `|udRank − dkRank| < N`.
- Rank-gap tick marks appear on the curve canvas every 10 ranks (e.g. "+10 / +20 / ...") at the midpoint X-coordinate.
- When a user drags a player in either column, a ghost target marker appears in the opposite column at `currentOtherRank + Δrank` along with an "Apply to [DK/UD] (±N)" pill near that row. Clicking the pill applies the equivalent move to the opposite platform's ranked list. The pill auto-dismisses on the next column interaction or after ~10s.
- Off-screen curve endpoints render an edge marker (small triangle + player name + rank) at the canvas edge instead of a full curve.
- On viewports below ~900px, the Compare button is not rendered, and `selectedPlatform === 'compare'` is forced back to a single-platform value.
- Scrolling the full ranking list (200+ players) maintains visually smooth (~60fps) frame pacing with curves active.
- Existing single-platform views (Underdog Rankings, DraftKings Rankings) continue to behave identically — drag-reorder, tier breaks, save/export, position filter, search.

## Verification Approach
1. Run `npm run lint` from `best-ball-manager/` — must pass with no new warnings or errors in modified files.
2. Run `npm run build` — must complete without errors.
3. Start `npm run dev` and verify the following manually in a browser (developer-driven, since this is a UI feature):
   a. Compare toggle is visible in the platform toggle row and switches into Compare mode on click.
   b. Two columns render with virtualized rows, both scrollable, scroll-locked by default. Toggle the lock — confirm columns scroll independently.
   c. Curves render between same-player positions. Visually inspect 5–10 players and confirm the curve lands on the correct row in both columns.
   d. Hover a row — confirm curve highlight, counterpart row highlight, delta badge.
   e. Type in the search box — confirm both columns filter/highlight together. Search for a single player and confirm scroll-to-curve.
   f. Switch position filter to RB — confirm both columns show only RBs and only RB curves render.
   g. Move the disagreement slider — confirm rows and curves with low |Δrank| disappear.
   h. Drag a player in the left column — confirm ghost marker and pill appear in the right column. Click the pill — confirm the right-column reorder applies and the pill dismisses.
   i. Drag a player in the right column — confirm the mirror flow works in the opposite direction.
   j. Resize the browser below 900px — confirm Compare toggle disappears and view falls back gracefully.
   k. Switch back to single-platform views — confirm all existing functionality still works (drag-reorder, tier breaks, save, export, upload).
   l. Spot-check a player who has UD rankings but no DK rankings — confirm the DK side shows them at their ADP fallback position.
4. Performance check: Use the browser performance panel while scrolling rapidly through a 200+ player list with curves active. Confirm no sustained frame drops.
5. Developer confirms each manual step above before the task is marked Done.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/PlayerRankings.jsx` | Modify | Add `'compare'` toggle option, mobile guard, branch render to delegate to `<CompareView />` when selected. Decouple toggle visibility from `availablePlatforms.length > 1` so Compare always renders on desktop. |
| `best-ball-manager/src/components/PlayerRankings.module.css` | Modify | Add Compare layout styles (two-column grid, curve canvas container, ghost-marker pill, sync-lock toggle). |
| `best-ball-manager/src/components/PlayerRankings/CompareView.jsx` | Create | Top-level component for Compare mode. Builds unified player set, manages two virtualizers, scroll-sync state, hover state, search/filter/disagreement state, drag-with-mirror state. |
| `best-ball-manager/src/components/PlayerRankings/CompareCurves.jsx` | Create | SVG canvas that consumes column row Y-positions + scroll offset and renders Bézier curves, edge markers, rank-gap ticks, and active-curve highlight. |
| `best-ball-manager/src/components/PlayerRankings/CompareView.module.css` | Create | Scoped styles for the Compare layout. |
| `Docs/Feature_Specs/Player_Rankings.md` | Modify (or Create) | Append a Compare Mode section describing behavior. If the spec doesn't exist yet, log a follow-up task rather than creating from scratch in this task. |

## Implementation Approach

**Step 1 — Toggle wiring in PlayerRankings.jsx**
- Extend the platform toggle to render three buttons: `'underdog'`, `'draftkings'`, `'compare'`. Always render the toggle row on desktop (drop the `availablePlatforms.length > 1` gate when desktop). On mobile, keep the existing single-platform behavior and exclude `'compare'`.
- Add a `useEffect` that forces `selectedPlatform` away from `'compare'` when `isMobile` becomes true.
- When `selectedPlatform === 'compare'`, render `<CompareView />` (passing `rankingsByPlatform`, `adpByPlatform`, `masterPlayers`, `onRankingsUpload`, `uploadAuthGuard`, `helpOpen`, `onHelpToggle`) and skip the existing single-list render path.

**Step 2 — Unified player set in CompareView**
- Build a player set keyed by `canonicalName(name)` from the union of:
  - `rankingsByPlatform.underdog` (or `adpByPlatform.underdog.latestRows` as fallback)
  - `rankingsByPlatform.draftkings` (or `adpByPlatform.draftkings.latestRows` as fallback)
- For each player, compute `udRank` and `dkRank` as their 1-indexed position in their respective platform's list (after sort by ADP for ADP fallback). If a player exists in only one platform, the other side's rank is derived from that player's position in the ADP fallback for the missing platform; if no ADP exists either, mark as `null` and exclude from compare rendering for that side.
- Reuse the existing seed/parse logic from PlayerRankings.jsx where possible — extract a small helper (`buildPlayersFromSource(source, adpLookup, projMap, adpRows)`) and import it from both places to avoid duplication.

**Step 3 — Two virtualized columns**
- Two `useVirtualizer` instances (one per column), each backed by its own scroll container. Same `estimateSize` per row as the existing single list (40px desktop) for visual continuity.
- `scrollLocked` state (default `true`). On scroll in either container, if locked, set `scrollTop` of the other to match. Throttle via `requestAnimationFrame` to avoid scroll-event feedback loops; use a `isProgrammaticScroll` guard so the propagated scroll doesn't re-trigger the handler.
- Position filter and disagreement slider apply to both column data sets identically. Search filters both columns by canonicalized name match.

**Step 4 — Curve canvas (CompareCurves.jsx)**
- Absolute-positioned `<svg>` between the columns, full-height of the visible viewport, width = the gutter between columns (e.g., 160px).
- Receives:
  - `players[]` — visible-or-near-visible players with `{id, name, udRow, dkRow}` (each `*Row` is a `{rank, y}` pair derived from the virtualizer's offset)
  - `scrollOffsetUd`, `scrollOffsetDk`
  - `activePlayerId`
  - `palette` — `{udColor: '#bf44ef', dkColor: <brand DK green>}`
- For each player, compute `leftY = udRow.y - scrollOffsetUd + rowHeight/2` and `rightY` similarly. Skip players whose both endpoints fall outside `[0, viewportHeight]` plus overscan.
- Path: `M 0,leftY C width/2,leftY width/2,rightY width,rightY`.
- Stroke: `url(#playerGradient-${id})` referencing a `<linearGradient>` with stops `udColor` at 0% and `dkColor` at 100%, rotated horizontally.
- Stroke width: `1 + min(8, Math.abs(udRank - dkRank) / 5)`.
- Active player curve: full opacity; others: opacity 0.25.
- Edge markers: when one endpoint is outside the viewport, render a small `<g>` at the canvas edge with a triangle pointing in the off-screen direction and a text label `name · #rank`.
- Rank-gap ticks: faint horizontal text labels at midpoint X every 10 ranks (`+10`, `+20`, ...), positioned at `y = (rank * rowHeight) - scrollOffsetUd`. Use `var(--text-muted)` color.

**Step 5 — Hover & delta badge**
- Mouseenter on a row in either column → set `activePlayerId`. Mouseleave → clear if no row is currently the active one.
- When `activePlayerId` is set, the curve canvas renders a small badge near the midpoint of the active curve showing `+N` or `−N` (sign indicates which side ranks the player higher; positive = ranked higher on right). Badge background uses the dominant platform color.

**Step 6 — Cross-list mirror edit**
- Both columns are wrapped in their own `<DndContext>` reusing the existing `pointerInsertionPoint` collision detection.
- On drag end in column A:
  - Compute `Δ = newRank − oldRank` for the dragged player on platform A.
  - Apply the reorder to platform A's ranked list (existing logic).
  - Look up the player's current rank on platform B; compute proposed `targetRankB = currentRankB + Δ` (clamped to `[1, listLength]`).
  - Set `mirrorProposal = {playerId, fromPlatform: 'underdog' | 'draftkings', toPlatform, targetRank, delta: Δ}`.
- Render a ghost row in column B at `targetRankB` (semi-transparent overlay row) plus a floating "Apply to [DK/UD] (±N)" pill anchored near that row.
- Click the pill → reorder platform B's ranked list to put the player at `targetRankB`. Clear `mirrorProposal`.
- Auto-dismiss `mirrorProposal` on:
  - Any subsequent drag (in either column)
  - Any click outside the pill
  - 10s timeout (use `setTimeout` cleared by interaction)

**Step 7 — Disagreement slider & position filter**
- New slider in the Compare header: range 0–50, step 1, default 0, label "Hide rank ±N matches" (or "Movers ≥ N").
- Apply to both column data sets: filter out rows where `|udRank − dkRank| < N`. Curve set is derived from the filtered intersection.
- Position filter reuses existing `viewMode` state.

**Step 8 — Header lockup & sync-lock toggle**
- Each column gets a small header strip: platform name + a "Saved" or "ADP fallback" pill indicating rank source.
- Sync-lock toggle: a small icon button in the Compare control row (next to position filter); locked = both columns scroll together (default), unlocked = independent.

**Step 9 — Visual polish**
- Reuse existing `POS_COLORS`, tier badge styles, pos badge classes for row contents to keep visual continuity with single-platform views.
- DK brand green: pick a saturated complement to UD purple; tentative `#10b981` (existing RB green) but verify against DraftKings brand palette (their orange/green is the canonical brand; if no brand token exists in `index.css` already, add one as `--platform-dk` and `--platform-ud`).
- Match row height to existing single-list rows (40px desktop) so toggle feels like a continuous experience.

**Step 10 — Performance**
- Virtualizers handle row recycling; curve canvas only iterates the union of visible-or-overscan players (typically 30–60 players visible × 2 columns).
- Use `requestAnimationFrame` for curve redraw on scroll; debounce hover state updates.
- Consider memoizing curve paths by `(playerId, leftY, rightY, isActive)` so React doesn't recreate JSX on each scroll tick.

**Edge cases**
- Player exists only on one platform: render at that platform's rank; opposite side falls back to ADP-derived rank if available, else excluded from rendering.
- Empty rankings on both platforms: Compare shows a friendly empty state ("No rankings or ADP loaded — sync data or upload a CSV").
- Search returns zero matches: both columns show "No players match" inline; curve canvas hides.
- User toggles position filter mid-drag: drag is canceled (existing behavior); mirror proposal cleared.

## Dependencies
- Builds on TASK-144 (PlayerRankings platform toggle + per-platform storage) — already complete.
- Does not block any active tasks.

## Open Questions
- Exact DK brand green: tentative `#10b981`; if a more brand-faithful color is preferred, swap during implementation. The CSS variable approach (`--platform-dk` / `--platform-ud`) makes this trivial to refine post-merge.
- Whether to extract `buildPlayersFromSource` into a shared helper now or duplicate temporarily and refactor in a follow-up. Recommend extracting up-front to avoid drift.
- Whether `Docs/Feature_Specs/Player_Rankings.md` exists. If not, defer the spec doc creation as a separate task rather than expanding scope here.

---
*Approved by: developer 2026-04-25*
