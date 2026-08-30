# Verelle

Verelle is a record-and-display chart for couples using the Marquette Method. It
records what the couple observed and lays it out as an instructor-readable
chart. It does not tell them what their data means.

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
Whether the couple had intercourse on a date. Recorded, never evaluated.

**LH strip**:
What a urine LH test strip showed on a date: Negative, Positive, or Invalid.
Transcribed like a monitor reading, and like one it is not a verdict.
_Avoid_: LH test result, ovulation test

**Mucus**:
Cervical mucus as the recording partner described it: Dry, Sticky, Creamy or
Stretchy. Described, never categorised - the Marquette manual's Low, High and
Peak mucus categories are a reading of the description, and reading it belongs
to the couple and their instructor.
_Avoid_: Peak mucus, mucus category, mucus score

**Temperature**:
A basal body temperature recorded for a date, together with the scale it was
recorded on. The scale is stored, never inferred from a locale.
_Avoid_: BBT, temp

**Note**:
Free text the recording partner attached to a date. Displayed back, never
parsed.
_Avoid_: Comment, tag, symptom

### Peak — the distinction that matters most

**Monitor Peak**:
A monitor reading whose value is Peak. It is data the device displayed and
nothing more. **It never produces a Peak annotation on the chart.**
_Avoid_: Peak (unqualified), egg symbol, three bars

**User-marked Peak**:
An explicit act by the recording partner declaring a date to be her Peak day.
The only anchor in Verelle, and the only thing that may render a `P`.
_Avoid_: Peak day (unqualified), confirmed peak

**Peak count**:
The mechanical annotations `P`, `P+1`, `P+2`, `P+3` counted forward from a
user-marked Peak. Arithmetic on a date the user chose — not a judgement about
her fertility.
_Avoid_: Post-peak phase, luteal count

### The chart

**Cycle**:
The span from one Cycle Day 1 to the day before the next. One row of the chart.

**Cycle Day**:
A date's position within its cycle, counting from 1. One column of the chart.
_Avoid_: CD, day of cycle, DoC

**Chart**:
The grid of observations laid out by cycle and cycle day. Verelle's entire
output. The chart is the product; the verdict is not.

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

**Record-and-display**:
Verelle's defining constraint: it renders what the couple recorded, with
mechanical annotations anchored to their own explicit marks. It computes no
fertility status, no fertile window, no day classification, and no advice. No
UI copy applies "fertile", "infertile", "safe", or "should" to a day.
_Avoid_: Read-only, passive, non-predictive

**Interpretation**:
Any claim about what an observation means for fertility. Belongs to the couple
and their instructor. Out of scope for v1 by deliberate decision, not omission.
_Avoid_: Analysis, insight, guidance, prediction
