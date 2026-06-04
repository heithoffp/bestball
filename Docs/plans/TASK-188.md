# TASK-188: Weekly portfolio digest email — retention + conversion loop

**Status:** Approved
**Priority:** P1

---

## Objective
Provide a **manually-run admin script** that emails a weekly, tier-aware portfolio digest every Friday. For **paid** users it is a retention loop; for **free** users it surfaces one Pro-**locked** insight with a deep-link CTA (top of the free→paid funnel). The script **previews to the developer's own inbox first** (`heithoff.patrick@gmail.com`) and only sends to all users on an explicit second invocation. **No user is skipped** — users with a personal signal get a personalized digest; everyone else (including users who never synced) gets a **general-news** digest (league-wide ADP movers, latest blog post, sync nudge). Mirror, not advisor: describe state, never prescribe.

## Verification Criteria
A correct implementation satisfies all of:

1. **Manual three-phase run** — no-arg = safe **dry-run** (computes + prints manifest, sends nothing); `--preview` sends a single combined review email to `heithoff.patrick@gmail.com` and nothing to real users; `--send --confirm` sends each opted-in user their digest.
2. **Personalized vs general routing (no skip)** — a user gets the **personalized** digest if they have ≥1 roster AND at least one signal (roster synced in last 7 days, exposure shift ≥ threshold, or an owned player with a normalized ADP move ≥ threshold). Otherwise they get the **general-news** digest. Only `email_preferences.weekly_digest = false` excludes a user entirely. A seeded never-synced user receives the general digest; a seeded fresh-roster user receives the personalized digest.
3. **Position-normalized ADP movers** — ADP significance is `|prevPick − currPick| / prevPick` (with an absolute floor, default ≥ 2 picks, to suppress top-of-board noise). Used both for the personalized owned-mover threshold and for ranking league-wide risers/fallers in the general digest. Movers are computed from the bundled `best-ball-manager/src/assets/adp/*.csv` snapshots.
4. **Tier-aware content** — free user → exactly one locked-insight teaser + deep-link CTA + seasonal-urgency footer; paid user → same insight in full, no upsell footer. Applies to both personalized and general modes (general free still teases a Pro capability).
5. **Strongest-signal selection** — the personalized free-tier teaser is chosen by ranking candidate locked insights by a strikingness score and picking the max. A seeded dominant-signal fixture selects that signal.
6. **Mirror-not-advisor** — no rendered copy contains prescriptive tokens (no "should", "fade", "target", "avoid", "must"); enforced by a unit assertion over rendered output.
7. **Unsubscribe** — every email contains a working `/unsubscribe?token=` link and a `List-Unsubscribe` header; opted-out users are excluded on the next run (CAN-SPAM).
8. **Week-over-week snapshot** — `--send` writes a `digest_snapshots` row per emailed user (`unique(user_id, week_start)`) for next week's exposure-shift diff; `--preview`/dry-run write nothing; re-running `--send` the same week does not double-send.

## Verification Approach
- **Unit (Node `node --test scripts/lib/digest/`):** seeded fixtures over the pure `assemble.mjs`:
  - never-synced vs unchanged vs fresh-roster vs ADP-mover → assert **mode** (general vs personalized), never skipped. (Criteria 2)
  - two-snapshot ADP fixture with an early-round and a late-round 5-pick move → assert the early-round mover ranks higher (normalized %). (Criteria 3)
  - free vs paid → assert teaser-vs-full + footer. (Criteria 4)
  - dominant-signal → assert selected teaser. (Criteria 5)
  - rendered HTML → assert no banned advisor tokens. (Criteria 6)
  - first-run (no prior snapshot) vs second-run → assert shift lines. (Criteria 8)
- **Integration (seeded Supabase, service-role):**
  - `--preview` → one email, recipient == developer, body lists eligible users + their mode; 0 snapshot writes. (Criteria 1, 2)
  - `--send --confirm` (small set) → N emails to N opted-in users, N snapshots; opted-out seeded user excluded. (Criteria 1, 7, 8)
  - re-run `--send` same week → 0 emails. (Criteria 8)
- **Manual (developer, the real Friday flow):** run `--preview`, eyeball the combined email in Gmail (rendering, links, tier + mode branching, ADP-mover relevance), then `--send --confirm`.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `scripts/send-weekly-digest.mjs` | Create | Main admin script: flags (`--preview` / `--send` / `--confirm` / `--to` / `--limit` / dry-run default), Supabase admin fetch, load ADP, assemble, Resend send, snapshot writes |
| `scripts/lib/digest/assemble.mjs` | Create | Pure: user+rosters+adp+priorSnapshot+tier → `{ mode, subject, html, snapshot }`. Routing (personalized/general), normalized ADP significance, strongest-signal teaser. Unit-tested |
| `scripts/lib/digest/template.mjs` | Create | Tier- and mode-branched HTML template + unsubscribe link / `List-Unsubscribe` builder |
| `scripts/lib/digest/loadAdp.mjs` | Create | Read & parse `src/assets/adp/*.csv` into the `adpSnapshots` shape `processMasterList` expects; expose league-wide normalized movers |
| `scripts/lib/digest/__tests__/digest.test.mjs` | Create | `node --test` unit suite |
| `supabase/migrations/00X_create_email_preferences.sql` | Create | `email_preferences` (user_id PK, weekly_digest bool default true, unsubscribe_token uuid, updated_at) + RLS |
| `supabase/migrations/00X_create_digest_snapshots.sql` | Create | `digest_snapshots` (user_id, week_start, summary jsonb, created_at; unique(user_id, week_start)) + RLS |
| `best-ball-manager/src/pages/Unsubscribe.jsx` | Create | Minimal `/unsubscribe?token=` page flipping `weekly_digest=false` |
| `best-ball-manager/src/App.jsx` | Modify | Add the `/unsubscribe` route |
| `docs/Feature_Specs/Weekly_Digest_Email.md` | Create | Feature spec + Friday operating procedure |

