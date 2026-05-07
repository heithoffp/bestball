# TASK-207: Scope Chrome extension manifest to fantasy-only paths (1.0.4 resubmit)

**Status:** Draft
**Priority:** P1

---

## Objective
Narrow the Chrome extension's content_scripts and host_permissions to exclude Underdog's sportsbook surfaces, in support of resubmitting after the 1.0.3 rejection under Chrome's online gambling policy. Underdog Sports operates both a DFS/best-ball product and a regulated sportsbook on the same underdogsports.com domain; the extension only operates on the fantasy draft surface but the current 1.0.3 manifest grants broad app.underdogsports.com/* access, which the reviewer cited. Approach: use content_scripts matches scoped to known fantasy paths plus exclude_matches for sportsbook paths (e.g. /sportsbook, /sports, /bets — to be confirmed by inspecting underdogsports.com), and consider whether host_permissions can be similarly tightened. Out of scope: Underdog Fantasy legacy domain (no sportsbook there), DraftKings adapter.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
