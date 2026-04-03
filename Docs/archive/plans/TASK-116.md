<!-- Completed: 2026-04-03 | Commit: cee9a97 -->
# TASK-116: Draggable tier breaks in PlayerRankings

**Status:** Approved
**Priority:** P3

---

## Objective

Make tier break divider bars in the PlayerRankings tab drag-and-droppable so users can reposition tier boundaries by grabbing the colored bar and moving it up or down between players — instead of the current workflow of deleting the break and re-creating it at the new position via the insert zone.

## Verification Criteria

1. Tier break dividers display a drag handle (GripVertical icon) on the left side
2. Grabbing the handle initiates a drag with a tier-bar-styled overlay (colored bar with label text)
3. Dropping a tier break between two players moves the break to that position — the old break is removed, the new break is added, and the custom label travels with it
4. Tier numbering recomputes correctly after the move (no gaps, no duplicates)
5. The implicit first-tier divider (before the first player) is NOT draggable — only user-created breaks in `overallTierBreaks` can be dragged
6. Tier break dragging is disabled in positional views (QB/RB/WR/TE) and while searching — same conditions that disable player dragging
7. Existing interactions are preserved: click label to edit, click X to delete, drop player onto break to change tier boundary
8. Desktop and mobile both work (desktop = table row, mobile = card divider)

## Verification Approach

1. `cd best-ball-manager && npm run build` — clean build, no errors
2. `npm run lint` — no new warnings
3. Manual testing checklist (developer):
   - Load rankings with multiple tier breaks
   - Drag a tier break down past 2-3 players — verify it lands correctly and tier numbers update
   - Drag a tier break up past other players — same verification
   - Drag a tier break past another tier break — verify both breaks survive and tiers recompute
   - Verify the first tier divider has no drag handle
   - Switch to a positional view (e.g., RB) — verify tier break drag handles disappear
   - Type in search — verify tier break drag handles disappear
   - Click a tier label to edit — verify editing still works (not intercepted by drag)
   - Click X to delete a tier break — verify delete still works
   - Drag a player onto a tier break — verify existing player-to-break behavior unchanged
   - Test on mobile viewport

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/PlayerRankings.jsx` | Modify | Add `useDraggable` to `TierDividerContent`, update `handleDragEnd` for tier-drag events, extend `PointerTrackingOverlay` for tier bar preview |
| `best-ball-manager/src/components/PlayerRankings.module.css` | Modify | Add grip handle styles for tier dividers, dragging opacity state |

## Implementation Approach

### 1. Make TierDividerContent draggable

Add `useDraggable` from `@dnd-kit/core` alongside the existing `useDroppable`:

- Draggable ID: `tier-drag:${playerId}` — distinguishable from player IDs and existing `break:` / `insert:` drop IDs
- Data: `{ kind: 'tier-drag', playerId, tierLabel }`
- Add a `canDrag` prop (false for the implicit first-tier divider, false when searching or in positional view)
- Render a `GripVertical` icon on the left side of the tier bar that receives `listeners` and `attributes` from `useDraggable`
- When `canDrag` is false, hide the grip icon
- When the tier break is being dragged (`isDragging`), reduce opacity

**Key detail:** The drag handle must be a separate element from the label and delete button so click-to-edit and click-to-delete are not intercepted by the drag listeners.

### 2. Update handleDragEnd for tier-drag events

At the top of `handleDragEnd`, check if `active.id` starts with `tier-drag:`:

```
if (active.id starts with 'tier-drag:') {
  const sourceTierPlayerId = extract from active.id
  const targetPlayerId = resolveDropTargetId(over.id)
  
  // Remove break from old position
  overallTierBreaks.delete(sourceTierPlayerId)
  
  // Add break at new position  
  overallTierBreaks.add(targetPlayerId)
  
  // Migrate label
  const label = tierLabels[sourceTierPlayerId]
  delete tierLabels[sourceTierPlayerId]
  if (label) tierLabels[targetPlayerId] = label
  
  return // don't fall through to player reorder logic
}
```

Edge case: If the tier break is dropped on itself (no movement), early-return with no changes.

Edge case: If dropped on another tier break's position, the source break moves to that position and the target break stays — effectively swapping which player ID owns which break. Need to handle label migration for both.

### 3. Extend PointerTrackingOverlay

The overlay currently renders a player pill. Add a branch:

- Track `activeId` — if it starts with `tier-drag:`, look up the tier color and label
- Render a tier-bar-styled overlay (colored background, white text, compact) instead of the player pill
- Add CSS class `.dragOverlayTier` for the tier bar overlay style

### 4. Pass canDrag to TierDividerContent

In the `flatItems` render loop, the `TierDividerContent` is rendered for `editable` tier dividers. Add the `canDrag` prop:

- `canDrag={canDrag && viewMode === 'overall'}` — reuses the existing `canDrag` (false when searching) and adds the positional view check
- Also pass `canDrag={false}` for the first tier divider (where `idx === 0` in the flat items, i.e., where `playerId` equals the first displayed player but that player is NOT in `overallTierBreaks`)

Actually, simpler: `canDrag={canDrag && viewMode === 'overall' && overallTierBreaks.has(playerId)}` — the first-tier divider's playerId is the first player, which is never in `overallTierBreaks` unless a user explicitly added a break there.

### 5. CSS additions

- `.tierDragHandle` — positioned on the left of the tier bar, same sizing as player grip handles
- `.tierDivider[data-dragging="true"]` / `.tierDividerMobile[data-dragging="true"]` — opacity: 0.3
- `.dragOverlayTier` — portal overlay styled as a compact tier bar

### 6. Mobile support

The mobile `TierDividerContent` renders a `<div>` instead of a `<tr>`. The same `useDraggable` hook works for both — the grip handle is added inside the div. Touch sensor already supports non-sortable draggables.

## Dependencies

- TASK-093 (drag-and-drop overlay offset fix) — ideally completed first so the overlay positioning is correct, but not strictly blocking since the tier drag overlay is independent

## Open Questions

- **Should dragging a tier break onto another tier break merge/swap them?** Current proposal: the source break moves to the target's player position. If the target position already has a break, both breaks end up on the same player — which effectively removes one tier boundary. This might be the intuitive behavior (collapsing two adjacent tiers). Alternative: prevent dropping on another break. Recommend: allow it and let the natural tier computation handle it (two breaks on the same player = one break, so it's a merge).

---
*Approved by: Patrick — 2026-04-03*
