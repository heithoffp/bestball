# TASK-209: Rename Docs/ -> docs/ in git (case normalization)

**Status:** Draft
**Priority:** P3

---

## Objective
Git tracks the documentation tree as 'Docs/' (capital D) but every reference in the repo (CLAUDE.md, hus-backlog/hus-adr scripts, modern convention) uses 'docs/' lowercase. On Windows the case-insensitive filesystem hides this; on case-sensitive systems (CI, Linux, macOS HFS+ case-sensitive) the mismatch will cause broken links and tooling failures. Rename via two-step git mv (Docs -> DocsTmp -> docs). Requires an ADR documenting the choice and rename procedure (deps on hus-adr).

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
