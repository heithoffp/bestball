<!-- Completed: 2026-04-02 | Commit: 26c7181 -->
# TASK-084: PlayerRankings: Virtualize the list with react-window (or similar)

**Status:** Approved
**Priority:** P2

---

## Objective

Add windowed/virtualized rendering to the Rankings tab so only visible rows are mounted,
eliminating the 1000–1500+ DOM node penalty that causes scroll, search, and drag lag
with 300–500 players.

## Verification Criteria

1. Scrolling through 300+ players is visually smooth — no jank or frame drops.
2. DOM node count for the player list is proportional to visible rows, not total player count
   (verify via DevTools Elements panel — should see ~20-30 rows rendered, not 300+).
3. Drag-and-drop reordering still works correctly end-to-end (drag a player, drop at new position, rank updates).
4. Tier breaks still render at correct boundaries before their first player; tier labels editable.
5. Tier toggle (click above row) still inserts/removes tier breaks correctly.
6. Search still filters players and shows empty state when no matches.
7. Positional view switching (Overall / QB / RB / WR / TE) still shows correct subsets.
8. Mobile card layout virtualizes correctly — cards remain tappable, expandable, draggable.
9. No visual regression — row heights, tier divider colors, and tier label colors unchanged.

## Verification Approach

1. Run `npm run build` from `best-ball-manager/` — must exit 0 with no errors.
2. Run `npm run dev`, open the Rankings tab with a full player file loaded (300+ players).
3. Open DevTools → Elements → inspect the `<tbody>` or card list — confirm only ~20-30 rows
   are in the DOM while the rest of the list is off-screen (developer step).
4. Scroll the list end-to-end — confirm no visible jank (developer step).
5. Drag a player 5+ positions down. Confirm the order updates correctly and tier breaks
   follow their boundaries (developer step).
6. Click the hidden tier-toggle zone above a player row. Confirm a tier break appears/disappears.
7. Type in the search box. Confirm the list filters. Clear search. Confirm full list restores.
8. Switch to QB view. Confirm only QBs shown. Switch back to Overall.
9. On a narrow viewport (< 768px), verify card layout renders, cards expand on tap, and drag handle works.

Steps 3–9 require the developer. Step 1 can be run by Claude.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/PlayerRankings.jsx` | Modify | Add virtualizer, flat items array, suspend-during-drag logic |
| `best-ball-manager/package.json` | No change | `@tanstack/react-virtual` already installed |

## Implementation Approach

### 1. Import virtualizer
`@tanstack/react-virtual` is already installed. Add the import:
```js
import { useVirtualizer } from '@tanstack/react-virtual';
```
No `npm install` needed.

### 2. Add `isDragActive` state
```js
const [isDragActive, setIsDragActive] = useState(false);
```
Update `handleDragStart` to `setIsDragActive(true)` and `handleDragEnd` to `setIsDragActive(false)`.

### 3. Build `flatItems` useMemo
Replace the inline rendering loops in `renderDesktopTable` and `renderMobileCards` with a
single `flatItems` array computed from `displayedPlayers`:

```js
const flatItems = useMemo(() => {
  const items = [];
  let lastRenderedTier = 0;

  displayedPlayers.forEach((player, idx) => {
    const playerTier = tierMap.get(player.id) || 1;
    const prevTier = idx > 0 ? (tierMap.get(displayedPlayers[idx - 1].id) || 1) : 0;

    // Insert empty tier dividers for any skipped tiers
    const startTier = idx === 0 ? 1 : prevTier + 1;
    for (let t = startTier; t < playerTier; t++) {
      if (t <= lastRenderedTier) continue;
      items.push({ type: 'tier-divider', tierId: t,
        tierColor: getTierColor(t),
        tierLabel: tierNumLabels.get(t) || getTierLabel(t) });
      lastRenderedTier = t;
    }

    // Tier toggle zone (hidden click target above each player)
    items.push({ type: 'tier-toggle-zone', playerId: player.id });

    // Player item
    items.push({
      type: 'player',
      player,
      displayRank: idx + 1,
      posRank: posRankMap.get(player.id) || '',
      tier: playerTier,
      hasTierAbove: idx === 0 || playerTier !== prevTier,
      tierLabelText: tierNumLabels.get(playerTier) || getTierLabel(playerTier),
    });
    lastRenderedTier = playerTier;
  });

  // Trailing empty tiers
  allTierNums.forEach(t => {
    if (t > lastRenderedTier) {
      items.push({ type: 'tier-divider', tierId: t,
        tierColor: getTierColor(t),
        tierLabel: tierNumLabels.get(t) || getTierLabel(t) });
    }
  });

  return items;
}, [displayedPlayers, tierMap, tierNumLabels, posRankMap, allTierNums]);
```

### 4. Set up virtualizer

```js
const rowVirtualizer = useVirtualizer({
  count: flatItems.length,
  getScrollElement: () => scrollContainerRef.current,
  estimateSize: (i) => {
    const item = flatItems[i];
    if (item?.type === 'tier-divider') return 32;
    if (item?.type === 'tier-toggle-zone') return 8;
    return 44; // player row (desktop) or 52 (mobile cards)
  },
  overscan: 5,
});
```

### 5. Desktop table — padding rows approach (matches ExposureTable pattern)

Replace the existing `<tbody>` render loop with:

```jsx
const virtualItems = rowVirtualizer.getVirtualItems();

