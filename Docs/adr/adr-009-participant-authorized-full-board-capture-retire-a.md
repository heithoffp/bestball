# ADR-009: Participant-authorized full-board capture (retire admin scraping)

**Date:** 2026-06-09
**Status:** Accepted
**Supersedes:** ADR-008

---

## Context

ADR-008 (Accepted 2026-05-21) authorized an admin-side scraping pipeline to backfill draft boards and unlock cross-user opponent context, on the explicit premise that BBM-family tournament slates are *"public — visible to any authenticated UD account, redistributed by bbmdb today."* TASK-241 implemented that pipeline.

During TASK-241's live verification on **2026-06-09**, that premise was **empirically falsified**. Underdog's `/v2/drafts/{id}` endpoint is **ownership-gated**: it returns a draft only to accounts that participated in that draft's pod.

Decisive evidence (queried against the live `draft_boards_admin` after ~272 boards were scraped):

- A query for *any cached board with no developer account in its pod* returned **0 rows**. Every board the scraper successfully fetched belonged to a 12-person pod one of the developer's own accounts was in.
- Per-account breakdown: the developer's three accounts each cached ~89 boards; every other user showed `cached` of 0–2 (the 1–2 being drafts the developer was *also* in). Thousands of other users' drafts all returned 404.

**Implication:** the admin scraper can only ever fetch drafts the operating account personally entered — which the developer already obtains through normal sync. The cross-user backfill purpose is unachievable through this mechanism. ADR-008 listed "UD posture changes / account-level access revoked" and the failure of its public-data premise as revisit conditions; this finding triggers them.

**Key enabling fact for the alternative:** the customer extension *already* calls `/v2/drafts/{id}` for the user's own drafts at sync time, and that response **already contains all 12 rosters in the pod** (`draft.picks` includes every entry's picks). The extension currently discards 11 of 12, keeping only the syncing user's picks:

```js
// underdog-bridge.js — full pod board is in draft.picks; we throw away 11/12
const userPicks = (draft.picks ?? []).filter(p => p.draft_entry_id === userEntry.id);
```

So complete pod boards for every draft any user enters are obtainable **within authorized access, with zero new ToS exposure**, simply by persisting the full board instead of dropping it.

## Decision

**Retire the admin-side scraping pipeline (supersede ADR-008). Pivot to participant-authorized full-board capture:** store all 12 rosters from the `/v2/drafts/{id}` response the syncing user is already entitled to, at sync time. Cross-user/opponent coverage emerges from **pod overlap** across the user base — every synced draft reveals its entire pod. Drafts that no BBE user entered are explicitly out of scope; that is the correct data boundary for a commercial product. This work folds into **TASK-240**.

## Alternatives Considered

### Option A: Keep the admin scraping pipeline (ADR-008 status quo)
Continue operating the `admin-extension/` scraper against `/v2/drafts/{id}`.
- **Pros:** Already built; no new work.
- **Cons:** **Does not work** for its stated purpose — ownership gating means it only retrieves the operator's own drafts. Retains all of ADR-008's ToS / operational / single-account-ban liabilities while delivering none of the cross-user value. Non-viable.

### Option B: Participant-authorized full-board capture (chosen)
Persist the full 12-roster board at sync from data the user is authorized to see.
- **Pros:** Stays entirely within UD-authorized access (the user reading their own session) — zero net-new ToS exposure, consistent with ADR-008's Option A safety. Complete pod boards for every synced draft. Pod overlap compounds coverage across users for free. Eliminates the single-account-ban dependency, the dual-data-path merge complexity, and a whole extension + scraper to maintain. Simpler system.
- **Cons:** Coverage limited to drafts ≥1 BBE user entered — never the full tournament field. Historical drafts need a re-sync to capture their full board (existing `extension_entries` rows hold only the user's own picks). ~12× the pick volume stored per retained draft. Persists identifiable third-party rosters server-side (see Risks).

### Option C: Multi-account credential-pooling scraping
Operate many UD accounts to widen pod coverage toward full-field reconstruction.
- **Pros:** Approaches bbmdb-style breadth.
- **Cons:** Egregious ToS posture for a *paid* product — exactly the risk ADR-008 cautioned against, amplified. Operationally unmanageable for a solo developer; high coordinated-ban risk. Rejected.

### Option D: Abandon full-board / opponent context entirely
Keep today's user-own-picks-only behavior; drop TASK-240.
- **Pros:** Least work; no third-party-data storage question.
- **Cons:** Forgoes a differentiating feature (full board view, opponent context) that is achievable cheaply and within authorized access. Throws away value we can legitimately capture.

## Consequences

### Positive

- The full-board feature is delivered through **authorized access** — no scraping, no single-account dependency, no ToS gray zone for a commercial product.
- Every synced draft yields its complete pod; pod overlap means the more users sync, the richer the opponent-context dataset becomes — a healthy growth flywheel.
- Net **reduction** in system complexity: the `admin-extension/`, the `draft_boards_admin` scraper writes, and the planned dual-source merge logic all go away.

### Negative

- No full-tournament field — only drafts BBE users were in. Opponent context is "your pods," not "the whole tournament."
- Historical full boards require a re-sync; pre-upgrade `extension_entries` rows can't be retroactively expanded (they never stored the other 11 rosters).
- Storage grows ~12× per draft for boards we choose to retain.

### Risks

- **Third-party data persistence.** Storing all 12 rosters means persisting identifiable picks of users (some non-BBE) server-side. Defensible — it's public-tournament data the syncing user is authorized to view, and surfacing opponent context was always the goal — but it warrants a privacy/retention note and should be reflected in the privacy policy. Revisit if UD or a user objects.
- **UD payload-shape change.** Capture depends on `draft.picks` containing all entries; if UD trims the payload to only the requesting user, coverage degrades to today's behavior. Acceptable — it fails safe.
- **Re-sync friction.** Backfill depth depends on users re-syncing. Mitigation belongs in TASK-240's plan (e.g., prompt or auto re-sync on upgrade).

## Revisit Conditions

This decision should be reconsidered when **any** of the following hold:

1. UD publishes a genuinely public draft-results endpoint or offers official data access — full-field coverage could then be pursued legitimately, beyond pod-overlap reach.
2. A user or UD objects to third-party roster storage — re-weigh the privacy/retention stance.
3. `draft.picks` stops returning the full pod (payload trimmed to the requesting user) — re-evaluate whether the feature remains viable at all.

## Related

- **Supersedes:** [ADR-008](adr-008-admin-side-ud-scraping-pipeline-for-draft-board-backfill.md).
- **Tasks:** TASK-240 (now the primary vehicle — expand to store the full board), TASK-243 (RosterViewer prefer-admin — moot, close Won't Do), TASK-244 (scraper scheduler — moot, close Won't Do), TASK-251 (negative-cache scraper 404s — moot), TASK-250 (ignore non-football slates — still valid, customer-side). Follow-up: retire/remove `admin-extension/` + `draft_boards_admin` (new cleanup task).
- **ADRs:** [ADR-002](adr-002-enforce-mirror-not-advisor-unconditional.md) (board view remains pure presentation), [ADR-008](adr-008-admin-side-ud-scraping-pipeline-for-draft-board-backfill.md) (superseded).

---
*Approved by: PHK — 2026-06-09*
