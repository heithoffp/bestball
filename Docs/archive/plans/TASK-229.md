# TASK-229: Clean up superseded extension artifacts in public/extension/

**Status:** Draft
**Priority:** P3

---

## Objective
v1.0.5 .zip/.xpi remain in public/extension/ alongside v1.0.7. Drop them — anyone hitting deep-linked v1.0.5 URLs gets 404 which is fine; install page always points at latest.json.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
