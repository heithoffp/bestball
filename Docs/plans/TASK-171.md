# TASK-171: Creator and streamer outreach — target list and pitch templates

**Status:** Approved
**Priority:** P1

---

## Objective
Build a prioritized target list of best-ball streamers and content creators (micro-creators, even <1K followers) and draft personalized DM pitch templates offering permanent free Pro access in exchange for on-stream usage. Deliverable is a markdown doc at `Docs/creator-outreach.md` — no code changes.

## Verification Criteria
1. `Docs/creator-outreach.md` exists and contains all sections below.
2. Target list includes 10-20 best-ball streamers with: name, platform(s), audience size estimate, content focus, and contact method.
3. List includes the three developer-named creators: Jeary Football, Chad Candles, Hoohames.
4. DM pitch template exists — personalized framework with fill-in-the-blank sections, not generic copy-paste.
5. Follow-up template exists for non-responses (1 follow-up, polite, non-pushy).
6. Creator deal terms section defines: permanent Pro access, expectation (use on stream), no hard obligation.
7. Pitch emphasizes the web app as primary product — overlay is optional/secondary.
8. Tone matches the Reddit post tone from TASK-170 — community member, not marketer.

## Verification Approach
1. Confirm `Docs/creator-outreach.md` exists.
2. Count target list entries — must be 10-20.
3. Search the doc for all three named creators.
4. Read pitch template and confirm it has personalization placeholders, mentions the web app first, and does not lead with the overlay.
5. Read follow-up template and confirm it's a single polite nudge.
6. Read deal terms and confirm permanent Pro, on-stream usage expectation, no hard contractual language.
7. Developer reviews the full doc for accuracy of creator details and tone.

Steps 1-6 can be run by Claude. Step 7 requires the developer.

## Files to Change
| File | Action | Description |
|------|--------|-------------|
| `Docs/creator-outreach.md` | Create | Target list, pitch templates, follow-up template, deal terms |

## Implementation Approach
1. Research best-ball streamers and content creators across YouTube, Twitter/X, Twitch, and podcasts. Start with the three named creators (Jeary Football, Chad Candles, Hoohames) and expand from there by searching for best-ball draft content, Underdog/DraftKings streaming, and r/bestball community contributors.
2. For each creator, capture: name, primary platform(s), estimated audience size, content focus (e.g., live drafts, strategy, recaps), and best contact method (Twitter DM, YouTube comment, Discord, email).
3. Prioritize by: relevance to best-ball (must be focused on best-ball, not general fantasy), engagement level (active comments/chat > passive audience), and platform overlap (Underdog and/or DraftKings users preferred).
4. Draft the DM pitch template using the value proposition from `Docs/value-proposition.md`:
   - Lead with the problem (managing 30+ best-ball entries)
   - Mention the web app and what it does (portfolio dashboard, exposure analysis, archetypes)
   - Offer permanent free Pro access — no strings attached, just "if you find it useful, mention it on stream"
   - Keep it short (under 150 words) — DMs that are too long get ignored
   - Include personalization placeholders: `[CREATOR_NAME]`, `[SOMETHING_SPECIFIC_ABOUT_THEIR_CONTENT]`, `[PLATFORM_THEY_DRAFT_ON]`
5. Draft a single follow-up template — sent 5-7 days after initial DM if no response. Even shorter, references the original message, no pressure.
6. Write the deal terms section:
   - Permanent Pro access (no expiration, no clawback)
   - Expectation: try the tool and use it on stream if they find it genuinely useful
   - No obligation to post, no scripted mentions, no affiliate tracking
   - Creator can stop using it anytime with no consequences
7. Assemble into `Docs/creator-outreach.md` with sections: Overview, Target List (table), Pitch Template, Follow-Up Template, Deal Terms, Outreach Cadence (suggested timing/order).

## Dependencies
- TASK-164 (value proposition) — Complete

---
