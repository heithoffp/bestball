<!-- Completed: 2026-07-12 | Commit: b3e24f1 -->
# TASK-325: Android FLAG_SECURE go/no-go: UD app capture visibility on Pixel 3

**Status:** Done
**Priority:** P3

---

## Objective
FEAT-032's blocking question: does the Underdog Android app set FLAG_SECURE (blanking screen capture)? Developer has a Pixel 3 (Android 12 max) — install UD from Play, attempt screenshot + built-in screen recording in the draft room specifically (not just lobby), record verdict. App-side FLAG_SECURE verdict generalizes to modern Android; OS-side MediaProjection semantics (14+ per-session consent, 15 lock-kill) do NOT and stay open. Optionally repeat in DK app. Budget: one $1 draft entry.

## Dependencies
None

## Open Questions
None.

---

## Verdict: GO (PASS)

**Neither Underdog nor DraftKings sets `FLAG_SECURE` on its Android draft room.** App-side
screen capture of the live draft is viable on modern Android.

### Method
Built-in Quick Settings screen recorder on a **Pixel 3 / Android 12**, run inside **live
draft rooms** (not the lobby) for both apps. Verdict judged on playback: legible UI = no
FLAG_SECURE; black frames or a "can't capture due to security policy" block = FLAG_SECURE set.

### Evidence
Frames extracted across the full span of each recording render fully legible — no black
frames, no capture-policy blanking:

- **Underdog** — draft room ("Up in 16 picks"), Players list with ADP/Proj, and Board view all clean.
- **DraftKings** — live draft room ("Round 1, Pick 1", on the clock), rankings with ADP, and draft Board all clean.

Committed evidence stills (`mobile-app/docs/task-325-evidence/`):
- `underdog_draft_players.png`, `underdog_draft_board.png`
- `draftkings_draft_players.png`, `draftkings_draft_board.png`

Raw `.mp4` recordings were kept local only (git-ignored via `mobile-app/docs/*.mp4`) to
avoid ~76 MB of binary bloat in the repo.

### Scope of the verdict
- **Resolved (app-side):** UD and DK do not block capture at the app layer; this generalizes
  to modern Android.
- **Still open (OS-side, for FEAT-032):** Android MediaProjection semantics — 14+ per-session
  consent prompts and 15's lock-screen capture-kill — are NOT exercised by this test and
  remain open questions for the FEAT-032 implementation.
