import type {
  Bleeding,
  MonitorReading,
  Observation,
} from "../observations/observation";
import { isFullFlow, mucusCategory } from "../observations/observation";
import type { CycleOverlay } from "../observations/cycle-overlay";
import { defaultProtocolVersion } from "../observations/cycle-overlay";
import type { Profile } from "../observations/profile";
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

/**
 * What the selected protocol makes of a single day: fertile or infertile (`CONTEXT.md`).
 */
export type DayStatus = "fertile" | "infertile";

/**
 * Whether a boundary is final or still provisional (`CONTEXT.md`).
 */
export type Confidence = "final" | "provisional";

/**
 * A published boundary of a fertile window (`CONTEXT.md`, ADR 0015).
 */
export interface FertileWindowBoundary {
  readonly cycleDay: number;
  readonly ruleId: string;
  readonly confidence: Confidence;
}

/**
 * The span of cycle days the selected protocol treats as fertile (`CONTEXT.md`).
 */
export interface FertileWindow {
  readonly start: FertileWindowBoundary;
  readonly end: FertileWindowBoundary | null;
}

/** One Civil date in a numbered Cycle. */
export interface ChartDay {
  readonly civilDate: CivilDate;
  readonly cycleDay: number;
  readonly monitorReading: MonitorReading | null;
  /** Empty means nobody recorded a field on this date. */
  readonly markers: readonly ObservationMarker[];
  /** Mechanical labels anchored to a Peak override or the last Monitor Peak. */
  readonly annotations: readonly PeakAnnotation[];
  /** What the selected protocol makes of a single day: fertile or infertile (`CONTEXT.md`). */
  readonly dayStatus: DayStatus | null;
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
  /** The computed fertile window for the selected protocol family (`CONTEXT.md`, ADR 0015). */
  readonly fertileWindow: FertileWindow | null;
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
 * Determine whether a Cycle Day falls within a Fertile window.
 */
export function isDayInFertileWindow(
  cycleDay: number,
  fertileWindow: FertileWindow | null | undefined,
  lastCycleDay?: number,
): boolean {
  if (!fertileWindow) return false;
  const startCycleDay = fertileWindow.start.cycleDay;
  const endCycleDay = fertileWindow.end?.cycleDay ?? lastCycleDay;
  if (endCycleDay === undefined) {
    return cycleDay >= startCycleDay;
  }
  return cycleDay >= startCycleDay && cycleDay <= endCycleDay;
}

/**
 * Project Observations into Cycle rows and Cycle Day columns.
 *
 * This is the Chart's single domain seam. It is a pure function of the rows it
 * is handed and today's Civil date; it reaches no store, framework, browser or
 * native API. Inputs include cycle overlays and the couple profile (Issue #33).
 */
export function projectChart(
  observations: readonly Observation[],
  today: CivilDate,
  cycleOverlays: readonly CycleOverlay[] = [],
  profile: Profile | null = null,
): Chart {
  // Profile input is reserved for subsequent history-based and eligibility rules
  void profile;
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

  const overlaysByStartDate = new Map<CivilDate, CycleOverlay>();
  for (const overlay of cycleOverlays) {
    overlaysByStartDate.set(overlay.startDate, overlay);
  }

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

    const overlay = overlaysByStartDate.get(start.civilDate);
    const protocolFamily = overlay?.protocolFamily ?? null;
    const protocolVersion =
      overlay?.protocolVersion ??
      (protocolFamily ? defaultProtocolVersion(protocolFamily) : null);

    // Count only cycles charting under a method protocol family
    const methodCyclesBefore = cycleStarts.slice(0, index).filter((s) => {
      const priorOverlay = overlaysByStartDate.get(s.civilDate);
      return priorOverlay?.protocolFamily !== null && priorOverlay?.protocolFamily !== undefined;
    }).length;
    const methodCycleNumber = methodCyclesBefore + 1;

    let fertileWindow: FertileWindow | null = null;
    if (
      protocolFamily === "regular_monitor" &&
      protocolVersion === "marquette_regular_manual_public"
    ) {
      if (methodCycleNumber <= 6) {
        let end: FertileWindowBoundary | null = null;
        if (monitorPeaks.length > 0) {
          const lastMonitorPeak = monitorPeaks[monitorPeaks.length - 1]!;
          const lastPeakCycleDay =
            daysBetweenCivilDates(start.civilDate, lastMonitorPeak.civilDate) + 1;
          const endCycleDay = lastPeakCycleDay + 3;
          const endCivilDate = civilDatePlusDays(lastMonitorPeak.civilDate, 3);
          const isEndComplete = today > endCivilDate || nextStart !== undefined;
          end = {
            cycleDay: endCycleDay,
            ruleId: "REG-END-1",
            confidence: isEndComplete ? "final" : "provisional",
          };
        }
        fertileWindow = {
          start: {
            cycleDay: 6,
            ruleId: "REG-START-1",
            confidence: "final",
          },
          end,
        };
      } else {
        // After six completed method cycles: use historical Monitor Peaks
        const priorMethodStarts = cycleStarts.slice(0, index).filter((s) => {
          const priorOverlay = overlaysByStartDate.get(s.civilDate);
          return priorOverlay?.protocolFamily !== null && priorOverlay?.protocolFamily !== undefined;
        });
        const lastSixPriorStarts = priorMethodStarts.slice(-6);
        const historicalPeakCycleDays: number[] = [];

        for (const priorStart of lastSixPriorStarts) {
          const priorIndex = cycleStarts.findIndex(
            (s) => s.civilDate === priorStart.civilDate,
          );
          const priorNextStart = cycleStarts[priorIndex + 1]?.civilDate;
          const priorEndDate =
            priorNextStart === undefined
              ? today
              : civilDatePlusDays(priorNextStart, -1);
          const priorObservations = datedObservations.filter(
            (o) => o.civilDate >= priorStart.civilDate && o.civilDate <= priorEndDate,
          );
          const priorMonitorPeaks = priorObservations.filter(
            (o) => o.monitorReading === "Peak",
          );
          for (const peak of priorMonitorPeaks) {
            const peakCycleDay =
              daysBetweenCivilDates(priorStart.civilDate, peak.civilDate) + 1;
            historicalPeakCycleDays.push(peakCycleDay);
          }
        }

        if (historicalPeakCycleDays.length === 0) {
          // When no historical Peak data exists, fall back to flat start with open end
          fertileWindow = {
            start: {
              cycleDay: 6,
              ruleId: "REG-START-1",
              confidence: "final",
            },
            end: null,
          };
        } else {
          const earliestPeakLast6 = Math.min(...historicalPeakCycleDays);
          const latestPeakLast6 = Math.max(...historicalPeakCycleDays);

          // Start rule: earlier of earliest Monitor Peak minus six and current cycle's first High
          const historicalCalendarStart = Math.max(1, earliestPeakLast6 - 6);
          const highReadings = observationsInCycle.filter(
            (o) => o.monitorReading === "High",
          );
          const firstHighObs = highReadings[0];
          const firstHighCycleDay =
            firstHighObs !== undefined
              ? daysBetweenCivilDates(start.civilDate, firstHighObs.civilDate) + 1
              : undefined;

          let startBoundary: FertileWindowBoundary;
          if (
            firstHighCycleDay !== undefined &&
            firstHighCycleDay < historicalCalendarStart
          ) {
            startBoundary = {
              cycleDay: firstHighCycleDay,
              ruleId: "REG-START-3",
              confidence: "final",
            };
          } else {
            startBoundary = {
              cycleDay: historicalCalendarStart,
              ruleId: "REG-START-2",
              confidence: "final",
            };
          }

          // End rule: earlier of current last Peak + 3 and historical latest Peak + 3
          const historicalEnd = latestPeakLast6 + 3;
          const makeFallbackEndBoundary = (
            fallbackCycleDay: number,
          ): FertileWindowBoundary => {
            const endCivilDate = civilDatePlusDays(start.civilDate, fallbackCycleDay - 1);
            const isEndComplete = today > endCivilDate || nextStart !== undefined;
            return {
              cycleDay: fallbackCycleDay,
              ruleId: "REG-END-2",
              confidence: isEndComplete ? "final" : "provisional",
            };
          };

          let endBoundary: FertileWindowBoundary | null = null;

          if (monitorPeaks.length > 0) {
            const lastMonitorPeak = monitorPeaks[monitorPeaks.length - 1]!;
            const currentPeakCycleDay =
              daysBetweenCivilDates(start.civilDate, lastMonitorPeak.civilDate) + 1;
            const currentEnd = currentPeakCycleDay + 3;

            if (currentEnd <= historicalEnd) {
              const endCivilDate = civilDatePlusDays(lastMonitorPeak.civilDate, 3);
              const isEndComplete = today > endCivilDate || nextStart !== undefined;
              endBoundary = {
                cycleDay: currentEnd,
                ruleId: "REG-END-1",
                confidence: isEndComplete ? "final" : "provisional",
              };
            } else {
              endBoundary = makeFallbackEndBoundary(historicalEnd);
            }
          } else {
            // No Monitor Peak in current cycle:
            // Check for prolonged run of High readings
            const totalDays = daysBetweenCivilDates(start.civilDate, endDate) + 1;
            let maxConsecutiveHigh = 0;
            let currentConsecutiveHigh = 0;
            let hasRunIntoHistoricalEnd = false;

            for (let dayIdx = 0; dayIdx < totalDays; dayIdx++) {
              const dayCivilDate = civilDatePlusDays(start.civilDate, dayIdx);
              const cycleDay = dayIdx + 1;
              const reading = observationsByDate.get(dayCivilDate)?.monitorReading;
              if (reading === "High") {
                currentConsecutiveHigh++;
                if (currentConsecutiveHigh > maxConsecutiveHigh) {
                  maxConsecutiveHigh = currentConsecutiveHigh;
                }
                if (cycleDay >= historicalEnd && currentConsecutiveHigh >= 3) {
                  hasRunIntoHistoricalEnd = true;
                }
              } else {
                currentConsecutiveHigh = 0;
              }
            }

            const isProlongedHigh =
              maxConsecutiveHigh >= 6 || hasRunIntoHistoricalEnd;

            if (isProlongedHigh) {
              // Prolonged run of High readings keeps window open rather than reading as infertility
              endBoundary = null;
            } else {
              endBoundary = makeFallbackEndBoundary(historicalEnd);
            }
          }

          fertileWindow = {
            start: startBoundary,
            end: endBoundary,
          };
        }
      }
    }

    const dayCount = daysBetweenCivilDates(start.civilDate, endDate) + 1;
    const days = Array.from({ length: dayCount }, (_, dayIndex): ChartDay => {
      const civilDate = civilDatePlusDays(start.civilDate, dayIndex);
      const cycleDay = dayIndex + 1;
      const annotations: PeakAnnotation[] = [];
      if (anchorPeak !== undefined) {
        const count = daysBetweenCivilDates(anchorPeak.civilDate, civilDate);
        const annotation = PEAK_COUNT[count];
        if (annotation !== undefined) annotations.push(annotation);
      }

      let dayStatus: DayStatus | null = null;
      if (fertileWindow !== null) {
        dayStatus = isDayInFertileWindow(cycleDay, fertileWindow) ? "fertile" : "infertile";
      }

      return {
        civilDate,
        cycleDay,
        monitorReading: observationsByDate.get(civilDate)?.monitorReading ?? null,
        markers: markersFor(observationsByDate.get(civilDate)),
        annotations,
        dayStatus,
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

    return { startDate: start.civilDate, days, mucusPeak, fertileWindow };
  });

  const unassignedDays = unassignedObservations.map((observation) => ({
    civilDate: observation.civilDate,
    monitorReading: observation.monitorReading,
    markers: markersFor(observation),
  }));

  return { today, cycles, unassignedDays };
}
