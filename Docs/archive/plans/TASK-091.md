<!-- Completed: 2026-04-02 | Commit: pending -->
# TASK-091: Align archetype distribution colors — Dashboard and Rosters tab

**Status:** Approved
**Priority:** P3

---

## Objective

Consolidate all archetype color definitions into `ARCHETYPE_METADATA` in `rosterArchetypes.js` so that Dashboard and RosterConstruction render identical colors for the same archetype keys — eliminating the current split where RB colors live in `PROTOCOL_TREE`, QB/TE colors live in a local Dashboard constant, and RosterConstruction hardcodes `var(--negative)` / `var(--accent)` for QB and TE progress bars.

## Verification Criteria

- Dashboard archetype distribution bars (RB, QB, TE) use the same colors as the corresponding Rosters tab progress-fill bars for every archetype key.
- No local `ARCHETYPE_COLORS` constant remains in `Dashboard.jsx`.
- Color fallback (`|| '#6b7280'`) is preserved in Dashboard for any unknown key.
- `ARCHETYPE_METADATA` in `rosterArchetypes.js` is the single source of truth for all 10 archetype colors.

## Verification Approach

1. Read `rosterArchetypes.js` — confirm `color` field present on all 10 entries in `ARCHETYPE_METADATA`.
2. Read `Dashboard.jsx` — confirm `ARCHETYPE_COLORS` constant is gone; all three distribution loops use `ARCHETYPE_METADATA[key]?.color`.
3. Read `RosterConstruction.jsx` — confirm QB tier progress fill uses `ARCHETYPE_METADATA[key]?.color` and TE tier progress fill uses `ARCHETYPE_METADATA[key]?.color`.
4. Dev: visually compare Dashboard "Archetype Distribution" stacked bars against the Rosters tab Tier 1/2/3 progress fills for the same archetype — colors should match.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/utils/rosterArchetypes.js` | Modify | Add `color` field to every entry in `ARCHETYPE_METADATA` |
| `best-ball-manager/src/components/Dashboard.jsx` | Modify | Remove local `ARCHETYPE_COLORS`; use `ARCHETYPE_METADATA[key]?.color` for RB, QB, and TE distributions |
| `best-ball-manager/src/components/RosterConstruction.jsx` | Modify | Replace hardcoded `var(--negative)` (QB) and `var(--accent)` (TE) with `ARCHETYPE_METADATA[key]?.color` |

## Implementation Approach

**Step 1 — rosterArchetypes.js**

Add `color` to each `ARCHETYPE_METADATA` entry. Copy RB colors from `PROTOCOL_TREE` (they are the authoritative source); use Dashboard's existing local values for QB/TE to preserve visual continuity:

```js
RB_HERO:          color: '#4bf1db'
RB_ZERO:          color: '#8b5cf6'
RB_HYPER_FRAGILE: color: '#f97316'
RB_BALANCED:      color: '#ef4444'
QB_ELITE:         color: '#bf44ef'
QB_CORE:          color: '#f59e0b'
QB_LATE:          color: '#10b981'
TE_ELITE:         color: '#3b82f6'
TE_ANCHOR:        color: '#f97316'
TE_LATE:          color: '#6366f1'
```

**Step 2 — Dashboard.jsx**

- Delete the `ARCHETYPE_COLORS` constant (lines 10-13).
- In the RB distribution mapping (line 47): change `color: PROTOCOL_TREE[key]?.color` → `color: ARCHETYPE_METADATA[key]?.color || '#6b7280'`.
- In the QB distribution mapping (line 61): change `color: ARCHETYPE_COLORS[key]` → `color: ARCHETYPE_METADATA[key]?.color || '#6b7280'`.
- In the TE distribution mapping (line 78): change `color: ARCHETYPE_COLORS[key]` → `color: ARCHETYPE_METADATA[key]?.color || '#6b7280'`.

**Step 3 — RosterConstruction.jsx**

- QB tier progress fill (line 456): change `background: 'var(--negative)'` → `background: ARCHETYPE_METADATA[key]?.color || 'var(--accent)'`.
- TE tier progress fill (line 509): change `background: 'var(--accent)'` → `background: ARCHETYPE_METADATA[key]?.color || 'var(--accent)'`.

## Dependencies

None.

---
*Approved by: Patrick 2026-04-02*
