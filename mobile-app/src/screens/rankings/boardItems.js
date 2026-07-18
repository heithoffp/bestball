// boardItems.js — pure state logic for the mobile Rankings drag board.
//
// The board renders ONE flat array interleaving three row types:
//   'player'  — draggable roster row (the only type that wires useReorderableDrag)
//   'divider' — tier rail sitting ABOVE the break-owning player (breaks.has(ownerId))
//   'insert'  — "+ Tier" pill between two same-tier players
// The tier-1 rail is rendered as the list header, NOT a flat item, so index 0 is
// always a player and a drop at index 0 simply crowns a new #1.
//
// Model state mirrors the web PlayerRankings:
//   players — ordered array of player objects ({ id, ... })
//   breaks  — Set<playerId>: a tier boundary sits immediately above that player
//   labels  — { __tier1__?: string, [playerId]: string } custom tier labels
//
// After a drag, the library reports flat indices (from → to). applyFlatReorder
// re-derives { players, breaks, labels } from the physically rearranged flat
// array: dividers are physical rows, so a boundary stays where the user sees it
// and re-attaches to whichever player now sits directly beneath it.

/** Mirror of react-native-reorderable-list's reorderItems util. */
export function reorderItems(data, from, to) {
  const next = [...data];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** tier number per player id + custom label per tier number. */
export function computeTierMaps(players, breaks, labels = {}) {
  const tierByPlayer = new Map();
  const labelByTier = new Map();
  let tier = 1;
  players.forEach((p, idx) => {
    if (idx === 0) {
      if (labels.__tier1__) labelByTier.set(1, labels.__tier1__);
    } else if (breaks.has(p.id)) {
      tier += 1;
      if (labels[p.id]) labelByTier.set(tier, labels[p.id]);
    }
    tierByPlayer.set(p.id, tier);
  });
  return { tierByPlayer, labelByTier };
}

/**
 * Build the flat item array for the overall board.
 * `editable: false` omits the insert pills (search / read-only rendering).
 */
export function buildFlatItems(players, breaks, { editable = true } = {}) {
  const items = [];
  let tier = 1;
  players.forEach((p, idx) => {
    if (idx > 0) {
      if (breaks.has(p.id)) {
        tier += 1;
        items.push({ type: 'divider', key: `divider-${p.id}`, ownerId: p.id, tierNum: tier });
      } else if (editable) {
        items.push({ type: 'insert', key: `insert-${p.id}`, ownerId: p.id, tierNum: tier });
      }
    }
    items.push({ type: 'player', key: p.id, player: p, tierNum: tier, rank: idx + 1 });
  });
  return items;
}

/**
 * Re-derive model state after the library physically moved flat item `from`
 * to flat index `to`. Only player rows are draggable; returns null when the
 * move is a no-op or the moved item is not a player.
 *
 * Boundary semantics (all covered by scripts/test-rankings-board.mjs):
 * - A divider re-attaches to the first player now below it; its custom label
 *   migrates with it.
 * - Adjacent dividers (a tier emptied of players) collapse — the lowest one
 *   survives, the emptied tier dissolves.
 * - Dividers left above the first player dissolve into the tier-1 rail; a
 *   custom label on the dissolving divider becomes the tier-1 label.
 * - Trailing dividers with no player beneath them dissolve.
 */
export function applyFlatReorder(flatItems, from, to, labels = {}) {
  if (from === to) return null;
  const moved = flatItems[from];
  if (!moved || moved.type !== 'player') return null;

  const simulated = reorderItems(flatItems, from, to);

  const players = [];
  const breaks = new Set();
  const nextLabels = {};
  if (labels.__tier1__) nextLabels.__tier1__ = labels.__tier1__;

  let pendingDividers = [];
  for (const item of simulated) {
    if (item.type === 'divider') {
      pendingDividers.push(item);
    } else if (item.type === 'player') {
      if (pendingDividers.length > 0) {
        // Lowest pending divider is the one visually touching this player.
        const divider = pendingDividers[pendingDividers.length - 1];
        const label = labels[divider.ownerId];
        if (players.length === 0) {
          // Boundary above the new #1 — the old tier 1 emptied out; this
          // divider becomes the tier-1 rail.
          if (label !== undefined) nextLabels.__tier1__ = label;
        } else {
          breaks.add(item.player.id);
          if (label !== undefined) nextLabels[item.player.id] = label;
        }
        pendingDividers = [];
      }
      players.push(item.player);
    }
    // 'insert' pills carry no state — skip.
  }
  // Trailing dividers (no player beneath) dissolve silently.

  return { players, breaks, labels: nextLabels };
}

/**
 * Reorder the homogeneous overall board (player-only drag cells).
 *
 * from/to index the `players` array directly (the ReorderableList's data is the
 * player list — tier rails and insert pills are rendered as per-row decorations,
 * NOT as separate list items, so the drag list stays homogeneous). Tier breaks
 * are stored as a Set<playerId>, so they travel with their owning player: a break
 * "above player X" stays above X wherever X lands.
 *
 * The one normalization: a break that ends up on the new #1 is meaningless (there
 * is no tier above the top player), so it dissolves into the tier-1 rail and its
 * custom label migrates to `__tier1__`. Returns null for a no-op.
 */
export function applyPlayerReorder(players, breaks, labels = {}, from, to) {
  if (from === to) return null;
  if (from < 0 || from >= players.length) return null;
  const next = reorderItems(players, from, to);
  const nextBreaks = new Set(breaks);
  const nextLabels = { ...labels };

  const first = next[0];
  if (first && nextBreaks.has(first.id)) {
    nextBreaks.delete(first.id);
    if (labels[first.id] !== undefined) nextLabels.__tier1__ = labels[first.id];
    delete nextLabels[first.id];
  }

  return { players: next, breaks: nextBreaks, labels: nextLabels };
}

/**
 * Reorder within a filtered view (position chips). from/to index the filtered
 * player-only array; the move is applied to the full list by anchoring to the
 * moved player's new neighbor inside the filter. Breaks/labels are untouched.
 * Returns the new full players array, or null for a no-op.
 */
export function applyFilteredReorder(fullPlayers, filteredPlayers, from, to) {
  if (from === to) return null;
  const moved = filteredPlayers[from];
  if (!moved) return null;
  const simulated = reorderItems(filteredPlayers, from, to);
  const newIdx = simulated.findIndex(p => p.id === moved.id);
  const prevNeighbor = newIdx > 0 ? simulated[newIdx - 1] : null;
  const nextNeighbor = newIdx < simulated.length - 1 ? simulated[newIdx + 1] : null;

  const without = fullPlayers.filter(p => p.id !== moved.id);
  let insertAt;
  if (prevNeighbor) {
    insertAt = without.findIndex(p => p.id === prevNeighbor.id) + 1;
  } else if (nextNeighbor) {
    insertAt = without.findIndex(p => p.id === nextNeighbor.id);
  } else {
    return null;
  }
  if (insertAt < 0) return null;
  const next = [...without];
  next.splice(insertAt, 0, moved);
  return next;
}

/** Move a player to a 1-based overall rank (jump-to-rank input). */
export function moveToRank(players, id, rank) {
  const idx = players.findIndex(p => p.id === id);
  if (idx < 0) return null;
  const to = Math.max(0, Math.min(players.length - 1, rank - 1));
  if (to === idx) return null;
  return reorderItems(players, idx, to);
}
