---
name: weekly-blog
description: Draft a weekly best-ball blog post from the compiled knowledge base. Surveys kb/articles/, finds recently-compiled material, uses the blog-brainstormer to generate a wide angle pool then curates 3 for the developer to approve, drafts the chosen post in the "Sharp With Receipts" voice (ADR-001) guided by the craft references, runs a blog-critic + blog-reader-sim critique/revise loop, and logs it under docs/blog/. Triggers - weekly blog, draft a blog post, write this week's post, blog topics, /weekly-blog.
---

# weekly-blog

Generate one weekly blog post from the compiled KB. Human-in-the-loop: you propose three
topics, the developer picks one, you draft it.

## Paths (runs entirely in the BestBall project)

This skill runs from the **BestBall** project root (`C:\Software\Personal\BestBall`). The whole
loop — brainstorm, draft, critique, log — lives here. The **only** resource read from outside
this repo is the compiled KB, which remains in the `BestBall_Strategy` sister project where
`hus-kb-compile` maintains it. Treat the KB as a read-only input; never write to it.

| Resource | Path |
|---|---|
| KB index (read-only input) | `C:\Software\Personal\BestBall_Strategy\kb\index.md` |
| KB articles (read-only input) | `C:\Software\Personal\BestBall_Strategy\kb\articles\**\*.md` |
| **Blog output (source of truth)** | `docs\blog\` — `best-ball-manager\scripts\sync-blog.mjs` copies this into `src\content\blog\` at predev/prebuild, so this is where a post must land to ship. |
| Blog index | `docs\blog\index.md` |
| Subagents | `.claude\agents\` (`blog-brainstormer`, `blog-critic`, `blog-reader-sim` — local to this project) |
| Craft skills | `.claude\skills\craft\` (local to this project) |
| Image output (referenced by posts) | `best-ball-manager\public\blog\images\` — posts reference these as `/blog/images/<name>.<ext>` |
| **Local ADP CSVs** | `best-ball-manager\src\assets\adp\` (see ADP section below) |

**Sourcing is two-tier (ADR-002).** The KB is the source of all *judgment* — strategy, expert
takes, rankings, opinions all trace to `kb/articles/` and `kb/index.md`. But you **state every
take as your own** and never attribute it to a panel or "the experts" in the prose (ADR-003);
provenance lives in the `kb_sources` frontmatter, not the sentence. Hard *facts* (box-score
stats, ADP) may come from the fixed whitelist in Step 5, cited inline with an access date. On
any fetch failure or unverifiable number, emit a `[STAT NEEDED: …]` placeholder — never fill a
figure from memory. Never reach into `docs/context/sources/`, off-whitelist domains, or outside
knowledge for anything else.

This skill runs **interactively in the main chat**. It must pause and wait for the developer
between proposing topics and drafting. Do not draft a post until a topic is chosen.

---

## Argument: recency window

The skill accepts an optional argument that sets how far back "fresh" material goes:

- *(empty)* → default **14 days**
- `21d`, `30d`, `7d` → that many days
- `since 2026-05-10` → everything compiled on/after that date

Today's date is available in session context — use it as the window's end.

---

## Workflow

### Step 1 — Orient
Read `docs/blog/index.md`. Extract the titles, slugs, and topics of every post already
written. If the file is missing or the table is empty, this is the first run — say so and
continue. Hold this list; it's how you avoid repeating yourself in Step 3.

### Step 2 — Detect fresh material (KB-only)
1. Read `kb/index.md` — note the "Last compiled" date and the category structure
   (strategy-frameworks, player-situations, positional-analysis, draft-mechanics).
2. Glob `kb/articles/**/*.md`. For each, read the frontmatter `last_compiled` field
   (a string like `2026-05-19T20:45:00Z` — compare it as a date).
3. Keep every article whose `last_compiled` falls inside the recency window. This is the
   **fresh set**.
4. **Fallback:** if the window yields nothing, take the most recently compiled ~8 articles
   instead, and tell the developer you fell back because nothing was compiled in the window.

### Step 3 — Survey & de-dupe
Read the fresh set's one-line summaries from `kb/index.md`, then read the full text of the
3–6 most promising articles. Look for tension, contrarian angles, surprising overlaps between
articles, or a throughline that connects several. Cross-reference against the existing-posts
list from Step 1 — drop any angle that's already been published.

### Step 4 — Brainstorm wide, curate to 3, then STOP
Spawn the **`blog-brainstormer`** subagent (Agent tool, `subagent_type: blog-brainstormer`).
Pass it the fresh set from Step 2, the existing-posts list from Step 1, and the instruction
that sourcing is KB-only. It returns a wide pool (≥6) of distinct, evidence-backed angles.

Curate that pool down to the **three strongest, most genuinely distinct** proposals. Drop any
angle already published, any that lacks a real consensus to break, and any whose receipts are
thin. Present **exactly three** numbered proposals. Each must contain:

- **Working title** — sharp, specific, not clickbait
- **The consensus it breaks** — what the field/market believes that the post argues against
- **Thesis** — the high-conviction call, one sentence
- **The receipts** — the specific KB-sourced facts that back it, with `kb/articles/...` path(s)
- **Why a drafter stops scrolling** — the "so what"
- **Metaphor (optional)** — name a controlling metaphor only if one genuinely clarifies;
  otherwise write "none — runs on argument." Never force one.

After listing them, stop. Ask the developer to pick a number, or to regenerate. **Do not
start drafting.** If they ask to regenerate, re-run the brainstormer for *genuinely different*
angles — not reworded versions of the same three.

### Step 5 — Draft the chosen post
Write 600–900 words in the **Voice** spec below. The bar is a **near-publish draft**, not a
skeleton: real numbers in place, charts fully specified with their data, frontmatter complete.
The only things left for the developer should be rendering the specified images and resolving
any genuine `[STAT NEEDED]`.

Before drafting:
1. Read the craft references and apply them: `.claude/skills/craft/writing-principles/SKILL.md`
   (the why) and `.claude/skills/craft/prose-writing/SKILL.md` (the line-level how).
2. **Read the two most recent published posts in `docs/blog/`** (any with `status: published`)
   as the fidelity target — match their density of concrete numbers, their inline-image cadence,
   their tracker attribution, and their frontmatter shape. They are the house standard; the
   draft should look like them, not like a thinner outline of them.

Then:

1. `date` = today (`YYYY-MM-DD`). `slug` = kebab-case of the title (collision same day → append `-2`).
2. Save to `docs/blog/YYYY-MM-DD-<slug>.md` with this frontmatter — **all fields, including
   `image`** (the OG card; use the placeholder filename below — the developer renders it later):
   ```yaml
   ---
   title: "<title>"
   date: <YYYY-MM-DD>
   status: draft
   image: "/blog/images/og-<slug>.png"
   kb_sources:
     - <kb/articles/...path>
   topic_tags: [<tag>, <tag>]
   ---
   ```
3. Append one row to the `docs/blog/index.md` table:
   `| <date> | <title> | <slug> | draft | <comma-separated source filenames> |`

#### Hard numbers (ADR-002)
When a claim is sharper with a real number than with a KB adjective, use the whitelist below —
never invent it. The KB still owns all strategy and opinion.

| Data type | Fetch from | Notes |
|---|---|---|
| Box-score stats (rush TDs, attempts, pass volume) | **nfl.com** (WebFetch the player's stats page) | Pro-Football-Reference is whitelisted but 403-blocks WebFetch — use PFR only for manual lookups. |
| Underdog or DraftKings ADP (current) | **Local CSV — preferred over WebFetch** — `best-ball-manager\src\assets\adp\{underdog\|draftking}_adp_YYYY-MM-DD.csv`. Pick the most recent file for each platform. Columns: `firstName, lastName, adp, positionRank, slotName, teamName`. | These are the authoritative platform ADPs scraped directly from Underdog / DraftKings. Read the file directly with the Read tool; do not fetch the web for platform ADP. |
| Best-ball / draft ADP (fallback) | **FantasyPros best-ball ADP** (WebFetch) | Use only when a specific player isn't in the local CSVs. |
| Advanced efficiency (YPRR, route %), strategy, takes, rankings | **KB only** | Never fetch these externally. |

Rules:
- **Exact numbers, not adjectives.** Pull the real ADP to one decimal from the local CSV
  (`33.6`, not "early third"), and *compute* derived figures rather than approximating:
  cross-platform pairs use the arrow + pick-delta format the published posts use —
  `Underdog 53.2 → DraftKings 59.2 · 6.0 picks later` — and percentage gaps are calculated, not
  eyeballed. "Down about 11%" is a draft that isn't done; "down 11%" with the two ADPs shown is.
- **Attribute ADP to the tracker, with the pull date** — match published practice: ADP comes
  from `[my own tracker](/adp-tracker)`, with the morning it was pulled stated once
  (`both boards pulled the same morning, 2026-06-15`). The CSV filename is your provenance for
  reading the number; the *prose* attribution is the tracker link + pull date, not the filename.
- **Cite every external web number inline** with source + access date:
  `12 rushing TDs in 2024 (nfl.com, accessed YYYY-MM-DD)`. Use today's date. Resolve these
  during drafting (WebFetch the nfl.com stats page) — `[STAT NEEDED]` is the failure fallback,
  not the default.
- **`[STAT NEEDED]` fallback.** On a fetch failure, an off-whitelist need, or an ambiguous
  table cell you can't read with confidence, write `[STAT NEEDED: <what you wanted>]` and move
  on. Never fill the figure from memory. The placeholder is surfaced to the developer in Step 6.
- Read a *specific* cell, not a row gist — dense stat tables are easy to misparse. If unsure
  which number is right, treat it as ambiguous and use `[STAT NEEDED]`.

#### Internal links
The blog is part of the web app — link relevant product surfaces the way the published posts do.
Allowed internal targets (root-relative): `/adp-tracker` (the ADP tracker — the standard
attribution for every ADP figure), `/blog` (the index), and any other live route the post
genuinely points at. Write them as ordinary markdown links (`[my own tracker](/adp-tracker)`).
Do not invent routes that don't exist.

#### Images & charts
The published posts carry 2–4 inline visuals: bespoke SVG data-viz charts (an ADP gap, a
cross-platform comparison, a package trade-off) plus, sometimes, a real draft-board screenshot.
Drafts must specify these to near-publish fidelity — never narrate a visual vaguely
("it happened at a real table"). Two kinds of visual, two conventions:

**1. Data-viz charts (the skill builds the full spec).** Wherever a chart sharpens the argument,
emit the live inline image reference *immediately followed by* an HTML-comment spec carrying the
**real data rows** (pulled from the CSV / resolved stats), so rendering the SVG is a mechanical
step the developer (or a later generator) can execute without re-deriving anything:

```
![<alt text stating the takeaway, not "a chart">](/blog/images/<name>-<YYYY-MM-DD>.svg)

