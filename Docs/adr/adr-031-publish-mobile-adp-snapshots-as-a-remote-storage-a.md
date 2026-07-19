# ADR-031: Publish mobile ADP snapshots as a remote Storage artifact with bundled fallback

**Date:** 2026-07-19
**Status:** Accepted

---

## Context

ADP snapshot data is currently **baked into the mobile app binary**. `scripts/build-data.mjs` compacts ~120 raw ADP CSVs into `mobile-app/shared/data/adpSnapshots.json`, which `shared/bundledData.js:9` imports statically; `loadBundledAdp()` decodes it synchronously into the pipeline (`dataLoader.processLoadedData`), and it surfaces on the Dashboard, ADP Tracker, Exposures, Rankings, and Draft Assistant.

Because the data lives in the binary, **any ADP refresh requires a full native rebuild and App Store review (~1 day)**. ADP moves constantly through draft season — this is the data that changes most often in the whole app, and it's currently the slowest to update. There is no over-the-air path today: the app has **no `expo-updates` installed** and no `runtimeVersion`/channel/`updates` config, and ADP is not fetched from any remote source at runtime.

Two existing decisions shape the solution:

- **ADR-018** established serving slim precomputed artifacts from Supabase **Storage** (object reads cost no Postgres disk IO), with a versioned object name (`-v1`) acting as a script↔client contract.
- **ADR-030** established a cache-first, refresh-in-background (stale-while-revalidate) strategy for mobile launch data via `expo-file-system`, degrading to a safe fallback on cache miss / corruption / offline.

This ADR composes both patterns for a new artifact. One boundary difference: ADR-018's `app-data` bucket is **private (authenticated-read)** because it mirrored an authenticated-only table. ADP is different — it ships in the binary and is visible to **guests and the demo experience**, so its remote copy must be equally reachable, i.e. **public-read**.

## Decision

Move ADP snapshots to a **remote-fetch model with the bundled copy as fallback**:

1. **Remote artifact.** Publish the byte-identical compacted ADP payload (the current `adpSnapshots.json` `{ names, snapshots }` shape) — wrapped with a `formatVersion` field — as `adp-snapshots-v1.json` in a **public-read** Supabase Storage bucket (`app-data-public`).
2. **Publish step.** An explicit `npm run publish:adp` (admin script under `scripts/`) uploads the artifact after `build:data`. `build:data` continues to write the bundled copy unchanged.
3. **Fetch-with-fallback loader.** `loadBundledAdp()` becomes an async `loadAdp()`: render immediately from the on-device cached remote copy (or the bundled copy on first launch), then fetch `adp-snapshots-v1.json` in the background; on success, validate `formatVersion` and shape, cache it via `expo-file-system`, and update state (stale-while-revalidate, per ADR-030).
4. **Safe degradation.** On **any** failure — offline, 404, parse error, or a `formatVersion` newer than the app understands — fall back to the **bundled** copy. The bundled JSON stays shipped in every build as the permanent floor, so the app is never worse off than today.
5. **Scope: ADP only.** Projections, rankings, demo rosters, and actuals stay bundled (they don't change on the same cadence).

## Alternatives Considered

### Option A: EAS Update (`expo-updates`)

Adopt Expo's OTA mechanism; publish new JS+asset bundles (including `adpSnapshots.json`) via `eas update`.

- **Pros:** Expo-native; also delivers JS bug hotfixes without review; no bespoke fetch/cache code.
- **Cons:** Requires adding `expo-updates` + runtime-version config + one adoption rebuild; ships the **entire** JS bundle for what is a pure-data change; still requires an `eas update` publish per refresh; introduces update-channel/rollback surface the app doesn't otherwise need yet.

### Option B: Remote Storage fetch with bundled fallback (chosen)

- **Pros:** Reuses two established, approved patterns (ADR-018 Storage artifact, ADR-030 cache-first SWR); publishing an ADP refresh becomes a **single file upload** — instant, free, no review; decoder and pipeline are unchanged (same payload shape); guests/demo get fresh ADP too; bundled fallback means no regression risk if the remote is down.
- **Cons:** Loader becomes async; adds a public bucket + publish step as new ops surface (a script↔client contract, per ADR-018); a brief staleness window between first paint and background refresh (per ADR-030); still needs **one** production build to adopt the mechanism.

### Option C: Status quo — rebuild + App Store review per ADP refresh

- **Pros:** Zero new code, no new infrastructure.
- **Cons:** ~1-day latency on the app's most frequently-changing data; unworkable during active draft season.

## Consequences

### Positive

- ADP refreshes become **upload-only**: run `build:data` + `publish:adp`, live in minutes, no rebuild, no review, no EAS/Apple involvement.
- Guests and the demo experience get current ADP, not the build-time snapshot.
- No regression risk: the bundled copy remains the guaranteed fallback, so offline/first-launch/remote-outage behavior is at least as good as today.
- Consistent with ADR-018 and ADR-030 — no new architectural concepts, just a new artifact.

### Negative

- The ADP load path changes from sync to async; `loadBundledAdp()` callers must adopt the async loader.
- New ops contract: a public bucket, a publish script, and a versioned object name that must move in lockstep with `build-data.mjs`'s output schema.
- A staleness window exists between first paint (cached/bundled) and background-refresh completion.
- **One more production build is required to adopt this** — the currently-submitting v1.0.0 build will not have it.

### Risks

- **Format drift:** if `build-data.mjs`'s compaction schema changes, an older installed app could fetch an incompatible artifact. *Mitigation:* in-file `formatVersion` gate (app ignores newer formats and uses bundled) **plus** the versioned object name (`-v1` → `-v2` on breaking changes), per ADR-018.
- **Forgotten publish:** ADP drifts if `publish:adp` isn't run after new snapshots land. *Mitigation:* fold into the existing operational rhythm (same concern and mitigation as ADR-018); consider automating later.
- **Public exposure:** a public bucket makes the ADP artifact world-readable. *Acceptable:* the identical data already ships in the app binary and is not secret or user-specific.

## Revisit Conditions

- Projections/rankings/actuals begin needing frequent in-season updates → generalize this into a shared remote-data pipeline rather than one-off artifacts.
- `expo-updates` gets adopted for JS hotfixes anyway → reconsider consolidating ADP delivery into EAS Update to avoid two update mechanisms.
- The artifact approaches multi-MB or ADP cadence becomes intra-day → revisit caching/sharding and freshness windows.

## Related

- Tasks: TASK-355 (implementation), TASK-334 (mobile submission path)
- ADRs: ADR-018 (precomputed Storage artifacts — the pattern and `-v1` contract), ADR-030 (cache-first stale-while-revalidate launch data), ADR-022 (Expo app shell)

---
*Approved by: Patrick (developer), 2026-07-19*
