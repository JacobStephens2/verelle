# Marquette Method Business Logic Specification for Verelle

## Executive Summary

This document translates public Marquette Method and Clearblue Fertility Monitor source material into an implementation-focused specification for Verelle, an app that helps women/couples chart fertility using the Marquette Method of Natural Family Planning (NFP). The Marquette Model was developed and launched at the Marquette University Institute for Natural Family Planning in 1998, and it uses urine hormone biomarkers collected at home, optionally with cervical mucus and basal body temperature (BBT), to determine the fertile window ([Marquette University Institute for NFP](https://www.marquette.edu/nursing/institute-natural-family-planning/model.php), [Mu, Fehring & Bouchard 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8935430/)).

The implementation-critical rule for regular cycles is: during the first six charted cycles, the fertile window begins on cycle day 6; after six cycles, it begins on the earliest Peak day in the last six cycles minus six days or the first High monitor reading, whichever comes first; it ends three full 24-hour days after the last Peak monitor reading in the current cycle, with a post-six-cycle fallback using the latest Peak in the previous six cycles plus three full days if the current cycle has no Peak ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)).

The most important unresolved implementation issue is that not every special-circumstance protocol is publicly specified at the same level of detail as the regular-cycles and postpartum-transition protocols. Public sources provide exact postpartum artificial-cycle and return-to-cycles rules, but they do not publish a complete stepwise post-pill protocol, a complete CBFM perimenopause protocol, or a complete irregular-cycle protocol beyond “consult a professional Marquette Method teacher” limits and fallback rules ([Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac), [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf), [Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

Verelle should therefore implement the public rules as versioned algorithms, store the source/protocol version with every computed fertile-window boundary, and mark unsupported special circumstances as “requires instructor protocol” rather than silently applying regular-cycle logic outside its published eligibility constraints ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf), [Vitae Fertility regular-cycles preview](https://www.vitaefertility.com/wp-content/uploads/2018/12/boychuk-marquette-method-regular-cycles-manual-preview.pdf)).

## 1. Scope, Source Hierarchy, and Safety Posture

This specification is an engineering reference, not a substitute for professional Marquette Method instruction. The official Marquette site states that the Institute provides professional services and that couples meet individually with a nurse to discuss unique needs, and peer-reviewed Marquette effectiveness studies describe teaching by trained health professionals as part of the program ([Marquette University Institute for NFP](https://www.marquette.edu/nursing/institute-natural-family-planning/model.php), [Mu, Fehring & Bouchard 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8935430/)).

Verelle should prioritize source authority in this order: Marquette University Institute materials and peer-reviewed Marquette studies; Clearblue manufacturer instructions for device operation; peer-reviewed studies of adjunct tools such as LH sticks or BBT; and third-party instructor summaries only when clearly labeled as non-official or when used to document gaps rather than to create rules ([Marquette University Institute for NFP](https://www.marquette.edu/nursing/institute-natural-family-planning/model.php), [Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf), [Fehring, Schneider & Barron 2008](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1494&context=nursing_fac)).

The Clearblue Fertility Monitor is marketed to assist conception and is not intended by the manufacturer for contraception, while Marquette protocols customize the monitor to identify the fertile period for avoiding pregnancy ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf), [Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac)).

## 2. Overview and Terminology

### 2.1 What the Marquette Method Is

The Marquette Model of NFP is a fertility-awareness-based method that uses urine fertility biomarkers collected at home and can be used with cervical mucus, BBT, and an algorithm to determine the fertile window ([Marquette University Institute for NFP](https://www.marquette.edu/nursing/institute-natural-family-planning/model.php)).

The Marquette Method incorporates an electronic hormonal fertility monitor (EHFM), traditionally the Clearblue/ClearPlan Easy Fertility Monitor, with optional cervical-vaginal mucus observations and post-ovulatory BBT shift observations ([Fehring, Schneider & Barron 2008](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1494&context=nursing_fac)).

The Marquette Method allows users to use one or more biological markers, including cervical-vaginal mucus, BBT, threshold levels of urinary estrone-3-glucuronide (E3G), and threshold levels of urinary luteinizing hormone (LH) detected by the monitor or other urine assay self-test kits ([Fehring, Schneider & Barron 2008](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1494&context=nursing_fac)).

### 2.2 Core Terms and App Semantics

| Term | Implementation definition | Source basis |
|---|---|---|
| Cycle Day 1 / CD1 / DoC 1 | First day of menses/period/full menstrual flow for charting; the Clearblue monitor treats the morning the `m` button is set as day 1. | [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf), [Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf) |
| Low fertility | Clearblue one-bar result; hormonally, no significant E3G rise has been detected. | [Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf), [Case Reports of the Marquette Method](https://pmc.ncbi.nlm.nih.gov/articles/PMC6081769/) |
| High fertility | Clearblue two-bar result; hormonally, the monitor has detected an estrogen/E3G rise from baseline. | [Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf), [Mu, Fehring & Bouchard 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8935430/) |
| Peak fertility | Clearblue three-bar/egg-symbol result; hormonally, the monitor has detected the LH surge. | [Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf), [Fehring, Schneider & Barron 2008](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1494&context=nursing_fac) |
| Monitor Peak Day | For Marquette endpoint calculations, use the last monitor Peak reading in the current cycle because the monitor displays Peak on the LH-surge day and the following day. | [Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf), [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf) |
| Mucus Peak Day | Last day of peak-quality cervical mucus, known retrospectively after mucus quality changes away from peak. | [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf) |
| EDO | Estimated day of ovulation; one Marquette validation source defines EDO as the menstrual-cycle day with the last Peak reading for either monitor or mucus. | [Current Medical Research / Marquette validation review](https://pmc.ncbi.nlm.nih.gov/articles/PMC4313435/) |
| Fertile window | App-computed interval during which intercourse/genital contact/withdrawal is to be avoided for avoiding pregnancy under Marquette instructions; the regular-cycles manual says to avoid from first day of fertility through last day of fertility. | [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf) |
| Luteal phase | In one Marquette validation article, luteal phase length is calculated from the day after the last monitor or mucus Peak through the day before next menses. | [Current Medical Research / Marquette validation review](https://pmc.ncbi.nlm.nih.gov/articles/PMC4313435/) |
| Correct use pregnancy | Pregnancy from intercourse on a day identified as infertile by the method. | [Schneider, Fehring & Bouchard 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10265386/) |
| Typical use pregnancy | Pregnancy-rate analyses that include incorrect/inconsistent use as well as correct use. | [Mu, Fehring & Bouchard 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8935430/) |

## 3. Clearblue Fertility Monitor Operation

### 3.1 Device Capabilities and Limitations

The Clearblue Fertility Monitor measures urine metabolites of estrogen and LH and displays Low, High, or Peak fertility status ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf), [Fehring, Schneider & Barron 2008](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1494&context=nursing_fac)).

The Clearblue booklet says the monitor is suitable for women whose natural cycles normally last 21 to 42 days, and the Marquette regular-cycles manual limits its regular-cycle instructions to women aged 20–42 with cycles between 22 and 42 days ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf), [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)).

The Clearblue booklet warns that recently pregnant users, recently breastfeeding users, and users who recently stopped hormonal contraception may wish to wait until they have at least two natural menstrual cycles in a row lasting 21–42 days before using the monitor ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

The Clearblue booklet warns that menopausal symptoms, PCOS, impaired liver or kidney function, pregnancy or recent pregnancy, tetracycline antibiotics, hormonal contraception, hormone replacement therapy, fertility treatments containing hCG or LH, and other cycle-affecting treatments may produce misleading results ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

### 3.2 `m` Button and Testing Window

The Clearblue `m` button is used at the start of each cycle to tell the monitor that the period has started and to establish a six-hour daily testing window ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

The Clearblue testing window runs from three hours before the `m`-button setting time to three hours after the `m`-button setting time, so an app should store both the button-press timestamp and the derived testing-window start/end times ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

The Clearblue booklet says the `m` button can be set from day 1 to day 5 of the cycle, and it says the user must set the `m` button the morning after the period begins for the monitor to understand that as day 1 ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

The Marquette regular-cycles manual describes pressing the monitor button the morning of the first day of the cycle, defined as the first day of menses or period ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)).

### 3.3 Test Requests, Urine Rules, and Maximum Test Days

The Clearblue booklet states that in cycle 1 the first test is requested on day 6, while in subsequent cycles the first test day varies between day 6 and day 9 according to what the monitor has learned about the user’s cycle ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

The Clearblue booklet states that the monitor requests tests every day for a total of 10 or 20 days depending on cycle length and when Peak fertility is detected ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

The Marquette regular-cycles manual says the monitor usually asks for 10 test strips over 10 days and occasionally requires 20 readings ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)).

The Clearblue booklet says tests must use first urine of the day inside the testing window, and it explains that first urine after sleeping has the highest hormone concentration ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

The Clearblue booklet instructs users to hold the sampling end in the urine stream for three seconds or dip it in collected urine for fifteen seconds, and it says the test stick should be inserted within fifteen minutes of wetting it ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

### 3.4 Reading Meanings and Hormonology

| Reading | UI representation | Hormonal interpretation | App rule impact |
|---|---|---|---|
| Low | One bar | No significant estrogen/E3G rise has been detected. | Not fertile by monitor-only reading unless calendar/history, mucus, postpartum, or other rules mark the day fertile. ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf), [Case Reports of the Marquette Method](https://pmc.ncbi.nlm.nih.gov/articles/PMC6081769/)) |
| High | Two bars | Estrogen/E3G has risen from baseline. | Fertile for avoiding pregnancy in monitor protocols. ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf), [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)) |
| Peak | Three bars plus Peak/egg symbol | LH surge has been detected, and ovulation normally occurs about 24–36 hours after the LH surge. | Fertile for avoiding pregnancy and anchor for end-of-fertility count. ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf), [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)) |

