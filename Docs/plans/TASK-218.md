# TASK-218: Migration communication for existing extension users

**Status:** Draft
**Priority:** P2

---

## Objective
Users who installed the extension before the Web Store rejection still have it, but it will eventually stop receiving updates (Web Store auto-update path is gone). Send a migration email instructing them to uninstall the old version and reinstall via /install.

Scope (sized for ~20 affected users — signup is required to use the extension, so the signed-up user list is the full population):
- Pull email list from Supabase auth.
- Draft honest email copy explaining the Web Store situation and the new /install path.
- Send via Resend using a simple one-off Node script (no transactional template infrastructure needed at this scale).
- Manually track replies / follow-up with anyone who has trouble installing.

Should ship within 2 weeks of /install going live. Related: ADR-005, TASK-213.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
