# TASK-196: PlayerRankings Compare View — full tier-break editing parity with single-platform views

**Status:** Pending Approval
**Priority:** P3

---

## Objective
CompareView currently displays tier dividers as read-only colored bars. Single-platform Underdog and DraftKings views support drag-to-reposition tier breaks, click-to-add insert zones between players, inline tier label editing, X-button delete, and smart drop-on-tier-break behavior (player drop reassigns the break so the player visually lands as the first row in the tier). Builds feature parity for both UD and DK columns of CompareView. Each column has its own DndContext, so handlers are independent but share helper logic. Should reuse the pointerInsertionPoint collision detection and tier-aware drop logic already proven in PlayerRankings.jsx.

## Verification Criteria
- In Compare mode, each column's tier dividers render with a left-side drag handle (grip icon), the editable tier label, and a right-side X delete button — visually matching the single-platform desktop view.
- Hovering or focusing the gap between two adjacent players in either column reveals a tier-insert affordance ("+" line) that, when clicked, inserts a tier break above the lower player. (Same affordance the single-platform view shows.)
- Clicking the tier label in either column opens an inline input; pressing Enter or blurring saves the new label, Escape cancels. The first tier in the column uses the `__tier1__` label key (same convention as single-platform).
- Clicking the X on a tier divider removes that break in that column only — the other column is unaffected.
- Dragging the grip handle of a tier divider in either column repositions the break to whatever player the pointer is hovering over (same `pointerInsertionPoint` behavior as single-platform). Custom tier label migrates with the break.
- Dragging a player onto a tier-break drop zone behaves identically to single-platform:
  - If the dragged player is the first in a tier and dropped on its own break upward → the break moves down by one (player rank stable, tier changes).
  - If the dragged player is the last in a tier and dropped on the break of the next player → the break moves to the dragged player.
  - Otherwise, the player reorders normally and the break is reassigned to the dragged player so they become the new first row in that tier.
- Dragging a player onto an insert zone reorders the player without adding/changing a break (same as single-platform).
- Each column's drag interactions are independent — a tier-break drag in UD does not affect DK and vice versa. Tier-break editing does not trigger the mirror-proposal pill.
- Drag overlays (player and tier-break) render in a portal that tracks the pointer, matching the single-platform behavior — no jumping due to virtualizer offset.
- All existing CompareView features continue to work: scroll lock, mirror proposal pill on player drag (player reorder still triggers it; tier-break drag does not), search filter, position filter, movers slider, curve canvas, hover highlight.
- Both columns continue to virtualize correctly with the new tier-break and insert-zone elements interleaved (correct heights and positioning during scroll).

## Verification Approach
1. Run `npm run lint` in `best-ball-manager/` — must pass with no new warnings or errors in modified files.
2. Run `npm run build` — must complete without errors.
3. Start `npm run dev` and verify the following manually in a browser (developer-driven):
   a. Switch to Compare mode. Confirm tier dividers in both columns now show grip handle, label, and X.
   b. Click a tier label in the UD column → rename → confirm only UD column updates.
   c. Click X on a UD tier break → confirm only UD column loses that break (curves recompute).
   d. Hover between two UD players in a tier → confirm "+" insert affordance appears. Click it → confirm a new break is added in UD only.
   e. Drag the grip on a DK tier break to a different player → confirm the break repositions only on DK.
   f. Drag a player in UD across a tier break and confirm the smart-drop behavior (break reassignment) works as documented.
   g. Drag a player in UD across a regular row and confirm the mirror-proposal pill still appears in DK.
   h. Tier-break drag in UD → confirm it does NOT trigger a mirror-proposal pill.
   i. Verify the same set of behaviors in DK column (drag/insert/edit/delete).
   j. Switch back to single-platform views — confirm all existing functionality still works.