<tbody>
  {/* Top spacer */}
  {!isDragActive && virtualItems.length > 0 && (
    <tr><td colSpan={10} style={{ height: virtualItems[0].start, padding: 0, border: 'none' }} /></tr>
  )}
  {(isDragActive ? flatItems.map((item, i) => ({ index: i, key: i })) : virtualItems).map(virtualRow => {
    const item = flatItems[virtualRow.index];
    // render by item.type — each element gets:
    //   key={virtualRow.key}  data-index={virtualRow.index}  ref={rowVirtualizer.measureElement}
  })}
  {/* Bottom spacer */}
  {!isDragActive && virtualItems.length > 0 && (
    <tr><td colSpan={10} style={{
      height: rowVirtualizer.getTotalSize() - (virtualItems.at(-1)?.end ?? 0),
      padding: 0, border: 'none'
    }} /></tr>
  )}
</tbody>
```

When `isDragActive === true`, iterate `flatItems` directly (all mounted) with no spacers.

The per-item render switch:
- `tier-divider` → existing `<tr>` with `colSpan={10}` divider markup
- `tier-toggle-zone` → existing hidden click `<tr>`
- `player` → `<SortableRow>` (unchanged, receives same props as today)

### 6. Mobile cards — absolute positioning approach (matches ExposureTable pattern)

```jsx
<div ref={scrollContainerRef} className={s.cardList}
  style={isDragActive ? {} : { position: 'relative', height: rowVirtualizer.getTotalSize() }}>
  {(isDragActive ? flatItems.map((item, i) => ({ index: i, key: i, start: 0 })) : rowVirtualizer.getVirtualItems())
    .map(virtualRow => {
      const item = flatItems[virtualRow.index];
      return (
        <div
          key={virtualRow.key}
          data-index={virtualRow.index}
          ref={isDragActive ? undefined : rowVirtualizer.measureElement}
          style={isDragActive ? {} : {
            position: 'absolute', top: 0, left: 0, width: '100%',
            transform: `translateY(${virtualRow.start}px)`,
          }}
        >
          {/* render by item.type */}
        </div>
      );
    })}
</div>
```

### 7. estimateSize for mobile
Change the `estimateSize` callback to return `52` for player items on mobile (`isMobile` is
available in scope). Alternatively use two separate virtualizer instances — one per layout.
Simplest: use a single virtualizer with `isMobile` in scope:

```js
estimateSize: (i) => {
  const item = flatItems[i];
  if (item?.type === 'tier-divider') return isMobile ? 28 : 32;
  if (item?.type === 'tier-toggle-zone') return 8;
  return isMobile ? 52 : 44;
},
```

### 8. SortableContext items list
The `SortableContext` `items` prop must remain `displayedPlayers.map(p => p.id)` — only actual
player IDs, not divider/toggle items. This is unchanged.

## Dependencies

None

---
*Approved by: <!-- developer name/initials and date once approved -->*
