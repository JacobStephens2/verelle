# Primary Source Research: Marquette Method Protocols for `postpartum_cycle_zero_original` and `postpartum_return_to_cycles`

**Investigator:** Antigravity Research  
**Date:** September 4, 2026  
**Target Protocols:**
1. `postpartum_cycle_zero_original` (Marquette Postpartum Cycle Zero / Lactational Amenorrhea Protocol)
2. `postpartum_return_to_cycles` (Marquette Postpartum Return-to-Cycles Protocol)
3. Circumstance Analysis: Postpartum without breastfeeding (Eligibility warning vs. computed family)
4. Comparative Analysis: Original protocol (2005/2013) vs. Revised breastfeeding protocol (2023)

---

## 1. Executive Summary

This research establishes the exact algorithmic rules, primary-source citations, and edge-case behaviors for Marquette Method postpartum protocols: `postpartum_cycle_zero_original` and `postpartum_return_to_cycles`.

### Key Findings Against Primary Literature:
1. **Cycle Zero (Lactational Amenorrhea) Mechanics**:
   - During lactational amenorrhea, regular menstrual bleeding is absent, but unpredictable follicular development and ovulation can occur. Traditional subjective biomarkers (cervical mucus and basal body temperature) suffer from high failure rates (Brown et al. 1985; Hatherley 1985; Bouchard et al. 2018).
   - The Clearblue Fertility Monitor (CBFM) is engineered for cycling women (21–42 day cycles) and expects an `m` button press on Day 1 of menses. To utilize the monitor during amenorrhea, Fehring, Barron, & Schneider (2005) introduced the **artificial 20-day cycle**: the user triggers Day 1, fast-forwards to testing, and tests urine hormones across a 20-day interval.
   - **Fertility Rules**: Under `postpartum_cycle_zero_original`, High and Peak days are fertile, as are three full days following the last Peak day (`last_peak + 3`). Days showing Low readings are infertile. If no Peak occurs by the end of the 20-day cycle, the artificial cycle ends and a new 20-day artificial cycle is initiated.
   - **No Menses Requirement**: Cycle zero does not require bleeding or menses to anchor Cycle Day 1; it is anchored explicitly as an artificial cycle.

2. **Return-to-Cycles Mechanics**:
   - The return-to-cycles phase begins upon the return of menses (first postpartum menstrual bleeding).
   - Under Bouchard, Fehring, & Schneider (2013), the fertile window opening transitions gradually across cycles to safely track the shortening follicular phase:
     - **Cycle 1**: Calendar start on **Cycle Day 10**.
     - **Cycle 2**: Calendar start on **Cycle Day 9**.
     - **Cycle 3**: Calendar start on **Cycle Day 8**.
     - **Cycle 4**: Calendar start on **Cycle Day 7**.
     - **Cycle 5 onward**: Calendar start on **Cycle Day 6**.
     - *Formula*: `max(6, 11 - postpartum_cycle_number)`.
   - **First High Override**: If the monitor records a **High** reading earlier than the calendar start day, fertility begins immediately on the day of that first High reading (`min(calendar_start, first_high_cd)`).
   - **End of Fertility**: The window closes three full days after the last Peak day (`last_peak + 3`).

3. **Comparison with 2023 Revised Protocol**:
   - Schneider, Fehring, & Bouchard (2023) published an effectiveness study on a revised breastfeeding protocol featuring 10 days of testing during cycle zero and optional evening LH tests.
   - However, the 2023 publication **omits a complete day-by-day implementation table or deterministic state machine** (e.g., handling non-testing intervals, retriggering criteria when 10 days elapse without peak, etc.). Consequently, Verelle implements the complete, deterministic **`postpartum_cycle_zero_original` (2005)** ruleset, as established in ADR 0015.

4. **Postpartum Without Breastfeeding**:
   - Non-lactating postpartum women resume ovulation much earlier (often between 25 and 94 days postpartum; Bouchard et al. 2013).
   - No distinct, validated day-by-day CBFM algorithm has been published for postpartum non-breastfeeding users. Manufacturer instructions recommend waiting for two natural cycles (21–42 days).
   - In accordance with ADR 0015, situations lacking a published algorithm are **Eligibility warnings that warn**, not families that compute.

---

## 2. Primary Sources and Official Citations

### Source A: Fehring, Barron, & Schneider (2005) — Original Cycle Zero Protocol
- **Citation**: Fehring, R. J., Barron, M. L., & Schneider, M. (2005). *Protocol for determining fertility while breastfeeding and not in cycles*. **Fertility and Sterility**, 84(3), 805–807. DOI: `10.1016/j.fertnstert.2005.03.042`.
- **Permanent URL**: `https://doi.org/10.1016/j.fertnstert.2005.03.042`
- **Marquette E-Publications**: `https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1004&context=nursing_fac`
- **Key Evidence & Rules**:
  - *Artificial Cycle Concept*: "Because the monitor is programmed for women who are having regular menstrual cycles, a protocol was developed to adapt the monitor for use by breastfeeding women who are not having cycles. The monitor was set to create an artificial 20-day cycle."
  - *Testing Schedule*: Users fast-forward the monitor to day 5 and test urine every other day while readings are Low. Once a High reading appears, testing occurs daily until Peak is detected or the 20-day interval ends.
  - *Abstinence / Fertile Days*: Couples avoid intercourse on High and Peak days, and for three full days following the Peak day.
  - *Cycle Reset*: If no LH surge occurs within 20 days, the monitor is reset and a new 20-day interval is begun.

