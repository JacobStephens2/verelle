# Primary Source Research: Marquette Method Protocols for `regular_monitor_plus_mucus` and `mucus_only`

**Investigator:** Antigravity Research Subagent  
**Date:** September 4, 2026  
**Target Protocols:**
1. `regular_monitor_plus_mucus` (Marquette Regular Monitor with Cervical Mucus / Sympto-Hormonal Dual-Check)
2. `mucus_only` (Marquette Cervical Mucus Only / Ovulation Method Protocol)

---

## 1. Executive Summary

This research establishes the exact algorithmic rules and primary-source citations for Marquette Method protocols incorporating cervical mucus: `regular_monitor_plus_mucus` (dual-check) and `mucus_only`.

Key findings against primary literature:
1. **Mucus Baseline & Categories**: The Marquette manual (*NewNFP-Usermanual_ 2-2019 rev.4*) classifies cervical mucus into three tiers matching monitor readings:
   - **Low** (dry or scant, thick and sticky, holding its shape),
   - **High** (transitional: cloudy, thinner, slightly stretchy, moist to wet), and
   - **Peak** (clear, stretchy like raw egg white, slippery/lubricative).
   In regular cycles, **baseline** represents the infertile post-menstrual dry/scant pattern. **Change from baseline** is the first appearance of observable mucus or sensation of wetness/lubrication (often initially sticky/scant, or transitional cloudy/stretchy).
2. **Start of Fertility**:
   - In `regular_monitor_plus_mucus`: Operates as a conservative union. In the first 6 cycles, fertility starts at `min(CD6, first_high_monitor, first_mucus_change)`. After 6 cycles, it starts at `min(earliest_peak_last6 - 6, first_high_monitor, first_mucus_change)`.
   - In `mucus_only`: In the first 6 cycles, fertility starts on **Cycle Day 6** by default, or earlier on the day of **first mucus seen or felt**. After 6 cycles, fertility begins on the **earliest Mucus Peak in the previous 6 cycles minus 6 days** or the **first mucus seen or felt**, whichever comes first.
3. **End of Fertility**:
   - In `mucus_only`: Fertility ends **three full 24-hour days after the Mucus Peak Day** (i.e. intercourse permitted on the evening of the 4th day past Mucus Peak; in day-granular charting, CD = Mucus Peak + 4 is the first infertile day). Mucus Peak is identified retrospectively and remains **provisional** until at least one non-Peak observation follows it.
   - In `regular_monitor_plus_mucus`: Fertility ends **three full days after whichever Peak marker occurs last** (`max(last_monitor_peak, mucus_peak) + 3 full days`). If only one marker demonstrates Peak (e.g., monitor Peak without mucus Peak, or mucus Peak without monitor Peak), the observed Peak governs the end calculation. If neither shows Peak, post-six-cycle fallback uses the latest Peak in the last 6 cycles + 3 full days; in the first 6 cycles with no Peak on either sign, fertility continues open-ended until next menses.
4. **Confidence**: An end boundary anchored by a Mucus Peak is provisional until a non-Peak day is observed and the 3-day post-peak count completes without recurrence of Peak mucus.

---

## 2. Primary Sources and Official Citations

