<!-- Completed: 2026-07-19 | Commit: f5b73f5 -->
# TASK-357: Fix DraftBroadcast Info.plist RPBroadcastProcessMode placement blocking App Store validation

**Status:** Draft
**Priority:** P1

---

## Objective
iOS submission fails altool validation: RPBroadcastProcessMode was declared only inside NSExtensionAttributes (needed for on-device record-button registration) but altool requires it directly under NSExtension. Fix declares it in BOTH locations in targets/draft-broadcast/Info.plist; also wires ascAppId 6791977736 + appleId into eas.json submit.production.ios for non-interactive CI submit, and gitignores build outputs. Relates to TASK-334.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
