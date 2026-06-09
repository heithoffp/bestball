---
name: craft-style-analysis
description: Reference module (not a slash command). Method for deriving a reusable voice-reference file from approved exemplar blog posts. Read by the weekly-blog skill once approved posts exist.
---

# Style Analysis (blog craft reference)

> Adapted 2026-05-28 from `haowjy/creative-writing-skills` (`skills/style-analysis`),
> reframed from fiction to opinionated best-ball strategy writing. Reference module — not a
> user-invocable skill.

## When this runs
This method bootstraps a **voice-reference file** from the blog's own best work. It needs
input: 2–3 *approved* posts in `content/blog/`. Until those exist, the canonical voice is the
"Sharp With Receipts" spec in `weekly-blog/SKILL.md` (see ADR-001). Once a few posts are
approved, derive a reference file so future drafts match the house voice empirically, not just
by rule.

## Discovery process
Start empirically. Read the approved posts and let the text show you where its patterns live,
rather than imposing categories. Note what recurs across posts and what varies by topic.

## Dimensions to extract
- **Sentence structure** — length distribution, fragment usage, compound vs. simple ratio.
- **Opening moves** — how the best posts hook (scene, number, claim) and how fast they reach
  the thesis.
- **Diction / register** — recurring word choices, where jargon is assumed vs. defined,
  domain vocabulary.
- **The contrarian move** — how each post names the consensus and turns it.
- **Evidence cadence** — how often and how a claim gets its receipt attached.
- **Pacing** — paragraph length and whitespace rhythm.
- **Closing technique** — how the strongest endings resolve the thesis.
- **Metaphor use** — when a controlling metaphor was used, and whether it earned its place.

## Output: the reference file
Document the voice through **principles, not catalogs**. For each pattern:
1. **Core principle** — the insight in a sentence or two, and what it does for the reader.
2. **Representative example** — one or two quotes with the source post cited.
3. **Pointers** — which posts show the pattern recurring.

Write it to `content/blog/voice-reference.md`.

## Critical distinction
Separate **intentional patterns** (reproduce them) from **unconscious tics** (log them as
issues for `blog-critic`, do not reproduce). The test: would we want every future post to
repeat this?

## Quality validation
1. Could a writer produce a recognizably on-voice post from this file alone?
2. Could they internalize it in one reading, without referring back mid-draft?
