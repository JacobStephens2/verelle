# ADR 0015: Verelle computes the Marquette fertile window

- Status: accepted
- Date: 2026-09-04
- Supersedes: ADR 0001 (v1 is record-and-display only) and ADR 0011
  (mechanical transcription is not a fertility verdict)
- Amends: ADR 0009 (rebuild as a Chart35 fork) — its closing claim that the two
  apps "do not share a view layer and never will"

## Decision

Verelle computes a fertile window from the couple's observations and names each
day fertile or infertile according to a Marquette protocol they selected. It
does this openly: every boundary records the rule that set it, the protocol
version in force, and the source the rule came from, and the day detail explains
that boundary in plain language.

Five protocol families ship: `regular_monitor`, `regular_monitor_plus_mucus`,
`mucus_only`, `postpartum_cycle_zero_original`, and
`postpartum_return_to_cycles`. `perimenopause_quantitative_proposed` is
deliberately excluded: its published rules are thresholds on quantitative E3G
and LH values, which the Clearblue Fertility Monitor does not report and Verelle
does not record.

Circumstances the public sources do not cover — post-pill, perimenopause,
postpartum without breastfeeding, cycles or ages outside the regular manual's
scope — are **statuses that warn**, not families that compute. The app names the
limit as a limit of the method's published instructions, says what the method's
own conservative guidance is in the meantime, and keeps computing the family she
chose. It never blocks, and it never demands a field she has not filled in.

Where sources conflict, the configured rule is explicit rather than averaged.
The post-six-cycle start rule ships as the regular-cycles manual's
`earliest Peak of the last six cycles − 6`, recorded as
`protocol_version: marquette_regular_manual_public`, not as the earliest-High
formulation described in the 2022 multisite paper.

## Context

ADR 0001 forbade computed fertility status on the FDA device-exclusion ground
that software which stores, transfers and displays medical data is not a device
unless it interprets or analyses it, and ADR 0011 drew that line between
transcribing a user's own entry into the method's notation and asserting what a
day means. That reasoning was sound and is not disowned here. What changed is
the judgement about who it protected.

The couple Verelle is for has **no instructor** (issue #6). Record-and-display
leaves them performing the Marquette algorithm in their heads every morning —
counting three full days from the last Peak, tracking the earliest Peak across
six cycles, deciding when the window opens — from a manual that states those
rules as formulas precisely so they do not have to. Withholding the arithmetic
did not leave the interpretation to their instructor; it left it to them, unaided
and unrecorded, which is where errors actually happen.

ADR 0014 already named this precisely — "the largest carried product risk is
that the Wilsons have no instructor", with the boundary "nevertheless held" and
the risk "carried rather than resolved". This ADR resolves it.

This moves Verelle toward the regulatory territory of 21 CFR 884.5370 (product
code PYT, DEN170052), which `docs/plans/mvp-restart.md` already named. That is
understood and accepted, not overlooked.

## Considered options

**Stay record-and-display and refine the UI.** Rejected: the MVP's problem was
not only that it did not feel good to use, it was that a self-directed couple got
a prettier grid and still no answer. The FDA exclusion is preserved by not
computing, but the person it leaves exposed is the user.

**Compute only for achieving pregnancy.** Rejected: it sidesteps the
contraceptive claim, but avoiding is the case these couples actually have, and
shipping the easier half would be evasion dressed as caution.

**Compute silently, showing only the answer.** Rejected: it is the version that
most resembles the apps issue #6's couple already tried and disliked, and it
makes the sources conflict invisible. A window whose rule and source are on
screen is a different product from one that just glows.

## Consequences

**The guards are rewritten, not deleted.** The CI fixture asserting that a
monitor Peak with no user anchor renders no `P` and `src/ui-copy.test.ts` were
written to make this change impossible, and deleting them would leave nothing in
their place. `src/ui-copy.test.ts` keeps banning "safe", "unsafe" and "should"
applied to a day, and now permits "fertile" and "infertile", which are the
method's own words. The boundary fixture becomes a fixture about the *distinction
between a device Peak, a mucus Peak and a manual override*, which is still a real
line worth holding.

**One disclaimer, at the start, not on every day.** A disclaimer repeated beside
every cell trains the user to stop reading it and makes the chart unreadable.

**The app teaches the method.** Categorising mucus, explaining each boundary, and
using the manual's own vocabulary are all part of the same decision: a couple who
could put Verelle down and chart on paper with an instructor is the goal, not a
couple dependent on it.

**New identifying data enters the chart.** Eligibility needs date of birth,
breastfeeding and postpartum status, and a hormonal-contraception stop date.
These live under the shared owner with everything else, encrypted the same way,
readable by both partners and by no one else — including the relay.

**`CONTEXT.md` changes materially.** *Record-and-display* and *Interpretation*
were defined as the product's boundary and are now false as written; *Monitor
Peak*'s claim that it "never produces a Peak annotation" is false; *Mucus*'s
"described, never categorised" is false. Those entries are rewritten in the same
change as this ADR, not left to drift.
