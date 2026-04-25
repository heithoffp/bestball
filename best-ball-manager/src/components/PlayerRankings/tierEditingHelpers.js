/* Pointer-based insertion-point collision detection — finds the first droppable
   whose vertical midpoint is at or below the pointer Y. This gives natural
   "insert between" behavior: hovering between items 2 and 3 targets item 3,
   so the dragged player is placed before item 3 (i.e., between 2 and 3). */
export function pointerInsertionPoint({ droppableRects, droppableContainers, pointerCoordinates }) {
  if (!pointerCoordinates) return [];
  const { y } = pointerCoordinates;

  const sorted = [...droppableContainers]
    .map(c => ({ container: c, rect: droppableRects.get(c.id) }))
    .filter(c => c.rect)
    .sort((a, b) => a.rect.top - b.rect.top);

  for (const { container, rect } of sorted) {
    if (rect.top + rect.height / 2 >= y) {
      return [{ id: container.id, data: container.data }];
    }
  }

  if (sorted.length > 0) {
    const last = sorted[sorted.length - 1];
    return [{ id: last.container.id, data: last.container.data }];
  }
  return [];
}

export function resolveDropTargetId(id) {
  if (!id) return null;
  if (typeof id !== 'string') return id;
  if (id.startsWith('break:') || id.startsWith('insert:') || id.startsWith('tier-drag:')) {
    return id.split(':').slice(1).join(':');
  }
  return id;
}
