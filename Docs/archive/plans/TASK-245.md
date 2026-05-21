<!-- Completed: 2026-05-21 | Commit: acd61c8 (pre-commit) -->
# TASK-245: Draft Assistant — port Tournament Filter and Playoff Stacks from extension

**Status:** Done
**Priority:** P2

---

## Objective
Add two extension-parity features to the website's Draft Assistant tab: (1) a Pro-gated **Tournament Filter** that scopes exposure/correlation aggregates to a chosen subset of slates/tournaments, reusing the existing `TournamentMultiSelect` component; (2) a **Playoff Game-Stack** badge on candidate players showing W15/16/17 opponent-matchup correlations against the user's already-drafted picks, ported from `draft-overlay.js`.

## Verification Criteria
1. With at least two distinct tournaments in the portfolio, opening Draft Assistant shows a Tournament Filter control in the toolbar area for Pro users; non-Pro users see no control (or a disabled/locked variant consistent with other Pro-gated UI).
2. Selecting a subset of tournaments updates every roster-derived aggregate on the page: Path %, Global Exposure %, Correlation, count parentheticals, strategy viability lock-ins. Clearing the selection reverts to "all tournaments".
3. With the filter empty (zero matching rosters), the player list still renders with ADP-only data and a non-crashing empty-state message (no NaN, no white-screen).
4. For any candidate player whose team plays an opponent in W15/16/17 of one of the user's already-drafted picks, a playoff-stack pill appears on the row inline with the existing stack pill. Hover (desktop) or tap (mobile) reveals a popup listing the qualifying picks grouped by week with team/opp labels.
5. The W17 (championship-week) pill receives visual emphasis distinct from W15/W16 (matching the extension's treatment).
6. Only **meaningful** position pairs trigger the pill — same-team teammates are excluded (already covered by the standard stack pill), and the position-pair filter from the extension's `MEANINGFUL_GAME_PAIRS` table is honored.
7. Playoff pill is Pro-gated (belt-and-braces, matching extension behavior in TASK-232).
8. Mobile layout: tournament filter is reachable from the segmented mobile toolbar; playoff pill appears in the mobile player list without breaking row height; popup is tap-dismissible.
9. `npm run lint` and `npm run build` pass cleanly from `best-ball-manager/`.

## Verification Approach
- Run `npm run lint` and `npm run build` in `best-ball-manager/`; both must exit 0.
- Start `npm run dev` and load a Pro account with a multi-tournament portfolio. Manually:
  1. Confirm Tournament Filter shows in Draft Assistant toolbar, defaults to "All Tournaments".
  2. Select one tournament; verify Path %, Global %, Correlation, and counts shift to match a single-tournament aggregate. Cross-check the same player's numbers against Dashboard with the same filter applied.
  3. Empty all selections; confirm the empty-state message appears with no console errors.
  4. Draft a few picks that produce a known W15/W16/W17 opponent overlap (e.g., a picked WR whose team plays an opposing QB in W17). Confirm pill appears with correct count, week labels, and popup contents.
  5. On a non-Pro account, confirm Tournament Filter and playoff pills are hidden/locked.
  6. Resize to ≤599px; verify toolbar control and pill rendering on mobile.
- Developer must confirm steps 1–6 above before marking Verified.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/components/DraftFlowAnalysis.jsx` | Modify | Add `selectedTournaments` state; thread it through `allRosters` filtering; render `<TournamentMultiSelect>` in the toolbar (Pro-gated); integrate `<PlayoffStackPill>` into the player row; surface popup UI |
| `best-ball-manager/src/components/DraftFlowAnalysis.module.css` | Modify | Pill styles (W15/W16/W17 variants, multi-week chip), popup styles, mobile breakpoints |
| `best-ball-manager/src/utils/playoffStacks.js` | Create | Port `analyzePlayoffStackOverlay` and `MEANINGFUL_GAME_PAIRS` / `pairsForWeek` from extension as a pure utility consumed by both Combos (TASK-239) and Draft Assistant |
| `best-ball-manager/src/assets/playoff-schedule-2026.json` | Create | Copy of `chrome-extension/src/data/playoff-schedule-2026.json` — one shared source per project remains the extension's; this is a website-side duplicate for now (note open question below) |
| `best-ball-manager/src/utils/tournamentFilter.js` | Create (or extract) | If existing tournament-filter helpers live inline in Dashboard/ComboAnalysis, extract `buildSlateGroups(rosters)` and `filterRostersByTournaments(rosters, selected)` into a shared util; otherwise reuse existing helpers as-is |

## Implementation Approach

### Phase 1 — Tournament Filter (Pro-gated)
1. **Locate the existing pattern.** Read how `ComboAnalysis.jsx` (lines ~539) and `Dashboard.jsx` (line ~376) build `slateGroups` and apply `selectedTournaments`. Reuse the same data shape and helpers verbatim — do not invent a new structure.
2. **State in DraftFlowAnalysis.jsx.** Add `const [selectedTournaments, setSelectedTournaments] = useState([])` and a `slateGroups` memo derived from `rosterData`. Both at component top, near other top-level state.
3. **Filter the rosters.** Wrap `allRosters` (line 162) with a `useMemo` that filters by `selectedTournaments`. Empty selection = unfiltered. All downstream memos (`matchingPathRosters`, `playerIndexMap`, `strategyStatus`, etc.) already depend on `allRosters` and will recompute correctly.
4. **Empty-state guard.** When filtered `allRosters.length === 0`, short-circuit aggregate UIs to show a one-line empty state ("No rosters match the selected tournaments") instead of NaN denominators. The player list keeps rendering with ADP-only columns.
5. **Pro gating.** Read tier via `useSubscription()` / `featureAccess`. Pattern: render the `<TournamentMultiSelect>` only when `canAccessFeature(tier, 'tournamentFilter')` (or whatever key matches existing usage); otherwise omit the control entirely (the Draft Assistant tab itself already has its own gating layer).
6. **Mobile placement.** Place the control in the desktop toolbar; on mobile (≤599px) put it inside the existing controls area used by `useMediaQuery` so it appears under the segmented control.

### Phase 2 — Playoff Stacks
1. **Port logic to a util.** Create `utils/playoffStacks.js` exporting:
   - `MEANINGFUL_GAME_PAIRS` (copy from extension)
   - `pairsForWeek(week)`
   - `analyzePlayoffStackOverlay({ candidateName, candidateTeam, candidatePos, currentPicks, playerTeamMap, playerPositionMap, playoffSchedule })` — pure function returning `{count, weeks:[{week, entries:[...]}]} | null`.
   Keep the function signature input-injected (not DOM-coupled) so Combos (TASK-239) can share it.
2. **Import schedule.** Add `best-ball-manager/src/assets/playoff-schedule-2026.json` as a static import. Build `playerTeamMap` and `playerPositionMap` from `masterPlayers` using `stableId()`-normalized keys.
3. **Per-row evaluation.** Inside the player-list render, for each candidate compute `analyzePlayoffStackOverlay(...)` (memoized per render via a derived `Map<playerId, payload>` so we don't recompute per render row).
4. **Pill UI.** Add a `<PlayoffStackPill payload={...}>` component (inline within DraftFlowAnalysis.jsx for now — extract later if reused) rendering:
   - Single-week: `W{NN} ×{count}` chip with week-specific class.
   - Multi-week: `W15/16/17 ×{count}` aggregate chip.
   - W17 chip uses a championship accent (gold/saturated red) distinct from W15/W16.
5. **Popup.** Reuse the existing correlation-popup portal pattern in DraftFlowAnalysis if present; otherwise a CSS-positioned popover on hover (desktop) / tap (mobile). Content matches extension `buildPlayoffPopupHtml`: section per week, rows showing position / name / `team @ opp`.
6. **Pro gating.** Belt-and-braces: skip pill computation when tier !== 'pro'. The tab is already Pro-gated.
7. **Same-team exclusion.** Confirmed in the extension logic — same-team picks are skipped (already covered by stack pill). Replicate exactly.

### Phase 3 — Cleanup
- Run `npm run lint` and fix any new warnings introduced by these changes.
- No changes to extension code; this is purely a website port.

### Edge Cases
- Player with no team mapping in `masterPlayers` → no pill, no error.
- Bye-week / missing playoff entry → silent skip.
- Filter selection that excludes the user's own roster slate → aggregate UIs show empty state; player list still renders.
- A pick whose team has been traded/changed mid-season → uses whatever team `masterPlayers` provides; acceptable for now.

## Dependencies
None hard-blocking. **Adjacent work to coordinate with:**
- **TASK-239** (Combos — Playoff Stacks sub-tab) is in progress and will likely need the same playoff-schedule data and analysis utility. Phase 2 step 1 (extract to `utils/playoffStacks.js`) is designed to be the shared surface so TASK-239 can consume it.
- **TASK-232** (extension playoff pills, Done) is the source of truth for visual/behavior parity.
- **TASK-231** (extension Pro gating, In Progress) sets the precedent for Pro-only draft features.

## Open Questions
1. **Schedule data ownership** — Two copies of `playoff-schedule-2026.json` (extension `src/data/` and website `src/assets/`) will drift. Acceptable short-term, but worth a follow-up task to centralize (e.g., a `shared/` directory or a build-time copy). Flagging rather than expanding scope.
2. **Pro-feature key naming** — Need to confirm whether `featureAccess.js` already has a key covering "tournament filter" (used by Dashboard/Combos) and whether we reuse it or add a new key for the Draft Assistant context. Will defer to the existing pattern when implementing.
3. **Pill placement vs. existing stack pill** — Extension appends the playoff pill *after* the stack pill in the same row. On mobile, this may cause row overflow with long names. If overflow becomes an issue, fall back to stacking pills vertically on ≤599px. Will assess during manual mobile testing in Verification.

---
*Approved by: <!-- developer name/initials and date once approved -->*
