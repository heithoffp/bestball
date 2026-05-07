<!-- Completed: 2026-05-07 | Commit: pending -->
# TASK-208: Documentation consolidation: refactor all in-repo documentation to match implementation reality

**Status:** Done
**Priority:** P3

---

## Objective
Documentation across the repo has drifted from the implemented website. Stale and contradictory docs are misleading future Claude sessions. Audit every in-scope doc against the actual code in `best-ball-manager/src`, then rewrite each in place to match reality. Archive or delete obviously dead docs.

## Dependencies
None.

## Scope

### In scope
- **Core project docs:** `CLAUDE.md`, top-level `README.md`, `best-ball-manager/README.md`
- **Docs/ tree:** `Docs/Vision_and_Scope.md`, `Docs/UI_UX_Guide.md`, `Docs/Feature_Specs/*.md` (10 files: ADP_Tracker, Combo_Analysis, Dashboard, Data_Pipeline, Draft_Assistant, Exposure_Analysis, Help_Guide, Player_Rankings, Roster_Construction, Roster_Viewer)
- **Loose root .md files:** `Jaccard_Charts_Notes.md`, `OPTIMIZATION_PLAN.md`, `Portfolio_Archetypes.md`, `draftStatus_response.md`, `best-ball-manager/MOBILE_FEATURES.md`
- **Governance/business docs in `docs/` and `Docs/`:** `docs/competitive-landscape.md`, `docs/creator-outreach.md`, `docs/value-proposition.md`, `Docs/Channel_Strategy.md`, `Docs/Pricing_Strategy.md`, `Docs/Competitive_Analysis.md`, `Docs/Uniqueness_Model.md`, `Docs/Backlog.md` (legacy duplicate)

### Out of scope (this task)
- Sub-tool READMEs: `chrome-extension/`, `scrapers/`, `simulation/`, `scripts/`, `supabase/` — separate task if needed
- `docs/plans/` (owned by hus-backlog), `docs/adr/` (owned by hus-adr), `docs/archive/`, `docs/systems-model/`, `docs/migrations/`
- `BACKLOG.md`, `ROADMAP.md`, `LIFECYCLE.md` (owned by hus-backlog / hus-lifecycle)
- Brand assets, screenshots, raw data files

## Ground truth
Code in `best-ball-manager/src/` is authoritative — components, utilities, routes, data pipeline. Where doc claims contradict code, the code wins. `Docs/Vision_and_Scope.md` is the authoritative source for product *intent*; only correct factual drift unless developer signals a vision change.

## Approach

### Phase 1 — Audit
Read every in-scope doc and map claims to current code. Produce a drift report covering:
- What's accurate (keep)
- What's stale or factually wrong (rewrite)
- What's duplicated across files (consolidate)
- What's superseded or dead (archive/delete)

Audit notes captured in this plan file under "Audit Results" (appended after Phase 1 runs). No file edits in this phase except the plan itself.

### Phase 2 — Triage and approval gate
Present a triage table: one row per in-scope doc with proposed action (Rewrite / Trim / Archive / Delete / Keep). **Pause for developer approval before Phase 3.** This is a hard gate — the audit may surface decisions (e.g., "is `Docs/Backlog.md` truly legacy?") that need a call.

### Phase 3 — Rewrite core
Rewrite, in this order:
1. `CLAUDE.md` (highest blast radius — governs every future session)
2. `Docs/Vision_and_Scope.md`
3. `Docs/Feature_Specs/*` — one per tab component, verified against the actual `.jsx` file
4. `Docs/UI_UX_Guide.md`
5. `README.md` and `best-ball-manager/README.md`

Each rewrite is verified against the corresponding source files at the time of writing.

### Phase 4 — Loose files and governance docs
- Loose root .md files: most are likely working notes; archive to `docs/archive/notes/` or delete with developer confirmation per the triage in Phase 2.
- Governance/business docs: consolidate overlapping pairs (e.g., `Docs/Competitive_Analysis.md` vs `docs/competitive-landscape.md`) to one canonical location per topic. `Docs/Backlog.md` is a legacy duplicate of root `BACKLOG.md` — archive.

### Phase 5 — Cross-reference pass
- Fix internal links across all rewritten docs.
- Validate `CLAUDE.md` "Project Files" table — every entry must exist; every governed file must be listed.
- Grep for references to files/components/utils that have been renamed or removed; fix or remove the references.
- Run `npm run lint` and `npm run build` in `best-ball-manager/` to confirm no doc-rewrite work accidentally touched code paths (sanity check; no code should change in this task).

## Files to Change

**All entries are documentation files (`.md`) — eligible for Level 1 auto-approval consideration, but this plan is being presented for explicit approval given high blast radius on `CLAUDE.md`.**

