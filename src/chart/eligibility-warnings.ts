/**
 * Eligibility warnings (`CONTEXT.md`, ADR 0015, issue #36).
 *
 * Circumstances outside the scope the Marquette Method publishes regular rules for
 * produce informative warnings. Eligibility warns and never blocks.
 *
 * Warning copy frames the limit as a limit of the method's published instructions,
 * never of the app. Every warning states the conservative guidance published sources
 * imply and offers a route to finding a Marquette instructor.
 */
import type { Profile } from "../observations/profile";
import type { CycleOverlay } from "../observations/cycle-overlay";
import type { ChartCycle } from "./projection";
import type { CivilDate } from "./civil-date";
import { completedYearsBetweenCivilDates } from "./civil-date";

export type EligibilityCircumstance =
  | "age_outside_range"
  | "cycle_length_outside_range"
  | "two_or_more_out_of_range_cycles"
  | "cycle_variation_over_10_days"
  | "post_pill"
  | "perimenopausal"
  | "postpartum_without_breastfeeding"
  | "missed_test_near_expected_peak";

export interface InstructorRoute {
  readonly label: string;
  readonly url: string;
}

export interface EligibilityWarning {
  readonly circumstance: EligibilityCircumstance;
  readonly reason: string;
  readonly instructionLimit: string;
  readonly conservativeGuidance: string;
  readonly instructorRoute: InstructorRoute;
}

export const MARQUETTE_INSTRUCTOR_ROUTE: InstructorRoute = {
  label: "Find a Marquette instructor",
  url: "https://www.marquettemethod.com/",
};

