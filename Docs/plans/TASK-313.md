# TASK-313: Arena leaderboard pagination

**Status:** Approved
**Priority:** P3

---

## Objective
The Arena leaderboard only ever shows the top 200 enrolled teams (`arenaClient.getLeaderboard`'s default `limit=200`, fetched with `.limit()`). Add server-side pagination so a viewer can page through the full pool, with a simple page-number / Prev-Next control under the table.

## Verification Criteria
- `getLeaderboard` accepts an `offset` (or `page`) parameter, fetches via `.range()`, and returns both the page of rows and the total enrolled-team count for the active filters.
- `ArenaLeaderboard` renders a pager below the table whenever the total team count exceeds one page (50 rows/page); the pager is hidden entirely when everything fits on page 1.
- Row rank numbers (`#` column, rank badges, movement deltas) reflect the team's true global rank (e.g. row 1 of page 2 reads `#51`, not `#1`) — not a page-relative index.
- The champion podium (top-3 cards) renders only on page 1; it never shows on later pages.
- "Find my team" jumps to whichever page contains the viewer's best team (using the existing `getArenaRank` true-rank/total), then scrolls to and flashes that row, even when it isn't on the page currently displayed.
- `cd best-ball-manager && npm run lint` passes with no new warnings/errors.
- Manual check (developer): with the Arena tab's Leaderboard view open against a pool of >50 enrolled teams, paging forward/back returns the correct rows, the last page shows the correct remainder count, and the pager is usable at both the 899px and 599px responsive breakpoints.

## Verification Approach
1. Automated: run `cd best-ball-manager && npm run lint` and confirm a clean exit.
2. Automated (read-through): re-read the modified `getLeaderboard` call and confirm `.range(offset, offset + limit - 1)` with `{ count: 'exact' }` on the `.select()`, matching the existing `getArenaRank` count pattern (`arenaClient.js:150`).
3. Manual (developer): start `npm run dev` in `best-ball-manager/`, open Arena → Leaderboard, and:
   - Confirm the pager only appears when there are more than 50 enrolled teams in the featured pool.
   - Click through pages (Next, a page number, Prev) and confirm rank numbers continue sequentially and Elo/W-L data is fresh per page.
   - Confirm the podium is absent on page 2+.
   - As a signed-in user whose best team is ranked beyond page 1, click "Find my team" and confirm it switches to the correct page and scrolls/flashes the row.
   - Resize to 899px and 599px widths and confirm the pager doesn't overflow or clip.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/src/utils/arenaClient.js` | Modify | `getLeaderboard` takes `{ platform, tournament, limit = 50, offset = 0 }`, selects with `{ count: 'exact' }`, uses `.range(offset, offset + limit - 1)` instead of `.limit(limit)`, and returns `{ rows, total }` instead of a bare array. Update the JSDoc comment. |
| `best-ball-manager/src/components/arena/ArenaLeaderboard.jsx` | Modify | Add `page`/`total` state and a `PAGE_SIZE = 50` constant; refetch on page change using the new `getLeaderboard` shape; compute global rank as `offset + i + 1` for row numbers, rank badges, and `computeMovement`; gate the podium on `page === 1`; render a pager control below the table; extend `findMyRow` to switch pages when the viewer's team isn't on the current page before scrolling/flashing. |
| `best-ball-manager/src/components/Arena.module.css` | Modify | Add pager styles (`.lbPager`, page-number buttons, active/disabled states, responsive rules at the existing 899px/599px breakpoints) using the established design tokens (`--font-mono`, `--accent`, `--surface-1/2`, `--border-subtle`, `--radius-sm`, `--text-muted`/`--text-secondary`, `--duration-fast`). |

## Implementation Approach
1. **`arenaClient.js`** — change `getLeaderboard`'s signature to `{ platform = 'all', tournament = 'featured', limit = 50, offset = 0 } = {}`. Change `.select(cols)` to `.select(cols, { count: 'exact' })`, replace `.limit(limit)` with `.range(offset, offset + limit - 1)`, and return `{ rows: data ?? [], total: count ?? 0 }`. This is the only call site (confirmed by Explore agent — no other production or test code calls `getLeaderboard`), so the return-shape change is safe to make directly rather than adding a second function.
2. **`ArenaLeaderboard.jsx`**:
   - Add `const PAGE_SIZE = 50;` and `const [page, setPage] = useState(1);` and `const [total, setTotal] = useState(0);`.
   - The load effect depends on `[page]`; call `getLeaderboard({ tournament: 'featured', limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE })`, then `setRows(result.rows)` and `setTotal(result.total)`.
   - `computeMovement(rows, viewKey, offset)` — thread the current page's offset through so `next[r.id] = offset + i + 1` (true rank), not the page-relative index. Do the same for the row rank badge (`offset + i + 1`) in the render.
   - Podium block: guard with `page === 1 && rows.length >= 3` so it never renders on later pages (a page-2 slice starting at rank 51 would otherwise mislabel three mid-pack teams as 1st/2nd/3rd).
   - Pager UI: a simple component rendered under `.lbTableWrap` when `total > PAGE_SIZE` — Prev button, a windowed set of page number buttons (e.g. first, last, and a few around the current page with an ellipsis for gaps — cap the window so it doesn't need its own scroll), Next button, and a `Page X of Y` label for screen readers / mobile. Disable Prev on page 1 and Next on the last page.
   - `findMyRow`: currently assumes the target row is already in `rows`. Change it to: if `yourRank.best.id` is not present in the current `rows`, compute `targetPage = Math.ceil(yourRank.rank / PAGE_SIZE)`, call `setPage(targetPage)`, and store the target id in a `pendingScrollId` state. Add a small effect that, when `rows` changes and `pendingScrollId` is set and present in `rows`, performs the existing `scrollIntoView` + flash logic and clears `pendingScrollId`. If the row is already on the current page, keep the existing immediate scroll/flash behavior.
   - No change needed for the "your rank" banner itself — it already renders from server-side `getArenaRank`, independent of which page is loaded.
3. **`Arena.module.css`** — add a `.lbPager` flex row (matching `.lbBar`'s `display:flex; align-items:center; justify-content:center; gap` pattern), `.lbPagerBtn` (mono font, bordered, `--surface-1` background, hover `--surface-2`, disabled state at reduced opacity + `cursor:default`), `.lbPagerNum` for individual page buttons with `.lbPagerActive` using `--accent`/`--accent-muted` like the existing `youTag`/`enrolledBtn` treatment, and a `.lbPagerEllipsis` for the `…` gap marker. Add responsive overrides in the existing `@media (max-width: 599px)` block if the numbered window needs to shrink (e.g. show fewer page numbers on narrow screens).
4. Page state naturally resets to 1 each time the Leaderboard view mounts, since `Arena.jsx` unmounts `ArenaLeaderboard` when switching tabs (confirmed by Explore — no keep-alive wrapper exists). This is acceptable default behavior and requires no extra reset logic.
5. Run `cd best-ball-manager && npm run lint`.

## Dependencies
None.

## Open Questions
- Page size is set to 50 (rather than keeping 200) so the numbered pager is meaningful even at moderate team counts; if the developer would rather keep pages large (e.g. 100 or 200) and just add Prev/Next without numbered buttons, that's a smaller variant of the same approach — flag before implementation if a different page size is preferred.

---
*Approved by: developer, 2026-07-02*
