# TASK-186: Extend beta period — free Pro access through Best Ball Mania opening week

**Status:** Approved
**Priority:** P1

---

## Objective
Extend the free beta trial from April 25 (NFL Draft) to May 4, 2026 (Best Ball Mania opening week). This gives new users ~3.5 additional weeks to experience Pro features with real drafts, increasing the likelihood of conversion when the paywall activates.

## Verification Criteria
1. Supabase migration trigger uses `2026-05-04T23:59:59Z` for new signups.
2. BetaBanner countdown references "Best Ball Mania opens (May 4)" instead of "NFL Draft (April 25)".
3. LandingPage pricing card says "Free through May 4".
4. All documentation references updated from April 25 to May 4.
5. LIFECYCLE.md target date updated to 2026-05-04.
6. No remaining references to "April 25" in active source code or documentation (archive files excluded).

## Verification Approach
1. `grep -r "April 25" --include="*.jsx" --include="*.js" --include="*.sql" --include="*.md"` — only archive files should match.
2. `npm run build` — confirms no build errors from changed files.
3. Visual check of LandingPage pricing card in dev server.
4. Remind developer to run SQL update for existing users' `beta_expires_at` in Supabase.

## Files Changed
| File | Change |
|------|--------|
| `supabase/migrations/003_auto_beta_on_signup.sql` | `2026-04-25T23:59:59Z` → `2026-05-04T23:59:59Z` |
| `supabase/migrations/002_create_profiles_table.sql` | Example comment date updated |
| `best-ball-manager/src/components/BetaBanner.jsx` | "NFL Draft (April 25)" → "Best Ball Mania opens (May 4)" |
| `best-ball-manager/src/components/LandingPage.jsx` | "Free through April 25" → "Free through May 4" |
| `docs/value-proposition.md` | Beta pricing hook updated |
| `docs/competitive-landscape.md` | Comparison table updated |
| `chrome-extension/STORE_DESCRIPTION.md` | "Free through the NFL Draft" → "Free through May 4" |
| `docs/plans/TASK-170.md` | Reddit post references updated |
| `LIFECYCLE.md` | Target date updated (via hus-lifecycle) |
| `BACKLOG.md` | TASK-161 title updated, TASK-186 completed (via hus-backlog) |

## Manual Step Required
Existing users need their `beta_expires_at` updated in Supabase SQL editor:
```sql
UPDATE public.profiles
SET beta_expires_at = '2026-05-04T23:59:59Z'
WHERE beta_expires_at = '2026-04-25T23:59:59Z';
```