export function evaluateEligibilityWarnings(
  cycles: readonly ChartCycle[],
  today: CivilDate,
  profile: Profile | null,
  cycleOverlays: readonly CycleOverlay[] = [],
): readonly EligibilityWarning[] {
  const warnings: EligibilityWarning[] = [];

  if (profile?.dateOfBirth) {
    const age = completedYearsBetweenCivilDates(profile.dateOfBirth, today);
    if (age < 20 || age > 42) {
      warnings.push({
        circumstance: "age_outside_range",
        reason: `Age (${age}) is outside the 20–42 range of the published regular-cycle instructions.`,
        instructionLimit:
          "The Marquette regular-cycle manual publishes instructions tested for women aged 20–42.",
        conservativeGuidance:
          "Published method instructions advise teacher consultation for protocol adjustments outside this age range; for avoiding pregnancy, couples treat all days before the post-Peak infertile time as fertile.",
        instructorRoute: MARQUETTE_INSTRUCTOR_ROUTE,
      });
    }
  }

  const overlaysByStartDate = new Map<CivilDate, CycleOverlay>();
  for (const overlay of cycleOverlays) {
    overlaysByStartDate.set(overlay.startDate, overlay);
  }

  function isRegularCycle(cycle: ChartCycle): boolean {
    const overlay = overlaysByStartDate.get(cycle.startDate);
    if (!overlay || overlay.protocolFamily === null || overlay.protocolFamily === undefined) {
      return true;
    }
    return (
      overlay.protocolFamily === "regular_monitor" ||
      overlay.protocolFamily === "regular_monitor_plus_mucus" ||
      overlay.protocolFamily === "mucus_only"
    );
  }

  // Evaluate regular cycle lengths (22–42 days) and cycle variation
  const completedCycleLengths: number[] = [];
  for (let i = 0; i < cycles.length - 1; i++) {
    const cycle = cycles[i];
    if (cycle && isRegularCycle(cycle)) {
      completedCycleLengths.push(cycle.days.length);
    }
  }

  const outOfRangeLengths: number[] = [];
  for (const len of completedCycleLengths) {
    if (len < 22 || len > 42) {
      outOfRangeLengths.push(len);
    }
  }

  const currentCycle = cycles[cycles.length - 1];
  const isCurrentCycleExceeding42 =
    currentCycle !== undefined &&
    isRegularCycle(currentCycle) &&
    currentCycle.days.length > 42;
  if (isCurrentCycleExceeding42) {
    outOfRangeLengths.push(currentCycle.days.length);
  }

  if (outOfRangeLengths.length === 1) {
    warnings.push({
      circumstance: "cycle_length_outside_range",
      reason: `Cycle length (${outOfRangeLengths[0]} days) is outside the 22–42 day range of published regular-cycle instructions.`,
      instructionLimit:
        "The Marquette regular-cycle manual publishes instructions for cycles between 22 and 42 days.",
      conservativeGuidance:
        "Published method instructions advise consulting an instructor for cycles outside 22–42 days; continue charting and treat days before confirmed post-Peak infertility as fertile.",
      instructorRoute: MARQUETTE_INSTRUCTOR_ROUTE,
    });
  } else if (outOfRangeLengths.length >= 2) {
    warnings.push({
      circumstance: "two_or_more_out_of_range_cycles",
      reason: `Two or more cycles (${outOfRangeLengths.length} cycles) are outside the 22–42 day range of published regular-cycle instructions.`,
      instructionLimit:
        "The Marquette regular-cycle manual states that experiencing two or more cycles outside 22–42 days requires professional teacher advice.",
      conservativeGuidance:
        "Published method instructions advise consulting an instructor for individualized instructions when multiple cycles fall outside 22–42 days; continue charting and treat days before confirmed post-Peak infertility as fertile.",
      instructorRoute: MARQUETTE_INSTRUCTOR_ROUTE,
    });
  }

  if (completedCycleLengths.length >= 2) {
    const minLength = Math.min(...completedCycleLengths);
    const maxLength = Math.max(...completedCycleLengths);
    const variation = maxLength - minLength;
    if (variation > 10) {
      warnings.push({
        circumstance: "cycle_variation_over_10_days",
        reason: `Cycle variation (${variation} days: shortest ${minLength} days, longest ${maxLength} days) is greater than 10 days.`,
        instructionLimit:
          "The Marquette regular-cycle manual states that cycle variation greater than 10 days requires professional teacher advice.",
        conservativeGuidance:
          "Published method instructions advise consulting an instructor when cycles vary by more than 10 days; continue charting and treat days before confirmed post-Peak infertility as fertile.",
        instructorRoute: MARQUETTE_INSTRUCTOR_ROUTE,
      });
    }
  }

  if (profile?.hormonalContraceptionStop) {
    warnings.push({
      circumstance: "post_pill",
      reason: `Hormonal contraception was recently stopped (stop date: ${profile.hormonalContraceptionStop}).`,
      instructionLimit:
        "The Marquette regular-cycle manual and Clearblue instructions state that women discontinuing hormonal contraception require special instructions rather than standard regular-cycle rules.",
      conservativeGuidance:
        "Clearblue manufacturer instructions advise waiting for two natural cycles (21–42 days) before relying on monitor readings, and published method instructions advise working with an instructor for post-pill protocol management.",
      instructorRoute: MARQUETTE_INSTRUCTOR_ROUTE,
    });
  }

  if (profile?.perimenopause === true) {
    warnings.push({
      circumstance: "perimenopausal",
      reason: "Perimenopausal status recorded in Profile.",
      instructionLimit:
        "The Marquette regular-cycle manual does not cover perimenopause; the method publishes specialized protocols for the perimenopausal transition.",
      conservativeGuidance:
        "Published method instructions advise consulting an instructor for perimenopausal transition protocols; continue charting and treat days before confirmed post-Peak infertility as fertile.",
      instructorRoute: MARQUETTE_INSTRUCTOR_ROUTE,
    });
  }

  if (profile?.postpartum === true && profile?.breastfeeding === false) {
    warnings.push({
      circumstance: "postpartum_without_breastfeeding",
      reason: "Postpartum status recorded without breastfeeding in Profile.",
      instructionLimit:
        "The Marquette regular-cycle manual covers established cycles, not postpartum transitions without breastfeeding.",
      conservativeGuidance:
        "Clearblue and Marquette instructions advise monitoring for the return of regular cycles or following an instructor-guided transition protocol; continue charting and treat days before confirmed post-Peak infertility as fertile.",
      instructorRoute: MARQUETTE_INSTRUCTOR_ROUTE,
    });
  }

  function isMonitorCycle(cycle: ChartCycle): boolean {
    const overlay = overlaysByStartDate.get(cycle.startDate);
    if (!overlay || overlay.protocolFamily === null || overlay.protocolFamily === undefined) {
      return true;
    }
    return (
      overlay.protocolFamily === "regular_monitor" ||
      overlay.protocolFamily === "regular_monitor_plus_mucus" ||
      overlay.protocolFamily === "postpartum_return_to_cycles" ||
      overlay.protocolFamily === "postpartum_cycle_zero_original"
    );
  }

  // Evaluate missed monitor tests near expected Peak
  for (let cycleIndex = 0; cycleIndex < cycles.length; cycleIndex++) {
    const cycle = cycles[cycleIndex];
    if (!cycle || !isMonitorCycle(cycle)) continue;

    // Monitor tests are requested only during the testing interval (CD6 onward)
    const missedDays = cycle.days.filter(
      (d) => d.monitorReading === "Missed" && d.cycleDay >= 6,
    );
    if (missedDays.length === 0) continue;

    const priorCycles = cycles.slice(Math.max(0, cycleIndex - 6), cycleIndex);
    const priorPeakDays: number[] = [];
    for (const pc of priorCycles) {
      const peakDay = pc.days.find((d) => d.monitorReading === "Peak");
      if (peakDay) priorPeakDays.push(peakDay.cycleDay);
    }

    const currentPeakDay = cycle.days.find((d) => d.monitorReading === "Peak")?.cycleDay;
    const firstHighDay = cycle.days.find((d) => d.monitorReading === "High")?.cycleDay;

    for (const missedDay of missedDays) {
      let isNearExpectedPeak = false;

      if (currentPeakDay !== undefined) {
        if (missedDay.cycleDay >= currentPeakDay - 2 && missedDay.cycleDay <= currentPeakDay + 1) {
          isNearExpectedPeak = true;
        }
      } else if (firstHighDay !== undefined) {
        if (missedDay.cycleDay >= firstHighDay && missedDay.cycleDay <= firstHighDay + 5) {
          isNearExpectedPeak = true;
        }
      } else if (priorPeakDays.length > 0) {
        const minPrior = Math.min(...priorPeakDays);
        const maxPrior = Math.max(...priorPeakDays);
        if (missedDay.cycleDay >= minPrior - 2 && missedDay.cycleDay <= maxPrior + 1) {
          isNearExpectedPeak = true;
        }
      } else {
        if (missedDay.cycleDay >= 11 && missedDay.cycleDay <= 17) {
          isNearExpectedPeak = true;
        }
      }

      if (isNearExpectedPeak) {
        warnings.push({
          circumstance: "missed_test_near_expected_peak",
          reason: `A monitor test was missed near the expected Peak (Cycle Day ${missedDay.cycleDay}).`,
          instructionLimit:
            "The Clearblue Fertility Monitor instructions state that a test missed close to ovulation can miss the chance to identify Peak fertility.",
          conservativeGuidance:
            "The fertile window may be less certain; continue testing as requested by the monitor and treat days as fertile until fertility is confirmed closed, or consult an instructor.",
          instructorRoute: MARQUETTE_INSTRUCTOR_ROUTE,
        });
        break;
      }
    }
  }

  return warnings;
}
