// src/data/byeWeeks.js
// 2026 NFL bye schedule, keyed by team abbreviation (weeks 5–14).
// Re-exported from the Eliminator reference data — whose byeWeeks block is the
// verified 2026 schedule — so general consumers (advanceModel via RosterViewer /
// DraftBoardModal) don't couple to the Eliminator-specific file shape.
// Refresh eliminator-2026.json each season and this stays correct.
import eliminatorData from './eliminator-2026.json';

export const BYE_WEEKS_2026 = eliminatorData.byeWeeks;