### Source A: Marquette Regular-Cycles User Manual
- **Citation**: Fehring, R. J., Schneider, M., & Barron, M. L. / Marquette University College of Nursing Institute for Natural Family Planning. *Marquette Method User Manual – Regular Cycles* (`NewNFP-Usermanual_ 2-2019 rev.4.docx`). Revised February 28, 2019.
- **Permanent URL**: `https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf`
- **Key Evidence & Quotes**:
  - *Mucus Categories*:
    - **Low Fertility ("L")**: "Scant, thick, and cloudy or dry" / "feeling moist or sticky and appearing scant, thick, minimal, white, and holding its shape" (Fig. 7, Beginning fertile mucus).
    - **High Fertility ("H")**: "As the cycle progresses and estrogen secretion increases from the growing follicle, cervical mucus increases in amount and becomes thinner, cloudy, and slightly stretchy. The texture may transition from moist and sticky to wet" (Fig. 8, Transitional cervical mucus).
    - **Peak Fertility ("P")**: "Peak fertile mucus... presence of peak-type mucus... distinctively slippery (lubricative) sensation... clear, stretchy like raw egg white" (Fig. 9, Peak fertile mucus).
  - *Retrospective Peak*: "Because the Peak Day can only be identified retrospectively (after a change to less fertile mucus or a dry sensation occurs), fertility is considered 'High' for three full days following the Peak Day."
  - *Mucus Algorithm First 6 Cycles*: "For the first 6 cycles, fertility begins on day 6" (Fig. 10: "Example mucus paper chart of first 6 cycles").
  - *Mucus Algorithm After 6 Cycles*: Fertility begins on the "earliest Peak mucus day in last six cycles minus six days or first mucus seen/felt, whichever comes first" (Fig. 10, Fig. 11: "Example mucus paper chart of second 6 cycles").
  - *End of Fertility*: Fertility ends three full days after the Peak Day; instructions specify resuming intercourse on the "evening of the fourth day past the Peak in cervical mucus."

### Source B: USCCB Marquette Model History and Effectiveness Paper
- **Citation**: Fehring, R. J. (2018). *The Marquette Model: An Evidenced-based Electronic Hormonal Fertility Monitor Aided Method of Family Planning* (USCCB Marquette Model History and Effectiveness Paper). United States Conference of Catholic Bishops (USCCB) Secretariat of Laity, Marriage, Family Life and Youth.
- **Permanent URL**: `https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf`
- **Key Evidence & Quotes**:
  - *Dual-Check Marquette I System (MMI)*:
    - *"The beginning of the fertile phase was either the change of mucus observations from baseline or a High reading on the monitor, whichever occurred first."*
    - *"The end of the fertile phase was determined by the last of the two indicators (three full days past the Peak day of cervical mucus or the last Peak reading of the monitor—whichever occurs last)."*
  - *Cross-Checking & Discrepancies*:
    - Discusses the cross-checking mechanism where biological signs (mucus) and objective hormonal assays (CBFM) support each other, protecting against early unexpected estrogen surges or device-missed LH surges.

### Source C: Fehring, Schneider, Raviele, & Barron (2007) — JOGNN Dual-Check Clinical Trial
- **Citation**: Fehring, R. J., Schneider, M., Raviele, K., & Barron, M. L. (2007). *Efficacy of Cervical Mucus Observations Plus Electronic Hormonal Fertility Monitoring as a Method of Natural Family Planning*. **Journal of Obstetric, Gynecologic, & Neonatal Nursing (JOGNN)**, 36(2), 152–160. DOI: `10.1111/j.1552-6909.2007.00129.x`.
- **Marquette E-Publications**: `https://epublications.marquette.edu/nursing_fac/7/`
- **Key Evidence & Quotes**:
  - *Physiological Rationale*: The monitor alone provides an estimated 5-day warning before peak in only ~20% of cycles, and thus misses the opening of the theoretical 6-day fertile window in ~80% of cycles without an algorithmic calendar start. Cervical mucus observations provide a direct biological cross-check to detect the earliest pre-ovulatory estrogenic rise.
  - *Effectiveness*: 12-month prospective clinical trial of 195 couples using monitor + mucus. Correct-use unintended pregnancy rate was 2.1 per 100 women (97.9% effective); typical-use pregnancy rate was 14.2 per 100 women (85.8% effective).
  - *Rule*: Recommends avoiding intercourse on all fertile days through the evening of the fourth day past either peak.

### Source D: Fehring, Schneider, & Barron (2008) — Comparative Efficacy Study
- **Citation**: Fehring, R. J., Schneider, M., & Barron, M. L. (2008). *Efficacy of the Marquette Method of Natural Family Planning*. **MCN: The American Journal of Maternal/Child Nursing**, 33(6), 348–354.
- **Marquette E-Publications**: `https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1494&context=nursing_fac`
- **Key Evidence**: Evaluated 204 women using Marquette protocols across monitor-only, monitor-plus-mucus, and mucus-only subgroups. Overall 12-month correct-use pregnancy rate of 0.6% (99.4% effective) and typical-use pregnancy rate of 10.6% (89.4% effective).