4. Developer confirms each manual step above before the task is marked Done.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/PlayerRankings/CompareView.jsx` | Modify | Add tier-break draggable + droppable wiring per column. Replace flat tier divider with editable component. Add insert zones. Add `pointerInsertionPoint` collision detection. Add tier-aware drag-end handlers. Add per-column `setTierBreaks` / `setTierLabels` mutators. Add `PointerTrackingOverlay` for both columns. |
| `best-ball-manager/src/components/PlayerRankings/CompareView.module.css` | Modify | Add styles for tier drag handle, X delete button, insert zone, drag-overlay portal, label input. Reuse design tokens from `PlayerRankings.module.css` to match visual language. |
| `best-ball-manager/src/components/PlayerRankings/tierEditingShared.jsx` | Create | Shared helpers and components: `pointerInsertionPoint` collision-detection function, `resolveDropTargetId`, `TierDividerEditable` component (drag handle + editable label + X), `TierInsertZone` component, `PointerTrackingOverlay`, `applyTierAwarePlayerDrop` reducer helper. Imported by both `PlayerRankings.jsx` (refactor in a follow-up if scope permits) and `CompareView.jsx`. |

(Optional refactor — out of scope for this task: extract these from `PlayerRankings.jsx` and reuse the shared module there too. For TASK-196 we **add** the shared module and consume it from CompareView only, leaving the existing single-platform code path untouched to keep the diff focused. A follow-up task can converge them.)

## Implementation Approach

**Step 1 — Create shared tier-editing module**
- Create `src/components/PlayerRankings/tierEditingShared.jsx`:
  - `pointerInsertionPoint({ droppableRects, droppableContainers, pointerCoordinates })` — copy from `PlayerRankings.jsx:59`.
  - `resolveDropTargetId(id)` — copy from `PlayerRankings.jsx:82` (handles `break:`, `insert:`, `tier-drag:` prefixes).
  - `TierDividerEditable` — desktop-only variant of the existing `TierDividerContent` with drag handle, inline label edit (Enter/Escape/blur), and X delete. Accepts `{ tierColor, tierLabelText, playerId, onTierLabelChange, onDelete, dropId, dragId, canDrag }`.
  - `TierInsertZone` — desktop-only "+" insert affordance, accepts `{ playerId, onClick, dropId }`.
  - `PointerTrackingOverlay` — copy from `PlayerRankings.jsx:432`. Accepts `{ activePlayer, activeTierDrag, displayedPlayers, accentColor }` so callers can pass platform color for visual continuity. Uses `useDndMonitor` so it must render inside a `<DndContext>`.
- Note: each column in CompareView already has its own `<DndContext>` and `<SortableContext>`, so a separate `PointerTrackingOverlay` instance lives inside each.
- Reuse the existing `getTierLabel` / `getTierColor` exports from `buildPlayers.js` (already imported by CompareView).

**Step 2 — Wire shared module into CompareView**
- Import `pointerInsertionPoint`, `resolveDropTargetId`, `TierDividerEditable`, `TierInsertZone`, `PointerTrackingOverlay`.
- Pass `collisionDetection={pointerInsertionPoint}` to both `<DndContext>` instances (UD and DK).

**Step 3 — Insert-zone interleaving**
- Update `buildFlatItems` so that whenever a player is followed by another player in the same tier, an insert-zone item is appended between them (matching the `flatItems` shape used in PlayerRankings.jsx). Keep the player-tier-divider items (which already exist) for the tier-boundary rows.
- Each insert-zone gets a small fixed height (~12-14px) and is included in the virtualizer's `estimateSize` switch.
- Tier dividers continue to use `TIER_DIVIDER_HEIGHT` (24px).

**Step 4 — Render editable tier dividers and insert zones**
- In each column's render loop, branch on item type:
  - `tier` → render `<TierDividerEditable>` with `dropId={break:${playerId}}`, `dragId={tier-drag:${playerId}}`, `playerId`, label/color, and the column-specific handlers.
  - `tier-insert` → render `<TierInsertZone>` with `dropId={insert:${playerId}}` and `onClick={() => toggleBreak(playerId)}`.
  - `player` → existing `<CompareRow>`, unchanged except for being wrapped in the same column's `SortableContext`.
- For the very-first row's tier label, persist with the `__tier1__` key (matches single-platform convention so saved CSV round-trips correctly).

**Step 5 — Per-column handlers**
- `handleUdTierToggle(playerId)` / `handleDkTierToggle(playerId)` — toggle membership in `udBreaks` / `dkBreaks`.
- `handleUdTierLabelChange(playerId, label)` / `handleDkTierLabelChange(playerId, label)` — same key convention as single-platform: `__tier1__` for first row, otherwise the player id.
- `handleUdDragEnd` / `handleDkDragEnd` — extend the existing per-column drag-end reducers to handle three cases:
  1. **Tier-break drag** (`active.id` starts with `tier-drag:`): move the break from source player to target player, migrate label, return without touching the player order. Skip the mirror-proposal logic — tier-break edits are local-only.
  2. **Player drop on tier break** (`over.id` starts with `break:`, `over.data.kind === 'tier-break'`): apply the same boundary logic as `PlayerRankings.jsx:822-904` — three sub-cases (drop on own break upward, drop on next-tier break downward, general non-adjacent case with break reassignment).
  3. **Player drop on insert zone or another player** (default): existing reorder logic, then if the target player owned a break and the dragged player just landed at that target position, reassign the break to the dragged player (same as `PlayerRankings.jsx:928-944`).
- The mirror-proposal computation only runs in case 3 (regular player reorder), preserving existing UX.

**Step 6 — Drag overlay**
- Track `activeId` per column (already partially tracked via `useSortable`'s `activatorEvent`; explicitly add `activeUdId` / `activeDkId` state set in `onDragStart` cleared in `onDragEnd`).
- Inside each column's `<DndContext>`, mount one `<PointerTrackingOverlay>` reading from that column's state. Pass `accentColor='var(--platform-ud)'` or `'var(--platform-dk)'` so the player-drag overlay and tier-drag overlay tint match the column.

**Step 7 — Styles**
- In `CompareView.module.css`, copy/adapt the desktop tier-divider styles from `PlayerRankings.module.css`:
  - `.tierDragHandle`, `.tierDeleteBtn`, `.tierLabelInput`, `.tierInsertZone`, `.tierInsertIndicator`, `.tierInsertIndicatorLine`, `.tierInsertIndicatorBtn`.
  - Drag-overlay portal: `.dragOverlayPortal`, `.dragOverlayRank`, `.dragOverlayName`, `.dragOverlayTier`, `.dragOverlayTierLabel`.
- Adjust the existing `.tierDivider` rule to use `position: relative` with absolute-positioned drag handle/label/X children (matching the single-platform layout).
- Reuse design tokens (`--text-muted`, `--accent`, `--surface-1`, etc.) — no new colors.

**Step 8 — Virtualizer measurement**
- Update each column's `useVirtualizer` `estimateSize` switch:
  - `tier` → `TIER_DIVIDER_HEIGHT` (24px) — unchanged
  - `tier-insert` → 14px
  - `player` → `ROW_HEIGHT` (40px) — unchanged
- Confirm the running `y` accumulator in `buildFlatItems` includes insert-zone heights so curves and ghost-target positions remain correct.

**Step 9 — Mobile guard**
- The existing single-platform code disables tier drag handles on mobile (`isMobile` prop). CompareView is already desktop-only (forced fallback in `PlayerRankings.jsx:518-523`), so we render the desktop variants directly without a mobile branch.

**Step 10 — Lint and build**
- `npm run lint` and `npm run build` from `best-ball-manager/`.

## Edge Cases
- **Empty break set:** First-render of a platform with no saved tier breaks renders only the tier-1 divider above the first player. Insert zones still appear between rows — clicking one creates the first additional break.
- **Tier-break drag onto a player who already has a break:** The source break is moved to the target; the target's existing break is preserved. (Handled by `Set` semantics — adding the same id twice is a no-op.)
- **Filtered view (search/movers active):** `canDrag` is false during search (matches single-platform); insert zones and tier-divider drag handles are hidden. The X delete and label-edit affordances also disable when `!canDrag` for consistency.
- **Position filter active (RB/QB/WR/TE):** Insert zones still appear between filtered players; clicking one adds a break in the **full** ranked list at the position immediately above that player. (This matches single-platform behavior — `flatItems` is built from the displayed list but break state lives on the full list.)
- **Curves and ghost targets:** Both depend on `yMap` for player positions. Recompute `buildFlatItems` returns `yMap` based on the new running `y`, so curves automatically update to skip past insert-zone gutter space.

## Dependencies
Builds on TASK-195 (Compare Mode). No blocking dependencies.

## Open Questions
- Whether to refactor `PlayerRankings.jsx` to consume the shared module in the same task, or defer to a follow-up. Recommend **defer** to keep the diff focused — the shared module is additive and PlayerRankings continues to work unchanged.

---
