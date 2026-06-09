# ADR-008: Admin-side UD scraping pipeline for draft-board backfill

**Date:** 2026-05-21
**Status:** Superseded
**Superseded By:** ADR-009

---

## Context

TASK-240 adds per-user draft-board capture during the existing Chrome-extension sync. That covers the immediate feature ask — "show me the full board for one of my rosters" — but has two structural limitations:

1. **No automatic backfill.** Boards only exist for drafts the user syncs *after* the extension upgrade ships. Historical rosters show a disabled button until the user re-syncs.
2. **No cross-user data.** Each user only ever sees boards captured from their own UD session. Opponent context (who else drafted this player in your tournament, what your league-mates' constructions look like) is out of reach.

A second pipeline — admin-side scraping — could fill both gaps. Reference precedent: **bbmdb** maintains a public DB of Best Ball Mania drafts by scraping `/v2/drafts/{id}` from a maintained UD account. The technical feasibility is well established; the question is whether it's appropriate for a *commercial* product to operate one.

Relevant project state:

- **Phase:** Pre-Launch Polish, target NFL Draft 2026. Headroom is months, not weeks, but the focus is shippability and conversion, not platform-building.
- **Scale target:** 500 subscribers by NFL 2026. Side-project scale; single solo developer.
- **Commercial status:** Paid subscription product. Distinct legal posture from bbmdb (non-commercial, tolerated). Scraping a partner's API to deliver a paid feature is a more provocative position than scraping it for a hobby DB.
- **Existing precedent:** [ADR-005](adr-005-self-host-the-chrome-extension-with-browser-detecting.md) established that the project is willing to operate outside official channels (self-hosted extension distribution) when product reasons justify it. That precedent applies less cleanly here because self-hosting an extension routes around store policies; admin scraping routes around a partner's ToS.
- **Data flow today:** Customer-supplied draft IDs already land in Supabase (`extension_entries.entry_id`). Discovery is bounded — no tournament crawling required to know which drafts to fetch.

### Forces in play

1. **ToS posture.** UD's ToS prohibits automated/scripted access. A commercial subscription product using scraped data is materially more exposed than a hobby DB.
2. **Blast radius of a single account ban.** One maintained UD account = one point of failure. If banned, the customer-facing surface degrades for everyone simultaneously, with no graceful per-user fallback unless the per-user path remains primary.
3. **Dual data path complexity.** RosterViewer would merge or prefer between two sources (per-user `draft_board`, admin `draft_boards_admin`). Read-side logic for staleness, freshness, conflicts.
4. **Privacy boundary.** Public BBM-style drafts are effectively public (visible to any authenticated UD account, redistributed by bbmdb today). Private slates are not. A whitelist is required and must be airtight.
5. **Customer expectation drift.** Once backfill exists, removing it later is a visible regression. The decision is partially one-way.
6. **Operational dependency.** Customer-facing feature now depends on developer's personal UD account staying signed in and unbanned. Side-project scale OK; not enterprise-grade.
7. **No clear demand signal yet.** TASK-240 hasn't shipped. There is no evidence of how often customers actually want backfilled or opponent-context data.

## Decision

Adopt **Option B (admin scraping pipeline)** as the path forward, subject to a **cautious-scraping constraint** that is binding on TASK-241's implementation: the scraper must behave conservatively enough that its traffic pattern is indistinguishable from a careful manual user, not a bulk scraper.

**Binding constraints on the implementation (TASK-241):**

1. **Rate budget.** No more than **one request every 2 seconds** to `api.underdog{fantasy|sports}.com`, with **±500 ms jitter** to avoid a perfectly periodic fingerprint. (≈ 30 requests/min ceiling, well under what an interactive user can hit.)
2. **Batched runs, not bursts.** Each scheduled run fetches at most **50 draft IDs**, then exits. With a few runs per day (e.g., every 4–8 hours via `chrome.alarms`), capacity is ~150–300 drafts/day — sufficient for steady-state new-draft trickle and gradual backfill, never a flood.
3. **Idempotency / skip-already-fetched.** Each run begins by `select draft_id from draft_boards_admin` to exclude already-cached IDs. No re-fetching just because a row exists.
4. **Honor `Retry-After` and back off on 429 / 5xx.** On any 429 or 5xx response, double the inter-request delay and stop the current run after a single retry. Resume normal pace on the next scheduled run, not within the same one.
5. **Stop-on-anomaly.** On 401/403 (auth failure or access revoked), halt all scraping and surface a notice to the developer. Do not retry until the developer manually re-enables.
6. **Whitelist of tournament types.** Only persist boards for an explicit allowlist of public-tournament `slate_title` patterns (BBM, Smash Bros, Eliminator, Pomeranian, etc., to be enumerated in TASK-241's plan). Private/unknown slate types are skipped, not stored.
7. **Off-hours bias.** Schedule runs to avoid the live-draft peak windows (US evenings) where the scraping traffic would compete with legitimate UD load.

These constraints are not optional polish — they are the basis on which this ADR is acceptable. Removing or materially relaxing them requires a new ADR.

## Alternatives Considered

### Option A: Status quo — per-user capture only

Rely solely on TASK-240. Customers must re-sync to backfill.

- **Pros:** Zero ToS exposure. No new infrastructure. No new dependencies. No new attack surface. Customer data never leaves a path UD already approves of (user reading their own browser session). No dual-data-path code complexity. Aligns with the project's current scale and solo-operator reality.
- **Cons:** Historical drafts remain blank until users re-sync. No opponent/tournament context. Users who don't re-sync never see the new feature populated for old drafts — a real but bounded gap.

### Option B: Admin scraping pipeline (chosen, with cautious-scraping constraints — see Decision)

Dedicated browser extension in developer's own browser, periodic `/v2/drafts/{id}` fetches against draft IDs harvested from Supabase, upserts to a new `draft_boards_admin` table, RosterViewer prefers admin data over per-user data.

- **Pros:** Automatic backfill of historical drafts without user action. Cross-user opponent context unlocks future features (tournament-level views, opponent ADP at your seat, league-mate stack analysis). Discovery is bounded — uses customer-supplied draft IDs only, no tournament crawling. Auth handled via the same XHR-capture trick the main extension uses, avoiding long-lived stored tokens.
- **Cons:** Commercial use of scraped data — worse ToS posture than bbmdb (non-commercial). Single account = single point of failure with no per-user fallback once customers come to expect backfill. Dual data path adds read-side complexity. Privacy whitelist must be airtight. Operational dependency on developer's personal UD account staying healthy. Removing the feature later is a visible regression. New extension + new DB table + new merge logic — non-trivial scope.

### Option C: Defer-and-measure

Ship TASK-240 and treat backfill demand as an empirical question. Watch usage analytics on `roster_draft_board_open` (TASK-240 logs this) and listen for feature requests. Revisit this ADR when a demand signal exists.

- **Pros:** Costs nothing now. Optionality preserved — Option B is still buildable later because TASK-240 already creates the `draft_boards_admin`-shaped data structure (a new table is additive, not breaking). Validates real customer need before taking on ToS, operational, and complexity costs. Honors the project's pre-launch phase priority (ship, not platform-build).
- **Cons:** Possible that demand only materializes *after* a backfill feature shows users what's possible, in which case "ship and see" never produces a signal. Mitigation: explicit lightweight user research (one-question survey, support-channel scan) after a few weeks of TASK-240 in production.

### Option D: Build admin scraper but keep data dev-private

Build the scraper for personal analytics / admin tooling only. Never surface admin-scraped data on customer-facing pages.

- **Pros:** Captures personal/strategic value (developer can study tournament dynamics, validate uniqueness sims against real data). Lower customer-expectation surface — no regression risk if shut down. Still has ToS exposure but data never leaves dev hands.
- **Cons:** Customer-facing feature gap (Option A's cons) persists in full. Significant build cost for personal-use-only data. Whether the strategic value justifies the build cost is a real but separate question from the customer-facing decision.

## Consequences

### Positive

- Historical drafts back-populate automatically without requiring users to re-sync — closes TASK-240's main customer-visible gap.
- Opponent/tournament context becomes available, unlocking future features (tournament-level views, opponent ADP at the user's seat, league-mate stack analysis).
- Discovery stays bounded — scraper only fetches draft IDs customers have already synced, never crawls tournament leaderboards. Smaller surface area than bbmdb-style "scrape everything."
- Auth handled via the same XHR-capture trick the main extension already uses — no long-lived UD token stored on a server.
- TASK-240's per-user capture remains primary and continues to work for private slates and brand-new drafts the scraper hasn't seen yet, providing a partial fallback if the scraper account is ever banned.

### Negative

- ToS exposure: a commercial product is now consuming automated API data. Posture is materially more exposed than bbmdb (non-commercial). Acceptable at current scale (~hundreds of subs), should be re-weighed if scale grows or UD changes posture.
- Dual data path complexity in RosterViewer: read-side logic to prefer admin-scraped over per-user, handle staleness, and degrade gracefully when admin data is absent.
- Operational dependency: a customer-facing feature now depends on developer's personal UD account staying signed-in and unbanned. Side-project scale OK; not enterprise-grade.
- Customer-expectation drift: once backfill is visible, removing it (e.g., after a ToS notice from UD) is a regression. The decision is partially one-way.
- Whitelist maintenance burden: new slate types appear over UD's product roadmap; without active maintenance, new public tournaments may sit un-backfilled, or — worse if the whitelist is too permissive — private slate types may leak through.

### Risks

- **Risk: account ban from rate-limit violation.** Mitigation: rate-budget constraints in the Decision section. If a ban happens despite caution, customer surface degrades but TASK-240's per-user path continues to work, so the regression is bounded.
- **Risk: privacy leak via overly-broad whitelist.** Mitigation: whitelist is allowlist-only (default deny), enumerated explicitly in TASK-241's plan, and reviewed when new slate types appear in `extension_entries.slate_title` values.
- **Risk: scope creep into bbmdb-style "scrape all of UD."** Mitigation: scraper is hardwired to read draft IDs only from `extension_entries` — tournament discovery / leaderboard crawling is explicitly out of scope for TASK-241 and would require a separate ADR.
- **Risk: UD tightens API surface (auth, rate limits, payload shape).** Acceptable — TASK-240's per-user capture continues to work as long as users can still see their own drafts in their browsers.
- **Risk: dual data path bugs.** Mitigation: TASK-241's plan must include tests covering all four states (admin-only, user-only, both, neither).

## Revisit Conditions

This ADR should be revisited and potentially superseded when **any** of the following hold:

1. **UD posture changes.** Receipt of a cease-and-desist, ToS-violation notice, or account suspension targeting BBE's scraper account, or visible UD product changes (CAPTCHA, stricter auth, public API release) that change the posture calculus.
2. **Scale crosses a threshold.** BBE passes ~2,000 subscribers, at which point the ToS-exposure and operational-dependency risks weigh more heavily than they do at side-project scale, and a more defensible data-acquisition path (official partnership, user-driven sync only) deserves re-evaluation.
3. **Rate-budget pressure.** Steady-state draft volume from the user base outgrows the 150–300 drafts/day capacity defined in the Decision section. Resolution must either tighten scope (e.g., only most-recent N drafts per user) or escalate to a new ADR — *not* silently raise the rate budget.
4. **Whitelist drift.** New UD tournament types appear that aren't covered by the allowlist, and either backfill is silently failing for them or there's pressure to add types without confirming public-data status. Triggers a maintenance review, escalates to a new ADR if the allowlist model breaks down.
5. **Scope-creep request.** Any proposal to extend scraping beyond customer-synced draft IDs (tournament leaderboard crawling, public draft enumeration, etc.) requires a new ADR — this ADR explicitly scopes to bounded discovery only.

## Related

- Tasks: TASK-240 (per-user capture — remains primary data path), TASK-241 (admin scraper implementation — unblocked by this ADR, must honor the Decision section's binding constraints), TASK-242 (this ADR)
- ADRs: [ADR-002](adr-002-enforce-mirror-not-advisor-unconditional.md) (mirror-not-advisor — admin scraper would still respect this, board view is pure presentation), [ADR-005](adr-005-self-host-the-chrome-extension-with-browser-detecting.md) (precedent for operating outside official channels — partial precedent only, since self-hosting routes around store policy whereas scraping routes around partner ToS)

---
*Approved by: PHK — 2026-05-21*
