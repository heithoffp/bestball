# TASK-355: Implement ADR-031 — remote ADP artifact with bundled fallback (mobile)

**Status:** Pending Approval
**Priority:** P2 · **Size:** M · **Model:** Opus
**ADR:** ADR-031 (composes ADR-018 Storage artifact + ADR-030 cache-first SWR)

---

## Objective

Move mobile ADP snapshots from a binary-baked asset to a **public-read Supabase Storage
artifact** (`adp-snapshots-v1.json`) that the app fetches cache-first with the bundled copy
as fallback. After this ships, an ADP refresh is `build:data` → `publish:adp` (a single file
upload) — no native rebuild, no App Store review. Target the mobile **v1.0.0** build (not yet
built), so the launch release already has upload-only ADP updates.

## Verification Criteria

1. **Remote wins when present.** After `publish:adp` uploads a new `adp-snapshots-v1.json`,
   the app loads ADP from the remote artifact (over the bundled copy) and renders the updated
   values — with no rebuild.
2. **Bundled fallback never regresses.** With the remote unreachable (offline / 404), or the
   payload malformed / carrying an unsupported `formatVersion`, the app loads ADP from the
   bundled copy exactly as it does today.
3. **Bundled build output unchanged.** `npm run build:data` still produces the same
   `shared/data/adpSnapshots.json` (no pipeline change).

## Verification Approach

- **Transform check (no lint script exists — per project convention):** run each changed JS
  file through `babel-preset-expo` (`npx babel --presets babel-preset-expo <file> -o /dev/null`)
  for `shared/bundledData.js`, `shared/adpArtifact.js`, and `src/contexts/PortfolioContext.jsx`
  — must transform without error.
- **Pure-logic node test** (mirrors how `mergeEntries` is node-testable in `entriesCache.js`):
  a small script exercising `validateAdpPayload()` and the remote-vs-bundled selection —
  asserts (a) a valid remote payload is chosen, (b) `formatVersion` newer than supported →
  rejected → bundled, (c) missing/!Array `names`/`snapshots` → rejected → bundled,
  (d) `null` remote (fetch failed) → bundled.
- **Publish dry-run:** `node scripts/publish-adp.mjs --dry-run` reads
  `mobile-app/shared/data/adpSnapshots.json`, wraps it, and reports artifact size without
  uploading — exits 0.
- **Bundled-output diff:** `cd mobile-app && npm run build:data` then
  `git diff --stat mobile-app/shared/data/adpSnapshots.json` shows no change.
- **Manual (developer, on device — required):**
  1. Run a real `publish:adp`, launch the app, confirm ADP reflects the uploaded file.
  2. Fresh install in airplane mode → confirm bundled ADP renders (fallback path).

## Files to Change

