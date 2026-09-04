# Verelle

Verelle is a fertility chart for couples using the Marquette Method. It records
what the couple observed, lays it out as an instructor-readable chart, and
computes the fertile window of the Marquette protocol they selected — showing
the rule and the source behind every boundary it draws.

## Language

### The record

**Observation**:
Everything one partner recorded for a single civil date. The unit of storage,
of sync, and of one chart cell.
_Avoid_: Entry, reading, log, data point

**Civil date**:
The calendar date in the recording partner's own timezone. Observations are
day-granular; a timezone change never moves an existing observation to a
different day.
_Avoid_: Timestamp, datetime

**Monitor reading**:
What the Clearblue Fertility Monitor displayed on a test day: Low, High, Peak,
Missed, or Error. Missed and Error are real values, not absent ones.
_Avoid_: Result, hormone level, test result

**Bleeding**:
Menstrual flow recorded for a date. The first day of full flow anchors Cycle
Day 1.
_Avoid_: Period, menses, flow

**Intercourse**:
Whether the couple had intercourse on a date. Part of the record; never graded.

**LH strip**:
What a urine LH test strip showed on a date: Negative, Positive, or Invalid. In
protocols that use it, a positive strip can stand in for a monitor Peak.
_Avoid_: LH test result, ovulation test

**Mucus**:
Cervical mucus recorded in the Marquette manual's own descriptions — dry or
scant, thick and sticky, cloudy and slightly stretchy, clear and stretchy like
egg white. Each description carries the mucus category it belongs to, so the
couple learn the method's language rather than the app's.
_Avoid_: Discharge, CM, mucus score

**Mucus category**:
Low, High, or Peak: which band of fertility a mucus description falls in under
the Marquette manual. Determined from the description she recorded.
_Avoid_: Mucus rating, mucus level

**Temperature**:
A basal body temperature recorded for a date, together with the scale it was
recorded on. Confirms ovulation after the fact; never opens or closes a fertile
window.
_Avoid_: BBT, temp

**Note**:
Free text the recording partner attached to a date. Displayed back, never
parsed.
_Avoid_: Comment, tag, symptom

### The three Peaks

**Monitor Peak**:
A monitor reading whose value is Peak. Where the selected protocol uses the
monitor, the **last** monitor Peak of a cycle — not the first — is what the end
of the fertile window counts forward from.
_Avoid_: Peak (unqualified), egg symbol, three bars

**Mucus Peak**:
The last day of Peak-category mucus in a cycle. Knowable only once a
non-Peak day follows it, so it is provisional until it isn't.
_Avoid_: Peak day (unqualified), peak mucus day

**Peak override**:
An explicit act by the recording partner naming a date as her Peak when the
monitor missed it. Recorded as an override, so a boundary it moves is visibly
hers rather than the device's.
_Avoid_: User-marked Peak, manual peak, corrected peak

**Peak count**:
The annotations `P`, `P+1`, `P+2`, `P+3` counted forward from whichever Peak the
selected protocol uses. The three full days after `P` are the days the Marquette
end-of-window rule waits out.
_Avoid_: Post-peak phase, luteal count

### The computation

**Protocol family**:
Which set of published Marquette rules a cycle is charted under — regular
monitor, monitor with mucus, mucus only, postpartum cycle zero, or postpartum
return to cycles. Chosen by the couple, recorded per cycle.
_Avoid_: Mode, algorithm, ruleset

**Protocol version**:
Which published source a family's rules were taken from, named explicitly
because public Marquette sources disagree on at least one boundary rule. Stored
so a boundary can never change without the version changing.
_Avoid_: Algorithm version, revision

**Fertile window**:
The span of cycle days the selected protocol treats as fertile, from the day it
opens to the day it closes. Drawn on the chart as a band behind the row.
_Avoid_: Fertile phase, fertile period, red zone

**Day status**:
What the selected protocol makes of a single day: fertile or infertile. The
method's words, and the only two Verelle uses.
_Avoid_: Safe, unsafe, risky, green day

**Boundary rule**:
The published rule that set one edge of a fertile window, named by its rule ID
and traceable to its source. Every boundary has one, and the day detail says
which in plain language.
_Avoid_: Reason, logic, calculation

**Confidence**:
Whether a boundary is final or still provisional — a window whose end depends on
a Peak that may not have happened yet is not the same claim as one whose Peak
count has completed. Drawn as the band's edge: solid when final, dashed when
not.
_Avoid_: Certainty, accuracy, probability

**Eligibility**:
Whether the couple's situation falls inside the scope the selected protocol was
published for — her age, her cycle lengths, and whether she is postpartum,
perimenopausal, or recently off hormonal contraception. Outside that scope
Verelle warns and keeps computing; it never blocks and never demands a field she
has not filled in.
_Avoid_: Validation, qualification, gating

**Intention**:
Whether a cycle is being charted to avoid or to achieve pregnancy. Changes what
the chart emphasises, never what it computes.
_Avoid_: Goal, mode, TTC

### The chart

**Cycle**:
The span from one Cycle Day 1 to the day before the next. One row of the chart.

**Cycle Day**:
A date's position within its cycle, counting from 1. One column of the chart.
_Avoid_: CD, day of cycle, DoC

**Chart**:
The grid of observations laid out by cycle and cycle day, with each cycle's
fertile window banded behind it. Verelle's entire output.

### The couple

**Couple**:
Two partners sharing one chart. Both record, both read.
_Avoid_: Account, household, family, user

**Pairing**:
The act of joining a second device to an existing chart using a short code. The
code never reaches the server.
_Avoid_: Invite, linking, couple invite

### Sharing and sync

**Owner secret**:
The 32-byte secret a chart is derived from. Whoever holds it can read and write
that chart; whoever does not, cannot. Losing it loses the chart — there is no
operator who can restore it.
_Avoid_: Password, key, credential, account secret

**Shared owner**:
The owner secret the couple holds in common. It *is* the couple, as far as the
data is concerned — one shared owner, one chart, two people.
_Avoid_: Couple key, group key, shared account

**Device owner**:
The owner secret belonging to one phone alone, distinct from the shared owner.
_Avoid_: Local account, device key

**Relay**:
The server that passes encrypted changes between the couple's phones. It cannot
read them. It does learn that a given owner synced, when, and roughly how much.
_Avoid_: Server, backend, sync server, cloud

### The boundary

**Published rule**:
A rule Verelle computes because a public Marquette or Clearblue source states
it. Verelle computes no rule it cannot cite, and where a situation has no
published rule it says so as a limit of the method's instructions rather than
inventing one.
_Avoid_: Our algorithm, house rules, heuristic

**Advice**:
A recommendation about what the couple should do. Verelle names a day fertile or
infertile under the protocol they chose and shows the rule that says so; it does
not call a day safe or unsafe, and it does not tell them what to do with it.
_Avoid_: Guidance, recommendation, insight