The Clearblue booklet says Peak fertility is displayed on the day of the LH surge and the following day, and then one High day may be shown because the egg may still be fertilized after that time ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

The Marquette endpoint rule counts three full days after the last Peak day, so Verelle must distinguish `first_peak_day`, `last_peak_day`, and `post_peak_count_days_completed` ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)).

### 3.5 Missed Tests, No Peak, and Device Errors

The Clearblue booklet states that if a test is missed, the monitor uses information already collected to calculate fertility status, but a test missed close to ovulation can miss the chance to identify Peak fertility ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

The Clearblue booklet states that there may be cycles without Peak fertility because a test was missed, a test was performed incorrectly, or ovulation did not occur ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

The Clearblue booklet states that if Peak fertility is not detected, the monitor may show High fertility for an extended period, as long as 19 days ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

The Marquette regular-cycles manual says the monitor misses the LH surge in about 8% of cycles or about 1 out of 10 cycles, and it says the monitor may ask for 20 test strips with 20 days of High readings in that scenario ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)).

## 4. Protocol Algorithms

### 4.1 Protocol Versioning Model

Verelle should store a `protocol_family` and `protocol_version` because public sources include at least: regular-cycles monitor protocol, cervical-mucus-only protocol, original postpartum artificial-cycle protocol, revised postpartum breastfeeding protocol, postpartum return-to-cycles protocol, low-cost LH-stick adjunct protocols, and proposed quantitative-hormone perimenopause rules ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf), [Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac), [Schneider, Fehring & Bouchard 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10265386/), [Perimenopause quantitative-monitor case reports](https://pmc.ncbi.nlm.nih.gov/articles/PMC10608103/)).

Verelle should compute a day’s status from the most conservative applicable rule when multiple signs are enabled because Marquette sources use phrases such as “whichever comes first” for beginning fertility and “whichever came last” for ending fertility when monitor and mucus are combined ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf), [USCCB Marquette Model history/effectiveness paper](https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf)).

### 4.2 Regular Cycles Protocol: Avoiding Pregnancy, Monitor-Based

#### Eligibility and inputs

The public Marquette regular-cycles instructions are for women aged 20–42 with cycles between 22 and 42 days, and the manual says that two or more cycles outside that range or cycle variation by more than 10 days requires professional Marquette teacher advice ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)).

The monitor-only regular protocol requires current-cycle monitor readings and, after six cycles, historical Peak data from the last six completed cycles ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)).

#### Start of fertile window

| Cycle history | Fertility begins | Implementation detail | Source |
|---|---|---|---|
| First 6 cycles on method | CD6 | All days CD6 through the computed end are fertile unless an instructor-specific override exists. | [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf) |
| After 6 completed cycles | Earlier of `(earliest Peak day among last 6 cycles - 6)` and current cycle’s first High reading | If first High occurs before the historical calendar start, fertile begins on first High. | [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf) |

A multisite Marquette effectiveness article states the post-six-cycle beginning of fertility is based on the earliest High reading of the last six cycles, while the regular-cycles manual and USCCB historical paper state an earliest-Peak-minus-six formula; Verelle should treat this as a source conflict and make the exact configured rule visible in protocol metadata ([Mu, Fehring & Bouchard 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8935430/), [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf), [USCCB Marquette Model history/effectiveness paper](https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf)).

#### End of fertile window

| Cycle history | Fertility ends | Implementation detail | Source |
|---|---|---|---|
| First 6 cycles on method | Three full 24-hour days after the last Peak day on the monitor | If the last Peak is CD15, the first non-fertile time begins after CD18 is complete; app UI should label CD16, CD17, and CD18 as post-Peak count days. | [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf) |
| After 6 completed cycles with current Peak | Earlier of `(latest Peak day among last 6 cycles + 3 full days)` and `(current cycle last Peak day + 3 full days)` | This provides a fallback if the monitor misses the current cycle’s Peak. | [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf) |
| After 6 completed cycles with no current Peak | Latest Peak day among last 6 cycles plus three full days | Case reports describe this as the missed-LH-surge algorithm. | [Case Reports of the Marquette Method](https://pmc.ncbi.nlm.nih.gov/articles/PMC6081769/), [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf) |
| First 6 cycles with no current Peak | No alternative end formula is public in the regular manual | The manual says there is no formula for an alternative end during the first six cycles; case reports say the user had to abstain until the next period when no Peak occurred. | [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf), [Case Reports of the Marquette Method](https://pmc.ncbi.nlm.nih.gov/articles/PMC6081769/) |

#### Avoiding behavior rule

The regular-cycles manual instructs couples avoiding pregnancy to avoid intercourse, genital contact, and withdrawal during the fertile window, and it also says monitor users should avoid intercourse on all High and Peak days ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)).

