# Changelog

All notable changes to the BBE Chrome extension are documented here. Format follows [Keep a Changelog](https://keepachangelog.com/).




## [1.4.0] - 2026-07-18

- **Sign in with Apple.** The draft overlay login now offers Apple sign-in alongside Google and email, matching the authentication options available on the website. Runs through `chrome.identity` via the same Supabase OAuth path as Google.

## [1.3.0] - 2026-06-20

- **Draft Boards in the Rosters tab.** View the full draft board for your synced drafts — every roster in the pod, your column highlighted, with per-column stats — right from the Rosters tab. Re-sync from the extension to pull in your draft boards.
- **Eliminator Mode in the draft overlay (Pro).** A bye-week rainbow built for Underdog Eliminator (weekly-survival) drafts, available right in the live-draft overlay for Pro subscribers.

## [1.2.0] - 2026-06-12

- Underdog sync now captures the **full draft board** — all 12 rosters in each pod you drafted, not just your own picks. This powers the complete Draft Board view in the Roster Viewer (opponent rosters, your highlighted column, per-column stats). Boards are read from data you're already authorized to see at sync time (ADR-009).
- **Board backfill:** each sync also fills in boards for up to 100 of your previously-synced drafts that don't yet have one, shown as a "Backfilling boards X / Y" progress step. If more remain, the sync result prompts you to reload and Sync again — repeated syncs converge until your whole portfolio has full boards. Incomplete legacy boards are repaired automatically.


## [1.1.1] - 2026-05-22

- Fix DK overlay returning 0% exposure for abbreviated player names that share both position and team. When a portfolio contained two players sharing the same first initial, last name, position, and NFL team (e.g., Bijan Robinson and Brian Robinson Jr., both RB ATL after Brian's 2026 offseason move to the Falcons), the name resolver could not disambiguate and returned null, hiding all exposure stats for both players. The resolver now adds an ADP-proximity tiebreak: when position + team narrowing leaves multiple candidates and the row exposes an ADP value, it picks the candidate whose median portfolio pick is closest to the row's displayed ADP. DK adapter row reads ADP via a three-strategy fallback (`data-key` attribute → header-column-index match → last `NumberCell`), since react-base-table does not reliably put `data-key` on body cells. Underdog flow unchanged.



## [1.1.0] - 2026-05-20

- Playoff game-stack pill: W17 (championship week) now includes RB pairings on both sides (RB↔QB/WR/TE/RB) since any opposing-game correlation carries more weight in the final week. W15 and W16 keep the conservative filter (RB excluded; TE↔TE excluded).
- Playoff pills are now per-week color-coded chips so the week is readable at a glance: W15 bronze, W16 silver, W17 gold. Candidates with hits across multiple playoff weeks collapse into a single red multi-week chip. The per-week hover popup gets matching header colors.




## [1.0.11] - 2026-05-15

- Playoff game-stack pill now labels itself with the actual playoff week(s) instead of the generic "PLAYOFFS" word. A candidate whose hits land in W15 shows `W15`; one with hits in W15 and W17 shows `W15/17`; etc. The count badge and the per-week hover popup are unchanged. Helps later in drafts when several candidates carry playoff correlations and disambiguating by week matters more than the count.




## [1.0.10] - 2026-05-14

- Fix DK overlay correlation/stack disappearing when scrolling the roster panel (TASK-233). DK's roster panel is a virtualized react-base-table that only mounts visible rows, so reads via `getCurrentPicks()` returned a moving subset of the roster and `resolveCurrentPicks()` overwrote `currentPicks` with each scroll. Now the picks resolver accumulates observed picks into a per-draft registry keyed by canonical name and never shrinks the set during a draft. Round is read from `aria-rowindex` to preserve true draft round across observations. Registry resets on overlay teardown / SPA navigation off a draft page. Underdog flow unchanged (its picks panel is not virtualized).
- Gate the in-draft row overlay (Exp %, Corr, tier badges, correlation popup) behind a Pro subscription (TASK-231). Free and signed-out users keep the FAB, sync, and tournament-aware status panel, but draft-row injections are not rendered.
- FAB panel "Overlay" toggle is greyed out with a lock icon and tooltip for non-Pro users. The Tournament Filter section is hidden when the row overlay is gated.
- New "Upgrade to Pro" button in the FAB panel opens `bestballexposures.com/?upgrade=1` in a new tab, which auto-launches the PlanPicker on the web app.
- Tier re-checks on init, sign-in/out, panel open, and draft-page navigation — upgrading without reloading reflects on the next panel open.
- Added playoff-week (W15-17) game-stack correlation pill on candidate rows (TASK-232). Pill renders when the candidate shares an NFL playoff-week game with one of the user's already-rostered players, restricted to meaningful best-ball position pairs (QB↔QB/WR/TE, WR↔QB/WR/TE, TE↔QB/WR — RB and TE↔TE excluded). Hover shows a per-week (W15/W16/W17) breakdown of correlated rostered players.
- Replaced placeholder 2026 playoff-week schedule JSON with the real NFL W15/16/17 matchups published 2026-05-14.




## [1.0.9] - 2026-05-10

- Fix Firefox content-script auth + portfolio load: bypass supabase's default `navigator.locks`-based token-refresh lock with a no-op lock function. In Firefox content scripts, `navigator` is Xray-wrapped from the page compartment and `navigator.locks.request(...)` returns a privileged-compartment Promise the content sandbox cannot `.then` on, throwing "Permission denied to access property 'then'" on every `supabase.auth.getSession()` / `supabase.from(...)` call. Each tab has its own client and there's no concurrent refresh to serialize, so a no-op lock is safe.




## [1.0.8] - 2026-05-10

- Fix Firefox Google sign-in from the FAB auth panel: wrap `chrome.runtime.sendMessage({ type: 'GOOGLE_OAUTH' })` in a sandbox-owned Promise via the callback form. v1.0.6 covered `chrome.storage.*` but missed this one chrome.* await in `signInWithGoogle`, so the Google button silently failed in Firefox with "Permission denied to access property 'then'". Email/password sign-in was already working post-1.0.6.
- Sync popup version string to manifest (was still showing v1.0.6).




## [1.0.7] - 2026-05-10

- Fix DraftKings roster name matching (TASK-227). DK's lineup API returns abbreviated first names, so synced rosters were stored as "B. Robinson", "J. Cook III", "L. Burden III" and never matched DK ADP CSV keys — silently breaking ADP, projections, team, and stack lookups across Exposures, ADP Tracker, Combos, Draft Assistant, and Roster Viewer. The DK adapter now prefers `displayName` from the draftables endpoint we already fetch, falling back to the abbreviated concatenation only when unavailable.
- Live-overlay name resolution: capture team in `getCurrentPicks` and pass it through `resolvePlayerKey`, so ambiguous abbreviations like "B. Robinson" (Bijan vs. Brian, both RB) disambiguate by team.
- Live-overlay abbreviation map: build and lookup both route through `canonicalName`, fixing 0% exposure on last names with embedded periods (e.g. Amon-Ra St. Brown).
- Existing already-synced rosters keep their abbreviated names until the user re-syncs; no auto-backfill.




## [1.0.6] - 2026-05-09

- Fix Firefox content-script auth panel: switch `chrome.storage.local` calls used in content-script context (Supabase auth storage adapter, post-sync writes) to callback form so Firefox's Xray vision doesn't block `.then` access on cross-compartment Promises.
- Bump `browser_specific_settings.gecko.strict_min_version` to `128.0` (required for `world: "MAIN"` content scripts).
- Sync popup version string to manifest.




## [1.0.5] - 2026-05-08

- Add Chromium self-hosted auto-update via top-level `update_url` (TASK-213). Resolves Edge "unknown source" install warning that grayed out the enable toggle when dragging a self-hosted `.crx` onto `edge://extensions`.




## [1.0.4] - 2026-05-08

- First release produced by the self-hosted build pipeline (TASK-215). No functional changes from 1.0.3.
