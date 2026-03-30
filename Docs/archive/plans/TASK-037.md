<!-- Completed: 2026-03-30 | Commit: 6beb23e -->
# TASK-037: Remove JaccardAnalysis tab

**Status:** Draft
**Priority:** P2

---

## Objective
Delete JaccardAnalysis.jsx, jaccardAnalysis.js, and all imports and tab navigation references in App.jsx. The Jaccard Analysis tab does not provide sufficient user value to justify its presence in the product.

## Dependencies
None

## Open Questions
- Are there any other components (beyond App.jsx) that import from jaccardAnalysis.js or JaccardAnalysis.jsx?
- Is there any shared utility logic in jaccardAnalysis.js that is used elsewhere (e.g., by draftScorer.js)? Jaccard/Phi co-occurrence metrics may be referenced in other utils — verify before deleting the file.
