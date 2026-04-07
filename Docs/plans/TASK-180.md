# TASK-180: Retake dashboard hero screenshot manually

**Status:** Draft
**Priority:** P2

---

## Objective
The automated Playwright screenshot at 1280×800 compresses the dashboard content, making it feel scrunched on the landing page hero. Developer wants to retake the dashboard hero screenshot manually at a better viewport size and replace `public/screenshots/dashboard-hero.png`. The OG image (`public/og-image-dashboard.png`) should also be retaken at that time to match.

## Dependencies
- TASK-179 — Fix visual issues noticed during screenshot review (should be done first so the retaken screenshots look correct)

## Open Questions
- What viewport size / browser width produces the best-looking dashboard for the hero?
