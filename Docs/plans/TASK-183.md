# TASK-183: Configure Sentry DSN for production error monitoring

**Status:** Draft
**Priority:** P2

---

## Objective
The Sentry integration code already exists in the app but the DSN environment variable (VITE_SENTRY_DSN) is empty, meaning no errors are being captured in production. Create a Sentry project for Best Ball Exposures and add the DSN as an environment variable in Vercel. This gives visibility into production errors from real users — critical for a newly launched product.

## Dependencies
None — Sentry code is already integrated.

## Open Questions
- Free Sentry tier (5K errors/month) should be sufficient for launch volume.
