<!-- Completed: 2026-04-07 | Commit: e669b5f -->
# TASK-169: First-run experience — sample data load button and empty state guidance

**Status:** Done
**Priority:** P1

---

## Objective
Add a "Try with sample data" button visible to new users who haven't uploaded any data. When clicked, loads the sample data bundle (TASK-168) into the app so users can immediately explore all analytics tabs. Implement meaningful empty states on tabs that currently show blank/broken UI when no data is loaded — each empty state should explain what the tab does and prompt the user to either upload their own data or try sample data. The goal: a new user sees real analytical value within 60 seconds of arriving. Addresses finding F-018 and EPIC-04 verification criteria.

## Dependencies
TASK-168 (sample data bundle must exist)

## Implementation Notes
The "Try Demo" button was already wired in LandingPage.jsx (onTryDemo prop) and App.jsx (loadDemoData callback). Fixed a routing bug where loadFromAssets() checked ?demo=true URL param instead of using the forceDemo flag, causing it to fall back to the empty rosters.csv instead of demo-rosters.csv. Fix: pass { forceDemo: true } from loadDemoData.
