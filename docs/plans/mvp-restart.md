# MVP restart plan

Decided 2026-08-25 by interview. This records the product decisions that are not
architectural enough for an ADR and not vocabulary enough for `CONTEXT.md`, but
which the spec is made of.

Supersedes `verelle-plan.md` for scope and sequencing. That document remains the
reference for the Marquette method itself, the threat model, and the regulatory
reasoning, all of which still hold.

---

## Who this is for

**The Wilsons — one couple, friends of the owner.** They use the Marquette
Method, chart on paper today, have looked at the available apps and were not
satisfied by any of them.

**They have no instructor.** They are self-directed. This matters more than it
looks: the plan's original bet was that *instructed* couples "are exactly the
users who do not need the app to do it." That bet does not cover these users,
and it is the single largest product risk carried into the MVP.

**The owner's household does not use the Marquette Method.** He cannot dogfood
this. Every version before the Wilsons see it is his best reading of the method,
not lived use.

## What replaces M1

M1 as written — the founding couple charts daily for 60 consecutive days as
chart of record — is unreachable, because the founding couple is not a Marquette
household. It is replaced by:

1. Build against synthetic data until the chart looks right.
2. Retro-enter one of Mrs. Wilson's completed paper cycles and have her confirm
   the rendering. Days, not months, and it catches the chart-format errors the
   owner cannot catch himself.
3. One live cycle charted in parallel with paper. Not 60 days — one complete
   cycle. Sixty days was calibrated for a public-investment decision nobody is
   making yet.

**No user conversation precedes the build.** This was decided deliberately on
2026-08-25 against the recommendation to ask them first. The consequence is
accepted and stated here so it is not rediscovered as a surprise: the spec is
the owner's reading of the method plus
`marquette-method-business-logic-specification-for-verelle.md`, validation moves
entirely to the handover, and rework after they first use it should be expected
rather than treated as failure.

Two questions therefore remain unanswered and should be asked at handover:
what specifically stopped them on other apps, and whether they want an app that
interprets their chart or specifically do not.

## Scope of the first version

One job: **record a daily observation and display the cycle as a chart.**

An observation carries four mandatory fields:

- monitor reading — Low, High, Peak, Missed, Error (Missed and Error are values,
  not absences)
- bleeding
- user-marked Peak
- intercourse

Everything else — LH strip, mucus, temperature, free-text note — sits behind a
"more" affordance. Every optional field is a row somebody has to skip at 6am.

The chart shows cycle-day numbering and the mechanical Peak counts P, P+1, P+2,
P+3 anchored to a user-marked Peak, and nothing derived beyond that.

**Both partners read and write the same chart**, on purpose. This was chosen
over solo-charting and over partner-read-only.

Not in the first version: reminders, multi-cycle comparison views, export,
payments, watches, a web app, an instructor portal, and everything already
listed as a v1 non-goal in `verelle-plan.md`.

## Why build this when Read Your Body exists

Read Your Body is record-and-display by design, has an MMPA-approved Marquette
template, charts the monitor readings, runs on both platforms, and costs about
$21/year. It is most of what v1 was scoped to be, and it is already shipping.

Verelle is built anyway because the Wilsons asked and the owner wants to help
them. That is a sufficient reason and needs no market thesis.

There is, however, a real differentiator, and the MVP should be shaped toward
it: **the partner cannot see the chart in any existing app.** It is the loudest
unmet Marquette request in the public review corpora — one reviewer describes
double-charting on paper *specifically so her husband can see it*. The one
shipped attempt at partner sharing misfires badly. This is what "both partners
read and write" is aiming at, and it makes the Wilsons a test of a real thesis
rather than a favour that goes nowhere.

The second open gap in the market — postpartum and breastfeeding charting,
unsupported by everyone — is real, larger, and deliberately not attempted here.

## Constraints inherited, not re-decided

- **No computed fertility status, ever.** ADR 0001 and ADR 0011. No fertile
  window, no day classification, no advice. No UI string applies "fertile",
  "infertile", "safe", or "should" to a day. A monitor Peak never renders a `P`.
- **The operator must be unable to read the couple's chart content.** ADR 0012.
  Note the disclosure is about content: a relay operator still learns that an
  owner synced, when, and roughly how much. Say that precisely in product copy.
- **Recording works with zero network, 100% of the time**, including cold
  launch. ADR 0010.
- **Losing the owner secret loses the chart.** ADR 0013. There is no operator
  recovery path and there must not be one. The UI must say so plainly.

## Still unspecified

- **Pairing.** `CONTEXT.md` defines it as a short code that never reaches the
  server. The spike retyped a 24-word mnemonic, which is not the product. This
  is entangled with ADR 0013, since pairing is how owner material moves between
  phones, and cannot be designed independently of it.
- **How owner secrets reach the platform keystore**, and how the couple records
  the shared owner secret offline.
- **Chart rendering** beyond "a table of cycle rows and day columns."
- **The `@evolu/vue` composables**, unexercised by the spike.
- **Cold launch in true airplane mode on physical phones** — the one spike
  criterion still open. `prototype/evolu-capacitor/RUNBOOK.md` has the script.
  Nothing may claim "verified on device" until it is run.