#### Pseudocode

```pseudo
# Regular monitor protocol, avoiding pregnancy.
# Source: Marquette regular-cycles manual and Marquette case reports.

function compute_regular_monitor_window(cycle, prior_cycles):
    method_cycle_number = count_completed_method_cycles_before(cycle) + 1

    if method_cycle_number <= 6:
        fertile_start_cd = 6
    else:
        earliest_peak_last6 = min(last_peak_cd(c) for c in last6(prior_cycles) if c.has_monitor_peak)
        historical_start = earliest_peak_last6 - 6
        first_high = first_cd(cycle.monitor_reading == HIGH)
        fertile_start_cd = min_defined(historical_start, first_high)

    current_last_peak = last_cd(cycle.monitor_reading == PEAK)

    if current_last_peak is defined:
        current_end = current_last_peak + 3
    else:
        current_end = undefined

    if method_cycle_number <= 6:
        if current_end is undefined:
            return Window(start=fertile_start_cd, end=NEXT_MENSES, confidence='no_public_alternative_end')
        return Window(start=fertile_start_cd, end=current_end)

    latest_peak_last6 = max(last_peak_cd(c) for c in last6(prior_cycles) if c.has_monitor_peak)
    historical_end = latest_peak_last6 + 3
    fertile_end_cd = min_defined(current_end, historical_end)
    return Window(start=fertile_start_cd, end=fertile_end_cd)
```

### 4.3 Regular Cycles Protocol: Achieving Pregnancy

The Clearblue booklet recommends intercourse two or more times during the fertile period and specifically during High and Peak fertility for the greatest chance of conception ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

The Marquette regular-cycles manual says that couples trying to achieve pregnancy should have intercourse on the High and Peak days of the monitor ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)).

The USCCB Marquette history/effectiveness paper reports an achieving-pregnancy prospective study with an overall pregnancy rate of 78 per 100 women over 12 menstrual cycles, with rates of 83 per 100 for the monitor group, 72 per 100 for the mucus group, and 75 per 100 for the combined mucus-and-monitor group ([USCCB Marquette Model history/effectiveness paper](https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf)).

```pseudo
# Achieving pregnancy targeting.
function compute_ttc_priority(day):
    if day.monitor == PEAK: return 'highest_priority_intercourse_day'
    if day.monitor == HIGH: return 'high_priority_intercourse_day'
    if day.lh_strip_positive: return 'highest_priority_intercourse_day'
    if day.mucus in [PEAK_TYPE, HIGH_TYPE]: return 'high_priority_intercourse_day'
    return 'not_targeted_by_marquette_monitor_protocol'
```

### 4.4 Cervical Mucus Protocol and Dual-Check Rules

The Marquette regular-cycles manual describes beginning cervical mucus as thick and sticky, high mucus as cloudy/thinner/slightly stretchy, Peak mucus as clear/stretchy/watery/slippery like egg white, and low-fertility mucus as scant/thick/cloudy or dry ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)).

The Marquette regular-cycles manual says the mucus Peak day is known retrospectively and that fertility by mucus ends three full days after the last day of Peak-type mucus; its mucus-only instruction also states fertility ends on the evening of the fourth day past the Peak in cervical mucus ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)).

The USCCB Marquette paper states that in an earlier Marquette I protocol, the beginning of the fertile phase was the change from mucus baseline or a High monitor reading, whichever came first, and the end was three full days past the Peak day of cervical mucus or the last Peak monitor reading, whichever came last ([USCCB Marquette Model history/effectiveness paper](https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf)).

| Configuration | Start rule | End rule | Source |
|---|---|---|---|
| Mucus-only, first 6 cycles | CD6 | Evening of fourth day past cervical mucus Peak / three full days after last Peak-type mucus | [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf) |
| Mucus-only, after 6 cycles | Earliest Peak mucus day in last six cycles minus six days or first mucus seen/felt, whichever comes first | Evening of fourth day past cervical mucus Peak / three full days after last Peak-type mucus | [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf) |
| Monitor + mucus dual-check | Change from baseline mucus or High monitor reading, whichever comes first | Three full days after later of cervical mucus Peak or last monitor Peak | [USCCB Marquette Model history/effectiveness paper](https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf) |

```pseudo
function compute_dual_monitor_mucus_window(cycle, prior_cycles):
    monitor_window = compute_regular_monitor_window(cycle, prior_cycles)
    mucus_start = compute_mucus_start(cycle, prior_cycles)
    mucus_end = compute_mucus_end(cycle)
    start = min_defined(monitor_window.start, mucus_start)
    end = max_defined(monitor_window.end, mucus_end)
    return Window(start=start, end=end, rationale='conservative_union_of_monitor_and_mucus')
```

### 4.5 Postpartum Breastfeeding Protocol: Cycle Zero / Lactational Amenorrhea

The original Marquette breastfeeding-not-in-cycles protocol was designed because the Clearblue monitor is designed for women who are ovulating and in cycles, so researchers used 20-day artificial cycles during postpartum amenorrhea ([Fehring, Barron & Schneider 2005](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1004&context=nursing_fac)).

The original artificial-cycle rules are: trigger a cycle by pressing the `M` button, fast-forward the monitor to day 5, let the monitor ask for tests for the next 20 days, test first-morning urine every other day, test every day after a High reading, retrigger and fast-forward every 20 days, and continue until a Peak reading is detected and menses resumes ([Fehring, Barron & Schneider 2005](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1004&context=nursing_fac), [Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac)).

The original avoiding-pregnancy rule for postpartum artificial cycles is to avoid intercourse on High and Peak days and for three full days after the last Peak day ([Fehring, Barron & Schneider 2005](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1004&context=nursing_fac), [Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac)).

The 2023 revised breastfeeding-protocol study states that the revised protocol increased the number of CBFM testing days, allowed an optional second evening LH test, and instructed women to test daily with the CBFM for ten days during cycle zero, but the public article text does not publish a complete day-by-day implementation table for the revised cycle-zero protocol ([Schneider, Fehring & Bouchard 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10265386/)).

```pseudo
# Original postpartum artificial-cycle protocol during lactational amenorrhea.
function postpartum_cycle_zero_original(day):
    if artificial_cycle_day == 1:
        require_user_action('press_M_button_and_fast_forward_to_day_5')
    if artificial_cycle_day in 6..26:
        if has_seen_high_in_artificial_cycle:
            request_test_daily()
        else:
            request_test_every_other_day_or_every_third_day_if_teacher_allows()
    if monitor == HIGH or monitor == PEAK:
        mark_fertile(day)
    if last_peak exists:
        mark_fertile_until(last_peak + 3_full_days)
    if artificial_cycle_day > 26 and no_peak:
        start_new_artificial_cycle()
```

