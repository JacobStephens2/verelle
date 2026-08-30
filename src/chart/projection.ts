import type { Observation } from "../observations/observation";
import { isFullFlow } from "../observations/observation";
import type { CivilDate } from "./civil-date";
import { civilDatePlusDays, daysBetweenCivilDates } from "./civil-date";

/** Minimum Cycle Day columns shown before the current Cycle grows past them. */
export const CYCLE_DAY_COLUMNS = 42;

/** The mechanical labels issue #10 will place on Chart days. */
export type PeakAnnotation = "P" | "P+1" | "P+2" | "P+3";

/** One Civil date in a numbered Cycle. */
export interface ChartDay {
  readonly civilDate: CivilDate;
  readonly cycleDay: number;
  /** `null` means nobody recorded anything on this date. */
  readonly observation: Observation | null;
  /** Empty until issue #10 adds the Peak count projection. */
  readonly annotations: readonly PeakAnnotation[];
}

/** A Cycle, from one Cycle Day 1 to the day before the next. */
export interface ChartCycle {
  readonly startDate: CivilDate;
  readonly days: readonly ChartDay[];
}

/**
 * The complete Chart projection as of `today`.
 *
 * Observations before the first recorded Cycle Day 1 remain visible but
 * unassigned: giving them a Cycle Day would invent an anchor the couple did
 * not record.
 */
export interface Chart {
  readonly today: CivilDate;
  readonly cycles: readonly ChartCycle[];
  readonly unassignedObservations: readonly Observation[];
}

/**
 * Project Observations into Cycle rows and Cycle Day columns.
 *
 * This is the Chart's single domain seam. It is a pure function of the rows it
 * is handed and today's Civil date; it reaches no store, framework, browser or
 * native API.
 */
export function projectChart(
  observations: readonly Observation[],
  today: CivilDate,
): Chart {
  const observationsByDate = new Map<CivilDate, Observation>();
  for (const observation of observations) {
    if (observation.civilDate <= today) {
      observationsByDate.set(observation.civilDate, observation);
    }
  }

  const datedObservations = [...observationsByDate.values()].sort((left, right) =>
    left.civilDate.localeCompare(right.civilDate),
  );

  const cycleStarts = datedObservations.filter((observation) => {
    if (!isFullFlow(observation.bleeding)) return false;

    const previousDate = civilDatePlusDays(observation.civilDate, -1);
    return !isFullFlow(observationsByDate.get(previousDate)?.bleeding ?? null);
  });

  const firstCycleStart = cycleStarts[0]?.civilDate;
  const unassignedObservations =
    firstCycleStart === undefined
      ? datedObservations
      : datedObservations.filter(
          (observation) => observation.civilDate < firstCycleStart,
        );

  const cycles = cycleStarts.map((start, index): ChartCycle => {
    const nextStart = cycleStarts[index + 1]?.civilDate;
    const endDate = nextStart === undefined ? today : civilDatePlusDays(nextStart, -1);
    const dayCount = daysBetweenCivilDates(start.civilDate, endDate) + 1;
    const days = Array.from({ length: dayCount }, (_, dayIndex): ChartDay => {
      const civilDate = civilDatePlusDays(start.civilDate, dayIndex);
      return {
        civilDate,
        cycleDay: dayIndex + 1,
        observation: observationsByDate.get(civilDate) ?? null,
        annotations: [],
      };
    });

    return { startDate: start.civilDate, days };
  });

  return { today, cycles, unassignedObservations };
}