### Source E: Fehring, Bouchard, & Schneider (2018) — Marquette Case Reports
- **Citation**: Fehring, R. J., Bouchard, T., & Schneider, M. (2018). *Case Reports of the Marquette Method of Natural Family Planning*. **The Linacre Quarterly**, 85(4), 345–354. DOI: `10.1177/0024363918811802`.
- **PMC Full Text**: `https://pmc.ncbi.nlm.nih.gov/articles/PMC6081769/`
- **Key Evidence**: Establishes the post-six-cycle missed-LH-surge fallback: when no Peak is detected in the current cycle after 6 completed cycles, fertility ends on the latest Peak of the last 6 cycles plus 3 full days. In the first 6 cycles, with no current Peak, no fallback exists and abstinence is required until next menses.

---

## 3. Detailed Algorithmic Rules

### 3.1 Mucus Baseline & Start of Fertility

#### Definition of "Mucus Baseline" and "Change from Baseline"
1. **Marquette Mucus Descriptions**:
   Under the Marquette regular manual, cervical mucus observations are classified into:
   - **Low ("L")**: "dry or scant", "thick and sticky" (holds its shape, minimal).
   - **High ("H")**: "cloudy and slightly stretchy" (thinner, increasing amount, moist to wet).
   - **Peak ("P")**: "clear and stretchy like egg white" (watery, lubricative, slippery).
2. **What constitutes Baseline?**
   In regular cycles, **baseline** is the pre-ovulatory infertile pattern immediately following menses. In women with regular cycles, this is typically a **dry** pattern (no mucus observed, dry sensation).
3. **What constitutes a Change from Baseline?**
   Under Marquette teaching:
   - For a woman whose baseline is dry: **Any observed mucus** (including sticky or scant) is a departure from baseline and is termed "first mucus seen or felt".
   - In women with a continuous basic infertile pattern (BIP) of sticky/cloudy mucus (more common in postpartum or perimenopause), baseline is that unchanging daily mucus pattern. A "change from baseline" is any change in sensation (e.g. from dry/tacky to moist/wet) or appearance (from thick/clumpy to thinner/cloudy/stretchy).
   - Therefore, in regular cycles, the transition from dry to **any mucus observation** constitutes a change from baseline and signals the opening of the biological fertile phase.

#### Start of Fertility Under `regular_monitor_plus_mucus` (Dual-Check)
The protocol applies a conservative cross-check:
1. **First 6 Cycles**:
   - **Calendar Start**: Cycle Day 6 is the default baseline start.
   - **Biomarker Overrides**: If a monitor reading of **High** occurs before CD6, or if a **change from mucus baseline (first mucus seen/felt)** occurs before CD6, the fertile window opens immediately on that earlier day.
   - *Rule*: Fertility begins on `min(CD6, first_high_monitor_cd, first_mucus_change_cd)`.
2. **After 6 Completed Cycles**:
   - **Historical Calculation**: The manual defines historical start as `earliest Peak day in last 6 cycles - 6`. In dual-check, both monitor Peak history and mucus Peak history are tracked. The conservative algorithm takes the earliest of either historical Peak minus 6:  
     `historical_start = min(earliest_monitor_peak_last6, earliest_mucus_peak_last6) - 6`.
   - **Current Cycle Biomarkers**: Evaluates current cycle's `first_high_monitor_cd` and `first_mucus_change_cd`.
   - *Rule*: Fertility begins on `min(historical_start, first_high_monitor_cd, first_mucus_change_cd)`.

#### Start of Fertility Under `mucus_only`
1. **First 6 Cycles**:
   - **Calendar Start**: Fertility begins on **Cycle Day 6** (Marquette manual Fig. 10).
   - **Override**: If mucus is observed prior to CD6, fertility begins on the first day mucus is seen or felt.
   - *Rule*: Fertility begins on `min(CD6, first_mucus_seen_or_felt_cd)`.
