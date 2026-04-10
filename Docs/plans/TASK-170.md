# TASK-170: Reddit launch posts — r/bestball and r/fantasyfootball announcements

**Status:** Approved
**Priority:** P1

---

## Objective
Draft launch posts for r/bestball and r/fantasyfootball that sound like a community member sharing something they built — not a product launch. Voice should match the landing page: direct, specific, problem-first, no fluff. End each post with an exported roster image and a "roast my team" engagement hook to invite comments and boost Reddit ranking.

## Dependencies
- TASK-164 (messaging/value prop) — Complete
- TASK-166 (screenshots) — Complete
- TASK-167 (landing page live) — Complete

## Open Questions (resolve before posting)
- Confirm r/bestball allows self-promotion posts (check sidebar rules)
- Confirm r/fantasyfootball rules — may require a megathread or mod approval
- Include screenshots inline? Reddit image posts get more engagement but can't include a clickable link in the body — may need to post as text with imgur links instead
- Select a conversation-worthy roster for the image export — pick the weirdest/most controversial build, not the best one (e.g. a hyper-fragile stack, a bold zero RB, a team with a player people love to argue about)

---

## Post Drafts

### r/bestball

**Title:** Best ball degen sharing the tool I built to manage my portfolio

**Body:**

Pre-draft best ball tournaments are starting to close up — now's the perfect time to go back through your entries and find those hidden gem rosters before the season kicks off.

I'm a huge data nerd and I draft way too many best ball teams every year. I got tired of having zero visibility into what my portfolio actually looks like across 30+ entries, so I built a tool to fix it.

**Best Ball Exposures** (bestballexposures.com) — sync your rosters from Underdog or DraftKings and see your whole portfolio on one screen.

I see the question "did I draft the same team twice?" come up a lot. Your rosters are almost always unique at the player level — with 300+ draftable players and 18 picks, the odds are tiny. The real redundancy risk is structural: falling into the same archetype over and over, stacking the same QB-WR pairs, or pairing the same two QBs without realizing it. That's what this tool actually surfaces.

What it does:

- **Exposure tracking** across all your entries with closing line value vs current ADP
- **Auto-classifies every roster** into strategy archetypes (Hero RB, Zero RB, Hyper Fragile, etc.) so you can see your strategy mix at a glance
- **Combo & stacking analysis** — which QB-WR stacks and QB pairs keep showing up across your entries, and how concentrated you are on specific combos
- **Draft overlay** — see your exposure and correlations live while you're drafting, right on the Underdog/DraftKings page
- **ADP tracker** and **player rankings** for both platforms
- **Exportable roster images** — download a snapshot of any roster to share

Works with both Underdog and DraftKings. Most tools only do one.

No account needed to try it — there's a "Load Sample Data" button if you want to poke around first. Free tier covers the dashboard, exposures, and roster viewer with archetypes. Pro is $20/mo for the full suite but everything is **free through May 4**.

Built this for myself originally. Still adding stuff every day based on feedback.

Speaking of which — here's one of my more interesting builds from this off-season. Roast my team:

[ROSTER IMAGE HERE]

---

### r/fantasyfootball

**Title:** Built a free tool for analyzing your best ball portfolio — roast one of my teams

**Body:**

If you're deep into best ball drafts and have no real way to see what your overall portfolio looks like — I was in the same spot. I'm a data nerd who drafts way too many best ball teams, and I wanted a way to actually inspect the interesting parts of my portfolio without stitching together spreadsheets.

So I built **Best Ball Exposures** (bestballexposures.com) — sync your rosters from Underdog or DraftKings and get the full picture.

One thing I've learned: worrying about drafting the "same team twice" is the wrong frame. Your rosters will always be unique at the player level. The real blind spot is structural — are you running the same strategy every draft? Stacking the same QB-WR pair without noticing? This tool is built to surface exactly that.

What you get:

- **Portfolio dashboard** — your entire portfolio on one screen
- **Exposure analysis** — see what % of your entries each player appears in, with ADP trend data
- **Roster viewer** — every roster auto-classified into a strategy archetype (Hero RB, Zero RB, Hyper Fragile, etc.) so you can see if you're lopsided
- **Combo analysis** — which QB stacks and QB pairs keep recurring across your entries
- **Draft overlay** for live drafting context on Underdog/DraftKings
- **ADP tracking and player rankings** across both platforms

Pre-draft tournaments are closing up soon — now's a good time to go through your entries and see what you've actually built.

No account required to try it. Free tier covers the dashboard, exposures, and roster viewer. Pro ($20/mo) adds the full analytics suite — but it's all **free through May 4** while I'm in beta.

bestballexposures.com

Now — here's one of my weirder best ball builds from this off-season. Let me know how cooked I am:

[ROSTER IMAGE HERE]

---

## Key Differences Between Posts

| | r/bestball | r/fantasyfootball |
|---|---|---|
| Title tone | "degen" — matches the sub culture | More neutral — "analyzing" + "roast" hook in title |
| Feature depth | More detailed (audience knows best ball) | Slightly higher-level (mixed audience) |
| CTA language | "Roast my team" | "Let me know how cooked I am" (lighter) |
| Urgency hook | Pre-draft tournaments closing (opener) | Same but briefer (mid-post) |

---

## Roster Image Selection

Pick a team that's conversation-worthy — not your best roster, but your most *interesting* one. A hyper-fragile stack, a controversial zero RB build, a team with a player people love to argue about. The goal is comments, not admiration.

---

## Posting Guidance

1. **Check subreddit rules before posting.** r/bestball is generally welcoming of community-built tools (Bag Manager and Best Ball Team Builder both posted successfully). r/fantasyfootball has stricter self-promo rules — verify before posting.
2. **Post r/bestball first** — smaller, more targeted, higher signal. Use it as a test run.
3. **Post during peak hours:** Tuesday–Thursday, 10am–2pm ET.
4. **Respond to every comment in the first hour.** Early engagement matters for Reddit ranking. The "roast my team" hook should generate comments — lean into the discussion, reply to roster critiques, engage authentically.
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
