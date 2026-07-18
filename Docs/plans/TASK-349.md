# TASK-349: Mobile Arena UI parity with web's mobile Arena layout

**Status:** Pending Approval
**Priority:** P2

---

## Objective

Rebuild the mobile app's Arena screen so it delivers the same "tale of the tape" experience the web app renders at its mobile breakpoint (`<900px`) — swipeable contender deck, comparison spine, rich roster cards with headshots and stacks, instant Elo reveal, and a podium leaderboard with search. Today `mobile-app/src/screens/ArenaView.jsx` is a stripped, text-only port; this closes the gap to the web's `components/arena/*` mobile layout that the developer wants replicated.

## Verification Criteria

1. **Vote parity** — The Vote view shows a swipeable Red/Blue contender deck with a corner toggle synced to the swipe, an `ArenaTape` comparison spine above it (Team CLV, Proj Pts, Uniqueness, Build, Top Stack, Picks, Drafted), rich roster cards (headshots, position chips, stack rails, CLV/Proj lens toggle, stacks toggle), and a Skip/Next dock. Tapping the in-view card casts the vote; the picked card reveals a rolling Elo delta instantly, and a session scorecard (judged / upsets) increments.
2. **Leaderboard parity** — The Leaderboard view shows a top-3 podium, ranked rows with Elo bars, rank-movement arrows, and win%, a player/NFL-team chip search with suggestions, a "your best team / find my team" banner when signed in, pagination, and rows that expand to the full roster card.
3. **My Teams parity** — The My Teams view matches the web's copy and layout: enrollment intro, Leave/Rejoin toggle, and per-team rows (tournament title, picks, Elo · W–L), with the same signed-out / no-BBM7-teams empty states.
4. **Runs cleanly** — `npm run lint` passes and the Arena screen renders without runtime errors in Expo (Vote / Leaderboard / My Teams all reachable, gated by `ARENA_AVAILABLE` / auth exactly as web).

## Verification Approach