| Path | Phase | Likely action |
|---|---|---|
| `CLAUDE.md` | 3 | Rewrite — verify Tech Stack, Key Commands, Architecture, Project Files table against code |
| `README.md` | 3 | Rewrite — current state likely diverged from product (Best Ball Exposures brand) |
| `best-ball-manager/README.md` | 3 | Rewrite — match actual scripts, dependencies, dev flow |
| `Docs/Vision_and_Scope.md` | 3 | Trim/correct factual drift; preserve intent |
| `Docs/UI_UX_Guide.md` | 3 | Rewrite to match actual UI patterns |
| `Docs/Feature_Specs/Dashboard.md` | 3 | Verify against `src/components/Dashboard.jsx` |
| `Docs/Feature_Specs/Exposure_Analysis.md` | 3 | Verify against `src/components/ExposureTable.jsx` |
| `Docs/Feature_Specs/ADP_Tracker.md` | 3 | Verify against `src/components/AdpTimeSeries.jsx` |
| `Docs/Feature_Specs/Draft_Assistant.md` | 3 | Verify against `src/utils/draftScorer.js` + assistant component(s) |
| `Docs/Feature_Specs/Combo_Analysis.md` | 3 | Verify against `src/components/ComboAnalysis.jsx` |
| `Docs/Feature_Specs/Roster_Construction.md` | 3 | Verify against `src/components/RosterConstruction.jsx` + `rosterArchetypes.js` |
| `Docs/Feature_Specs/Roster_Viewer.md` | 3 | Verify against `src/components/RosterViewer.jsx` |
| `Docs/Feature_Specs/Player_Rankings.md` | 3 | Verify against `src/components/PlayerRankings.jsx` |
| `Docs/Feature_Specs/Help_Guide.md` | 3 | Verify against `src/components/HelpGuide.jsx` |
| `Docs/Feature_Specs/Data_Pipeline.md` | 3 | Verify against `App.jsx`, `utils/csv.js`, `utils/helpers.js` |
| `Jaccard_Charts_Notes.md` | 4 | Likely archive (working notes) |
| `OPTIMIZATION_PLAN.md` | 4 | Likely archive (superseded by BACKLOG/ROADMAP) |
| `Portfolio_Archetypes.md` | 4 | Either fold into Roster_Construction spec or archive |
| `draftStatus_response.md` | 4 | Likely delete (looks like a debug capture) |
| `best-ball-manager/MOBILE_FEATURES.md` | 4 | Verify against actual mobile UX; rewrite or archive |
| `Docs/Backlog.md` | 4 | Archive — legacy duplicate of root `BACKLOG.md` |
| `Docs/Channel_Strategy.md` | 4 | Trim/refresh; keep if still active strategy doc |
| `Docs/Pricing_Strategy.md` | 4 | Trim/refresh — confirm pricing matches current ($20/$15 with promo) |
| `Docs/Competitive_Analysis.md` vs `docs/competitive-landscape.md` | 4 | Consolidate to one canonical file |
| `Docs/Uniqueness_Model.md` | 4 | Verify against ADR-003 (Uniqueness Engine output model) and current code |
| `docs/creator-outreach.md` | 4 | Trim/refresh or archive |
| `docs/value-proposition.md` | 4 | Trim/refresh or archive |

Final list will be confirmed in Phase 2 triage table.

## Implementation Approach

1. **Phase 1 audit:** Read each in-scope doc and the corresponding code. For each doc, write a 1–3 sentence drift summary into the plan's "Audit Results" section. No file edits to the docs themselves.
2. **Phase 2 triage:** Present a single table with proposed action per doc. Wait for developer approval of the triage table before any rewrites.
3. **Phase 3 rewrites (core):** One file at a time. After each, do a quick re-verification (grep for references) before moving to the next.
4. **Phase 4 (loose + governance):** Move archived files to `docs/archive/notes/` (create if missing). Delete files only with explicit developer confirmation per Phase 2 triage.
5. **Phase 5 cross-reference:** Final link sweep + `CLAUDE.md` Project Files table validation.

Reflection block presented before marking Done.

## Verification Criteria
- [ ] Every in-scope doc has been either rewritten, trimmed, archived, or explicitly kept-as-is (decision recorded in Phase 2 triage).
- [ ] No in-scope doc references files, components, utilities, or scripts that no longer exist in `best-ball-manager/src/` or the repo.
- [ ] `CLAUDE.md` "Project Files" table lists every governed file and only files that exist.
- [ ] No remaining duplicate-topic doc pairs (e.g., one canonical competitive analysis file, not two).
- [ ] Brand naming is consistent across docs (Best Ball Exposures / BBE — per memory `project_product_name`).
- [ ] `npm run lint` and `npm run build` in `best-ball-manager/` still pass (sanity check — code untouched).
- [ ] Reflection block presented before marking Done.

## Verification Approach
1. **Spot-check each rewritten Feature_Spec** against its corresponding component file: open the spec, open the component, confirm every claim in the spec maps to behavior visible in the code.
2. **Run a link/reference sweep:** grep across all rewritten docs for filenames, component names, and util names; confirm each exists.
3. **Run the project's build/lint** from `best-ball-manager/`:
   - `npm run lint`
   - `npm run build`
4. **Re-read `CLAUDE.md` end-to-end** and confirm a fresh Claude session would have an accurate map of the project from it alone.
5. Present Reflection block, then ask developer for explicit close confirmation per hus-backlog rules.

## Audit Results
*(Populated during Phase 1.)*

---

Please review and reply **approved** to proceed, or provide feedback to revise.