### 4.6 Postpartum Breastfeeding Return-to-Cycles Protocol

The 2013 postpartum-transition protocol says that when menses returns, the user should reset the monitor and erase memory for all six postpartum cycles, mark day 1 as the first day of menses, and begin testing when the monitor asks for a test on day 6 ([Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac)).

The 2013 protocol says fertility begins on day 10 of the first cycle after menses returns, day 9 in the second cycle, day 8 in the third cycle, day 7 in the fourth cycle, and day 6 in the fifth cycle onward, unless the monitor records a High reading before those days, in which case fertility starts on the first High reading ([Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac)).

The 2013 protocol says that beginning on day 6 of the first menstrual cycle postpartum, women may optionally do a second evening LH test with a separate LH kit to reduce missed LH-surge risk ([Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac)).

The 2023 revised breastfeeding-protocol article states the same return-to-cycles pattern at a higher level: start fertile time in cycle one on day ten and shift the start earlier by one day in each subsequent cycle ([Schneider, Fehring & Bouchard 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10265386/)).

| Postpartum cycle after first menses | Calendar fertile-start day | Override | End rule | Source |
|---|---:|---|---|---|
| Cycle 1 | CD10 | First High if earlier | High/Peak days plus 3 full days after last Peak | [Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac) |
| Cycle 2 | CD9 | First High if earlier | High/Peak days plus 3 full days after last Peak | [Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac) |
| Cycle 3 | CD8 | First High if earlier | High/Peak days plus 3 full days after last Peak | [Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac) |
| Cycle 4 | CD7 | First High if earlier | High/Peak days plus 3 full days after last Peak | [Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac) |
| Cycle 5 onward | CD6 | First High if earlier | High/Peak days plus 3 full days after last Peak | [Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac) |

```pseudo
function postpartum_return_to_cycles_window(cycle, postpartum_cycle_number):
    calendar_start = max(6, 11 - postpartum_cycle_number)  # cycle1=>10, cycle2=>9, cycle3=>8, cycle4=>7, cycle5+=>6
    first_high = first_cd(cycle.monitor_reading == HIGH)
    start = min_defined(calendar_start, first_high)
    last_peak = last_cd(cycle.monitor_reading == PEAK or cycle.lh_strip_positive)
    if last_peak is undefined:
        end = NEXT_MENSES_OR_INSTRUCTOR_REVIEW
    else:
        end = last_peak + 3
    return Window(start, end)
```

### 4.7 Postpartum Non-Breastfeeding Protocol

The 2013 Marquette postpartum-transition study included postpartum lactating and nonlactating women, with 183 breastfeeding and 15 not breastfeeding participants among postpartum users of the online charting system and postpartum protocol ([Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac)).

The 2013 article states that in nonlactating women, ovulation can occur as early as 25 days postpartum, usually occurs between 45 and 94 days postpartum, and ovulation leading to sustained pregnancy usually occurs at 42 days or later ([Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac)).

Public sources found for this report do not provide a distinct stepwise “postpartum non-breastfeeding” CBFM algorithm separate from the postpartum-transition protocol and the regular-cycles protocol after cycles resume ([Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac), [Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

Verelle should therefore model postpartum non-breastfeeding as a special circumstance requiring instructor confirmation, should not automatically apply regular-cycle rules before the first postpartum menses, and should expose the Clearblue manufacturer warning that recently pregnant users may wish to wait for two natural 21–42-day cycles before using the monitor ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf), [Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac)).

### 4.8 Perimenopause Protocol

The Marquette regular-cycles manual’s public regular-cycle rules are not scoped for perimenopause because they are limited to women aged 20–42 and cycles of 22–42 days ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)).

The USCCB Marquette paper reports a perimenopause cohort of 160 women aged 40–55, with a typical-use pregnancy rate of 6 per 100 women over 12 months, and subgroup typical-use rates of 3 per 100 for monitor alone, 4 per 100 for mucus alone, and 6 per 100 for monitor plus mucus ([USCCB Marquette Model history/effectiveness paper](https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf)).