### Source B: Bouchard, Fehring, & Schneider (2013) — Postpartum Transition Protocol
- **Citation**: Bouchard, T., Fehring, R. J., & Schneider, M. (2013). *Efficacy of a new postpartum transition protocol for avoiding pregnancy*. **Journal of the American Board of Family Medicine (JABFM)**, 26(1), 35–44. DOI: `10.3122/jabfm.2013.01.120126`.
- **Permanent URL**: `https://doi.org/10.3122/jabfm.2013.01.120126`
- **PMID**: `23288279`
- **Key Evidence & Rules**:
  - *Amenorrhea Phase*: Confirms the 20-day artificial cycle monitor reset protocol during lactational amenorrhea with a 98% correct-use effectiveness rate.
  - *Return of Menses*: "When menses resumed, women were instructed to reset the monitor to day 1 on the first day of menses and erase the monitor memory."
  - *Calendar Start Walk*: "Fertility was considered to begin on day 10 of the first cycle, day 9 of the second cycle, day 8 of the third cycle, day 7 of the fourth cycle, and day 6 of the fifth cycle and beyond, unless the monitor recorded a High reading before these days."
  - *First High Override*: A monitor High reading prior to the scheduled calendar start advances the start of fertility to that day.
  - *End of Window*: Fertility ends on the evening of the fourth day after the last Peak day (i.e., three full days after Peak).
  - *Postpartum Non-Breastfeeding Observations*: Documents 15 non-breastfeeding postpartum women, noting ovulation can occur by day 25, but provides no separate non-breastfeeding algorithm.

### Source C: Schneider, Fehring, & Bouchard (2023) — Revised Breastfeeding Protocol
- **Citation**: Schneider, M. M., Fehring, R. J., & Bouchard, T. P. (2023). *Effectiveness of a Postpartum Breastfeeding Protocol for Avoiding Pregnancy*. **The Linacre Quarterly**, 90(2), 182–193. DOI: `10.1177/00243639231167235`.
- **Permanent URL**: `https://doi.org/10.1177/00243639231167235`
- **PMCID**: `PMC10265386`
- **Key Evidence & Findings**:
  - *Modifications Evaluated*: Revisions included (1) instructing women to test daily with the CBFM for 10 days during cycle zero, (2) moving the start of fertility from CD10 to CD6 over the first six cycles, and (3) adding an optional evening LH test.
  - *Omission of Implementation Specification*: The article describes testing "daily for ten days during cycle zero," but does not publish a complete day-by-day table, interval protocol, or deterministic algorithmic state machine for handling negative 10-day test blocks, monitor resets, or non-testing windows during extended amenorrhea.

### Source D: Clearblue Fertility Monitor Instructions
- **Citation**: Swiss Precision Diagnostics GmbH. (2015). *Clearblue Fertility Monitor User Handbook* (Publication 800834-14).
- **Key Evidence**: States that women who have recently been pregnant or breastfeeding should wait until they have had at least two consecutive natural menstrual cycles (21–42 days) before relying on standard monitor instructions.

### Source E: USCCB Marquette Model History and Effectiveness Paper
- **Citation**: Fehring, R. J. (2018). *The Marquette Model: An Evidenced-based Electronic Hormonal Fertility Monitor Aided Method of Family Planning*. United States Conference of Catholic Bishops (USCCB).
- **Permanent URL**: `https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf`

---

## 3. Detailed Algorithmic Rules

### 3.1 Postpartum Cycle Zero (`postpartum_cycle_zero_original`)

#### Cycle Initialization
- An artificial cycle does not require vaginal bleeding or menses to start.
- Cycle Day 1 is defined by the user initiating the artificial cycle during amenorrhea.
- The standard artificial cycle length is 20 days (or extends until Peak + 3 days if an LH surge occurs late in the cycle).

#### Day Status and Fertile Window
1. **Fertile Days**:
   - Any day with a monitor reading of **High**.
   - Any day with a monitor reading of **Peak** (or user **Peak override**).
   - The **three full days** immediately following the last Peak day (`last_peak + 1`, `last_peak + 2`, `last_peak + 3`).
2. **Infertile Days**:
   - Any day that is not High, not Peak, and not within three full days after the last Peak.
   - Low monitor readings prior to a High reading or following Peak+3 are infertile.
