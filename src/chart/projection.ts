import type {
  Bleeding,
  MonitorReading,
  Observation,
} from "../observations/observation";
import { isFullFlow } from "../observations/observation";
import type { CivilDate } from "./civil-date";
import { civilDatePlusDays, daysBetweenCivilDates } from "./civil-date";

/** Minimum Cycle Day columns shown before the current Cycle grows past them. */
export const CYCLE_DAY_COLUMNS = 42;

/** The mechanical labels issue #10 will place on Chart days. */
export type PeakAnnotation = "P" | "P+1" | "P+2" | "P+3";

/** A recorded Observation field that the compact Chart marks on a day. */
export type ObservationMarker =
  | "monitor"
  | "bleeding"
  | "user_marked_peak"
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
  /** Empty until issue #10 adds the Peak count projection. */
  readonly annotations: readonly PeakAnnotation[];
}

/** A dated Observation that precedes the first recorded Cycle Day 1. */
export interface UnassignedChartDay {
  readonly civilDate: CivilDate;
  readonly monitorReading: MonitorReading | null;
  readonly markers: readonly ObservationMarker[];
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
  readonly unassignedDays: readonly UnassignedChartDay[];
}

function markersFor(observation: Observation | undefined): ObservationMarker[] {
  if (observation === undefined) return [];

  const markers: ObservationMarker[] = [];
  if (observation.monitorReading !== null) markers.push("monitor");
  if (observation.bleeding !== null) markers.push("bleeding");
  if (observation.userMarkedPeak !== null) markers.push("user_marked_peak");
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
    const dayCount = daysBetweenCivilDates(start.civilDate, endDate) + 1;
    const days = Array.from({ length: dayCount }, (_, dayIndex): ChartDay => {
      const civilDate = civilDatePlusDays(start.civilDate, dayIndex);
      return {
        civilDate,
        cycleDay: dayIndex + 1,
        monitorReading: observationsByDate.get(civilDate)?.monitorReading ?? null,
        markers: markersFor(observationsByDate.get(civilDate)),
        annotations: [],
      };
    });

    return { startDate: start.civilDate, days };
  });

  const unassignedDays = unassignedObservations.map((observation) => ({
    civilDate: observation.civilDate,
    monitorReading: observation.monitorReading,
    markers: markersFor(observation),
  }));

  return { today, cycles, unassignedDays };
}
