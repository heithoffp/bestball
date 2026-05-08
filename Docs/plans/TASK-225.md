# TASK-225: Release artifact smoke test before tagging extension versions

**Status:** Draft
**Priority:** P3

---

## Objective
Both manifest bugs that broke 1.0.5 (background.scripts MV3 violation, dead update_url pointing at removed updates.xml endpoint) shipped because the release pipeline never loads the produced artifact into a real Chrome and Firefox profile before tagging. Add a smoke test step to chrome-extension/scripts/release.mjs (or a separate script invoked at the end of the release flow) that, at minimum: validates manifest.json against MV3 schema, runs 'npx web-ext lint --source-dir=dist', and prompts the developer to drag the .zip onto chrome://extensions and confirm 'extension loaded with no errors' before the script completes. Stretch: a Puppeteer-driven headed Chrome that loads the unpacked dist/ and reports load errors automatically. Goal is to catch any future manifest field that breaks one engine's parser before users hit it.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