3. **Fertile Window Computation**:
   - **Start**: If a High or Peak reading occurs in the cycle, the fertile window opens on the earliest High or Peak Cycle Day (`PP0-START`).
   - **End**: If a Peak reading occurs in the cycle, the fertile window ends on `last_peak_cycle_day + 3` (`PP0-END`).
   - **Provisional vs. Final**:
     - The start boundary is final upon observation of High or Peak.
     - The end boundary is provisional until three full days have elapsed past the last Peak.
     - If High has occurred without Peak, the window remains open (`end: null`, provisional).
     - If no High or Peak has occurred in the cycle, `fertileWindow` is `null`, and all recorded days are `dayStatus: "infertile"`.

---

### 3.2 Postpartum Return to Cycles (`postpartum_return_to_cycles`)

#### Cycle Initialization
- Anchored by the first day of full menstrual bleeding (Cycle Day 1).
- Each cycle tracks its `postpartumCycleNumber` (1 through 6+).

#### Fertile Window Computation
1. **Calendar Start Rule**:
   - Cycle 1: Cycle Day 10.
   - Cycle 2: Cycle Day 9.
   - Cycle 3: Cycle Day 8.
   - Cycle 4: Cycle Day 7.
   - Cycle 5 and onward: Cycle Day 6.
   - *Formula*: `calendar_start = Math.max(6, 11 - postpartumCycleNumber)`.
2. **First High Override**:
   - If the first monitor **High** reading occurs earlier than `calendar_start`, the window opens on that High reading day: `start = min(calendar_start, first_high_cycle_day)`.
   - Rule ID: `PP-RETURN-START-HIGH` (or `REG-START-3` if High overrides calendar start).
3. **End of Fertile Window**:
   - Closes three full days after the last Peak reading: `end = last_peak_cycle_day + 3` (`PP-RETURN-END-1` / `REG-END-1`).
   - Final when three full days have passed or the cycle has concluded; provisional otherwise.
   - If no Peak occurs, the window remains open (`end: null`).

---

### 3.3 Postpartum Without Breastfeeding

- Non-lactating postpartum status does not have a dedicated published algorithm in Marquette literature.
- Under ADR 0015:
  - It is classified as an **Eligibility warning** (`postpartum_without_breastfeeding`).
  - No synthetic family is computed.
  - The warning directs the couple to Clearblue manufacturer advice (wait 2 natural cycles) and Marquette instructor consultation, while allowing standard charting.

---

## 4. Boundary Rule Ledger

| Rule ID | Protocol Family | Description | Source Citation |
|---|---|---|---|
| `PP0-START` | `postpartum_cycle_zero_original` | Postpartum cycle zero begins fertility on the first High or Peak monitor reading. | Fehring, Barron & Schneider (2005) |
| `PP0-END` | `postpartum_cycle_zero_original` | End is three full days after the last Peak. | Fehring, Barron & Schneider (2005) |
| `PP-RETURN-START-1` | `postpartum_return_to_cycles` | Postpartum return-to-cycles begins fertility on Cycle Day 10 in cycle 1, shifting one day earlier each cycle to Cycle Day 6 from cycle 5 onward. | Bouchard, Fehring & Schneider (2013) |
| `PP-RETURN-START-HIGH` | `postpartum_return_to_cycles` | First High reading earlier than calendar start. | Bouchard, Fehring & Schneider (2013) |
| `PP-RETURN-END-1` | `postpartum_return_to_cycles` | End is three full days after the last Peak. | Bouchard, Fehring & Schneider (2013) |

---

## 5. Conclusion and Implementation Strategy

1. **Artificial Cycle Support in Projection**:
   - Enable `projectChart` to identify cycle starts from `cycleOverlays` where `startDate` is provided, even when no menstrual bleeding observation exists on that date.
   - Ensure `unassignedDays` only collects observations prior to the earliest cycle start (whether bleeding or overlay-anchored).
2. **Cycle Zero Projection**:
   - Implement `postpartum_cycle_zero_original` in `projection.ts`.
   - Days with High, Peak, or within Peak+3 evaluate to `dayStatus: "fertile"`.
   - Other days evaluate to `dayStatus: "infertile"`.
   - Fertile window opens on first High/Peak and closes on Peak+3.
3. **Return-to-Cycles Projection**:
   - Implement `postpartum_return_to_cycles` in `projection.ts`.
   - Compute `calendarStart = Math.max(6, 11 - (overlay?.postpartumCycleNumber ?? 1))`.
   - Check for earlier `firstHighCycleDay`.
   - End at `lastPeakCycleDay + 3`.
4. **Boundary Rules & Day Explanation**:
   - Register rule IDs in `boundary-rules.ts`.
   - Ensure `DayExplanation.vue` renders plain-language explanations with zero advice words.
5. **Golden Fixtures**:
   - Add comprehensive golden fixtures for:
     - Cycle zero during amenorrhea (including artificial cycle start without menses, Low days, High days, Peak days, and post-Peak infertility).
     - Return-to-cycles walking CD10 to CD6 across cycles 1 through 5+.
     - Return-to-cycles early High override.