- **Lint:** `cd mobile-app && npm run lint` exits clean (no new errors in the new/changed files).
- **Static import check:** confirm every import in the new components resolves against `mobile-app/shared/utils/*` and `mobile-app/src/components/ui.jsx` — `grep` the new files' import lines and match each against an existing export. All data functions (`getPairing`, `submitVote`, `getLeaderboard`, `searchLeaderboard`, `getMyBestArenaTeam`, `getArenaRank`, `getMyArenaTeams`, `getArenaEnrollment`, `setArenaEnrollment`, `enrichSnapshotDisplay`, `enrichSnapshotCLV`, `buildEnrollableTeams`, `analyzeRosterStacks`, `nflTeamColor`, `teamAbbrev`, `posColor`, `headshotUrl`) already exist mobile-side — no new util work.
- **Manual run (developer):** launch the app (`npx expo start`, dev build on the developer's iPhone), open the Draft tab → Arena, and confirm each criterion above interactively: swipe the deck, cast a vote and watch the Elo roll, flip the CLV/Proj lens and stacks, open Leaderboard (podium + expand a row + run a chip search), open My Teams. This is the load-bearing check — Arena depends on live Edge Functions and cannot be fully exercised from a headless lint.
- **Screenshot compare (developer, optional):** put the web app in a narrow viewport next to the mobile app to confirm the layouts read the same.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `mobile-app/src/screens/arena/ArenaRosterCard.jsx` | Create | RN contender/roster card: headshot rows (reuse `PlayerAvatar`), position chips + stack chips, per-row stack rails, CLV/Proj lens cell with bars, corner tint (red/blue/neutral), win/loss + "Your pick" states, Elo delta ribbon + rolling ticker, draft-date + picks + combo header. |
| `mobile-app/src/screens/arena/ArenaTape.jsx` | Create | RN "tale of the tape" spine: VS medallion + stat rows (Team CLV, Proj Pts, Uniqueness, Build, Top Stack, Picks, Drafted) with winner-side highlight in corner color. |
| `mobile-app/src/screens/arena/ArenaVote.jsx` | Create | RN vote view: prefetch + `fetchNext`, `predictEloResult` client mirror, instant reveal, session scorecard, lens/stacks toggles (AsyncStorage-persisted), swipeable deck (horizontal paging `ScrollView` + corner toggle synced via `onScroll`/`scrollTo`), Skip/Next dock, all non-matchup states (loading/empty/unavailable/rate-limited/error). |
| `mobile-app/src/screens/arena/ArenaLeaderboard.jsx` | Create | RN leaderboard: podium (top-3), ranked rows w/ Elo bars + `Movement` arrows (AsyncStorage rank store) + win%, chip search w/ suggestions (reuse `SearchBar`), your-rank/find-my-team banner, pagination, expandable rows rendering `ArenaRosterCard` (neutral corner). |
| `mobile-app/src/screens/arena/ArenaMyTeams.jsx` | Create | RN My Teams: enrollment intro + Leave/Rejoin toggle, per-team standings rows, web-matching empty states (unavailable / signed-out / no BBM7 teams). |
| `mobile-app/src/screens/ArenaView.jsx` | Modify | Slim to the Arena shell: brand header (Swords + "Best Ball Arena" + BBM7 tag), `Segmented` Vote/Leaderboard/My Teams nav, `useAutoRegister`, the shared `adpLookup`/`projLookup`/`projTotalFn`/`comboLookup` memos, and dispatch to the three sub-views. |
| `mobile-app/src/theme.js` | Modify | Add corner colors (`cornerRed`, `cornerBlue`) + tint helpers used by the card/tape winner highlighting. |

## Implementation Approach

**Guiding rule:** the web files under `best-ball-manager/src/components/arena/*` are the reference. Match their structure, copy, and behavior; translate DOM/CSS to RN primitives. No changes to `best-ball-manager/` and no changes to any `shared/utils/` — the data layer is already ported and is the source of truth.

1. **Theme prep (`theme.js`)** — Add `cornerRed`/`cornerBlue` (mirror the web's `--corner-red`/`--corner-blue`) plus a small tint helper so cards and tape can render corner-colored borders/backgrounds and winner highlights.

2. **`ArenaRosterCard.jsx`** — Port from the web card:
   - Rows built from `snapshot.players` (already sorted/enriched by `enrichSnapshotDisplay`). Each row: `PlayerAvatar` (headshot + monogram fallback, already handles DST logos) · name · `POS·TEAM·pick` meta · lens cell.
   - **Lens cell:** `clv` → signed % text + a center-anchored `Bar`; `proj` → rounded value + a `Bar` scaled to `maxProj`. Colors from `posColor`.
   - **Stacks:** `analyzeRosterStacks(players)` (teams normalized via `teamAbbrev`) → per-row left "rail" (colored left border via `nflTeamColor`) + stack chips in the position-snapshot header. Gated by `showStacks`.
   - **Header:** corner dot + label, "Your pick ✓" tag, draft date (`CalendarDays`), combo pctText chip, "{count} picks".
   - **Reveal:** corner tint red/blue/neutral; win/loss border; Elo delta ribbon with a `RatingTicker` — port the web's rAF count-up (RN supports `requestAnimationFrame`; write to component state instead of DOM `textContent`, honoring reduced-motion via `AccessibilityInfo.isReduceMotionEnabled` or a simple immediate-set fallback).
   - Card is the vote target when `pickable` (Pressable → `onPick`).

3. **`ArenaTape.jsx`** — Port directly: `TapeStat` = `<View>` row of `[A value | label | B value]`, winner side highlighted in corner color. Reuse the same `buildName` (via `ARCHETYPE_METADATA`), `stackSummary` (via `analyzeRosterStacks`/`nflTeamColor`), CLV/Proj/date/combo comparisons and winner rules verbatim. `React.memo` the export.

4. **`ArenaVote.jsx`** — Port the web vote controller:
   - State machine (`loading|voting|picked|revealed|empty|unavailable|rate_limited|error`), `prefetch`/`fetchNext`, optimistic pick + `predictEloResult` (copy the K-factor/expectedScore math verbatim so the client roll matches the server), `REVEAL_MS` auto-advance timer, guest-cap handling.
   - **Deck:** horizontal `ScrollView` with `pagingEnabled` (card width = content width, next card edge peeking), `onScroll` → `deckIndex` (midpoint test, matching web), programmatic `scrollTo` for the corner toggle and the reveal auto-focus of the picked card. Nested inside the screen's vertical scroll — horizontal-in-vertical is fine in RN.
   - **Corner toggle:** two tabs (Red/Blue) synced both ways with the deck.
   - **Session scorecard** (judged/upsets) + **lens/stacks toggles** persisted via AsyncStorage (`bbe_arena_lens`, `bbe_arena_stacks`, `bbe_arena_session_stats`, `bbe_arena_guest_capped`) — same keys as web for conceptual parity; reads are async so seed from state and hydrate on mount.
   - **Dock:** Skip (voting) / advance row with progress fill + Next (reveal). Drop keyboard handlers (no hardware keyboard on mobile).

5. **`ArenaLeaderboard.jsx`** — Port the web leaderboard:
   - Data via `getLeaderboard({ tournament:'featured', limit:50, offset })`; `searchLeaderboard` for chip search; `getMyBestArenaTeam`/`getArenaRank` for the banner.
   - `computeMovement` rank store in AsyncStorage (`bbe_arena_lb_ranks`) → `Movement` arrows.
   - Podium (top-3) as Pressable cards; ranked rows as Pressables with Elo `Bar`, W–L, win%, movement, chevron; expand → `ArenaRosterCard` (corner `neutral`).
   - Chip search: reuse `SearchBar`; suggestions from `masterPlayers` + `NFL_TEAMS` (same `snapshotMeta`/`BuildMeta` preview facts). "Find my team" jumps to the page holding the row then scrolls (RN: track row via `onLayout` refs + `ScrollView.scrollTo`, or a measured offset).
   - Pagination control (prev / windowed page numbers / next).

6. **`ArenaMyTeams.jsx`** — Port copy + layout: enrollment intro paragraph (enrolled vs not), Leave/Rejoin button, `getMyArenaTeams`/`getArenaEnrollment`/`setArenaEnrollment`, per-team rows (`tournamentTitle || slateTitle`, picks, Elo · W–L · new), and the three gate states (`!ARENA_AVAILABLE`, `!user`, no featured teams) using `isFeaturedSnapshot`/`FEATURED_TOURNAMENT`.

7. **`ArenaView.jsx` (shell)** — Reduce to: brand header, `Segmented` nav, `useAutoRegister`, the shared `adpLookup`/`projLookup`/`projTotalFn`/`comboLookup` memos (already present), and dispatch to the three new sub-views. Keep it inside the existing `ScreenScaffold` mount in `app/(tabs)/draft.jsx` (no routing change).

**Edge cases:** guest voting cap (standing notice), reduced-motion (skip the Elo roll), empty/rate-limited/unavailable states, DST logo rows (PlayerAvatar handles), snapshots carrying full team names (normalize via `teamAbbrev` before stack/color lookup — same as web), and async AsyncStorage hydration (never block first paint on it).

## Dependencies

None. All required shared utils, client functions, data files, and UI primitives are already present in `mobile-app/`. AsyncStorage (`@react-native-async-storage/async-storage`) is already a dependency.

## Open Questions

- **Persistence keys:** plan reuses the web's storage key *names* in AsyncStorage for conceptual parity. This is cosmetic — happy to use mobile-scoped names if preferred.
- **Reveal-motion library:** plan uses `requestAnimationFrame` (built-in) for the Elo ticker rather than Reanimated, to keep the port close to the web source. Reanimated is available if a smoother native-driver animation is wanted later.
- **KB:** no `kb/index.md` at repo root — research phase ran without KB context (used direct source reads of both Arena implementations).

---
*Approved by: PH — 2026-07-18*
