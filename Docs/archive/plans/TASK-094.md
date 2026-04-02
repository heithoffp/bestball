<!-- Completed: 2026-04-02 | Commit: 26c7181 -->
# TASK-094: Add RB_DOUBLE_ANCHOR archetype to roster classification

**Status:** Done
**Priority:** P3

---

## Objective

Add `RB_DOUBLE_ANCHOR` as a fifth RB archetype in `rosterArchetypes.js`, classifying rosters that draft exactly 2 RBs in rounds 1–3 with no additional RBs in rounds 4–5 (a deliberate gap before continuing the build in round 6+).

## Verification Criteria

- `classifyRosterPath` returns `{ rb: 'RB_DOUBLE_ANCHOR', ... }` for a roster with 2 RBs in R1–3 and 0 RBs in R4–5.
- Rosters that previously fell into `RB_BALANCED` due to the same pattern now correctly resolve to `RB_DOUBLE_ANCHOR`.
- `RB_HERO`, `RB_ZERO`, and `RB_HYPER_FRAGILE` classification is unchanged (no overlap).
- `PROTOCOL_TREE` and `ARCHETYPE_METADATA` contain a valid entry for `RB_DOUBLE_ANCHOR`.

## Verification Approach

Manual trace through `classifyRosterPath` logic with three test cases:
1. 2 RBs in R1–3, 0 in R4–5 → should return `RB_DOUBLE_ANCHOR`
2. 1 RB in R1–3, 0 in R4–6 → should still return `RB_HERO`
3. 0 RBs in R1–4 → should still return `RB_ZERO`

Read the updated file and verify the logic order and conditions are correct.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/utils/rosterArchetypes.js` | Modify | Add PROTOCOL_TREE entry, ARCHETYPE_METADATA entry, and classifyRosterPath condition |

## Implementation Approach

**1. `PROTOCOL_TREE` — add entry after `RB_HYPER_FRAGILE`:**

```js
RB_DOUBLE_ANCHOR: {
  color: '#f59e0b',
  children: {
    QB_CORE: { children: { TE_LATE: 60, TE_ANCHOR: 30, TE_ELITE: 10 } },
    QB_LATE: { children: { TE_LATE: 70, TE_ANCHOR: 20, TE_ELITE: 10 } },
    QB_ELITE: { children: { TE_ELITE: 40, TE_ANCHOR: 40, TE_LATE: 20 } }
  }
},
```

**2. `ARCHETYPE_METADATA` — add entry:**

```js
RB_DOUBLE_ANCHOR: { name: 'Double Anchor', desc: '2 RBs R1-3, gap R4-5.', color: '#f59e0b' },
```

**3. `classifyRosterPath` — add new variable and condition:**

Add `const rbRounds4to5 = countPosition(roster, 'RB', 4, 5);` alongside existing RB count variables.

Insert the condition before the `RB_BALANCED` fallthrough:

```js
} else if (rbRounds1to3 === 2 && rbRounds4to5 === 0) {
  // Double Anchor: exactly 2 early RBs, deliberate gap before round 6
  path.rb = 'RB_DOUBLE_ANCHOR';
} else {
```

**Classification order (after change):**
1. `RB_ZERO` — 0 RBs in R1–4
2. `RB_HYPER_FRAGILE` — 3+ RBs in R1–4, ≤4 total
3. `RB_HERO` — exactly 1 RB in R1–3, 0 in R4–6
4. `RB_DOUBLE_ANCHOR` — exactly 2 RBs in R1–3, 0 in R4–5 *(new)*
5. `RB_BALANCED` — everything else

## Dependencies

None

---
*Approved by: Patrick 2026-04-02*