2. **After 6 Completed Cycles**:
   - **Formula**: The fertile window begins on the **earliest Mucus Peak day in the last 6 cycles minus 6 days**, or the **first mucus seen or felt**, whichever comes first.
   - *Rule*: Fertility begins on `min(earliest_mucus_peak_last6 - 6, first_mucus_seen_or_felt_cd)`.

---

### 3.2 End of Fertility

#### End of Fertility Under `mucus_only`
1. **Rule**: Fertility ends three full 24-hour days after the Mucus Peak Day (`mucus_peak_cd + 3 full days`). Intercourse is permitted starting the evening of the fourth day past the Mucus Peak. In Verelle's day-granular model, `P, P+1, P+2, P+3` are fertile; `P+4` is infertile.
2. **Retrospective Peak Identification**:
   - The Mucus Peak Day is defined as the **last day of Peak-type mucus** (clear, stretchy, or lubricative/slippery).
   - It cannot be known on the day it occurs; it is recognized only **retrospectively** once a non-Peak observation (Low, High, or Dry) is recorded on the following day.
   - *Provisional status*: Any candidate Peak day remains provisional on that day and on subsequent days until a non-Peak observation confirms the peak shift. If Peak-type mucus returns before the 3 full post-peak days elapse, the post-peak count resets, and the new last Peak day becomes the candidate.
3. **If No Mucus Peak Is Observed**:
   - *First 6 cycles*: The cycle has no published alternative end formula; fertility remains open-ended through next menses.
   - *After 6 cycles*: Follows the Marquette missed-peak fallback: fertility ends on `latest_mucus_peak_last6 + 3 full days`.

#### End of Fertility Under `regular_monitor_plus_mucus` (Dual-Check)
1. **General Rule**: Fertility ends three full days after whichever Peak marker comes last:
   $$\text{Fertile End CD} = \max(\text{last\_monitor\_peak\_cd}, \text{mucus\_peak\_cd}) + 3$$
2. **Case Analysis**:
   - **Both Markers Show Peak (Different Days)**:
     - The later Peak governs the 3-day post-peak count.
     - *Example*: Monitor Peak is CD14 and CD15 (last Monitor Peak = CD15). Mucus Peak is CD16 (followed by Low on CD17). The later peak is CD16. Fertility ends CD16 + 3 = CD19.
   - **Monitor Peak Observed, Mucus Peak NOT Observed**:
     - The observed Monitor Peak governs: fertility ends 3 full days after the last Monitor Peak (`last_monitor_peak_cd + 3`).
   - **Mucus Peak Observed, Monitor Peak NOT Observed**:
     - The observed Mucus Peak governs: fertility ends 3 full days after the Mucus Peak (`mucus_peak_cd + 3`). This rescues cycles where the Clearblue monitor failed to detect the LH surge (e.g. 20 days of High).
   - **Neither Marker Shows Peak**:
     - *First 6 cycles*: Fertile through next menses (open-ended).
     - *After 6 cycles*: Historical fallback applies: `max(latest_monitor_peak_last6, latest_mucus_peak_last6) + 3 full days`.

