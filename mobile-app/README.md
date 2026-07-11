# BBE Mobile — Live Draft Assistant

Native mobile companion for Best Ball Exposures. Reads the user's live Underdog draft
from their own screen (on-device capture + OCR) and surfaces glanceable, portfolio-aware
draft context — **iOS first via Live Activities / Dynamic Island**, Android overlay later.

**Status: pre-implementation.** The feasibility spike (TASK-318) gates all product code.
No app exists here yet; this directory currently holds design documentation and will hold
the Expo React Native app (TASK-319) once the spike passes.

## Orientation

| Doc | Read it for |
|-----|-------------|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | The four-layer design, data flows, session models, Live Activity design |
| [`docs/RESEARCH_NOTES.md`](docs/RESEARCH_NOTES.md) | Condensed platform research (iOS, Android, competitive/ToS) with sources — the evidence behind the ADRs |
| [`docs/DEVELOPMENT_NOTES.md`](docs/DEVELOPMENT_NOTES.md) | Practical constraints: Windows→EAS workflow, hard platform limits, gotchas |
| `docs/SPIKE_RESULTS.md` | (created by TASK-318) go/no-go verdicts with evidence |

## Governance

- **Epic:** EPIC-08 (ROADMAP.md) — features FEAT-027…032
- **ADRs:** ADR-019 (screen reading, not API access) · ADR-020 (ScreenCaptureKit-first)
  · ADR-021 (pick-ledger parse engine + remote templates) · ADR-022 (Expo RN + EAS)
- **Spike plan:** `docs/plans/TASK-318.md` (repo root `docs/`)
- Product boundaries: the in-app assistant is an opinionated surface like the web Draft
  Assistant; everything else stays mirror-not-advisor (ADR-002).

## Planned layout (post-TASK-319)

```
mobile-app/
  app/              # Expo Router screens (RN)
  modules/          # Expo native modules (Swift): capture, parse, activity bridge
  targets/          # WidgetKit Live Activity extension (SwiftUI)
  shared/           # JS analytics package shared with best-ball-manager
  spike/            # TASK-318 throwaway test app + screenshot fixtures
  docs/             # This documentation
```
