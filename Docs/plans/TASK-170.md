# TASK-170: Reddit launch posts — r/bestball and r/fantasyfootball announcements

**Status:** Approved
**Priority:** P1

---

## Objective
Draft launch posts for r/bestball and r/fantasyfootball that sound like a community member sharing something they built — not a product launch. Voice should match the landing page: direct, specific, problem-first, no fluff.

## Dependencies
- TASK-164 (messaging/value prop) — Complete
- TASK-166 (screenshots) — Complete
- TASK-167 (landing page live) — Complete

## Open Questions (resolve before posting)
- Confirm r/bestball allows self-promotion posts (check sidebar rules)
- Confirm r/fantasyfootball rules — may require a megathread or mod approval
- Include screenshots inline? Reddit image posts get more engagement but can't include a clickable link in the body — may need to post as text with imgur links instead

---

## Post Drafts

### r/bestball

**Title:** I built a portfolio analytics tool for people managing 50+ best ball entries
**Body:**

I draft way too many best ball teams every year and got tired of stitching together spreadsheets to figure out what my portfolio actually looks like. So I built something.

**Best Ball Exposures**: automatically sync your rosters from Underdog and/or DraftKings, see your whole portfolio on one screen.

What it does:

- **Exposure table** across all your entries with CLV vs current ADP
- Auto-classifies every roster into an **archetypes** (Hero RB, Hyper-Fragile, Elite QB, etc.) so you can see your strategy mix
- **Draft overlay** to see correlations and exposures live while drafting.
- **Combo/stacking analysis** — which QB-WR pairs keep showing up in your entries
- **ADP tracker and player rankings** for both Underdog and Draft Kings

Works with both Underdog and DraftKings. Most tools out there only do Underdog.

No account needed to try it. There's a "Load Sample Data" button on the site if you want to poke around before uploading your own stuff. Free tier covers the dashboard, exposures, and roster viewer with archetypes. Pro is $20/mo for the full suite but it's **free through May 4**.

bestballexposures.com

Built this for myself originally. Figured other people drafting 30-40+ entries are dealing with the same thing. Open to feedback, still adding stuff every day.

---

### r/fantasyfootball

**Title:** Built a free tool for tracking your best ball portfolio across Underdog and DraftKings

**Body:**

If you do a lot of best ball drafts and have no idea what your overall portfolio looks like — I was in the same spot. Built a web app to fix it.

**Best Ball Exposures** — automatically sync your rosters from Underdog or DraftKings and see exposure, strategy breakdown, stacking patterns, and draft tendencies across all your entries.

The free tier gives you a portfolio dashboard, exposure analysis, and a roster viewer that auto-classifies each roster into a strategy archetype (Hero RB, Zero RB, etc). Pro ($20/mo) adds draft flow analysis, combo analysis, ADP tracking, and rankings — but it's all free through May 4 while I'm in beta.

Supports both platforms. No account required to try it, there's sample data you can load to see it in action.

bestballexposures.com

If you're only doing a few entries this probably isn't for you. But if you're 30+ deep and losing track of what you've built, this is what I made it for.

---

## Posting Guidance

1. **Check subreddit rules before posting.** r/bestball is generally welcoming of community-built tools (Bag Manager and Best Ball Team Builder both posted successfully). r/fantasyfootball has stricter self-promo rules — verify before posting.
2. **Post r/bestball first** — smaller, more targeted, higher signal. Use it as a test run.
3. **Post during peak hours:** Tuesday–Thursday, 10am–2pm ET.
4. **Respond to every comment in the first hour.** Early engagement matters for Reddit ranking.
5. **Stagger r/fantasyfootball** by at least a few hours, ideally the next day.
6. **Optional follow-ups:** r/underdogfantasy, r/DraftKingsFantasy — smaller but highly targeted.
7. **Do not cross-post.** Write native posts for each sub.

---

## Verification Criteria
- [ ] Post is live on r/bestball
- [ ] Post is live on r/fantasyfootball (or confirmed megathread approach)
- [ ] Both posts include bestballexposures.com
- [ ] Both posts mention free through May 4
- [ ] Developer has monitored first-hour comments and responded
- [ ] Post URLs are saved for reference

## Verification Approach
1. Confirm both posts are publicly accessible at their Reddit URLs
2. Verify each post contains the landing page URL
3. Verify each post mentions the May 4 free beta deadline
4. Developer confirms comment monitoring is complete

## Files to Change
No code changes. Deliverable is live Reddit posts authored by the developer.

## Implementation Approach
1. Developer reviews and personalizes the drafts (add specific details from their own drafting experience)
2. Developer checks subreddit rules for r/bestball and r/fantasyfootball
3. Post r/bestball first during a peak engagement window
4. Monitor and respond to comments
5. Post r/fantasyfootball the following day
6. Save post URLs for documentation