#### Provisional Confidence Dynamics
- **Monitor Peak**: Once the monitor displays its second Peak day, `last_monitor_peak_cd` is locked by the device protocol. The end date is deterministic, though confidence remains provisional until the 3 post-peak days (`P+1, P+2, P+3`) have passed.
- **Mucus Peak**: Inherently provisional until a non-Peak day is recorded.
- **Dual-Check Interaction**:
  - If Monitor Peak has occurred (e.g. CD14–15) and mucus is currently Peak on CD15, the end date is provisionally CD15 + 3 = CD18.
  - If on CD16 the user records Peak mucus again, the Mucus Peak shifts to CD16, moving the provisional end date to CD19.
  - The end boundary is marked **final** only when:
    1. Both expected peaks have either occurred or been bypassed (with the controlling peak's post-peak shift confirmed),
    2. Three full days past the controlling Peak have elapsed, and
    3. The current date has reached `controlling_peak + 4`.

---

### 3.3 Discrepancy Recording

When combining monitor and mucus, discrepancies between hormonal and physical observations provide critical context for the couple and instructor. The system records the discrepancy flags where the markers disagree:

1. **`mucus_change_before_monitor_high`** (or `mucus_fertile_before_monitor_high`):
   - *Condition*: Mucus changes from baseline before the first monitor High reading.
   - *Impact*: Mucus moves the fertile window start earlier.
2. **`monitor_high_before_mucus_change`**:
   - *Condition*: Monitor displays High before any mucus change is observed.
   - *Impact*: Monitor moves the fertile window start earlier.
3. **`mucus_peak_after_monitor_peak`**:
   - *Condition*: Retrospective Mucus Peak is later than the last Monitor Peak.
   - *Impact*: Mucus extends the fertile window beyond the monitor's post-peak count.
4. **`monitor_peak_after_mucus_peak`**:
   - *Condition*: Last Monitor Peak is later than the Mucus Peak.
   - *Impact*: Monitor extends the fertile window beyond the mucus post-peak count.
5. **`monitor_peak_without_mucus_peak`**:
   - *Condition*: Monitor displays Peak, but no Peak-category mucus is recorded.
   - *Impact*: Monitor controls the end rule alone.
6. **`mucus_peak_without_monitor_peak`**:
   - *Condition*: Mucus Peak occurs, but monitor never displays Peak.
   - *Impact*: Mucus controls the end rule alone, rescuing a missed monitor peak.

---

## 4. Boundary Rule IDs and Proposed Metadata Specifications

Matching the convention established in `src/chart/boundary-rules.ts` and `docs/marquette-method-business-logic-specification-for-verelle.md`:

### Boundary Rules for `mucus_only`

- `MUCUS-ONLY-START-1`: "First six cycles begin fertility on Cycle Day 6." (Source: Marquette regular-cycles user manual)
- `MUCUS-ONLY-START-2`: "Earliest Mucus Peak of the last six cycles minus six." (Source: Marquette regular-cycles user manual)
- `MUCUS-ONLY-START-3`: "First mucus observation earlier than calendar start." (Source: Marquette regular-cycles user manual)
- `MUCUS-ONLY-END-1`: "End is three full days after the Mucus Peak." (Source: Marquette regular-cycles user manual; Provisional requirement: "Recording a non-Peak mucus observation and completing three full days after the Mucus Peak will make it final.")
- `MUCUS-ONLY-END-2`: "Missed-peak fallback uses latest Mucus Peak from last six cycles plus three full days." (Source: Case Reports of the Marquette Method; Provisional requirement: "Passing the historical fallback day or completing three full days after a confirmed Mucus Peak will make it final.")

### Boundary Rules for `regular_monitor_plus_mucus` (Dual-Check)

- `DUAL-START-CALENDAR-1`: "First six cycles begin fertility on Cycle Day 6." (Source: Marquette regular-cycles user manual)
- `DUAL-START-CALENDAR-2`: "Earliest Peak of the last six cycles minus six." (Source: Marquette regular-cycles user manual)
- `DUAL-START-MONITOR`: "First High reading earlier than calendar start." (Source: Marquette regular-cycles user manual)
- `DUAL-START-MUCUS`: "Mucus change from baseline earlier than calendar start or monitor High." (Source: USCCB Marquette Model history/effectiveness paper)
- `DUAL-END-MONITOR`: "End is three full days after last Monitor Peak." (Source: Marquette regular-cycles user manual; Provisional requirement: "Completing three full days after the last Monitor Peak with no subsequent Mucus Peak will make it final.")
- `DUAL-END-MUCUS`: "End is three full days after Mucus Peak." (Source: USCCB Marquette Model history/effectiveness paper; Provisional requirement: "Recording a non-Peak mucus observation and completing three full days after the Mucus Peak will make it final.")
- `DUAL-END-FALLBACK`: "Missed-peak fallback uses latest Peak from last six cycles plus three full days." (Source: Case Reports of the Marquette Method; Provisional requirement: "Passing the historical fallback day or completing three full days after a confirmed Peak will make it final.")
