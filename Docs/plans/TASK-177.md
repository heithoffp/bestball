# TASK-177: Sync and store entry fee per DraftKings roster

**Status:** Draft
**Priority:** P3

---

## Objective
The DK /contest/mycontests endpoint returns `BuyInAmount` per contest entry. During sync, capture this value and store it alongside each roster in the extension_entries database table. This enables future analytics features like ROI tracking, bankroll management, or contest-tier filtering. The BuyInAmount is already available in the parsed mycontests data from TASK-160's implementation — it just needs to be threaded through to the Entry shape and database schema.

## Dependencies
- TASK-160 (completed) — mycontests parsing already extracts contest data including BuyInAmount.

## Open Questions
- Does the extension_entries Supabase table need a schema migration to add an entry_fee column, or should it be stored inside the existing players JSON?
- Should entry fee also be captured for Underdog entries (requires checking if UD's API exposes it)?
- What UI surfaces would display or use the entry fee data?