## Implementation Approach
1. **Script shell** — follow `scripts/send-chrome-review-email.mjs` conventions (Node ESM, `@supabase/supabase-js` service-role, Resend via `RESEND_API_KEY`, from `noreply@bestballexposures.com`). Flags: dry-run (default) → manifest only; `--preview` → one combined email to `heithoff.patrick@gmail.com`, no snapshots; `--send --confirm` → real sends + snapshots; `--to <email>` / `--limit <n>` for testing.
2. **Reuse, don't vendor** — import `best-ball-manager/src/utils/{helpers,stackAnalysis,rosterArchetypes}.js` directly (pure ESM).
3. **Load ADP (`loadAdp.mjs`)** — read `src/assets/adp/` from disk, parse `*_adp_YYYY-MM-DD.csv` (PapaParse), sort by date, build `adpSnapshots` + `adpMap`. Compute **league-wide movers**: for each player present in the two most recent snapshots, `significance = |prev − curr| / prev`, drop moves under the absolute floor, sort desc → top risers/fallers for the general digest.
4. **Eligible-user query** — Supabase admin: `auth.users` + `subscriptions` (active/trialing) + `profiles` (beta/comp) → tier per `SubscriptionContext.jsx`; left-join `email_preferences` (missing ⇒ opted-in). Pull each user's `extension_entries`. Exclude only opted-out users.
5. **Per-user aggregate + routing (`assemble.mjs`)** — flatten entries → `processMasterList` (exposures + ADP history), `analyzeRosterStacks`, `analyzePortfolioTree`. Compute signals: new rosters (synced_at < 7d), exposure shifts vs prior snapshot, owned ADP movers (normalized significance ≥ threshold). **Routing:** any signal ⇒ `mode='personalized'`; else ⇒ `mode='general'`. Always returns content (never skip).
6. **Strongest-signal teaser (free, personalized)** — candidates: accidental-stack count → Combo Analysis; player over-concentration → Exposures/Roster Viewer; archetype over-concentration → Roster Viewer; big owned ADP mover → ADP Tracker. Normalize each to a strikingness score, pick max, map to deep-link.
7. **General-news content** — top league-wide normalized ADP risers/fallers; latest blog post (title + link — see Dependencies/TASK-249; omit block gracefully if no published URL yet); a "sync your latest drafts" nudge; free users still get a Pro-capability teaser.
8. **Render (`template.mjs`)** — sections per mode/tier: header → what-changed (personalized) or league movers (general) → ADP movers → hook (free teaser+CTA / paid full) → footer (free seasonal urgency; both: unsubscribe). Mirror-not-advisor copy. `List-Unsubscribe` header.
9. **Send + persist** — Resend per recipient; on `--send`, upsert `digest_snapshots`; final summary (sent / personalized vs general / errors).
10. **Unsubscribe** — `/unsubscribe?token=` React page resolves the token, sets `weekly_digest=false`, shows confirmation.

**Migration note:** Migrations run now (June 2026), before the 2026-10-30 grant cutoff → new public tables auto-expose; add RLS regardless. Explicit grants optional now, included for forward-safety (per CLAUDE.md).

## Dependencies
- **No ADR needed** — manual admin script (developer's choice) removes the scheduled-job-runtime decision.
- **TASK-249 (blog on site)** — *soft*: the general digest links to the latest published blog post. Until TASK-249 ships those pages, the blog block is omitted (or links to the raw article URL if one exists). Not a hard blocker.
- Resend (`RESEND_API_KEY`, verified domain; `scripts/send-*.mjs` as references); `extension_entries` / `subscriptions` / `profiles` (exist); Supabase service-role key (already used by existing admin scripts).

## Resolved Decisions
- Util import (not vendor) — **confirmed**.
- ADP significance — **position-normalized %** (`|prev−curr|/prev`, absolute floor ≥ 2 picks).
- No skipping — **general-news fallback** for users without a personal signal.
- Preview = one combined email to the developer — **confirmed**.
- Relevance thresholds (starting values): exposure shift ≥ 5 pts; normalized ADP move ≥ ~10% (floor 2 picks); roster synced in last 7 days. Tunable constants.

---
*Approved by: developer (2026-06-03) — feedback incorporated: general-news fallback (no skip), normalized ADP %, unsubscribe required.*
