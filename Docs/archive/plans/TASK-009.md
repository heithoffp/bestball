<!-- Completed: 2026-03-29 | Commit: pending -->
# TASK-009: Add error monitoring with Sentry

**Status:** Approved
**Priority:** P2
**Feature:** FEAT-003

---

## Objective
Install and configure Sentry for React error tracking so production errors are captured, reported, and actionable. A commercial product needs visibility into runtime errors — currently there is no error monitoring and failures are invisible.

## Verification Criteria
- `@sentry/react` is listed in `package.json` dependencies
- `src/utils/sentry.js` exports an `initSentry()` function that calls `Sentry.init()` with DSN from `import.meta.env.VITE_SENTRY_DSN`
- `main.jsx` calls `initSentry()` before `createRoot()`
- App is wrapped in `Sentry.ErrorBoundary` with a fallback UI showing a reload button
- When `VITE_SENTRY_DSN` is not set, `initSentry()` is a no-op and the app runs normally
- `.env.example` includes `VITE_SENTRY_DSN=`
- `npm run build` succeeds without errors

## Verification Approach
1. Run `npm run build` in `best-ball-manager/` — expect clean build with no errors
2. Check `package.json` for `@sentry/react` dependency
3. Read `src/utils/sentry.js` and confirm DSN guard and init logic
4. Read `main.jsx` and confirm `initSentry()` call and `ErrorBoundary` wrapper
5. Read `.env.example` and confirm `VITE_SENTRY_DSN` is listed

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `best-ball-manager/package.json` | Modify | Add `@sentry/react` dependency |
| `best-ball-manager/src/utils/sentry.js` | Create | Sentry init with DSN guard |
| `best-ball-manager/src/main.jsx` | Modify | Call `initSentry()` and wrap app in `ErrorBoundary` |
| `best-ball-manager/.env.example` | Modify | Add `VITE_SENTRY_DSN` |

## Implementation Approach
1. `npm install @sentry/react` in `best-ball-manager/`
2. Create `src/utils/sentry.js`:
   - Export `initSentry()` that checks for `VITE_SENTRY_DSN`; if missing, return early
   - Call `Sentry.init({ dsn, environment: import.meta.env.MODE })`
3. In `main.jsx`:
   - Import and call `initSentry()` before `createRoot()`
   - Wrap `<App />` in `<Sentry.ErrorBoundary fallback={...}>`
   - Fallback: simple centered div with "Something went wrong" heading and reload button
4. Add `VITE_SENTRY_DSN=` to `.env.example`

## Decisions
- **Sentry plan:** Free tier (5K errors/mo) — sufficient for launch
- **Performance traces:** Not included — Vercel Analytics covers performance
- **Source maps:** Use Vercel's Sentry integration (dashboard config, not code)

## Dependencies
- TASK-008 — Vercel config (completed)

---
*Approved by: developer, 2026-03-29*
