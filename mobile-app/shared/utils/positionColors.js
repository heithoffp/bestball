// src/utils/positionColors.js
// Shared position color palette, extracted from RosterViewer so other
// components (e.g. DraftBoardModal) render identical position pills.

export const POS_COLORS = {
  QB: '#BF44EF', RB: '#10B981', WR: '#F59E0B', TE: '#3B82F6',
  K: '#6b7280', DEF: '#ef4444', DST: '#ef4444', default: '#eeeeee',
};

export function posColor(pos) {
  return POS_COLORS[pos] || POS_COLORS.default;
}
