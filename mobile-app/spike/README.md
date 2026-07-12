# TASK-318 Spike App (throwaway)

Scratch Expo app for the EPIC-08 feasibility spike. **Never build product code here** —
the real scaffold is TASK-319. See `docs/plans/TASK-318.md` for the full spike plan and
`mobile-app/docs/SPIKE_RESULTS.md` for verdicts.

## What's in here

- `App.tsx` — one button that calls into Swift and prints the result (Q4 round-trip proof).
- `modules/spike-native/` — local Expo Module in Swift (`hello()` + `isCaptured()`).
  Part C's ScreenCaptureKit stub gets added to this module after Q4 passes.
- `eas.json` — `development` profile (dev client, internal distribution, device build).
- `fixtures/` — Part B screenshot corpus (see its README; scrub before committing).

## Part D runbook (developer)

Prerequisites (one-time, cannot be done by Claude):

1. Apple Developer Program enrollment ($99/yr) — start first, approval can take 1–2 days.
2. Expo account (free tier).
3. `npm install -g eas-cli` (or use `npx eas-cli`).

Then, from this directory:

```
eas login
eas init                      # links the app to your Expo account (creates projectId)
eas device:create             # register the iPhone (opens a URL to install the profile)
eas build --profile development --platform ios
```

- First build prompts to generate iOS credentials — let EAS manage them (it talks to
  your Apple Developer account).
- When the build finishes, scan the QR code on the build page with the iPhone to install.
- Open the app, tap **Call Swift**. A "Hello from Swift on iOS ..." line = **Q4 PASS**.
- Note the wall-clock time of the build (queue + compile) — it goes in SPIKE_RESULTS.md
  as the native-iteration loop latency for ADR-022.

For fast JS iteration afterwards: `npx expo start` on this machine, open the dev client
on the phone (same Wi-Fi), and it connects to Metro.
