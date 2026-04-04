<!-- Completed: 2026-04-03 | Commit: c17767c -->
# TASK-093: PlayerRankings — Fix drag-and-drop overlay offset in virtualized list

**Status:** Approved
**Priority:** P2

---

## Objective

Fix the DragOverlay ghost card in PlayerRankings that follows the cursor with a ~5-row downward offset, making drag-and-drop reordering unusable because the user cannot predict where a player will be placed. Replace dnd-kit's built-in DragOverlay with a custom portal-based overlay positioned at actual pointer coordinates.

## Verification Criteria

- Dragging a player shows the ghost card directly adjacent to the cursor (no visible offset)
- The ghost card follows the cursor smoothly during the drag
- Dropping a player places it at the correct position (where the cursor is, not where the old overlay was)
- Works correctly at all scroll positions (top, middle, bottom of list)
- Works on both desktop (table) and mobile (cards) views

## Verification Approach

1. Run `npm run build` from `best-ball-manager/` — must compile without errors.
2. Developer manually tests drag-and-drop:
   - Drag a player near the top of the list — overlay should track cursor
   - Scroll down and drag a player in the middle — overlay should track cursor with no growing offset
   - Scroll to the bottom and drag — same behavior
   - Drop a player and confirm it lands where expected

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/PlayerRankings.jsx` | Modify | Replace `<DragOverlay>` with custom portal overlay using `useDndMonitor` pointer tracking |
| `best-ball-manager/src/components/PlayerRankings.module.css` | Modify | Add styles for the portal-based drag overlay (fixed positioning) |

## Implementation Approach

1. Import `createPortal` from `react-dom` and `useDndMonitor` from `@dnd-kit/core`.
2. Add state for pointer coordinates (`pointerPos`), updated via `useDndMonitor({ onDragMove })` reading `event.activatorEvent` or `event.delta` to compute screen position.
3. Replace the existing `<DragOverlay dropAnimation={null}>` block with a custom component that:
   - Renders via `createPortal(..., document.body)`
   - Uses `position: fixed; left; top` set to tracked pointer coords (with small x-offset so it doesn't sit under cursor)
   - Only renders when `activePlayer` is non-null
4. Remove the `DragOverlay` import if no longer used.
5. The existing `pointerClosestCenter` collision detection continues to handle correct drop placement.

### Previous attempts that did NOT fix it (preserved for context)

1. Moved tier insert zones into flatItems — correct for accuracy, didn't fix overlay
2. Removed CSS transforms from sortable rows — eliminated jank, not the offset
3. Removed dynamic overscan change on drag start — didn't fix offset
4. Custom pointer-based collision detection — fixes drop location, not overlay position
5. `dropAnimation={null}` — cosmetic only

## Dependencies

None

---
*Approved by: developer, 2026-04-02*
