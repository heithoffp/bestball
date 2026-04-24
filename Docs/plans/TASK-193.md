# TASK-193: SEO — Long-tail content + crawler-visible content for SPA deep routes

**Status:** Draft
**Priority:** P3

---

## Objective
Add a public-facing static content surface (e.g. /blog or /glossary) and/or pre-render the marketing/landing routes so non-JS crawlers (GPTBot, ClaudeBot, PerplexityBot) and Google can index real content on deep routes (/exposures, /rosters, /adp-tracker, etc.). Today only the homepage has pre-render content via index.html injection. Options to evaluate via ADR: Vite SSG, switch marketing surface to Next.js App Router, or static MDX pages targeting fantasy best-ball long-tail queries (e.g. 'what is zero RB', 'Underdog vs DraftKings best ball', 'stacking strategy'). Highest-leverage SEO move for both Google and AI search citation. Origin: identified during initial SEO pass on 2026-04-24.

## Dependencies
None

## Open Questions
<!-- Unknowns or decisions to resolve before planning. Delete if none. -->
