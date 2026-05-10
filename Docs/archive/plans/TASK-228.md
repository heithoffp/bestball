# TASK-228: Fix Firefox auto-update routing — manifest update_url points at /updates.json but file lives at /extension/updates.json

**Status:** Draft
**Priority:** P2

---

## Objective
Manifest's gecko.update_url is https://bestballexposures.com/updates.json (root) but the served file is at /extension/updates.json. Vercel catch-all rewrites /updates.json to index.html so Firefox gets HTML and silently fails auto-update. Fix via Vercel rewrite from /updates.json to /extension/updates.json so existing and future installs both work.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
