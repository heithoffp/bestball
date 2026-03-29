# TASK-019: Configure SMTP and branded email templates

**Status:** Approved
**Priority:** P2
**Feature:** FEAT-001

---

## Objective
Configure a production-grade SMTP provider (Resend) in Supabase for reliable transactional email delivery, set up a custom sender domain (`noreply@bestballexposures.com`), and create branded email templates for signup confirmation and password reset. The default Supabase mailer works but has strict rate limits (~4/hr in dev) that won't scale for launch.

## Verification Criteria
1. Supabase project uses a custom SMTP provider (not the built-in mailer)
2. Emails are sent from a `@bestballexposures.com` address
3. Signup confirmation email arrives with Best Ball Exposures branding (logo/name, not generic Supabase)
4. Password reset email arrives with Best Ball Exposures branding
5. Email confirmation link works end-to-end (redirects back to app, confirms account)
6. Password reset link works end-to-end (redirects to password update flow)

## Verification Approach
1. Developer creates a Resend account, verifies the `bestballexposures.com` domain, and configures SMTP credentials in Supabase dashboard (Auth > SMTP Settings).
2. Developer customizes email templates in Supabase dashboard (Auth > Email Templates) for Confirmation and Password Reset.
3. Developer tests signup with a fresh email address — confirm the email arrives from `@bestballexposures.com` with branding, and the confirmation link works.
4. Developer tests password reset — confirm the email arrives branded and the reset link works.
5. Claude verifies that the app's redirect URLs in `AuthContext.jsx` and Supabase dashboard are consistent and correct.

*Steps 1-4 are developer-executed (Supabase dashboard + email inbox). Step 5 is Claude-executable.*

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/.env.example` | Modify | Document that SMTP is configured via Supabase dashboard (no app-level env vars needed) |
| `Docs/plans/TASK-019.md` | Modify | This plan file |

## Implementation Approach
1. **Resend setup** (developer, in browser):
   - Create Resend account at resend.com
   - Add and verify `bestballexposures.com` domain (DNS records: SPF, DKIM, DMARC)
   - Generate SMTP credentials from Resend dashboard

2. **Supabase SMTP configuration** (developer, in Supabase dashboard):
   - Navigate to Authentication > SMTP Settings
   - Enable custom SMTP
   - Enter Resend SMTP credentials (host: `smtp.resend.com`, port: 465, username: `resend`, password: API key)
   - Set sender name: "Best Ball Exposures"
   - Set sender email: `noreply@bestballexposures.com`

3. **Email templates** (developer, in Supabase dashboard):
   - Navigate to Authentication > Email Templates
   - Customize **Confirm signup** template — add "Best Ball Exposures" branding, clean layout, clear CTA button
   - Customize **Reset password** template — same branding treatment
   - Ensure `{{ .ConfirmationURL }}` and `{{ .SiteURL }}` variables are preserved

4. **Redirect URL verification** (Claude):
   - Check that `emailRedirectTo` in `AuthContext.jsx` points to the correct production URL
   - Verify Supabase dashboard Redirect URLs whitelist includes the production domain

5. **Update `.env.example`** (Claude):
   - Add a comment noting SMTP is configured via Supabase dashboard, not app env vars

## Dependencies
- TASK-004 — Email/password auth (Done)
- TASK-005 — Auth modal (Done)
- Developer must have DNS access to `bestballexposures.com`

## Progress Notes (2026-03-29)

**Completed:**
- Resend account created, `bestballexposures.com` domain added
- DNS records (DKIM, SPF, MX, DMARC) added to Porkbun
- SMTP credentials configured in Supabase dashboard (Auth > SMTP Settings)
- Branded email templates (navy+gold palette) added in Supabase (Auth > Email Templates)
- `.env.example` updated with SMTP documentation comment
- Redirect URLs in `AuthContext.jsx` verified — use `window.location.origin` (correct for both dev and prod)
- App-wide branding updated: `index.css` CSS variables changed to navy (`#060E1F`) + gold (`#E8BF4A`) palette

**Blocked:**
- DNS propagation for Resend domain verification still pending — signup test returned "Error sending confirmation email"

**To resume:**
1. Check Resend dashboard > Domains — wait for "Verified" status
2. Test signup with a fresh email address
3. Test password reset flow
4. Verify criteria 1–6

---
*Approved by: developer — 2026-03-29*
