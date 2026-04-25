import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical, X } from 'lucide-react';
import { useDroppable, useDraggable, useDndMonitor } from '@dnd-kit/core';

/* TierDividerEditable — desktop-only editable tier divider. Drag handle on the
   left, centered editable label, X delete on the right. */
export function TierDividerEditable({
  styles,
  tierColor,
  tierLabelText,
  playerId,
  onTierLabelChange,
  onDelete,
  dropId,
  dragId,
  canDrag,
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');

  const { setNodeRef: setDropRef, isOver } = useDroppable({
    id: dropId,
    data: { kind: 'tier-break', playerId },
  });
  const { attributes, listeners, setNodeRef: setDragRef, isDragging } = useDraggable({
    id: dragId,
    data: { kind: 'tier-drag', playerId, tierLabelText, tierColor },
    disabled: !canDrag,
  });

  const handleLabelClick = (e) => {
    e.stopPropagation();
    if (!canDrag) return;
    setEditValue(tierLabelText || '');
    setIsEditing(true);
  };

  const handleLabelSave = () => {
    setIsEditing(false);
    if (onTierLabelChange && editValue.trim() !== tierLabelText) {
      onTierLabelChange(playerId, editValue.trim());
    }
  };

  const handleDelete = (e) => {
    e.stopPropagation();
    if (onDelete) onDelete(playerId);
  };

  return (
    <div
      ref={setDropRef}
      className={styles.tierDivider}
      style={{
        background: tierColor.border,
        boxShadow: isOver ? 'inset 0 0 0 1px rgba(255,255,255,0.35)' : undefined,
        opacity: isDragging ? 0.3 : 1,
        position: 'relative',
        height: '100%',
        width: '100%',
      }}
    >
      {canDrag && (
        <div ref={setDragRef} className={styles.tierDragHandle} {...listeners} {...attributes}>
          <GripVertical size={14} />
        </div>
      )}
      {isEditing ? (
        <input
          autoFocus
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleLabelSave}
          onKeyDown={(e) => { if (e.key === 'Enter') handleLabelSave(); if (e.key === 'Escape') setIsEditing(false); }}
          onClick={(e) => e.stopPropagation()}
          className={styles.tierLabelInput}
        />
      ) : (
        <>
          <span onClick={handleLabelClick} title="Click to edit tier label" className={styles.tierLabel}>
            {tierLabelText}
          </span>
          {canDrag && (
            <button onClick={handleDelete} className={styles.tierDeleteBtn} title="Remove tier break">
              <X size={14} />
            </button>
          )}
        </>
      )}
    </div>
  );
}

/* TierInsertZone — desktop-only "+" insert affordance between two same-tier players. */
export function TierInsertZone({ styles, playerId, onClick, dropId, disabled }) {
  const { setNodeRef, isOver } = useDroppable({
    id: dropId,
    data: { kind: 'tier-insert', playerId },
  });
  return (
    <div
      ref={setNodeRef}
      className={styles.tierInsertZone}
      onClick={disabled ? undefined : onClick}
      title="Add tier break above this player"
      style={{ height: '100%', width: '100%', position: 'relative', cursor: disabled ? 'default' : 'pointer' }}
    >
      <div className={styles.tierInsertIndicator} style={isOver ? { opacity: 0.85 } : undefined}>
        <div className={styles.tierInsertIndicatorLine} />
        <div className={styles.tierInsertIndicatorBtn}>+</div>
      </div>
    </div>
  );
}

/* PointerTrackingOverlay — portal-based drag overlay that tracks the pointer
   directly. Mounted inside a <DndContext> so useDndMonitor wires up. */
export function PointerTrackingOverlay({ styles, activePlayer, activeTierDrag, displayedPlayers, accentColor }) {
  const [pos, setPos] = useState(null);

  useDndMonitor({
    onDragStart(event) {
      const e = event.activatorEvent;
      if (e) setPos({ x: e.clientX, y: e.clientY });
    },
    onDragMove(event) {
      const e = event.activatorEvent;
      if (e && event.delta) {
        setPos({ x: e.clientX + event.delta.x, y: e.clientY + event.delta.y });
      }
    },
    onDragEnd() { setPos(null); },
    onDragCancel() { setPos(null); },
  });

  if (!pos) return null;

  if (activeTierDrag) {
    return createPortal(
      <div className={styles.dragOverlayTier} style={{
        left: pos.x + 12, top: pos.y - 16,
        background: activeTierDrag.tierColor.border,
      }}>
        <GripVertical size={14} />
        <span className={styles.dragOverlayTierLabel}>{activeTierDrag.tierLabelText}</span>
      </div>,
      document.body
    );
  }

  if (!activePlayer) return null;

  const rank = displayedPlayers.findIndex(p => p.id === activePlayer.id) + 1;

  return createPortal(
    <div
      className={styles.dragOverlayPortal}
      style={{
        left: pos.x + 12,
        top: pos.y - 16,
        ...(accentColor ? { borderColor: accentColor } : {}),
      }}
    >
      <span className={styles.dragOverlayRank}>{rank}</span>
      <span className={styles.dragOverlayName}>{activePlayer.name}</span>
      <span style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
        {activePlayer.adpStr ?? activePlayer.latestAdp ?? activePlayer.originalAdp ?? '-'}
      </span>
    </div>,
    document.body
  );
}
