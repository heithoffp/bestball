# TASK-320: iOS screen-capture module: ScreenCaptureKit FrameSource and draft session UX

**Status:** Draft
**Priority:** P2

---

## Objective
Native Swift module per ADR-020: FrameSource abstraction over ScreenCaptureKit (SCContentSharingPicker consent, SCStream frames at ~1fps with frame-diff gating), draft-session lifecycle (start/stop, auto-stop on inactivity, screen-lock handling), and the session UX (start-draft flow, capture status indicator). Architecture must keep a ReplayKit broadcast-extension fallback possible per ADR-020.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
