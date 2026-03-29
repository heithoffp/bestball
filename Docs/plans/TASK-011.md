# TASK-011: Set up CI/CD pipeline with GitHub Actions

**Status:** Draft
**Priority:** P2
**Feature:** FEAT-003

---

## Objective
Create a GitHub Actions workflow that runs lint and build checks on every PR, providing a basic quality gate before merging to main. Vercel handles deployment automatically on push to main, so the CI pipeline focuses on catching errors before merge rather than deployment. This prevents broken builds from reaching production.

## Dependencies
None

## Open Questions
- Should the pipeline also run any tests (if tests exist or are added)?
- Branch protection rules: require CI pass before merge?
- Should we add a build size check to catch unexpected bundle growth?
