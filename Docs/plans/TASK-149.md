# TASK-149: User Feedback Button — in-app form that emails feedback to developer via Resend

**Status:** Approved
**Priority:** P2

---

## Objective

Add a persistent floating feedback button visible on every tab that opens a minimal modal. Users choose a category (Bug / Suggestion / Other), write a message, and optionally provide their email. On submit, a new Supabase edge function calls the Resend REST API to email the feedback to the developer — no database storage needed.

## Verification Criteria

1. A floating button is visible in the bottom-right corner on every tab.
2. Clicking the button opens a modal with: type selector (Bug / Suggestion / Other), message textarea (required), optional email field, Cancel and Submit buttons.
3. Submit is disabled when message is empty or while a request is in flight.
4. After a successful submit, the modal shows a success state and closes after 2 seconds.
5. On error, an inline error message is shown without closing the modal.
6. The edge function `send-feedback` is deployed and reachable; a test submission results in a formatted email arriving at the developer's inbox.

## Verification Approach

1. `npm run build` inside `best-ball-manager/` — must produce zero errors.
2. `npm run dev` — open the app, confirm floating button renders bottom-right on Dashboard and at least two other tabs.
3. Open the modal — verify all form fields present; confirm Submit is disabled with empty textarea.
4. Fill in message, submit — confirm loading state appears, then success state.
5. Developer confirms email received in inbox with correct content (type, message, sender email if provided).
6. Test error path: temporarily point the fetch at a bad URL and confirm inline error renders without crashing.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `supabase/functions/send-feedback/index.ts` | Create | Deno edge function — validates payload, calls Resend REST API, emails developer |
| `best-ball-manager/src/components/FeedbackButton.jsx` | Create | Floating button + modal component with form state and submit logic |
| `best-ball-manager/src/components/FeedbackButton.module.css` | Create | Styles for button, modal overlay, form fields, and success/error states |
| `best-ball-manager/src/App.jsx` | Modify | Import FeedbackButton and render it alongside AuthModal/AccountSettings |

## Implementation Approach

### 1. Supabase edge function — `supabase/functions/send-feedback/index.ts`

Follows the same Deno structure as existing edge functions. No auth required (public endpoint).

```
- Read RESEND_API_KEY and DEVELOPER_EMAIL from Deno.env
- Handle OPTIONS preflight (CORS)
- Parse POST body: { type, message, userEmail? }
- Validate: type must be one of Bug/Suggestion/Other; message must be non-empty and ≤1000 chars
- Call https://api.resend.com/emails via fetch with Authorization: Bearer <RESEND_API_KEY>
  - from: "Feedback <noreply@bestballexposures.com>"
  - to: [DEVELOPER_EMAIL]
  - subject: "[Feedback] <type> — Best Ball Portfolio Manager"
  - html: simple formatted body with type, message, and sender email (or "anonymous")
- Return 200 { success: true } or 400/500 with error message
```

Two Supabase secrets to add via dashboard:
- `RESEND_API_KEY` — Resend API key (already used for SMTP; same key works for REST API)
- `DEVELOPER_EMAIL` — developer's personal email address

### 2. FeedbackButton component

Self-contained — manages its own modal open/close state. No props needed (calls the edge function URL via the existing `supabase` client's `.functions.invoke()`, or falls back to a direct fetch to the VITE_SUPABASE_URL-derived function URL if supabase client is null).

State:
- `isOpen` — modal visibility
- `type` — 'Bug' | 'Suggestion' | 'Other' (default: 'Bug')
- `message` — textarea value
- `userEmail` — optional email input
- `status` — 'idle' | 'loading' | 'success' | 'error'
- `errorMsg` — string

Behavior:
- Floating button: fixed bottom-right, z-index above content, uses a `MessageSquare` Lucide icon with a "Feedback" label
- Modal: centered overlay with backdrop, similar to AuthModal pattern
- Success state: replaces form with checkmark + "Thanks for your feedback!" message, auto-closes after 2 seconds
- Reset state on close (including after success)
- The `message` textarea has a visible char counter (x/1000)

Call mechanism:
```js
const supabaseFunctionsUrl = import.meta.env.VITE_SUPABASE_URL
  ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-feedback`
  : null;
// POST to supabaseFunctionsUrl with JSON body
// No Authorization header needed (public function)
```

### 3. App.jsx wiring

Add import and render `<FeedbackButton />` inside the root div, alongside `<AuthModal>` and `<AccountSettings>` (before `</div>` on line ~337). No props needed.

## Dependencies

None

## Open Questions

- **Developer email:** What personal email address should feedback be sent to? This needs to be set as the `DEVELOPER_EMAIL` Supabase secret. _(Resolve before implementation — can be added to the secret without being written in code.)_

---
*Approved by: <!-- developer name/initials and date once approved -->*