<!-- CHART SPEC
type: grouped-bar | gap-strip | scatter | comparison-bars
data:
  - { label: "Josh Allen",     underdog: 33.6, draftkings: 25.7 }
  - { label: "Lamar Jackson",  underdog: 56.5, draftkings: 53.4 }
caption: <one-line takeaway, mirrors the alt>
source: underdog_adp_2026-06-15.csv, draftking_adp_2026-06-15.csv
-->
```

Name the file `/blog/images/<short-slug>-<YYYY-MM-DD>.svg`; the rendered file lands in
`best-ball-manager/public/blog/images/`. Match the chart count and placement of the published
posts — roughly one visual per major beat, not one per paragraph.

**2. Real screenshots (human-supplied placeholder).** A draft-board screenshot or app capture
can't be auto-generated. Insert a literal placeholder line:
`[INSERT IMAGE: screenshot of the June 10 BBM board where Allen went R3 and the highlighted column took Kyren, then Daniels in R6]`

The OG card (`image:` frontmatter, `og-<slug>.png`) is also human-supplied — it's already named
in the frontmatter, so just flag it in the Step 6 checklist.

Every chart spec, screenshot placeholder, and the OG card are surfaced in Step 6 as the image
punch-list.

### Step 5b — Critique & revise loop (before showing the developer)
Do not present a draft you have not pressure-tested. After writing:

1. Spawn **`blog-critic`** (`subagent_type: blog-critic`) and **`blog-reader-sim`**
   (`subagent_type: blog-reader-sim`) on the draft file. Run them in parallel.
2. Address **every Blocking and High finding**, every AI-tell/banned-phrase hit, and any spot
   the reader-sim drifted or distrusted. Medium/Low findings: fix or consciously keep.
3. Re-run `blog-critic` if you made substantial changes. Iterate until the critic returns no
   Blocking/High findings and zero AI-tell hits.
4. Update the saved draft file with the revised post.

### Step 6 — Present
Show the full revised draft inline. Briefly note what the critique loop caught and changed.
**List the pre-publish punch-list as a checklist**, grouped, so the developer's remaining work
is explicit and short:
- **Numbers** — each `[STAT NEEDED: …]` (a figure to fetch or supply).
- **Charts to render** — each `<!-- CHART SPEC -->` block, by target filename, noting its data
  is already filled in and it just needs rendering to `best-ball-manager/public/blog/images/`.
- **Screenshots** — each `[INSERT IMAGE: …]` the developer must capture.
- **OG card** — the `og-<slug>.png` named in frontmatter.

Offer further revisions (tighten, re-angle, adjust the metaphor). Leave `status: draft` until
the developer says it's done and all checklist items are resolved.

---

## Voice — "The Sharp With Receipts"

Defined from first principles in **ADR-001**. The blog's job: make a **high-conviction,
non-consensus call** a drafter can act on, and **back every word of it with specific evidence**
from the KB. Safe takes are worthless at a draft table; so is a hot take with nothing under it.
The voice lives in the tension between the two.

### The signature move
Every post does the same thing: **name what the market believes, then break it with evidence.**
State the consensus, turn it, then spend the post proving the turn with KB-sourced specifics.
If there's no consensus to push against, it isn't a post yet.

### Who you're writing for
A mixed room, casual to sharp. Open on something any fantasy player understands, then go deep
fast. Assume general fantasy literacy (ADP, the draft, stacks). Define the *one* term a casual
reader would trip on, once, in passing. Never explain what you can assume.

### Operating principles
1. **Take the side.** Beat the weak counters; refusing a verdict (both-sidesing) is a top AI
   tell and useless to a drafter. But beating *every* counter is the opposite tell — see #7.
2. **Conviction is collateralized, never naked.** Every strong claim gets an immediate,
   concrete receipt: a player, an ADP, a round, a team, a real number. State the take as your
   own — never lean on "the experts say" or name a panel to borrow its authority (ADR-003).
   The receipt is the evidence, not the source's reputation.
3. **Economy.** Every sentence sharpens the call or gets cut.
4. **Trust the reader.** Don't resolve every ambiguity or name every implication.
5. **Concrete over abstract.** "A late-fourth Bucky Irving splitting third downs with Gainwell"
   beats "an undervalued back in a crowded committee."
6. **Metaphor optional.** Use a controlling metaphor only when it genuinely clarifies; extend
   it cleanly, never mix it, never decorate. Most posts win on stance plus specifics.
7. **Leave one honest counter standing (mandatory).** Every post must concede at least one
   genuine place the call could be wrong, and *not* immediately knife it. A steelman demolished
   in the same breath does not count. This is one honest beat, not both-sidesing and not
   hedging — you still make the call. A post with a perfectly frictionless thesis fails the
   critic at High.

### Structure
- **Open** on the tension or the claim. Never a definition, never "In best ball, …".
- **Thesis by paragraph two** — the reader knows where you stand and what you're fighting.
- **Body = the receipts.** Each paragraph advances the case; none recaps.
- **Land the ending** on a line that resolves the thesis, not a summary.
- 600–900 words. Active voice. Present tense for strategy.

### Hard bans — AI tells (rewrite any hit before presenting)
- **Hedging filler:** "arguably," "it could be said," "some might say," "potentially,"
  "it's worth noting," "it's important to note."
- **Narrative-naming:** "fascinating," "intriguing," "interestingly," "the curious case of."
- **Filler transitions:** "Furthermore," "Moreover," "In conclusion," "At the end of the day,"
  "When it comes to," "Needless to say."
- **Throat-clearing openers:** "In the world of…," "In today's…," "Let's dive in," "buckle up."
- **Em-dash overuse.** Reserve for genuine interruption; default to commas, colons, semicolons,
  full stops. Soft cap ~1 per 150 words. Rewrite the sentence, don't just swap punctuation.
- **Symmetrical triads & gratuitous listicles** where prose carries the argument better.
- **Both-sidesing** that refuses a verdict.
- **Stacked / paired metaphors** — two images in one breath. One image; cut the second.
- **"It's not X, it's Y" pivots** ("That price isn't the cost of certainty. It's a tax.").
  State the claim plainly.
- **Escalating triples** ("real, structural, and not going to correct itself"). Break the rhythm.
- **Faux-inevitable conclusions** ("The rule writes itself."). Own the take as opinion.
- **Omniscient "most people" framing** ("most drafters read it backwards"). Speak first-person,
  narrower.
- **Single-framing-device overcommitment** — piling one metaphor across the whole post. Let
  some sentences be plain.
- **Over-polished column cadence** ("nobody has to sweat on a Sunday," "said the quiet part out
  loud"). Prefer rough, domain-native phrasing.
- **In-prose attribution of judgment to an outside source** ("the ETR panel calls it wild,"
  "the experts say," "one panel put it straight"). Own the take; the source lives in the
  `kb_sources` frontmatter, not the sentence (ADR-003). Hard *numbers* still carry their inline
  whitelist citation — that's a fact, not a borrowed opinion.

### Provenance (non-negotiable, ADR-002 + ADR-003)
**KB for judgment, whitelist for facts — but the author owns every take.** Every ranking and
strategic claim must be *grounded* in the KB: it traces to one of the `kb/articles/` files
listed in the post's `kb_sources` frontmatter, and you never invent a take the KB doesn't
support. But state it as your own opinion. **Do not attribute judgment in the prose** — no "the
ETR panel calls it wild," no "the experts say," no "one panel put it straight." Naming an
outside source to back an opinion reads as borrowed conviction and is an AI-tell (ADR-003).
Provenance lives in the frontmatter, not the sentence. Hard numbers (box-score stats, ADP) are
the one thing you *do* cite in-prose: pull them from the Step 5 whitelist with an inline source
+ access date, because that citation guards against inventing a number, not against owning an
opinion. **No-fabrication is absolute:** on any fetch failure or unverifiable number, emit
`[STAT NEEDED: …]` — never fill a figure from memory, never cite an off-whitelist domain.

### Self-check before presenting
The `blog-critic` agent (Step 5b) runs this adversarially, but check it yourself first: every
banned phrase above; em-dash density over the cap; a second metaphor sneaking in; any paragraph
that recaps rather than advances; any strong claim missing its receipt; a verdict that never
lands; **exactly one honest counter left standing, not knifed** (a frictionless thesis fails);
any stacked image, "it's not X it's Y" pivot, escalating triple, or "most people" claim; **any
take attributed in-prose to a panel/expert instead of owned** (ADR-003 — provenance belongs in
the frontmatter). Word count 600–900.
