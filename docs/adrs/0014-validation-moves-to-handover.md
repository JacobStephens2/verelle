# ADR 0014: the founding household cannot dogfood Verelle, so validation moves to handover

- Status: accepted
- Date: 2026-08-25

## Decision

Verelle is built to completion before its users see it, and validated at
handover rather than during design.

The success metric M1 in `docs/plans/verelle-plan.md` — the founding couple
charts daily for 60 consecutive days as their chart of record, with an
instructor accepting the rendered chart — is withdrawn. It is replaced by a
three-step sequence: build against synthetic data until the **Chart** looks
right; retro-enter one of Mrs. Wilson's completed paper **Cycles** and have her
confirm the rendering; then one live Cycle charted in parallel with paper.

No user conversation precedes the build.

## Context

Verelle's users are the Wilsons, one couple, friends of the owner. They use the
Marquette Method, chart on paper today, and have no instructor.

**The owner's household does not use the Marquette Method.** This is the fact
everything else follows from. Every assumption about what a charting morning is
like, what the chart needs to show, and what is annoying at 6am is his best
reading of the method rather than lived use. He cannot catch his own
chart-format errors, because he has never had to read one in anger.

M1 was written for a founding couple who charts. There is no such couple, so
the metric is not merely unmet — it is unreachable, and leaving it in place
would have meant an acceptance gate that could never close. Sixty consecutive
days was also calibrated for a public-investment decision nobody is making yet;
the MVP has two users.

The decision not to talk to the Wilsons first was taken deliberately, against
the recommendation to ask them before specifying. The recommendation was to put
two questions to them up front: what specifically stopped them on the other
apps, and whether they want an app that interprets their chart or specifically
do not.

## Considered options

**Interview the Wilsons before specifying** was the recommended option and was
rejected by the owner. It would have replaced guesswork with answers on both
open questions, at the cost of delay and of a conversation he preferred not to
have yet.

**Find an instructed couple to dogfood with** was not pursued: it enlarges the
project from a favour for friends into a recruitment exercise, and the users who
matter are already known.

**Keep M1 and defer it** was rejected as worse than withdrawing it. An
acceptance gate that cannot close is not a gate; it is a permanently red light
that later readers learn to ignore.

## Consequences

**The spec is the owner's reading of the method**, plus
`docs/marquette-method-business-logic-specification-for-verelle.md`. It is not
validated by a user of the method until handover.

**Rework after they first use it is expected, not failure.** This is recorded
explicitly so that a later reader — human or agent — does not treat the first
round of corrections as evidence that something went wrong.

**The largest carried product risk is that the Wilsons have no instructor.** The
v1 plan's bet was that instructed couples "are exactly the users who do not need
the app to do it." That bet does not cover self-directed users. The
**record-and-display** boundary is nevertheless held, for regulatory reasons as
much as product ones (ADR 0001, ADR 0011), so the risk is carried rather than
resolved. It should be named at handover rather than discovered there.

> **Resolved by ADR 0015 (2026-09-04).** This carried risk is the reason the
> record-and-display boundary was reversed: Verelle now computes the fertile
> window, precisely because self-directed couples were the ones the boundary
> left unserved.

**Two questions are owed at handover** and must be asked then: what specifically
stopped them on the other apps, and whether they want an app that interprets
their chart or specifically do not.

**Retro-entry of a past Cycle becomes a load-bearing feature**, not a
convenience. Step two of the replacement sequence is impossible without it.
