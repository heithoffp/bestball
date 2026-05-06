<!-- Completed: 2026-05-06 | Commit: 21b6537 -->
# TASK-201: Customer comms for Chrome review window

**Status:** Done
**Priority:** P2

---

## Objective
Send a one-off email to the 3 paying customers explaining that Chrome Web Store review of v1.0.3 is pending and pointing them at the in-app sideload affordance shipped in TASK-200. Test send to the developer's personal inbox first, then send to customers.

## Verification Criteria
- A test email is delivered to `heithoff.patrick@gmail.com` and renders correctly (subject, body, link to `https://bestballexposures.com/#install-extension`). Body correctly states that the extension is unusable until manual install (no "old version still works" claim, since `underdogfantasy.com` redirects to `underdogsports.com`).
- After developer review, the same email is delivered to the 3 paying customer addresses (provided by the developer at send time).
- Resend dashboard shows successful delivery (no bounces/errors) for all 4 sends.
- No code changes to the website, banner, FAQ, or terms.

## Verification Approach
1. Developer provides the `RESEND_API_KEY` (already in `.env.example`) and the 3 customer email addresses at send time.
2. Run the script in **test mode**: `node scripts/send-chrome-review-email.mjs --test`. Confirm the email lands in `heithoff.patrick@gmail.com` and the deep link opens the install modal.
3. Developer reviews the test email and approves the body copy. If revisions are needed, edit the template and re-run test mode.
4. Run the script in **send mode** with the 3 customer addresses: `node scripts/send-chrome-review-email.mjs --to a@x.com,b@y.com,c@z.com`. The script sends each email individually (one `to` per request) to avoid exposing addresses across recipients.
5. Developer confirms in the Resend dashboard that all 3 sends succeeded.
6. Removal note appended to TASK-182 (Chrome Web Store submission) so a follow-up "we're back on the store" email can be considered when approval lands — handled there, not here.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `scripts/send-chrome-review-email.mjs` | Create | Node script that sends the customer email via Resend. Supports `--test` (sends only to `heithoff.patrick@gmail.com`) and `--to <comma-separated>` (sends to listed recipients, one email per recipient). Reads `RESEND_API_KEY` from env. |
| `scripts/templates/chrome-review-email.html` | Create | HTML email body — explains 1.0.2 still works on `underdogfantasy.com`, manual install needed on `underdogsports.com`, links to `https://bestballexposures.com/#install-extension`, sets 2-4 week expectation, no refund offer. |

## Implementation Approach

1. **Email copy** — owner voice, plain, no em-dashes. Approximate body:
   > Hey,
   >
   > Wanted to give you a quick heads up. Our Chrome extension (v1.0.3) is sitting in review with the Chrome Web Store right now, and it'll probably be 2 to 4 weeks before it's back up for normal install.
   >
   > Underdog recently started redirecting all traffic from underdogfantasy.com over to underdogsports.com, so the older version of the extension doesn't work anywhere anymore. Until the store review clears, you'll need to install v1.0.3 manually. I put together a quick walkthrough that should get you set up in about 2 minutes:
   >
   > https://bestballexposures.com/#install-extension
   >
   > That link works whether you're signed in or not. It covers downloading the extension and loading it through chrome://extensions.
   >
   > I'll send another note as soon as we're back on the Chrome store. If you hit any snags with the install, just reply to this email and I'll help you through it.
   >
   > Thanks for sticking with us.
   >
   > Patrick
   > Best Ball Exposures

2. **Script structure** (`scripts/send-chrome-review-email.mjs`):
   - Read `RESEND_API_KEY` from `process.env`. Exit with clear error if missing.
   - Parse `--test` and `--to <list>` flags. `--test` overrides recipients to `["heithoff.patrick@gmail.com"]`. Without either flag, exit with usage message — no accidental sends.
   - Read the HTML template from `scripts/templates/chrome-review-email.html`.
   - For each recipient, POST to `https://api.resend.com/emails` with `from: "Patrick <noreply@bestballexposures.com>"`, single-element `to`, subject `"Quick update on the Best Ball Exposures Chrome extension"`, html body, and a plain-text fallback.
   - Log per-recipient success/failure. Exit non-zero if any send fails.

3. **From address** — use `noreply@bestballexposures.com` (already verified in Resend per TASK-149). Reply-to set to `heithoff.patrick@gmail.com` so customers can reply directly.

4. **Sending model** — one Resend API call per recipient (not a batch with multiple `to` entries). Keeps each customer's address private and gives per-recipient delivery status.

5. **No persistence** — this is a one-off send. No DB writes, no audit log beyond Resend's dashboard. The script is throwaway; it can be deleted after the comms window closes (tracked under the TASK-182 / TASK-200 removal cleanup).

## Dependencies
- TASK-200 (sideload affordance) — **complete**.
- `RESEND_API_KEY` env var available locally.

## Open Questions
- None remaining. (Mechanism: Resend; segmentation: 3 paying customers, addresses provided at send time; refund posture: no offer; site changes: none; social: skipped.)

---
*Approved by:*
