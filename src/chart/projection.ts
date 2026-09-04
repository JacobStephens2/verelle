import type {
  Bleeding,
  MonitorReading,
  Observation,
} from "../observations/observation";
import { isFullFlow, mucusCategory } from "../observations/observation";
import type { CivilDate } from "./civil-date";
import { civilDatePlusDays, daysBetweenCivilDates } from "./civil-date";

/** Minimum Cycle Day columns shown before the current Cycle grows past them. */
export const CYCLE_DAY_COLUMNS = 42;

/** Mechanical labels counted from a Peak override or the last Monitor Peak (`CONTEXT.md`). */
export type PeakAnnotation = "P" | "P+1" | "P+2" | "P+3";

const PEAK_COUNT: readonly PeakAnnotation[] = ["P", "P+1", "P+2", "P+3"];

/** A recorded Observation field that the compact Chart marks on a day. */
export type ObservationMarker =
  | "monitor"
  | "bleeding"
  | "peak_override"
  | "intercourse"
  | "lh_strip"
  | "mucus"
  | "temperature"
  | "note";

/** One Civil date in a numbered Cycle. */
export interface ChartDay {
  readonly civilDate: CivilDate;
  readonly cycleDay: number;
  readonly monitorReading: MonitorReading | null;
  /** Empty means nobody recorded a field on this date. */
  readonly markers: readonly ObservationMarker[];
  /** Mechanical labels anchored to a Peak override or the last Monitor Peak. */
  readonly annotations: readonly PeakAnnotation[];
}

/** A dated Observation that precedes the first recorded Cycle Day 1. */
export interface UnassignedChartDay {
  readonly civilDate: CivilDate;
  readonly monitorReading: MonitorReading | null;
  readonly markers: readonly ObservationMarker[];
}

/**
 * The last day of Peak-category mucus in a Cycle (`CONTEXT.md`).
 *
 * Knowable only once a non-Peak day follows it, so it is provisional until it
 * isn't.
 */
export interface MucusPeak {
  readonly civilDate: CivilDate;
  readonly cycleDay: number;
  readonly provisional: boolean;
}

/** A Cycle, from one Cycle Day 1 to the day before the next. */
export interface ChartCycle {
  readonly startDate: CivilDate;
  readonly days: readonly ChartDay[];
  readonly mucusPeak: MucusPeak | null;
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
  readonly unassignedDays: readonly UnassignedChartDay[];
}

function markersFor(observation: Observation | undefined): ObservationMarker[] {
  if (observation === undefined) return [];

  const markers: ObservationMarker[] = [];
  if (observation.monitorReading !== null) markers.push("monitor");
  if (observation.bleeding !== null) markers.push("bleeding");
  if (observation.peakOverride === true) markers.push("peak_override");
  if (observation.intercourse !== null) markers.push("intercourse");
  if (observation.lhStrip !== null) markers.push("lh_strip");
  if (observation.mucus !== null) markers.push("mucus");
  if (observation.temperature !== null) markers.push("temperature");
  if (observation.note !== null) markers.push("note");
  return markers;
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

  const cycleStarts: Observation[] = [];
  let previousRecordedBleeding: Bleeding | undefined;
  for (const observation of datedObservations) {
    if (observation.bleeding === null) continue;
    if (
      isFullFlow(observation.bleeding) &&
      (previousRecordedBleeding === undefined || !isFullFlow(previousRecordedBleeding))
    ) {
      cycleStarts.push(observation);
    }
    previousRecordedBleeding = observation.bleeding;
  }

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
    const observationsInCycle = datedObservations.filter(
      (observation) =>
        observation.civilDate >= start.civilDate &&
        observation.civilDate <= endDate,
    );

    const peakOverrides = observationsInCycle.filter(
      (observation) => observation.peakOverride === true,
    );
    const monitorPeaks = observationsInCycle.filter(
      (observation) => observation.monitorReading === "Peak",
    );
    const anchorPeak =
      peakOverrides.length > 0
        ? peakOverrides[peakOverrides.length - 1]
        : monitorPeaks.length > 0
          ? monitorPeaks[monitorPeaks.length - 1]
          : undefined;

    const dayCount = daysBetweenCivilDates(start.civilDate, endDate) + 1;
    const days = Array.from({ length: dayCount }, (_, dayIndex): ChartDay => {
      const civilDate = civilDatePlusDays(start.civilDate, dayIndex);
      const annotations: PeakAnnotation[] = [];
      if (anchorPeak !== undefined) {
        const count = daysBetweenCivilDates(anchorPeak.civilDate, civilDate);
        const annotation = PEAK_COUNT[count];
        if (annotation !== undefined) annotations.push(annotation);
      }
      return {
        civilDate,
        cycleDay: dayIndex + 1,
        monitorReading: observationsByDate.get(civilDate)?.monitorReading ?? null,
        markers: markersFor(observationsByDate.get(civilDate)),
        annotations,
      };
    });

    const peakMucusObservations = observationsInCycle.filter(
      (observation) => mucusCategory(observation.mucus) === "Peak",
    );
    const lastPeakMucus = peakMucusObservations[peakMucusObservations.length - 1];

    let mucusPeak: MucusPeak | null = null;
    if (lastPeakMucus !== undefined) {
      const hasSubsequentNonPeakMucus = observationsInCycle.some((observation) => {
        if (observation.civilDate <= lastPeakMucus.civilDate) return false;
        const category = mucusCategory(observation.mucus);
        return category !== null && category !== "Peak";
      });
      mucusPeak = {
        civilDate: lastPeakMucus.civilDate,
        cycleDay: daysBetweenCivilDates(start.civilDate, lastPeakMucus.civilDate) + 1,
        provisional: !hasSubsequentNonPeakMucus,
      };
    }

    return { startDate: start.civilDate, days, mucusPeak };
  });

  const unassignedDays = unassignedObservations.map((observation) => ({
    civilDate: observation.civilDate,
    monitorReading: observation.monitorReading,
    markers: markersFor(observation),
  }));

  return { today, cycles, unassignedDays };
}
