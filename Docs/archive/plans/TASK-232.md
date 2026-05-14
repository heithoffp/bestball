<!-- Completed: 2026-05-11 | Commit: 64dbc0d (work uncommitted at archive time) -->
# TASK-232: Playoff week (15/16/17) correlation pills in extension overlay

**Status:** Done
**Priority:** P2

---

## Objective
Add a single playoff game-stack indicator pill to the extension overlay's player rows. The pill counts the user's already-rostered players who share an NFL playoff-week game (W15, W16, or W17) with the candidate player, restricted to position pairings that meaningfully correlate in best ball. Hover reveals a per-week breakdown. Ships in extension v1.0.10 alongside TASK-231.

## Verification Criteria

1. **Positive case (cross-team game stack):** With a portfolio containing rostered players from teams that play each other in W15/16/17, hovering over a candidate from one side of a playoff game shows the playoff pill with a non-zero count, and the popup lists the correlated rostered player(s) under the correct week heading.
2. **RB exclusion:** A candidate at RB never produces the pill regardless of correlations. A rostered RB is never counted toward any other candidate's pill.
3. **TE↔TE exclusion:** A TE candidate with a rostered opposing TE in the same playoff game does NOT produce the pill (only a rostered opposing QB or WR qualifies for a TE candidate).
4. **Multi-week aggregation:** A QB candidate whose opponent in W16 also rosters a WR and a TE for you produces count=2, popup groups them under "Week 16" only.
5. **Same-team teammate suppression:** A teammate who also plays the same playoff game (e.g., your rostered WR1 on the candidate QB's team) is NOT counted in the playoff pill — it is already represented by the existing `.bbm-stack-pill`.
6. **Empty case:** Candidate with no qualifying correlations across all three weeks renders no pill (no empty/zero-state pill).
7. **Bye-week tolerance:** If the candidate or a rostered pick is missing from the schedule JSON for a given week (bye), that week is silently skipped with no console errors.
8. **Pro gating:** Non-Pro users (gated per TASK-231) see no playoff pill. Pro users see it as specified.
9. **Coexistence with existing pill:** When both `.bbm-stack-pill` and `.bbm-playoff-pill` apply to the same row, both render with the playoff pill positioned after the stack pill (no visual overlap, no replacement).
10. **No regressions:** Exposure %, correlation %, correlation popup, tier-break badges, and the existing stack pill all behave identically for Pro users compared with pre-change behavior.

## Verification Approach

**Automated (Claude runs):**
1. `cd chrome-extension && npm run build` — confirm clean Vite build with the new JSON import resolved.
2. Read back the generated `dist/` content script and confirm `playoff-schedule-2026.json` content is inlined (or properly bundled per Vite static-asset config).
3. Static check: open `draft-overlay.js`, confirm `applyPlayoffStackBadge` is invoked from both `sweepRows`'s row-init path and `updateRowMetrics` (the same two call sites that drive `applyStackBadge` today).

**Manual (developer runs against a real draft page):**
4. Load the unpacked extension `chrome-extension/dist/` in Chrome as a Pro user.
5. Open an Underdog draft where your portfolio contains players who match a known W15/16/17 game pairing (developer picks a test pairing — e.g., portfolio has a Bills WR rostered, candidate is the opposing QB that week). Confirm the playoff pill renders with count=1 and the hover popup shows the rostered WR under the correct week.
6. Hover a candidate RB. Confirm no playoff pill. Hover a candidate with no qualifying playoff opponents on your roster — confirm no pill.
7. Pick a row where same-team teammate already rosters that QB's WR1; confirm the existing stack pill renders normally and the playoff pill does NOT double-count that teammate.
8. Bye-week probe: pick a candidate whose team is on bye one of the three weeks; confirm no console errors and weeks with no schedule entry simply do not appear in the popup.
9. Repeat steps 5–8 on a DraftKings draft page to confirm parity.
10. Sign in as a Free account; confirm no playoff pill renders (TASK-231 gate).
11. DevTools console — confirm no red errors across all states.

The developer must explicitly confirm steps 5–10 before TASK-232 is marked Verified.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `chrome-extension/src/content/draft-overlay.js` | Modify | Add `applyPlayoffStackBadge()` + `analyzePlayoffStackOverlay()` (sibling of existing stack helpers); add `populatePlayoffPopup()`; reuse `ensureCorrPopupPortal()` portal with state-tagged content; wire calls into `sweepRows` row init and `updateRowMetrics`; add `MEANINGFUL_GAME_PAIRS` lookup and import of the bundled schedule. Add CSS for `.bbm-playoff-pill`, `.bbm-playoff-popup-week`, `.bbm-playoff-count` inside the existing style block. Short-circuit when `currentTier !== 'pro'` (uses gate from TASK-231). |
| `chrome-extension/src/data/playoff-schedule-2026.json` | Create | Static lookup: `{ "<TEAM_ABBR>": { "15": "<OPP_ABBR>", "16": "<OPP_ABBR>", "17": "<OPP_ABBR>" }, ... }` for all 32 NFL teams. Omit the key for any week a team is on bye. Team abbreviations must match whatever `playerTeamMap` already stores (verify during implementation; if any mismatch, normalize at import time). |
| `chrome-extension/CHANGELOG.md` | Modify | Append a bullet to the existing 1.0.10 entry (added by TASK-231): "Added playoff-week (W15-17) game-stack correlation pill on candidate rows with hover breakdown grouped by week." |
| `chrome-extension/manifest.json` | Unchanged | Version is already 1.0.10 from TASK-231 — do NOT double-bump. |
| `chrome-extension/package.json` | Unchanged | Same — do NOT double-bump. |

No new modules, no new observers, no Supabase migrations.

## Implementation Approach

### Schedule data

1. Create `chrome-extension/src/data/playoff-schedule-2026.json` keyed by team abbreviation. Structure:
   ```json
   {
     "BUF": { "15": "DET", "16": "PHI", "17": "CLE" },
     "DET": { "15": "BUF", "16": "PIT", "17": "MIN" },
     ...
   }
   ```
   Source the data from the published 2026 NFL schedule when creating the file. Missing week key = bye / no game; never throw.

2. Import at the top of `draft-overlay.js`:
   ```js
   import playoffSchedule from '../data/playoff-schedule-2026.json';
   ```
   Verify Vite's content-script bundling resolves JSON imports (it does by default; if the existing build config disallows JSON imports, fall back to inlining the object literal in a sibling `.js` module — decide during build verification, not now).

3. Confirm team-abbreviation parity. During implementation, log a one-time sanity-check inside `initDraftOverlay()` that walks `playerTeamMap` values and reports any abbreviation not found in the JSON (dev-only console.debug; remove before commit if noisy). The goal is to surface mismatches between Underdog/DK team codes and the schedule keys before they hit users.

### Correlation matrix

4. Define a frozen lookup at module top:
   ```js
   // Meaningful best-ball game-stack pairs: candidatePos => Set of rostered opponent positions
   const MEANINGFUL_GAME_PAIRS = Object.freeze({
     QB: new Set(['QB', 'WR', 'TE']),
     WR: new Set(['QB', 'WR', 'TE']),
     TE: new Set(['QB', 'WR']),
     // RB intentionally absent — never a candidate
   });
   ```
   To qualify, both the candidate's position must be a key, AND the rostered player's position must be in the corresponding Set. RB rostered picks are skipped because no candidate's Set includes RB. TE↔TE is excluded because TE's Set is `['QB','WR']`, not `['QB','WR','TE']`.

### analyzePlayoffStackOverlay(playerName)

5. Sibling of `analyzeStackOverlay()`, placed directly after it (~line 1004). Returns either `null` or:
   ```js
   {
     count: <total correlated rostered players across weeks 15-17>,
     weeks: [
       { week: '15', entries: [{ name, position, team, opp }] },
       { week: '16', entries: [...] },
       { week: '17', entries: [...] }
     ] // only weeks with entries appear
   }
   ```
   Algorithm:
   - Resolve candidate key, team, position via `resolvePlayerKey` + `playerTeamMap` + `playerPositionMap`. If position is not a key in `MEANINGFUL_GAME_PAIRS`, return `null` (handles the RB-candidate exclusion).
   - For each of weeks `['15','16','17']`:
     - Look up `playoffSchedule[candidateTeam]?.[week]`. If missing (bye), skip.
     - For each `pick` in `currentPicks`:
       - Look up rostered pick's team and position via the maps. Skip if missing.
       - **Same-team suppression:** if `pickTeam === candidateTeam`, skip (it's a teammate game stack, already covered by `.bbm-stack-pill`).
       - Otherwise, check `playoffSchedule[pickTeam]?.[week]`. If it equals `candidateTeam`, the two are in the same playoff game.
       - Check `MEANINGFUL_GAME_PAIRS[candidatePos]?.has(pickPos)`. If true, include the pick in the week's entries.
     - If the week has entries, push the week group.
   - If total count is zero, return `null` (suppresses pill render).

### applyPlayoffStackBadge(row, playerName)

6. Sibling of `applyStackBadge()`, placed after it. Mirrors structure exactly:
   ```js
   function applyPlayoffStackBadge(row, playerName) {
     row.querySelectorAll('.bbm-playoff-pill').forEach(el => el.remove());
     const info = analyzePlayoffStackOverlay(playerName);
     if (!info) return;
     const positionRow = row.querySelector(adapter.selectors.stackPillTargetSelector);
     if (!positionRow) return;
     const pill = document.createElement('span');
     pill.className = 'bbm-playoff-pill bbm-inline-overlay';
     pill.innerHTML = `PLAYOFFS <span class="bbm-playoff-count">${info.count}</span>`;
     pill.dataset.payload = JSON.stringify(info); // for hover handler
     positionRow.appendChild(pill);
     attachPlayoffPopupHandlers(pill);
   }
   ```
   The pill is appended AFTER any existing `.bbm-stack-pill` because `applyStackBadge` runs first in the call sequence — the playoff pill simply lands after it in the same parent.

### Hover popup

7. Reuse the existing `corrPopupPortal` (created by `ensureCorrPopupPortal`). Add a small helper `populatePlayoffPopup(payload)` that returns HTML:
   ```
   <div class="bbm-corr-popup-title">Playoff Game Stacks</div>
   <div class="bbm-playoff-popup-week">Week 15</div>
   <div class="bbm-corr-popup-row">…name…position…vs OPP…</div>
   …
   ```
   Reusing the portal is simpler than creating a second one and avoids double-portal positioning logic. The portal's `innerHTML` is rebuilt on every hover regardless of source (already true for the existing correlation popup).

8. `attachPlayoffPopupHandlers(pill)` mirrors the `corr` cell's mouseenter/mouseleave at lines 1034–1044, but reads `pill.dataset.payload`, parses, and calls `populatePlayoffPopup`.

### CSS additions (inside the existing style block in draft-overlay.js)

```css
/* Playoff game-stack pill — sibling of .bbm-stack-pill, distinct color */
.bbm-playoff-pill {
  display: inline-block;
  vertical-align: middle;
  margin-left: 4px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 1px 5px;
  border-radius: 20px;
  border: 1px solid #06B6D4;
  color: #06B6D4;
  background: #06B6D41A;
  line-height: 1.5;
  white-space: nowrap;
  cursor: default;
  opacity: 0.9;
}
.bbm-playoff-pill .bbm-playoff-count {
  margin-left: 4px;
  padding: 0 4px;
  border-radius: 8px;
  background: #06B6D4;
  color: #0C1A30;
  font-weight: 800;
}
.bbm-playoff-popup-week {
  margin-top: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #06B6D4;
  opacity: 0.85;
}
```

### Call-site wiring

9. In `sweepRows`'s per-row processing block (where `applyStackBadge(row, resolvedName)` is called at ~line 907 and ~line 1122), add `applyPlayoffStackBadge(row, resolvedName)` immediately after `applyStackBadge`.

10. In `updateRowMetrics` (line 907 area), add the same call directly after the existing `applyStackBadge` call.

11. **Pro gating.** The new functions execute inside the same row-injection path that TASK-231 gates with `currentTier !== 'pro'`. Because TASK-231 short-circuits at `sweepRows` and `updateRowMetrics`, the playoff pill is already free-rider gated and needs no additional check. (Belt-and-braces: add `if (currentTier !== 'pro') return;` as the first line of `applyPlayoffStackBadge` to make the gate explicit even if a future refactor moves the call sites.)

### Edge cases

- **Schedule JSON has no entry for a team:** Treat as bye/unknown for every week — skip the team silently. Avoid optional-chain throws by always going through `playoffSchedule[team]?.[week]`.
- **Player name resolves but team is unknown:** `playerTeamMap.get(key)` returns `undefined` → early return `null` from `analyzePlayoffStackOverlay`.
- **Same player resolves to multiple identities (DK alias edge cases):** Defer to `resolvePlayerKey`, which already disambiguates with row context. No new logic.
- **Schedule changes mid-season (rare):** Acceptable to ship as a static JSON for the 2026 season; if mid-season corrections are needed, ship in the next extension release.
- **W18 / Super Bowl:** Out of scope. Only weeks 15/16/17 per the task title.

### Out of scope

- Server-fetched schedule (deferred — bundled JSON is the agreed approach).
- "Last 5 / Last 10" filtering of correlated rostered players (possible follow-up).
- Same-team playoff correlations (already shown by the existing stack pill).
- Same-game RB correlations or TE↔TE correlations.

## Dependencies

- **TASK-231 (in progress):** The Pro-tier gate this feature relies on is being added by TASK-231. TASK-232 will land on top of it; if TASK-231 is not merged first, the belt-and-braces `if (currentTier !== 'pro') return;` line still gates correctly because `currentTier` defaults to `null`. But the intent is that TASK-231 ships in the same 1.0.10 release.

## Open Questions

1. **Final pill label text** — proposed `PLAYOFFS`; alternatives `PO STACK` or `W15-17`. Awaiting developer call.
2. **Final pill color** — proposed teal `#06B6D4` to differentiate from purple QB stack (`#BF44EF`) and amber WR stack (`#F59E0B`). Will adopt unless developer overrides.
3. **JSON shape** — proposed all 32 teams included, with missing week keys = bye. Alternative: omit teams with no playoff-week data; less explicit but smaller payload. Proposing the explicit-all-teams approach.
4. **Follow-up (not in scope):** Filter the popup breakdown to show only the most-rostered correlated players, or aggregate by week count when the list is long. Tracking as a potential future task if hover popups get cluttered in practice.

---
*Approved by: <!-- pending -->*
