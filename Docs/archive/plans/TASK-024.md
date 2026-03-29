<!-- Completed: 2026-03-29 | Commit: pending -->
# TASK-024: Implement beta program flag and promotion flow

**Status:** Approved
**Priority:** P2
**Feature:** FEAT-021

---

## Objective
Add a time-limited beta access mode that grants Pro-tier features via a Supabase `profiles` table flag, with a banner UI that counts down to expiry and prompts conversion to a paid subscription.

## Verification Criteria
1. User with `beta_expires_at` in the future gets `tier='pro'` without a Stripe subscription.
2. User with `beta_expires_at` in the past gets `tier='free'` (natural fallback).
3. User with an active Stripe subscription gets `tier='pro'` regardless of beta flag (subscription takes precedence).
4. BetaBanner appears when beta is active with <=7 days remaining, showing days left and "Subscribe to keep Pro access" CTA.
5. BetaBanner shows a conversion prompt with BETA25 promo code mention after beta expires (user is free tier + has a past beta_expires_at).
6. BetaBanner does not render for guest users, non-beta free users, or pro subscribers.
7. Profiles table RLS: users can only read their own row.
8. `npm run build` succeeds with no errors.
9. `npm run lint` passes cleanly.

## Verification Approach
1. Run `npm run build` from `best-ball-manager/` — must succeed with no errors.
2. Run `npm run lint` from `best-ball-manager/` — must pass cleanly.
3. Read `SubscriptionContext.jsx` and confirm:
   - Profile is fetched from `profiles` table on user change.
   - Tier derivation checks `beta_expires_at > now()` as a path to `'pro'`.
   - Active subscription still takes precedence over beta flag.
4. Read `BetaBanner.jsx` and confirm:
   - Renders countdown when beta active and <=7 days remain.
   - Renders conversion prompt (with BETA25 mention) when beta expired and user is free tier.
   - Does not render for guests, non-beta users, or pro subscribers.
5. Read `002_create_profiles_table.sql` and confirm:
   - Table has `id` (FK to auth.users), `beta_expires_at` (timestamptz nullable).
   - RLS enabled with select policy restricted to `auth.uid() = id`.
6. Read `App.jsx` and confirm BetaBanner is rendered with correct props.
7. Developer: manually test by inserting a profiles row with `beta_expires_at` set to a future date and verifying Pro access in the browser. Then set it to a past date and verify fallback to Free tier with conversion banner.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `supabase/migrations/002_create_profiles_table.sql` | Create | Migration for profiles table with beta_expires_at column and RLS |
| `best-ball-manager/src/contexts/SubscriptionContext.jsx` | Modify | Fetch profile, add beta check to tier derivation, expose beta state |
| `best-ball-manager/src/components/BetaBanner.jsx` | Create | Banner component with countdown and conversion CTA |
| `best-ball-manager/src/components/BetaBanner.module.css` | Create | Styles for BetaBanner |
| `best-ball-manager/src/App.jsx` | Modify | Render BetaBanner |

## Implementation Approach

### Step 1: Create profiles table migration
- Create `supabase/migrations/002_create_profiles_table.sql`
- Table: `profiles` with columns:
  - `id` uuid primary key, references `auth.users(id)`
  - `beta_expires_at` timestamptz, nullable (null = no beta access)
  - `created_at` timestamptz default now()
- Enable RLS with policy: users can select where `auth.uid() = id`
- No insert/update policy needed — admin manages rows via SQL editor or service role
- Include a comment with the admin SQL snippet to grant beta access:
  ```sql
  insert into profiles (id, beta_expires_at)
  values ('<user-uuid>', '2026-04-25T23:59:59Z')
  on conflict (id) do update set beta_expires_at = excluded.beta_expires_at;
  ```

### Step 2: Modify SubscriptionContext to check beta flag
- Add a `profile` state alongside `subscription`
- In the user effect, fetch from `profiles` table (same pattern as subscription fetch): `supabase.from('profiles').select('beta_expires_at').eq('id', user.id).maybeSingle()`
- Add derived state:
  - `isBetaActive`: `profile?.beta_expires_at && new Date(profile.beta_expires_at) > new Date()`
  - `isBetaExpired`: `profile?.beta_expires_at && new Date(profile.beta_expires_at) <= new Date()`
  - `betaExpiresAt`: raw timestamp for banner use
  - `betaDaysRemaining`: computed days until expiry (null if no beta)
- Update tier derivation: subscription `active`/`trialing` takes precedence, then `isBetaActive` grants `'pro'`, otherwise `'free'`
- Expose `isBetaActive`, `isBetaExpired`, `betaDaysRemaining`, `betaExpiresAt` via context

### Step 3: Build BetaBanner component
- Renders in two modes:
  1. **Countdown mode** (beta active, <=7 days remaining): Info-style banner with "Your beta access expires in N days. Subscribe to keep Pro features." and a "Subscribe Now" button that calls `redirectToCheckout`.
  2. **Conversion mode** (beta expired, user is free tier): Warning-style banner with "Your beta access has ended. Use code BETA25 for 25% off your subscription." and a "Subscribe Now" button.
- Does not render if: no beta flag, beta active with >7 days remaining, user is guest, or user has active subscription.
- Dismissible via X button (state local to component — reappears on page reload, which is fine for this use case).
- Styled with BetaBanner.module.css: fixed banner at top of content area, info (blue) and warning (amber) variants.

### Step 4: Integrate BetaBanner into App.jsx
- Import BetaBanner
- Render it inside the main layout, above the tab content area
- No conditional logic in App.jsx — the component self-manages its visibility based on subscription context

## Dependencies
- TASK-015 (Done) — Feature gating by subscription tier
- TASK-014 (Done) — Subscription status sync with Supabase

---
*Approved by: <!-- developer name/initials and date once approved -->*