| File | Change |
|------|--------|
| `supabase/migrations/018_create_app_data_public_bucket.sql` | **New.** Idempotent public-read policy for the `app-data-public` bucket (`storage.objects` select to `anon, authenticated` where `bucket_id = 'app-data-public'`). Documents the bucket in version control; the publish script is what creates it (mirrors migration 016's split). |
| `scripts/publish-adp.mjs` | **New.** Mirrors `build-combo-boards.mjs`: loads `repoRoot/.env.local` (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`), reads `mobile-app/shared/data/adpSnapshots.json`, wraps as `{ formatVersion: 1, generatedAt, names, snapshots }`, `ensureBucket('app-data-public', { public: true })`, uploads `adp-snapshots-v1.json` (upsert, `application/json`). `--dry-run` supported. |
| `scripts/package.json` | Add `"publish:adp": "node publish-adp.mjs"` (deps `@supabase/supabase-js` + `dotenv` already present). |
| `mobile-app/shared/adpArtifact.js` | **New.** Isolates fetch + cache + validation (mirrors `entriesCache.js`): `ADP_FORMAT_VERSION = 1`, public URL from `SUPABASE_URL`, `readAdpCache()` / `writeAdpCache()` via `expo-file-system` `File/Paths` (`bbe-adp-cache-v1.json` in `Paths.document`), `validateAdpPayload()`, `fetchRemoteAdp()`, `refreshAdp()` (fail-soft). |
| `mobile-app/shared/bundledData.js` | Convert sync `loadBundledAdp()` → async `loadAdp()`: return decoded files from cache-or-bundled for immediate render; keep a pure `decodeAdp(bundle)`; export `refreshAdpFiles()` that runs `refreshAdp()` and returns decoded files when the artifact changed (else `null`). Other getters unchanged. |
| `mobile-app/src/contexts/PortfolioContext.jsx` | `await loadAdp()` at both call sites (lines ~122, ~184). After initial processing, fire `refreshAdpFiles()` in the background; if it returns new files, re-run the pipeline and `setState` (stale-while-revalidate, per ADR-030). |

## Implementation Approach

1. **Bucket + migration.** Write `018_create_app_data_public_bucket.sql` with an idempotent
   `drop policy if exists` + `create policy` for public read on `app-data-public`. (A
   `public: true` bucket serves objects at `/storage/v1/object/public/...` without RLS, so
   this policy is belt-and-suspenders + documentation; the script is the operative creator.)
2. **Publish script.** Copy the structure of `build-combo-boards.mjs`: env load, `ensureBucket`
   with `{ public: true }`, read the mobile bundled JSON, wrap with `formatVersion`, upload
   with `upsert: true`. Add the `scripts/package.json` run entry.
3. **adpArtifact.js.** Model on `entriesCache.js`. `validateAdpPayload(p)` returns true only
   when `p.formatVersion <= ADP_FORMAT_VERSION` and `names`/`snapshots` are arrays. Public URL
   = `` `${SUPABASE_URL}/storage/v1/object/public/app-data-public/adp-snapshots-v1.json` ``.
   `refreshAdp()`: fetch → validate → on valid+changed write cache and return payload; on any
   failure return `null` (fail-soft). Cache read/write and corrupt-file deletion mirror
   `readEntriesCache`/`writeEntriesCache`.
4. **bundledData.js.** Keep the existing decode as pure `decodeAdp({ names, snapshots })`.
   `loadAdp()` = `decodeAdp(readAdpCache() ?? bundledImport)`. `refreshAdpFiles()` =
   `const p = await refreshAdp(); return p ? decodeAdp(p) : null;`.
5. **PortfolioContext.jsx.** Make the two sites await `loadAdp()`; both already run inside
   async load paths. After the first render's pipeline completes, call `refreshAdpFiles()`
   and, if non-null, re-process with the new adpFiles and update state.
6. **Scope guard.** ADP only — `getProjectionsRows/getRankingsRows/getDemoRosterRows/
   getActualsFiles` and `build-data.mjs` are untouched. `shared/utils/*` pipeline stays a
   lockstep port of web (this change lives in `bundledData.js` + new `adpArtifact.js` +
   `PortfolioContext.jsx`, none of which are shared-with-web pipeline files).

## Rollback Approach

Revert the commit — the bundled fallback means the app returns to today's behavior with no
data loss. Optionally delete the `app-data-public/adp-snapshots-v1.json` object; the bucket
can be left in place (unused).

## Notes / Proposed deviation from the original ask

- **Publish script location.** The task brief suggested `mobile-app/scripts/publish-adp.mjs`
  + `npm run publish:adp` inside the app package. I propose putting it in **repo-root
  `scripts/`** alongside `build-combo-boards.mjs` instead — it reuses that directory's
  existing `@supabase/supabase-js` + `dotenv` deps and `repoRoot/.env.local` service-role key,
  and keeps a service-role credential path out of the shipped app package. It still reads the
  mobile bundled JSON. Flagging per the scope-drift gate; say the word if you'd rather it live
  under `mobile-app/`.

## Related

- ADR-031 (decision), ADR-018 (Storage artifact pattern), ADR-030 (cache-first SWR)
- TASK-334 (mobile submission path)
