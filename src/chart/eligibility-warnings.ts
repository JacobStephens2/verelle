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
import type { ChartCycle } from "./projection";
import type { CivilDate } from "./civil-date";

export type EligibilityCircumstance =
  | "age_outside_range"
  | "cycle_length_outside_range"
  | "two_or_more_out_of_range_cycles"
  | "cycle_variation_over_10_days"
  | "post_pill"
  | "perimenopausal"
  | "postpartum_without_breastfeeding";

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

/**
 * Calculate age in completed years from `birthDate` to `onDate`.
 */
export function ageOnCivilDate(birthDate: CivilDate, onDate: CivilDate): number {
  const bParts = birthDate.split("-").map(Number);
  const tParts = onDate.split("-").map(Number);
  const bYear = bParts[0];
  const bMonth = bParts[1];
  const bDay = bParts[2];
  const tYear = tParts[0];
  const tMonth = tParts[1];
  const tDay = tParts[2];
  if (
    bYear === undefined ||
    bMonth === undefined ||
    bDay === undefined ||
    tYear === undefined ||
    tMonth === undefined ||
    tDay === undefined ||
    Number.isNaN(bYear) ||
    Number.isNaN(bMonth) ||
    Number.isNaN(bDay) ||
    Number.isNaN(tYear) ||
    Number.isNaN(tMonth) ||
    Number.isNaN(tDay)
  ) {
    return 0;
  }
  let age = tYear - bYear;
  if (tMonth < bMonth || (tMonth === bMonth && tDay < bDay)) {
    age--;
  }
  return age;
}

export function evaluateEligibilityWarnings(
  cycles: readonly ChartCycle[],
  today: CivilDate,
  profile: Profile | null,
): readonly EligibilityWarning[] {
  const warnings: EligibilityWarning[] = [];

  if (profile?.dateOfBirth) {
    const age = ageOnCivilDate(profile.dateOfBirth, today);
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

  // Evaluate cycle lengths
  const completedCycleLengths: number[] = [];
  for (let i = 0; i < cycles.length - 1; i++) {
    const cycle = cycles[i];
    if (cycle) {
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
  const isCurrentCycleExceeding42 = currentCycle !== undefined && currentCycle.days.length > 42;
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
        "Published method instructions advise consulting an instructor for cycles outside 22–42 days; continue charting and treat days before the confirmed post-Peak infertile phase as fertile.",
      instructorRoute: MARQUETTE_INSTRUCTOR_ROUTE,
    });
  } else if (outOfRangeLengths.length >= 2) {
    warnings.push({
      circumstance: "two_or_more_out_of_range_cycles",
      reason: `Two or more cycles (${outOfRangeLengths.length} cycles) are outside the 22–42 day range of published regular-cycle instructions.`,
      instructionLimit:
        "The Marquette regular-cycle manual states that experiencing two or more cycles outside 22–42 days requires professional teacher advice.",
      conservativeGuidance:
        "Published method instructions advise consulting an instructor for individualized guidance when multiple cycles fall outside 22–42 days; continue charting and treat days before confirmed post-Peak infertility as fertile.",
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

  return warnings;
}
