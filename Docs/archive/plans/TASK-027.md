<!-- Completed: 2026-03-30 | Commit: a57da6a -->
# TASK-027: Clean up lint warnings across codebase

**Status:** Done
**Priority:** P3

---

## Objective

Resolve all ESLint errors and warnings so `npm run lint` exits clean (zero errors, zero warnings). Currently 50 errors and 8 warnings across 15 files.

## Verification Criteria

- `npm run lint` exits with code 0 and prints no errors or warnings.

## Verification Approach

1. Run `npm run lint` from `best-ball-manager/` and confirm zero errors and zero warnings.

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `src/App.jsx` | Modify | Remove unused `saveFile` import; suppress missing hook deps with eslint-disable |
| `src/components/AdpTimeSeries.jsx` | Modify | Remove unused `pid` and `i` vars; suppress intentional setState-in-effect |
| `src/components/JaccardAnalysis.jsx` | Modify | Move `SortHeader` component definition outside the parent component |
| `src/components/DraftFlowAnalysis.jsx` | Modify | Remove unused vars (`Icon`, `draftSlot`, `structural`, `e`, `_adjustedBase`, `teams`); move any inline component outside render |
| `src/components/Dashboard.jsx` | Modify | Suppress missing hook dep warning |
| `src/components/RosterViewer.jsx` | Modify | Remove unused vars; suppress missing hook dep where intentional |
| `src/components/ExposureTable.jsx` | Modify | Fix any reported issues |
| `src/contexts/SubscriptionContext.jsx` | Modify | Suppress fast-refresh export warning on `useSubscription`; suppress setState-in-effect if intentional |
| `src/contexts/AuthContext.jsx` | Modify | Suppress fast-refresh export warning on `useAuth` |
| `src/hooks/useSpikeWorker.js` | Modify | Fix any reported issues |
| `src/utils/draftScorer.js` | Modify | Fix any reported issues |
| `src/utils/helpers.js` | Modify | Fix any reported issues |
| `src/utils/spikeWeekProjection.js` | Modify | Fix any reported issues |
| `src/main.jsx` | Modify | Fix any reported issues |
| `vite.config.js` | Modify | Define `__dirname` via `fileURLToPath`/`dirname` for ESM compatibility |

## Implementation Approach

Work file-by-file in lint output order. For each error category, apply the appropriate fix:

**Unused vars (`no-unused-vars`):** Remove the unused import or variable declaration entirely. For destructured loop variables that can't be removed, prefix with `_` (e.g., `_pid`) to satisfy the allowed-pattern rule `/^[A-Z_]/u`.

**Static components in render (`react-hooks/static-components`):** For `SortHeader` in `JaccardAnalysis.jsx` (and any similar patterns), move the component definition above the parent component. Since it captures `sortKey`, `sortAsc`, and `handleSort` from closure, convert those to explicit props instead.

**setState in effect (`react-hooks/set-state-in-effect`):** Where the pattern is intentional initialization (e.g., `AdpTimeSeries.jsx` selecting the first 5 players on first render), add `// eslint-disable-next-line react-hooks/set-state-in-effect` above the offending setState call with a comment explaining why. Refactor only where straightforward.

**Fast refresh export violations (`react-refresh/only-export-components`):** `AuthContext.jsx` and `SubscriptionContext.jsx` export both a Provider component and a hook from the same file — a known acceptable pattern for context modules. Add `// eslint-disable-next-line react-refresh/only-export-components` above each non-component export.

**Missing hook dependencies (`react-hooks/exhaustive-deps`):** For stable functions like `loadData` and `loadFromStorage` that are intentionally omitted from dep arrays (to avoid infinite re-render loops), add `// eslint-disable-next-line react-hooks/exhaustive-deps` above the `useEffect`/`useCallback`. Add a comment explaining the omission.

**Rules of hooks (`react-hooks/rules-of-hooks`):** Fix any conditional hook call by moving it unconditionally above the conditional.

**`__dirname` not defined (`no-undef`) in `vite.config.js`:** Add:
```js
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __dirname = dirname(fileURLToPath(import.meta.url));
```

**Compilation Skipped warnings:** If from `@typescript-eslint`, add appropriate eslint-disable or update the ESLint config to skip those file types.

After each file, re-run lint to confirm that file's errors are cleared before moving on. Final run confirms zero errors and warnings.

## Dependencies

None

---

*Approved by: developer 2026-03-30*
