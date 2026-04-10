# TASK-187: Welcome email for new signups

**Status:** Draft
**Priority:** P2

---

## Objective
Send a welcome email to every new user who signs up, orienting them to the product and driving first engagement. Initially this can be manual (developer sends personally) or a simple Supabase trigger + Resend template. The goal is to make new users feel welcomed and give them a clear next step: install the extension, sync their first rosters, explore the dashboard. Even a manual personal email from the founder creates a strong first impression for an early-stage product.

## Dependencies
- Resend is already configured as the SMTP provider for Supabase auth emails
- Need to decide: manual founder emails vs. automated Supabase trigger + Resend API

## Open Questions
- Should this eventually become an automated drip sequence (welcome → "did you install the extension?" → "your first portfolio insight")?
- What's the right CTA for the welcome email — install extension, explore demo, or upload CSV?
