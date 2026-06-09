---
name: craft-prose-critique
description: Reference module (not a slash command). Adversarial critique method and finding rubric for best-ball blog drafts. Read by the blog-critic agent and the weekly-blog skill.
---

# Prose Critique (blog craft reference)

> Adapted 2026-05-28 from `haowjy/creative-writing-skills` (`skills/prose-critique`),
> reframed from fiction to opinionated best-ball strategy writing. Reference module read by
> the `blog-critic` agent — not a user-invocable skill.

## Core method: adversarial reading
Do not confirm what works. Actively hunt for failure points. A critique exists to find the
places a sharp reader would disengage, distrust the writer, or stop believing the call.

## The five dimensions
1. **Argument / throughline** — Is there a clear, falsifiable thesis? Is there a real
   consensus being pushed against, or is one manufactured? Does each paragraph advance the
   case, or does some recap? Does the verdict land?
2. **Voice / stance** — Is the conviction earned (collateralized by evidence) or naked? Does
   the writer both-sides their way out of a position? Is the persona consistent?
3. **Prose** — line-level clarity, rhythm, word choice, sentence-length variety.
4. **Provenance** — Does every number, ranking, and expert take trace to a cited
   `kb/articles/` file? Any invented or unsourced figure is a blocking finding.
5. **Engagement** — Where would a mixed-audience reader skim, stall, or bounce?

## The AI-tell scan (run every time)
Flag each hit explicitly. These are the house's hard tells:
- **Completeness impulse / both-sidesing** — hedged, every-angle-covered analysis that
  refuses a verdict.
- **Hedging filler** — "arguably," "it could be said," "some might say," "potentially,"
  "it's worth noting," "it's important to note."
- **Narrative-naming** — "fascinating," "intriguing," "interestingly," "the curious case of."
- **Filler transitions** — "Furthermore," "Moreover," "In conclusion," "At the end of the
  day," "When it comes to," "Needless to say."
- **Throat-clearing openers** — "In the world of…," "In today's…," "Let's dive in," "buckle up."
- **Em-dash overuse** — count them; over ~1 per 150 words is a finding. Flag em dashes used
  as default connectors where a comma, colon, or full stop belongs.
- **Symmetrical triads / gratuitous listicles** where prose would carry the argument better.
- **Forced or mixed metaphor** — a controlling metaphor that decorates rather than clarifies,
  or a second unrelated metaphor sneaking in.

## Rubric for valid findings
Every finding must be:
- **Specific** — "the pacing has issues" fails. Quote the exact passage (≤125 chars).
- **Reasoned** — explain the reader cost, not just that the thing exists.
- **Directable** — the writer knows what to change or decide.
- **Non-obvious** — beyond a spellcheck.

## Stage calibration
Match critique intensity to draft maturity. Early: thesis and structure problems. Late: prose
polish, rhythm, the AI-tell scan. Do not polish the rhythm of a paragraph whose argument is
broken.

## Severity signaling
Rank every finding:
- **Blocking** — unsourced claim, no real thesis, no verdict, manufactured consensus.
- **High** — both-sidesing, naked conviction, any AI-tell hit, a dead/recap paragraph.
- **Medium** — rhythm flatness, a weak open or close, an over-explained basic.
- **Low** — word-choice nitpicks.

Lead the report with the highest severity. Each finding: what, where (quote), why it costs the
reader, recommended fix, severity.
