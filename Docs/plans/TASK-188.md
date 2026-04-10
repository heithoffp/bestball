# TASK-188: Weekly portfolio digest email — retention loop

**Status:** Draft
**Priority:** P2

---

## Objective
Send a weekly email to active users summarizing their portfolio state — new rosters synced, exposure changes, notable ADP movements for players they're heavily exposed to. This is the primary retention mechanism: it brings users back to the app between drafts and reinforces the value of the product. Without a retention loop, users sign up, explore once, and forget.

This is a new feature that requires email infrastructure (Resend API or Supabase Edge Function + Resend), a data aggregation query, and an email template. Can start simple — even a plain-text summary is better than no email.

## Dependencies
- Resend already configured for auth emails — can reuse for transactional
- Need user's extension_entries data to compute weekly changes
- Need ADP snapshot diffs to surface movement

## Open Questions
- What metrics belong in the digest? (new rosters synced, top exposure changes, ADP risers/fallers they own)
- Frequency: weekly or after each sync? Weekly feels right for a digest.
- Should users be able to opt out? (Yes — CAN-SPAM compliance requires unsubscribe)
- Infrastructure: Supabase Edge Function on a cron, or external service?
