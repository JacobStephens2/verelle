# ADR 0011: mechanical transcription is not a fertility verdict

- Status: superseded by ADR 0015 (Verelle computes the Marquette fertile window)
- Date: 2026-08-25
- Note: drafted as 0008 during the 2026-08-25 design session
- Amends: ADR 0001 (v1 is record-and-display only)

## Decision

ADR 0001's boundary is drawn between *transcribing what the user recorded into
the method's own notation* and *asserting the fertility state of a day*. The
first is mechanical and permitted. The second is interpretation and is out of
scope for v1.

Rendering a user-marked Peak as P and counting P+1, P+2, P+3 forward from it is
transcription: it restates a date the user chose, in the notation she was taught.
Naming a day fertile or infertile, bounding a fertile window, or advising on
intercourse is a verdict, whoever computes it.

## Context

Chart35, by the same author, assigns Creighton stamps and computes peak-day and
post-peak counts from user observations. Read alongside ADR 0001's flat "no
interpretation", that looks inconsistent, and a future reader — human or agent —
would reasonably conclude that one of the two apps has mispriced its risk.

It is not inconsistent, but ADR 0001 did not say why, so this records the line.
The FDA device definition excludes software that stores, transfers, and displays
medical data unless it is intended to interpret or analyze it. Restating a user's
own entry in her method's notation is display. Telling her what a day means is
analysis.

## Consequences

The existing CI fixture — a monitor Peak with no user anchor, asserting that no
P annotation renders — is the executable form of this line and must stay. The
copy test also stays: no UI string may apply "fertile", "infertile", "safe", or
"should" to a day. New display features are checked against this ADR, not against
whether they feel helpful.
