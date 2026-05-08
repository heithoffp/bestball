# TASK-222: Add data_collection_permissions to Firefox manifest disclosure

**Status:** Draft
**Priority:** P3

---

## Objective
Mozilla AMO validator warned that browser_specific_settings.gecko.data_collection_permissions is missing (TASK-216 sign run 2026-05-08). Currently a warning, will become required for new Firefox extension versions. Disclosure must reflect actual data the extension collects — roster picks (websiteContent), Supabase auth (authenticationInfo), and any technical telemetry. Choose values from Mozilla's allowed set, document the choice, and update manifest.json. Reference: https://mzl.la/firefox-builtin-data-consent.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
