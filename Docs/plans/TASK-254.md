# TASK-254: Server-side enforcement for Pro-locked blog archive (RLS-gated delivery)

**Status:** Draft
**Priority:** P3

---

## Objective
v1 blog (TASK-249) gates the Pro archive client-side; bundled markdown ships locked posts to every browser (readable via devtools). Harden by serving non-free posts from Supabase (table or Edge Function) with RLS so locked content never reaches unauthorized clients. Deferred from TASK-249 as an accepted v1 monetization tradeoff.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
