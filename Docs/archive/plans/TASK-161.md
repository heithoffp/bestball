<!-- Completed: 2026-04-06 | Commit: pending -->
# TASK-161: Auto-grant beta access through NFL Draft (April 25) for new signups

**Status:** Approved
**Priority:** P1

---

## Objective
Automatically grant all new signups Pro-tier beta access through April 25 (NFL Draft) via a Supabase database trigger, and update the BetaBanner messaging to reference the NFL Draft window.

## Verification Criteria
1. A new Supabase SQL migration file exists that creates a trigger on `auth.users` insert which auto-creates a `profiles` row with `beta_expires_at = '2026-04-25T23:59:59Z'`.
2. The trigger handles conflicts (user already has a profile row) gracefully via `ON CONFLICT DO NOTHING`.
3. BetaBanner countdown mode references the NFL Draft deadline instead of generic "beta access".
4. BetaBanner conversion mode (post-April 25) still works — prompts subscribe with BETA25 code.

## Verification Approach
1. Read the migration SQL file and confirm the trigger logic is correct.
2. Run `npm run build` from `best-ball-manager/` to confirm no build errors.
3. Developer: apply the migration in Supabase SQL editor and test by creating a new account — verify the `profiles` row appears with `beta_expires_at = '2026-04-25T23:59:59Z'`.
4. Developer: visually confirm BetaBanner messaging in the app (countdown and expired states).

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/003_auto_beta_on_signup.sql` | Create | Trigger function + trigger on `auth.users` insert to auto-create profile with beta_expires_at |
| `best-ball-manager/src/components/BetaBanner.jsx` | Modify | Update copy to reference NFL Draft beta window |

## Implementation Approach
1. **SQL migration** (`supabase/migrations/003_auto_beta_on_signup.sql`):
   - Create function `handle_new_user()` that inserts into `public.profiles` with `id = NEW.id` and `beta_expires_at = '2026-04-25T23:59:59Z'`.
   - Use `INSERT ... ON CONFLICT (id) DO NOTHING` so it's safe if a profile already exists.
   - Create trigger `on_auth_user_created` on `auth.users` `AFTER INSERT` calling this function.
   - The function returns `NEW` as required for trigger functions.

2. **BetaBanner copy updates**:
   - Countdown mode: "Your free beta access ends after the NFL Draft (April 25)." with subscribe CTA.
   - Conversion mode: "Your beta access has ended. Use code **BETA25** for 25% off." with subscribe CTA.
   - Keep "Start Free Trial" references for now (TASK-162 will clean those up).

## Dependencies
None

## Open Questions
- Backfilling existing users without `beta_expires_at` is a manual Supabase SQL operation if desired — not included in this task's scope.

---
*Approved by: PH — 2026-04-06*
