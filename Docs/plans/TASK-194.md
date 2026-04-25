# TASK-194: Search Console — add Domain property and unify URL variants via Vercel redirects

**Status:** Draft
**Priority:** P2

---

## Objective
Google Search Console currently reports issues for non-canonical URL variants (www, http). Two-part fix: (1) Add a 'Domain' property in Google Search Console for bestballexposures.com (covers all subdomains and protocols automatically) and verify via DNS TXT record at the registrar/Vercel DNS. (2) In Vercel project Settings → Domains, add www.bestballexposures.com as a redirect to the apex bestballexposures.com so all variants 301 to https://bestballexposures.com/. Vercel auto-handles http→https. Verify post-change with curl -I http://www.bestballexposures.com expecting 301 → https://bestballexposures.com/. Origin: developer flagged GSC variant issues during 2026-04-24 SEO pass; deferred to a future session due to time.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