A Marquette-related 2014 review reports one correct-use unintended pregnancy among 79 analyzable participants in a perimenopause study, corresponding to 1.5 pregnancies per 100 users over 12 months, and five typical-use unintended pregnancies, with subgroup rates of 3, 4, and 6 per 100 over 12 months for EHFM, mucus-only, and both-markers groups ([Current Medical Research / Marquette perimenopause review](https://pmc.ncbi.nlm.nih.gov/articles/PMC4313435/)).

Public sources found for this report do not provide the complete CBFM perimenopause day-by-day protocol, so Verelle should not infer a perimenopause CBFM protocol solely from regular-cycle rules ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf), [Current Medical Research / Marquette perimenopause review](https://pmc.ncbi.nlm.nih.gov/articles/PMC4313435/)).

For quantitative-hormone monitors rather than CBFM, a perimenopause case-report article proposes that the beginning of the fertile window occurs when E3G is 100 ng/mL either that day or the day before, and it cites LH levels of 11 mIU/mL as proposed to signify ovulation; this source is case-report/proposed-protocol material and not a complete validated CBFM implementation protocol ([Perimenopause quantitative-monitor case reports](https://pmc.ncbi.nlm.nih.gov/articles/PMC10608103/)).

A non-peer-reviewed perimenopause protocol PDF for Mira explicitly disclaims that it is based on provider experiences and feedback rather than scientific research or studies, so Verelle should not treat that PDF as an official Marquette CBFM rule set ([Perimenopause Protocol PDF](https://143440709.fs1.hubspotusercontent-eu1.net/hubfs/143440709/Onboarding%20Documents/Protocols/Perimenopause%20Protocol.pdf)).

### 4.9 Post-Pill / Coming Off Hormonal Contraception Protocol

The Clearblue manufacturer states that users who recently stopped hormonal contraception may wish to wait until they have at least two natural menstrual cycles in a row, each lasting 21–42 days, before using the monitor ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

The Vitae regular-cycles preview states that its regular-cycles manual should not be used by women coming off hormonal birth control and that those users should work directly with a Marquette Method instructor to determine additional instructions ([Vitae Fertility regular-cycles preview](https://www.vitaefertility.com/wp-content/uploads/2018/12/boychuk-marquette-method-regular-cycles-manual-preview.pdf)).

A FACTS About Fertility article about “After the Pill” describes a user story and says Marquette has protocols for a monitor-missed-ovulation situation, but it does not publish a post-pill day-by-day algorithm or abstinence rule ([FACTS About Fertility post-pill article](https://www.factsaboutfertility.org/after-the-pill-experience-with-the-marquette-model/)).

Verelle should implement post-pill status as a special-circumstance flag that blocks automatic regular-protocol use unless the user has completed the configured waiting/qualification criteria or an instructor has selected a specific protocol version ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf), [Vitae Fertility regular-cycles preview](https://www.vitaefertility.com/wp-content/uploads/2018/12/boychuk-marquette-method-regular-cycles-manual-preview.pdf)).

### 4.10 Long / Irregular Cycles Protocol and Monitor Test-Window Exhaustion

The Clearblue booklet states that women with irregular or long cycles over 35 days may need 20 test sticks in each cycle to detect their most fertile time, and it states that the monitor can detect Peak fertility in cycles of 21–42 days ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

The Marquette regular-cycles manual says that if there are two or more cycles outside 22–42 days or menstrual cycles vary by more than 10 days, the user should see a professional Marquette teacher for advice ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)).

Case reports state that the CBFM is normally used by women with regular cycles between 21 and 42 days and that cycles with no Peak in the first six cycles required abstinence until the next period because the missed-LH-surge algorithm could not yet be used ([Case Reports of the Marquette Method](https://pmc.ncbi.nlm.nih.gov/articles/PMC6081769/)).

For implementation, if the monitor runs out of 20 test days and no Peak exists in the first six method cycles, Verelle should mark the fertile window as open through next menses or instructor review rather than inventing an end date ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf), [Case Reports of the Marquette Method](https://pmc.ncbi.nlm.nih.gov/articles/PMC6081769/)).

For implementation after six completed cycles, if the monitor runs out of test days and no Peak exists, Verelle may compute the end from the latest Peak day in the last six cycles plus three full days if the protocol is regular-cycle/missed-LH-surge eligible ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf), [Case Reports of the Marquette Method](https://pmc.ncbi.nlm.nih.gov/articles/PMC6081769/)).

## 5. Peak Day Determination and Discrepancies

### 5.1 Monitor Peak

Clearblue defines Peak fertility as the LH surge, which triggers ovulation approximately 24–36 hours later, and the device displays Peak on the day of the LH surge and the following day ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

Marquette sources use the last Peak reading for endpoint calculations, so Verelle should compute `monitor_peak_first_cd`, `monitor_peak_last_cd`, and `monitor_edo_cd = monitor_peak_last_cd` if following the validation-study EDO convention ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf), [Current Medical Research / Marquette validation review](https://pmc.ncbi.nlm.nih.gov/articles/PMC4313435/)).

### 5.2 Mucus Peak

The Marquette manual describes Peak mucus as clear, stretchy, watery, and slippery like egg white, and it says the Peak mucus day is identified retrospectively ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)).

Verelle should only finalize `mucus_peak_cd` after a subsequent non-Peak mucus day makes the last Peak-type mucus day knowable, because the manual says the user only knows the Peak day retrospectively ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)).

### 5.3 Reconciling Monitor and Mucus

When monitor and mucus differ, public Marquette sources use conservative cross-checking: start fertility at the earlier of mucus change from baseline or monitor High, and end fertility three full days after whichever Peak marker occurs last ([USCCB Marquette Model history/effectiveness paper](https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf)).

Verelle should store discrepancy flags such as `mucus_peak_after_monitor_peak`, `monitor_peak_after_mucus_peak`, `mucus_fertile_before_monitor_high`, and `no_monitor_peak_but_mucus_peak`, because these directly affect fertile-window boundaries under dual-check logic ([USCCB Marquette Model history/effectiveness paper](https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf)).

## 6. LH Test Strip Integration

A Marquette study of low-cost LH sticks compared generic Wondfo ovulation sticks with the electronic hormonal fertility monitor and found the monitor sensitivity for LH surge detection was 20 mIU/mL while Wondfo LH sticks were 25 mIU/mL ([Fehring, Schneider & Bouchard 2018](https://pubmed.ncbi.nlm.nih.gov/29489529/)).

The low-cost LH-stick study reported that Wondfo sticks detected an LH surge in 203 of 219 cycles, while the electronic monitor detected an LH surge in 182 of 219 cycles, and agreement on the day of the LH surge was 97.7% ([Fehring, Schneider & Bouchard 2018](https://pubmed.ncbi.nlm.nih.gov/29489529/)).

The low-cost LH-stick study concluded that Wondfo LH sticks were sufficiently sensitive to use in place of the electronic fertility monitor for determining Peak fertility with the Marquette Fertility algorithm, while noting that larger research was needed ([Fehring, Schneider & Bouchard 2018](https://pubmed.ncbi.nlm.nih.gov/29489529/)).

Easy@Home instructions define a positive LH result as the test line being as dark as or darker than the control line, define a negative result as the test line being lighter than the control line or absent, and define an invalid result as no control line ([Easy@Home ovulation test manual](https://manuals.plus/asin/B08XXJDMPX.pdf)).

Premom explains that Easy@Home qualitative strips compare test-line intensity to control-line intensity, that a T/C ratio of 1.0 or higher means the test line is as dark as or darker than the control line, and that individual LH peaks can vary by woman and cycle ([Premom T/C ratio guide](https://premom.com/what-is-a-t-c-ratio/)).

Premom states that a standard LH surge cutoff is 25–45 mIU/mL and corresponds to a T/C ratio of 1.0 or above, while also noting that some users may not reach 1.0 and that double-peak or plateau patterns can occur ([Premom ovulation-test guide](https://premom.com/how-to-use-ovulation-tests/)).

| LH input type | Positive threshold to store | Protocol interpretation | Caveat |
|---|---|---|---|
| Qualitative strip visual | Test line as dark as or darker than control line | Treat as LH surge / Peak proxy if selected in protocol | User interpretation can vary. ([Easy@Home ovulation test manual](https://manuals.plus/asin/B08XXJDMPX.pdf)) |
| Premom qualitative T/C | T/C ratio >= 1.0 | Treat as positive LH under default threshold | Some users’ personal peaks may be below 1.0. ([Premom T/C ratio guide](https://premom.com/what-is-a-t-c-ratio/), [Premom ovulation-test guide](https://premom.com/how-to-use-ovulation-tests/)) |
| Wondfo-style Marquette adjunct | Strip sensitivity about 25 mIU/mL | Can be used as Peak fertility marker with Marquette algorithm in the study context | Larger study recommended. ([Fehring, Schneider & Bouchard 2018](https://pubmed.ncbi.nlm.nih.gov/29489529/)) |
| Postpartum optional evening LH | Separate LH kit from day 6 of the first menstrual cycle postpartum | Reduces chance of missed LH surge | Optional protocol addition. ([Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac)) |

```pseudo
function interpret_lh_strip(reading):
    if reading.invalid_no_control_line:
        return INVALID
    if reading.qualitative_line_comparison == 'test_as_dark_or_darker_than_control':
        return POSITIVE_LH_SURGE
    if reading.tc_ratio is not null and reading.tc_ratio >= user_protocol.lh_tc_positive_threshold_default_1_0:
        return POSITIVE_LH_SURGE
    return NEGATIVE_OR_NONPEAK
```

## 7. BBT and Ovulation Confirmation

The Clearblue booklet states that BBT predicts ovulation only after it happens, while the monitor predicts ovulation before it happens by detecting hormone changes ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

Mayo Clinic states that ovulation has likely occurred when a slightly higher basal temperature remains steady for three days or more, and it says the rise is typically less than 0.5°F or 0.3°C ([Mayo Clinic BBT guidance](https://www.mayoclinic.org/tests-procedures/basal-body-temperature/about/pac-20393026)).

Mayo Clinic states that for avoiding pregnancy with BBT, unprotected sex is off-limits from the start of the menstrual period until three to four days after BBT rises, but BBT alone may not provide enough warning time to prevent pregnancy ([Mayo Clinic BBT guidance](https://www.mayoclinic.org/tests-procedures/basal-body-temperature/about/pac-20393026)).

A temperature-charting source describes a Celsius “three-over-six” rule in which the first high temperature is at least 0.1°C above the highest of the previous six low temperatures, with a coverline drawn 0.05°C above the highest of the prior six lows, and the rise sustained for at least three days ([Taking Charge of Your Fertility Celsius guidelines](https://www.tcoyf.com/celsius-guidelines/)).

Verelle should treat BBT as a confirmation signal rather than a Marquette primary start-of-fertile-window signal unless an instructor-selected protocol uses BBT differently, because Marquette sources describe BBT as optional and the manufacturer notes that BBT confirms after ovulation rather than predicting fertile days ([Fehring, Schneider & Barron 2008](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1494&context=nursing_fac), [Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

## 8. Cycle Data Model Implications

### 8.1 Core Entities

| Entity | Required fields | Rationale |
|---|---|---|
| `UserProfile` | DOB/age band, postpartum status, breastfeeding status, hormonal-contraception stop date, perimenopause flag, health-condition flags, instructor override flags | Protocol eligibility depends on age, postpartum/breastfeeding state, recent hormonal treatment, and cycle regularity. ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf), [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)) |
| `Cycle` | cycle_id, start_date, CD1 basis, protocol_family, protocol_version, method_cycle_number, postpartum_cycle_number, intention, cycle_length, completed flag | Protocol rules differ by first six cycles, postpartum cycle number, and pregnancy intention. ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf), [Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac)) |
| `CycleDay` | cycle_id, date, cycle_day, bleeding score, day status, computed fertility status, confidence, reasons | Day-level status is needed because monitor readings and algorithm days produce fertile/infertile classifications. ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)) |
| `MonitorSetup` | m_button_time, testing_window_start, testing_window_end, monitor_model, memory_reset flag, artificial_cycle_id | The `m` button sets the testing window and postpartum protocols require resets/retriggering/artificial cycles. ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf), [Fehring, Barron & Schneider 2005](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1004&context=nursing_fac)) |
| `MonitorReading` | cycle_day, reading enum Low/High/Peak/error/missed, test_requested, test_time, first_morning_urine flag, invalid/error code | Test timing, missed tests, High, and Peak affect fertility calculations. ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)) |
| `LHStripReading` | cycle_day, time, brand, qualitative result, T/C ratio, numeric LH if available, valid flag | LH strips may serve as Peak proxies, and postpartum protocols optionally use evening LH testing. ([Fehring, Schneider & Bouchard 2018](https://pubmed.ncbi.nlm.nih.gov/29489529/), [Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac)) |
| `MucusObservation` | cycle_day, sensation, appearance, category Low/High/Peak, baseline-change flag, confidence | Mucus can determine start and end of fertility when used alone or as a cross-check. ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf), [USCCB Marquette Model history/effectiveness paper](https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf)) |
| `BBTReading` | cycle_day, temperature, unit, time, sleep quality, disturbed flag, thermal-shift status | BBT can confirm ovulation and requires timing/quality metadata. ([Mayo Clinic BBT guidance](https://www.mayoclinic.org/tests-procedures/basal-body-temperature/about/pac-20393026), [Taking Charge of Your Fertility Celsius guidelines](https://www.tcoyf.com/celsius-guidelines/)) |
| `IntercourseEvent` | date/time, cycle_day, genital contact/intercourse/withdrawal, protected flag, intention relevance | Marquette avoiding instructions include intercourse, genital contact, and withdrawal during fertile days. ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)) |
| `FertileWindow` | start_cd, end_cd, start_source, end_source, protocol_version, provisional/final flag, reason codes | Windows can change as Peak/mucus is identified retrospectively and should be auditable. ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf), [USCCB Marquette Model history/effectiveness paper](https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf)) |

### 8.2 Derived Fields

Verelle should compute `first_high_cd`, `first_peak_cd`, `last_peak_cd`, `earliest_peak_last6_cd`, `latest_peak_last6_cd`, `mucus_peak_cd`, `estimated_day_of_ovulation_cd`, `luteal_phase_length`, `post_peak_count`, `no_peak_flag`, `missed_test_near_expected_peak_flag`, `long_cycle_flag`, and `regular_protocol_eligibility_flag` because each field maps to a public Marquette or Clearblue rule ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf), [Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf), [Current Medical Research / Marquette validation review](https://pmc.ncbi.nlm.nih.gov/articles/PMC4313435/)).

Verelle should store `source_rule_ids` for every computed boundary because public Marquette sources differ on at least one post-six-cycle start-rule phrasing, and explicit rule IDs let the app avoid hidden algorithm changes ([Mu, Fehring & Bouchard 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8935430/), [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)).

## 9. Edge Cases and Validation Rules

| Edge case | Detection | App behavior | Source basis |
|---|---|---|---|
| Anovulatory cycle / no Peak | No monitor Peak, no LH-positive strip, possible no BBT shift, possible no mucus Peak | First six regular cycles: keep fertile through next menses/instructor review; after six regular cycles: use missed-LH fallback if eligible. | [Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf), [Case Reports of the Marquette Method](https://pmc.ncbi.nlm.nih.gov/articles/PMC6081769/) |
| Double Peak / multiple LH surges | Multiple LH-positive strips or multiple Peak-like events | Use last valid Peak/LH event for end-of-fertile-window count unless instructor protocol says otherwise. | Marquette endpoint rules use “last Peak” for ending fertility. ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)) |
| Monitor High persists without Peak | High readings continue up to 19 days or 20 tests | Do not infer infertility from prolonged High; apply no-Peak logic. | [Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf), [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf) |
| Long/irregular cycle | Cycle >42 days, more than one out-of-range cycle, or variation >10 days | Mark regular protocol ineligible and require instructor/special protocol. | [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf), [Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf) |
| Very short cycle | Cycle below regular protocol range or Peak before expected testing window | Mark regular protocol ineligible if below 22 days; manufacturer says very short cycle after longer cycles can produce unexpected Peak-display patterns. | [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf), [Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf) |
| First cycle on method | `method_cycle_number == 1` | Start fertility on CD6 and do not use history-based start/end rules. | [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf) |
| Missed test near ovulation | Missed monitor test during requested test interval, especially near expected Peak | Continue testing as requested; warn that Peak may be missed; keep conservative fertile status. | [Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf) |
| Postpartum no cycles | Postpartum with no menses | Use postpartum artificial-cycle protocol only if selected; otherwise require instructor review. | [Fehring, Barron & Schneider 2005](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1004&context=nursing_fac), [Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac) |
| Recent hormonal contraception | Hormonal contraception stopped recently | Do not default to regular protocol; flag manufacturer two-natural-cycle waiting statement and instructor requirement. | [Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf), [Vitae Fertility regular-cycles preview](https://www.vitaefertility.com/wp-content/uploads/2018/12/boychuk-marquette-method-regular-cycles-manual-preview.pdf) |
| Perimenopause | Age/stage/cycle variability indicating perimenopause | Do not use regular-cycle public rules automatically; require perimenopause protocol selection/instructor configuration. | [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf), [Current Medical Research / Marquette perimenopause review](https://pmc.ncbi.nlm.nih.gov/articles/PMC4313435/) |
| Late luteal phase / possible pregnancy | Post-ovulatory phase beyond expected length | USCCB describes the online charting system as notifying possible pregnancy when the post-ovulatory phase goes beyond 19 days. | [USCCB Marquette Model history/effectiveness paper](https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf) |

## 10. Effectiveness Statistics

| Context | Correct/perfect use | Typical/total use | Notes | Source |
|---|---:|---:|---|---|
| 2008 retrospective Marquette study | 0.6% 12-month correct-use pregnancy rate / 99.4% effective | 10.6% 12-month typical-use pregnancy rate / 89.4% effective | 204 participants, 12 unintended pregnancies, one correct-use unintended pregnancy. | [Fehring, Schneider & Barron 2008](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1494&context=nursing_fac) |
| 2022 multisite Marquette study, all categories | Not calculated by correct months/cycles | 6.7 unintended pregnancies per 100 women over 12 months | 42 unintended pregnancies in multisite study. | [Mu, Fehring & Bouchard 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8935430/) |
| 2022 multisite regular cycles | Not calculated by correct months/cycles | 2.8 unintended pregnancies per 100 women over 12 months | Category-specific rate. | [Mu, Fehring & Bouchard 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8935430/) |
| 2022 multisite postpartum/breastfeeding | Not calculated by correct months/cycles | 8.0 unintended pregnancies per 100 women over 12 months | Category-specific rate. | [Mu, Fehring & Bouchard 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8935430/) |
| 2022 multisite irregular cycles | Not calculated by correct months/cycles | 4.3 unintended pregnancies per 100 women over 12 months | Category-specific rate. | [Mu, Fehring & Bouchard 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8935430/) |
| 2013 postpartum transition protocol | 2 unintended pregnancies per 100 women at 12 months with correct use | 8 unintended pregnancies per 100 women at 12 months postpartum | Included lactating and nonlactating postpartum participants using online charting. | [Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac) |
| 2023 revised postpartum breastfeeding protocol | 2 per 100 over 12 months/cycles for pregnancies meeting a priori criteria | 4 per 100 women at 12 cycles for pregnancies meeting a priori criteria | Article also reports broader total pregnancies and sensitivity analyses. | [Schneider, Fehring & Bouchard 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10265386/) |
| Perimenopause study summary | 1.5 pregnancies per 100 over 12 months among correct-use analyzable participants | 3–6 pregnancies per 100 over 12 months by marker subgroup; 6 per 100 overall in USCCB summary | Public sources summarize results but do not expose full protocol algorithm. | [Current Medical Research / Marquette perimenopause review](https://pmc.ncbi.nlm.nih.gov/articles/PMC4313435/), [USCCB Marquette Model history/effectiveness paper](https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf) |
| Low-cost LH sticks as Peak proxy | Not an avoiding-pregnancy effectiveness study | Wondfo LH detected surge in 92.7% of cycles vs 83.1% for EHFM, with 97.7% agreement on surge day | Study says larger research is needed. | [Fehring, Schneider & Bouchard 2018](https://pubmed.ncbi.nlm.nih.gov/29489529/) |

Effectiveness figures are not interchangeable across protocols because studies differ by reproductive category, markers used, instruction model, pregnancy-intention handling, and whether correct-use exposure months/cycles were available ([Fehring, Schneider & Barron 2008](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1494&context=nursing_fac), [Mu, Fehring & Bouchard 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8935430/), [Schneider, Fehring & Bouchard 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10265386/)).

## 11. Implementation Rules by Day Status

| Rule ID | Condition | Day status for avoiding pregnancy | Reason shown to user | Source |
|---|---|---|---|---|
| REG-START-1 | First six regular method cycles and CD >= 6 before end rule closes | Fertile | First six cycles begin fertility on CD6. | [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf) |
| REG-START-2 | After six cycles and CD >= earliest Peak last six minus six | Fertile | Historical Peak-minus-six start rule. | [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf) |
| REG-START-3 | Current cycle first High before calendar start | Fertile | First High starts fertility if earlier. | [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf) |
| REG-END-1 | Three full days completed after current last Peak | Infertile after count completes | End is three full days after last Peak. | [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf) |
| REG-END-2 | After six cycles, no current Peak, historical latest Peak + 3 reached | Infertile if regular/missed-surge eligible | Missed-LH fallback uses latest Peak from last six cycles plus three full days. | [Case Reports of the Marquette Method](https://pmc.ncbi.nlm.nih.gov/articles/PMC6081769/), [Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf) |
| MUCUS-START | Mucus changes from baseline before monitor High | Fertile | Earlier mucus change starts fertility in dual-check use. | [USCCB Marquette Model history/effectiveness paper](https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf) |
| MUCUS-END | Three full days after last mucus Peak and later than monitor end | Fertile until count completes | Later Peak marker controls end. | [USCCB Marquette Model history/effectiveness paper](https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf) |
| PP0-HIGH | Postpartum artificial cycle has monitor High | Fertile | Avoid High days postpartum. | [Fehring, Barron & Schneider 2005](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1004&context=nursing_fac) |
| PP0-PEAK | Postpartum artificial cycle has monitor Peak or within 3 full days after last Peak | Fertile | Avoid Peak days and three full days after. | [Fehring, Barron & Schneider 2005](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1004&context=nursing_fac) |
| PP-RTC-START | Postpartum return cycle reaches CD10/CD9/CD8/CD7/CD6 according to cycle number | Fertile | Return-to-cycles calendar start shifts earlier by one day per cycle. | [Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac) |
| LH-POS | Valid LH strip positive | Peak proxy / fertile | LH strip positive can identify surge/Peak proxy in selected protocols. | [Fehring, Schneider & Bouchard 2018](https://pubmed.ncbi.nlm.nih.gov/29489529/), [Easy@Home ovulation test manual](https://manuals.plus/asin/B08XXJDMPX.pdf) |

## 12. Data Model & Algorithm Appendix

### 12.1 Unified Daily Fertility Computation

```pseudo
function compute_day_status(user, cycle, day, prior_cycles):
    assert cycle.protocol_family is not null

    eligibility = evaluate_protocol_eligibility(user, cycle, prior_cycles)
    if eligibility.blocking_special_circumstance and not cycle.instructor_override:
        return Status('requires_instructor_protocol', reasons=eligibility.reasons)

    if cycle.protocol_family == 'regular_monitor':
        window = compute_regular_monitor_window(cycle, prior_cycles)
    elif cycle.protocol_family == 'regular_monitor_plus_mucus':
        window = compute_dual_monitor_mucus_window(cycle, prior_cycles)
    elif cycle.protocol_family == 'postpartum_cycle_zero_original':
        window = compute_postpartum_artificial_cycle_window(cycle)
    elif cycle.protocol_family == 'postpartum_return_to_cycles':
        window = postpartum_return_to_cycles_window(cycle, cycle.postpartum_cycle_number)
    elif cycle.protocol_family == 'mucus_only':
        window = compute_mucus_only_window(cycle, prior_cycles)
    elif cycle.protocol_family == 'perimenopause_quantitative_proposed':
        window = compute_quantitative_perimenopause_window(cycle)
    else:
        return Status('unsupported_protocol', reasons=['No public implementation rule loaded'])

    if day.cycle_day between window.start and window.end inclusive:
        return Status('fertile', reasons=window.reason_codes)
    if window.end == NEXT_MENSES and day.cycle_day >= window.start:
        return Status('fertile_open_ended', reasons=window.reason_codes)
    return Status('infertile_by_selected_protocol', reasons=window.reason_codes)
```

### 12.2 Eligibility Function

```pseudo
function evaluate_protocol_eligibility(user, cycle, prior_cycles):
    reasons = []

    if cycle.protocol_family startswith 'regular':
        if user.age < 20 or user.age > 42:
            reasons.append('regular Marquette manual public scope is ages 20-42')
        if cycle.length_known and (cycle.length < 22 or cycle.length > 42):
            reasons.append('regular Marquette manual public scope is cycles 22-42 days')
        if count_out_of_range_last_n(prior_cycles, 22, 42) >= 2:
            reasons.append('two or more cycles outside range require professional advice')
        if variation_last_n(prior_cycles) > 10:
            reasons.append('cycle variation >10 days requires professional advice')
        if user.recent_hormonal_contraception_stop:
            reasons.append('post-pill users require special instructions / manufacturer two-natural-cycle caution')
        if user.postpartum or user.breastfeeding or user.perimenopause:
            reasons.append('special reproductive category requires selected special protocol')

    return Eligibility(blocking_special_circumstance = any(reasons), reasons=reasons)
```

### 12.3 Fertile Window Boundary Audit Object

```json
{
  "cycle_id": "uuid",
  "protocol_family": "regular_monitor",
  "protocol_version": "marquette_regular_manual_public",
  "fertile_start_cd": 6,
  "fertile_start_rule_id": "REG-START-1",
  "fertile_end_cd": 18,
  "fertile_end_rule_id": "REG-END-1",
  "first_high_cd": 9,
  "first_peak_cd": 14,
  "last_peak_cd": 15,
  "earliest_peak_last6_cd": null,
  "latest_peak_last6_cd": null,
  "mucus_peak_cd": null,
  "edo_cd": 15,
  "confidence": "final_after_peak_count_complete",
  "source_urls": [
    "https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf",
    "https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf"
  ]
}
```

## 13. Sources / Bibliography

The Marquette University Institute for Natural Family Planning describes the Marquette Model as a urine-biomarker-based NFP method that can be used with mucus, BBT, and an algorithm ([Marquette University Institute for NFP](https://www.marquette.edu/nursing/institute-natural-family-planning/model.php)).

The Marquette regular-cycles user manual provides the public regular-cycle monitor and mucus rules used for the core algorithms in this specification ([Marquette regular-cycles user manual](https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf)).

The Clearblue Fertility Monitor booklet provides the manufacturer’s device-operation rules, warnings, reading definitions, test-window rules, and suitability limits ([Clearblue Fertility Monitor booklet](https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf)).

Fehring, Schneider, and Barron’s 2008 paper reports Marquette effectiveness outcomes and describes the method’s integration of EHFM, mucus, BBT, E3G, and LH markers ([Fehring, Schneider & Barron 2008](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1494&context=nursing_fac)).

Mu, Fehring, and Bouchard’s multisite effectiveness study reports typical-use pregnancy rates by reproductive category and describes the Marquette protocol at a high level ([Mu, Fehring & Bouchard 2022](https://pmc.ncbi.nlm.nih.gov/articles/PMC8935430/)).

Fehring, Barron, and Schneider’s 2005 breastfeeding-not-in-cycles protocol paper provides the original postpartum artificial-cycle rules ([Fehring, Barron & Schneider 2005](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1004&context=nursing_fac)).

Bouchard, Fehring, and Schneider’s 2013 postpartum-transition study provides postpartum artificial-cycle and return-to-cycles rules, optional evening LH testing, and postpartum effectiveness statistics ([Bouchard, Fehring & Schneider 2013](https://epublications.marquette.edu/cgi/viewcontent.cgi?article=1154&context=nursing_fac)).

Schneider, Fehring, and Bouchard’s 2023 revised postpartum breastfeeding study reports updated testing concepts and revised postpartum effectiveness statistics ([Schneider, Fehring & Bouchard 2023](https://pmc.ncbi.nlm.nih.gov/articles/PMC10265386/)).

The USCCB Marquette Model history/effectiveness paper summarizes historical Marquette protocols, online charting behavior, and effectiveness statistics across multiple Marquette studies ([USCCB Marquette Model history/effectiveness paper](https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf)).

The Marquette case-reports paper provides key no-Peak/missed-LH-surge edge-case handling and confirms first-six-cycle limitations ([Case Reports of the Marquette Method](https://pmc.ncbi.nlm.nih.gov/articles/PMC6081769/)).

The low-cost LH-stick study provides Wondfo/EHFM sensitivity and agreement data for using LH strips with the Marquette Fertility Algorithm ([Fehring, Schneider & Bouchard 2018](https://pubmed.ncbi.nlm.nih.gov/29489529/)).

Easy@Home and Premom sources provide consumer LH strip interpretation rules for line darkness and T/C ratio thresholds ([Easy@Home ovulation test manual](https://manuals.plus/asin/B08XXJDMPX.pdf), [Premom T/C ratio guide](https://premom.com/what-is-a-t-c-ratio/), [Premom ovulation-test guide](https://premom.com/how-to-use-ovulation-tests/)).

Mayo Clinic and Taking Charge of Your Fertility sources provide general BBT interpretation guidance used only as optional confirmation logic, not as a primary Marquette CBFM protocol rule ([Mayo Clinic BBT guidance](https://www.mayoclinic.org/tests-procedures/basal-body-temperature/about/pac-20393026), [Taking Charge of Your Fertility Celsius guidelines](https://www.tcoyf.com/celsius-guidelines/)).

The quantitative perimenopause case-report article and non-peer-reviewed Mira perimenopause PDF document proposed quantitative-hormone thresholds and caveats, but they do not provide a complete official CBFM perimenopause protocol for Verelle to implement automatically ([Perimenopause quantitative-monitor case reports](https://pmc.ncbi.nlm.nih.gov/articles/PMC10608103/), [Perimenopause Protocol PDF](https://143440709.fs1.hubspotusercontent-eu1.net/hubfs/143440709/Onboarding%20Documents/Protocols/Perimenopause%20Protocol.pdf)).
