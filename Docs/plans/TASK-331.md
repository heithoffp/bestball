# TASK-331: Live-capture session frame recorder: full OCR frame log + export + local replay harness

**Status:** Pending Approval
**Priority:** P2

---

## Objective

Turn every live-capture draft into a complete, offline-debuggable regression corpus: the broadcast extension records every OCR'd frame of a session to a JSONL file, the confidence hub gains an "Export frames" button, and a Node replay script runs the whole recording through the same engine locally — so parsing defects are diagnosed and fixes proven against real drafts without another live draft or EAS build.

**Motivation:** the diag ring buffer keeps only the last 6 ingests. TASK-329 needed three on-device iterations because each defect could only be seen through that keyhole, and each fix cost a live draft + EAS build to evaluate.

## Verification Criteria

1. **A recorded draft replays end-to-end locally:** running the replay script on an exported frames file prints a per-frame timeline (kind, picks-until, current pick, ledger/inferred-gone sizes) and a final status + targets that match what the Live Activity showed on device.
2. **Export works from the confidence hub:** after a broadcast session, "Export frames" opens the iOS share sheet with the session's `.jsonl` file (developer confirms on device).
3. **No capture regression:** the existing test suite still passes and capture behavior (pushes, memory guard, heartbeat) is unchanged when recording is on.

## Verification Approach

- `npm run test:draft` passes (engine untouched; smoke that the sessionConfig round-trips the new `recordFrames` flag).
- Unit-test the replay script against a synthetic frames JSONL assembled from existing fixtures: replaying `FAST_DRAFT_SEQUENCE` frames produces the same final status as ingesting them directly (identical engine, so byte-equal status JSON).
- **Developer (manual, needs the next EAS build):** run a real draft with recording on; confirm the frames file exists and exports via the share sheet; send it over and confirm the local replay timeline matches the on-device Live Activity behavior at the timestamps of interest.
- Memory check: recording is append-only file I/O (no in-memory accumulation); confirm via a full fast draft that the extension stays alive (heartbeat continuous, no jetsam).

## Files to Change

| File | Action | Description |
|------|--------|-------------|
| `mobile-app/targets/draft-broadcast/FrameProcessor.swift` | Modify | Append one JSONL line per ingested frame (`{t, kind?, items:[{text,x,y,w,h,confidence}]}`) to `frames-<sessionStart>.jsonl` in the App Group container; delete stale recordings at setup; hard cap ~20 MB; gated on `recordFrames` in sessionConfig |
| `mobile-app/modules/bbe-draft-native/ios/BBEDraftNativeModule.swift` | Modify | Add `latestFrameLogPath()` — newest `frames-*.jsonl` in the App Group container (file discovery stays native; no new JS deps) |
| `mobile-app/src/draft/liveActivity.js` | Modify | Wrapper for `latestFrameLogPath()` (no-op off-device) |
| `mobile-app/src/draft/sessionController.js` | Modify | Pass `recordFrames: true` in `baseConfig`; expose `getFrameLogPath()` for the panel |
| `mobile-app/src/screens/LiveSessionPanel.jsx` | Modify | "Export frames" button beside the Debug export — `Sharing.shareAsync(file://…)` via the already-present `expo-sharing` |
| `mobile-app/scripts/replay-frames.mjs` | Create | `node scripts/replay-frames.mjs <frames.jsonl> --pool <csv> [--username X] [--slot N] [--verbose]` — builds the pool, feeds every frame through `parseUnderdogScreen` + `session.ingest`, prints per-frame timeline + final status/targets/glance |
| `mobile-app/docs/LIVE_SESSION_V1.md` | Modify | Document the recorder, export flow, and replay workflow |

## Implementation Approach

1. **Recorder (Swift, extension side):** in `FrameProcessor.ingest`, after the engine call, serialize the already-built `items` array plus epoch seconds and append to the session's JSONL file via a `FileHandle` kept open on the processing queue (single-threaded by construction). File lives in `FileManager.containerURL(forSecurityApplicationGroupIdentifier:)`. At `setUp()`, delete previous `frames-*.jsonl` (one recording retained at a time) and create the new file only when the parsed sessionConfig has `recordFrames == true`. Stop appending past ~20 MB (log once). ~0.8 fps × a few KB/frame ≈ 3–10 MB per long draft — no jetsam pressure since nothing accumulates in memory.
2. **Native module:** `latestFrameLogPath()` enumerates the container for `frames-*.jsonl`, returns the newest path or nil. Keeping discovery native avoids adding `expo-file-system` (per the peer-dep/dyld lesson from the launch-crash episode, no new native deps).
3. **App side:** `sessionController` adds `recordFrames: true` to `baseConfig` (always on for now — it's the developer's own device and the data never leaves it unless shared; revisit before public TestFlight). `LiveSessionPanel` adds "Export frames" next to the existing Debug Share button: resolve the path, `Sharing.shareAsync('file://' + path, { mimeType: 'application/json' })`; disabled state when no recording exists.
4. **Replay harness:** `replay-frames.mjs` reads the JSONL, builds the pool from a CSV (`name,position,team,adp` — the bundled UD ADP snapshot format), creates a session (optional `--username/--slot`), ingests frames in order, and prints per frame: `t · kind · pu · cp · ledger · gone (+new marks)`, then the final `getStatus()` + `getGlance()`. `--verbose` dumps a frame's raw lines by index for close inspection. Reuses the exact engine modules — behavior parity is the whole point (same principle as ADR-021's single-engine decision).
5. **Privacy note (no new ADR):** ADR-019/020's constraint is that raw *pixels* never leave the process and only derived data is pushed; the recording stores derived OCR text, stays in the App Group on device, and leaves only via the user-initiated share sheet. Documented in LIVE_SESSION_V1.md.

## Dependencies

None hard; ships in the same EAS build as TASK-329's `task329.3` engine.

## Open Questions

- Recording defaults ON for the developer build. Before any public TestFlight, either default OFF behind a Debug toggle or add a retention cap — flagged in LIVE_SESSION_V1.md rather than decided here.

## Handoff Notes

- Implemented 2026-07-15: recorder in FrameProcessor.swift (App Group JSONL, 20 MB cap, stale-file cleanup), `latestFrameLogPath()` native fn, `recordFrames: true` in session config, "Frames" export button in the confidence hub, `scripts/replay-frames.mjs`, docs in LIVE_SESSION_V1.md. `npm run test:draft` green incl. the replay-parity check.
- **End-to-end proven 2026-07-15:** developer recorded a live slow-draft session on device, exported `frames-1784120786.jsonl` (42 frames) via the Frames button, and the local replay reproduced the on-device behavior exactly (including the "P1 · up in 0" log lines visible inside a captured frame). Three parser defects were diagnosed and fixed purely from the recording — the exact workflow this task was built for (see TASK-329 scope item 3).
- Fix during first real use: `replay-frames.mjs`'s pool loader now handles the actual bundled UD ADP snapshot format — quoted CSV headers and split `firstName`/`lastName` columns (was: "no recognizable name column").
- **Remaining verification criterion 1/2 evidence is in hand** (recording exported + replay matches device). **Blocker for closing:** confirm no capture regression over a full-length draft on the next EAS build (heartbeat continuous, no jetsam) — the recording so far covers a short session.

---
*Approved by: developer (AskUserQuestion "Approved"), 2026-07-15*
