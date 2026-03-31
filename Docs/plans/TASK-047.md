# TASK-047: Draft overlay scoring

**Status:** Draft
**Priority:** P2

---

## Objective

Wire the existing `draftScorer.js` logic into the draft overlay so users see real-time, exposure-aware candidate scores directly on the Underdog draft board. Pulls current portfolio context (exposure percentages, archetype distribution) from Supabase so recommendations reflect the user's actual portfolio state at draft time.

## Dependencies

TASK-043 (Supabase data bridge — needs portfolio context read API)
TASK-046 (draft overlay scaffold — needs the mounted UI shell)

## Open Questions

- How does the content script get access to the current draft board state (available players, current pick number, roster construction so far)? Needs DOM scraping or Underdog API interception.
- `draftScorer.js` currently runs in the web app context — can it be bundled into the extension content script as-is, or does it have browser/module dependencies that need adjustment?
- How frequently should scores refresh? On each pick turn, or continuously?
- Should the overlay show scores for all available players or just a top-N shortlist?
