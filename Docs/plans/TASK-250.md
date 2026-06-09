# TASK-250: Ignore non-football UD slates (e.g. 'UD 2026 World Cup' soccer) in extension sync and/or web app

**Status:** Draft
**Priority:** P2

---

## Objective
extension_entries contains a soccer slate 'UD 2026 World Cup' alongside football best-ball slates (UD 2026 Season/Superflex Season/Eliminator Season/Pre-Draft Best Ball; plus DK Pre-Draft/Post-Draft). The customer chrome-extension syncs ALL UD draft entries regardless of sport, so soccer entries pollute football portfolio analytics (unmatched players in exposure tables, archetype counts, etc.). Decide whether to filter at sync time (chrome-extension/src), read time (best-ball-manager web app), or both, and define the football-slate allow/deny criteria. Discovered during TASK-241 admin-scraper whitelist confirmation on 2026-06-09. Relates to TASK-241 and FEAT-020.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
