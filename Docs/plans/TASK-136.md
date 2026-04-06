# TASK-136: ADR — per-platform scoped entry sync strategy

**Status:** Draft
**Priority:** P3

---

## Objective

Record an Architecture Decision Record for the per-platform scoped entry sync strategy introduced in TASK-132. The `writeEntries` function in `bridge.js` was changed from a full user-scoped delete to a platform-scoped delete that tracks each platform's previous entry IDs in `chrome.storage`. This decision affects how all future adapters sync entries and should be documented before a third platform is added.

The ADR should cover:
- **Problem:** Full-replace (`delete().eq('user_id')`) wiped cross-platform entries when a second platform synced
- **Chosen approach:** Each adapter declares a `platform` string; `writeEntries` reads previous entry IDs from `chrome.storage[platform_entry_ids]`, deletes only those, inserts the new batch, and saves the new IDs back to storage
- **Alternatives considered:** (1) DB `platform` column — clean but requires schema migration; (2) entry_id pattern matching (numeric = DK, non-numeric = Underdog) — fragile, breaks with a third platform
- **Trade-offs:** No DB migration needed; works for any number of platforms; but stale entries (from a platform the user stops syncing) persist indefinitely in Supabase

## Dependencies

- TASK-132 (implementation being documented) must be complete.
