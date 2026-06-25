# Backlog Archive -- June 2026

Archived from `BACKLOG.md`. Last updated 2026-06-25. Contains completed tasks through TASK-266.

## Completed Tasks

| ID | Title | Status | Priority | Plan | Verified | Completed |
|----|-------|--------|----------|------|----------|-----------|
| TASK-202 | Admin comp Pro script + comp_expires_at column | Done | P2 | [Plan](../plans/TASK-202.md) | No | 2026-05-06 |
| TASK-201 | Customer comms for Chrome review window | Done | P2 | [Plan](../plans/TASK-201.md) | No | 2026-05-06 |
| TASK-200 | Sideload extension stopgap (download zip + install instructions) | Done | P2 | [Plan](../plans/TASK-200.md) | Yes | 2026-05-06 |
| TASK-212 | Generate and wire post-draft simulation data | Done | P3 | [Plan](../plans/TASK-212.md) | No | 2026-05-07 |
| TASK-210 | DraftExplorer — Pre-Draft / Post-Draft mode toggle | Done | P3 | [Plan](../plans/TASK-210.md) | Yes | 2026-05-07 |
| TASK-208 | Documentation consolidation: refactor all in-repo documentation to match implementation reality | Done | P3 | [Plan](../plans/TASK-208.md) | No | 2026-05-07 |
| TASK-222 | Add data_collection_permissions to Firefox manifest disclosure | Done | P3 | [Plan](../plans/TASK-222.md) | No | 2026-05-08 |
| TASK-214 | Refactor all Chrome Web Store links to point to /install | Done | P2 | [Plan](../plans/TASK-214.md) | No | 2026-05-08 |
| TASK-207 | Scope Chrome extension manifest to fantasy-only paths (1.0.4 resubmit) (Won't Do: Web Store resubmit path abandoned. Self-hosting via TASK-213 / ADR-005 supersedes; manifest scoping for AMO is tracked separately if needed.) | Won't Do | P1 | [Plan](../plans/TASK-207.md) | No | 2026-05-08 |
| TASK-182 | Submit Chrome extension to Chrome Web Store (Won't Do: Superseded by TASK-213 self-hosted distribution (ADR-005). Web Store listing path abandoned.) | Won't Do | P1 | [Plan](../plans/TASK-182.md) — Draft | No | 2026-05-08 |
| TASK-213 | Implement self-hosted extension distribution with browser-detecting install flow | Done | P1 | [Plan](../plans/TASK-213.md) | Yes | 2026-05-08 |
| TASK-216 | Decide and execute Firefox distribution strategy (AMO listed vs. unlisted self-distribution signing) | Done | P2 | [Plan](../plans/TASK-216.md) | Yes | 2026-05-08 |
| TASK-215 | Set up extension build and release pipeline with secure key management | Done | P1 | [Plan](../plans/TASK-215.md) | Yes | 2026-05-08 |
| TASK-217 | Audit current Web Store extension install base before cutover (Won't Do: Email-list-as-population is sufficient: signup is required to use the extension, so the signed-up user list captures 100% of affected users (~20 total). No separate Web Store baseline needed; TASK-218 will use the email list as both audience and denominator.) | Won't Do | P3 | [Plan](../plans/TASK-217.md) | No | 2026-05-08 |
| TASK-229 | Clean up superseded extension artifacts in public/extension/ | Done | P3 | [Plan](../plans/TASK-229.md) | No | 2026-05-10 |
| TASK-228 | Fix Firefox auto-update routing — manifest update_url points at /updates.json but file lives at /extension/updates.json | Done | P2 | [Plan](../plans/TASK-228.md) | No | 2026-05-10 |
| TASK-227 | Fix DK roster name matching — use draftables displayName at sync time | Done | P1 | [Plan](../plans/TASK-227.md) | No | 2026-05-10 |
| TASK-232 | Playoff week (15/16/17) correlation pills in extension overlay | Done | P2 | [Plan](../plans/TASK-232.md) | No | 2026-05-11 |
| TASK-245 | Draft Assistant — port Tournament Filter and Playoff Stacks from extension | Done | P2 | [Plan](../plans/TASK-245.md) | Yes | 2026-05-21 |
| TASK-246 | Supabase migration grants: update template, existing migrations, and CLAUDE.md | Done | P2 | [Plan](../plans/TASK-246.md) | Yes | 2026-05-28 |
| TASK-256 | Per-route Open Graph metadata + hero images for blog posts (build-time prerender) | Done | P2 | [Plan](../plans/TASK-256.md) | Yes | 2026-06-09 |
| TASK-249 | Publish weekly blog content to website — blog index + article pages | Done | P1 | [Plan](../plans/TASK-249.md) | Yes | 2026-06-09 |
| TASK-253 | ADP Tracker — % change / raw ADP calculation toggle | Done | P3 | [Plan](../plans/TASK-253.md) | Yes | 2026-06-09 |
| TASK-247 | draft_boards_admin: include explicit GRANT when adding authenticated read policy (Won't Do: Moot per ADR-009: draft_boards_admin is being dropped (TASK-252); no authenticated read policy/grant will ever be added.) | Won't Do | P3 | [Plan](../plans/TASK-247.md) | No | 2026-06-09 |
| TASK-251 | Admin scraper — negative-cache 404 draft IDs to stop re-fetching dead drafts (Won't Do: Moot per ADR-009: admin scraper retired; no run loop to negative-cache 404s.) | Won't Do | P3 | [Plan](../plans/TASK-251.md) | No | 2026-06-09 |
| TASK-244 | Admin scraper — scheduled background runs via chrome.alarms (Won't Do: Moot per ADR-009: admin scraper retired; no run loop to schedule.) | Won't Do | P3 | [Plan](../plans/TASK-244.md) | No | 2026-06-09 |
| TASK-243 | RosterViewer — prefer admin-scraped draft board over per-user when available (Won't Do: Moot per ADR-009: admin-scraping retired (ownership-gated API). No admin-scraped board to prefer; full-board capture is now participant-authorized via TASK-240.) | Won't Do | P3 | [Plan](../plans/TASK-243.md) | No | 2026-06-09 |
| TASK-242 | ADR: Admin-side UD scraping pipeline for draft-board backfill | Done | P3 | [Plan](../plans/TASK-242.md) | Yes | 2026-06-09 |
| TASK-241 | Admin draft-board scraper — periodic UD fetch by draft_id | Done | P3 | [Plan](../plans/TASK-241.md) | Yes | 2026-06-09 |
| TASK-260 | Backfill draft boards for already-synced UD drafts (bounded re-fetch) | Done | P3 | [Plan](../plans/TASK-260.md) | Yes | 2026-06-12 |
| TASK-258 | Chrome extension: capture full draft board at UD sync (ADR-009) and switch web read path off draft_boards_admin | Done | P3 | [Plan](../plans/TASK-258.md) | Yes | 2026-06-12 |
| TASK-266 | Tap/click-to-zoom lightbox for blog figures | Done | P2 | [Plan](../plans/TASK-266.md) | Yes | 2026-06-15 |
| TASK-265 | Hide archive lock icon for users who can read the post (Pro/author) | Done | P3 | [Plan](../plans/TASK-265.md) | Yes | 2026-06-15 |
