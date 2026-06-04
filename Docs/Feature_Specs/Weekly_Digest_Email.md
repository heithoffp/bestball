# Feature Spec — Weekly Portfolio Digest Email

**Task:** TASK-188
**Status:** Implemented (pending first live send)
**Type:** Operator-run growth/retention surface (not a user-facing app tab)

---

## Purpose

A weekly, tier-aware email that mirrors each user's best-ball portfolio. It is the
top of the free→paid funnel (free users get a Pro-locked teaser) and a retention
loop (paid users get the full insight). It is **manually run by the operator** every
Friday — not automated — and previews to the operator's own inbox before any bulk send.

Design principle: **mirror, not advisor.** Every line describes portfolio state; no
copy prescribes action. The unit test asserts the rendered HTML contains none of the
banned advisor tokens (`should`, `fade`, `target`, `avoid`, `must`, `recommend`).

---

## Operating procedure (the Friday flow)

```bash
cd scripts && npm install            # once, to pick up papaparse

# from repo root, with .env.local containing SUPABASE_URL,
# SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY:
node scripts/send-weekly-digest.mjs                 # 1. DRY RUN — prints the manifest, sends nothing
node scripts/send-weekly-digest.mjs --preview       # 2. sends ONE combined review email to heithoff.patrick@gmail.com
node scripts/send-weekly-digest.mjs --send --confirm # 3. sends each eligible user their digest
```

Helper flags: `--to <email>` sends a single sample digest to an address; `--limit <n>`
caps recipients.

---

## Routing (no user is skipped)

Every opted-in user receives an email. Mode is chosen per user:

| Mode | When | Content |
|------|------|---------|
| **personalized** | user has ≥1 roster AND a signal (new roster in 7d, exposure shift ≥ 5 pts, or owned ADP move ≥ 10% normalized) | what changed + owned ADP movers + tier hook |
| **general** | no personal signal (incl. users who never synced) | league-wide ADP movers + latest blog post + sync nudge + tier hook |

Only `email_preferences.weekly_digest = false` excludes a user entirely.

---

## ADP movement metric (position-normalized)

Significance = `|prevPick − currPick| / prevPick`, with an absolute floor of 2 picks.
A 5-pick move at pick 30 (16.7%) outranks a 5-pick move at pick 180 (2.8%). Used both
for the personalized owned-mover threshold and for ranking league-wide risers/fallers.
Computed from the bundled `best-ball-manager/src/assets/adp/*.csv` snapshots (read off
disk by the script — no DB ADP needed).

---

## Tiering

- **free** → one Pro-locked teaser (strongest-signal rotation) + deep-link CTA into the
  locked tab + seasonal-plan footer.
- **pro** → the insight shown in full, no upsell footer.

Tier derived exactly as `SubscriptionContext.jsx`: active/trialing subscription, or
`profiles.beta_expires_at` / `comp_expires_at` in the future ⇒ `pro`; else `free`.

Strongest-signal teaser candidates and their deep-links: accidental QB stacks → Combo
Analysis; player over-concentration → Exposure Analysis; archetype concentration →
Roster Viewer; owned ADP mover → ADP Tracker. Highest strikingness score wins.

---

## Data model

- **`email_preferences`** (`007_…`) — `weekly_digest` opt-out + `unsubscribe_token`.
  No-login unsubscribe via the `unsubscribe_digest(uuid)` SECURITY DEFINER RPC
  (granted to `anon`), called by the `/unsubscribe?token=` page.
- **`digest_snapshots`** (`008_…`) — one row per user per ISO `week_start` holding the
  exposure summary. Enables (a) week-over-week exposure-shift diffs and (b) idempotency
  (re-running `--send` in the same week skips already-sent users). Service-role only.

---

## Code map

| File | Role |
|------|------|
| `scripts/send-weekly-digest.mjs` | Orchestration: fetch users/tier/entries, load ADP, assemble, send via Resend, write snapshots |
| `scripts/lib/digest/loadAdp.mjs` | Parse bundled ADP CSVs → snapshots + adpMap + league movers (I/O) |
| `scripts/lib/digest/assemble.mjs` | Pure: routing, normalized movers, exposure diff, strongest-signal teaser, snapshot |
| `scripts/lib/digest/template.mjs` | Pure: tier/mode-branched HTML + text + List-Unsubscribe header |
| `scripts/lib/digest/__tests__/digest.test.mjs` | `node --test` unit suite (9 tests) |
| `best-ball-manager/src/components/Unsubscribe.jsx` | `/unsubscribe?token=` page |

Analytics are reused (not vendored) from `best-ball-manager/src/utils/` —
`processMasterList`, `analyzeRosterStacks`, `classifyRosterPath`.

---

## Known limitations / future work

- **Preview shape**: one combined email with all digests stacked — fine at current
  scale, may need pagination as the list grows.
- **Blog link** depends on TASK-249 (blog pages on the site); until then the general
  digest's blog block links to `/blog/<slug>` which 404s if not yet published — the
  block is omitted when no index entry exists.
- **Thresholds** (exposure 5 pts, ADP 10%, 7-day new-roster) are constants in
  `assemble.mjs#THRESHOLDS`; tune from real send feedback.
