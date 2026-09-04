import type {
  Bleeding,
  MonitorReading,
  Mucus,
  Observation,
} from "../observations/observation";
import { isFullFlow, mucusCategory } from "../observations/observation";
import type { CycleOverlay } from "../observations/cycle-overlay";
import { defaultProtocolVersion } from "../observations/cycle-overlay";
import type { Profile } from "../observations/profile";
import type { CivilDate } from "./civil-date";
import { civilDatePlusDays, daysBetweenCivilDates } from "./civil-date";

import type { BoundaryRuleId } from "./boundary-rules";
import type { EligibilityWarning } from "./eligibility-warnings";
import { evaluateEligibilityWarnings } from "./eligibility-warnings";

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
  readonly ruleId: BoundaryRuleId;
  readonly confidence: Confidence;
}

/**
 * Discrepancy flags between monitor and mucus markers in dual-check protocols.
 */
export type MarkerDiscrepancy =
  | "mucus_fertile_before_monitor_high"
  | "monitor_high_before_mucus_change"
  | "mucus_peak_after_monitor_peak"
  | "monitor_peak_after_mucus_peak"
  | "no_monitor_peak_but_mucus_peak"
  | "no_mucus_peak_but_monitor_peak";

/**
 * The span of cycle days the selected protocol treats as fertile (`CONTEXT.md`).
 */
export interface FertileWindow {
  readonly start: FertileWindowBoundary;
  readonly end: FertileWindowBoundary | null;
  readonly discrepancies?: readonly MarkerDiscrepancy[];
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
  readonly eligibilityWarnings: readonly EligibilityWarning[];
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
 * Departure from baseline mucus: any observed mucus other than dry/scant.
 */
export function isMucusChangeFromBaseline(
  mucus: Mucus | string | null | undefined,
): boolean {
  if (!mucus) return false;
  return mucus !== "dry or scant" && mucus !== "Dry";
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

interface PriorMethodCycle {
  readonly startDate: CivilDate;
  readonly observations: readonly Observation[];
}

function getLastSixPriorMethodCycles(
  cycleStarts: ReadonlyArray<{ readonly civilDate: CivilDate }>,
  currentIndex: number,
  overlaysByStartDate: ReadonlyMap<CivilDate, CycleOverlay>,
  datedObservations: readonly Observation[],
  today: CivilDate,
): readonly PriorMethodCycle[] {
  const priorMethodStarts = cycleStarts.slice(0, currentIndex).filter((s) => {
    const priorOverlay = overlaysByStartDate.get(s.civilDate);
    return (
      priorOverlay?.protocolFamily !== null &&
      priorOverlay?.protocolFamily !== undefined
    );
  });
  const lastSixPriorStarts = priorMethodStarts.slice(-6);
  return lastSixPriorStarts.map((priorStart) => {
    const priorIndex = cycleStarts.findIndex(
      (s) => s.civilDate === priorStart.civilDate,
    );
    const priorNextStart = cycleStarts[priorIndex + 1]?.civilDate;
    const priorEndDate =
      priorNextStart === undefined
        ? today
        : civilDatePlusDays(priorNextStart, -1);
    const observations = datedObservations.filter(
      (o) =>
        o.civilDate >= priorStart.civilDate && o.civilDate <= priorEndDate,
    );
    return {
      startDate: priorStart.civilDate,
      observations,
    };
  });
}

function computePeakPlusThreeEndBoundary(
  anchorPeak: Observation | undefined,
  startCivilDate: CivilDate,
  today: CivilDate,
  nextStartCivilDate: CivilDate | undefined,
  ruleId: BoundaryRuleId,
): FertileWindowBoundary | null {
  if (anchorPeak === undefined) return null;
  const anchorPeakCycleDay =
    daysBetweenCivilDates(startCivilDate, anchorPeak.civilDate) + 1;
  const endCycleDay = anchorPeakCycleDay + 3;
  const endCivilDate = civilDatePlusDays(anchorPeak.civilDate, 3);
  const isEndComplete = today > endCivilDate || nextStartCivilDate !== undefined;
  return {
    cycleDay: endCycleDay,
    ruleId,
    confidence: isEndComplete ? "final" : "provisional",
  };
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
  const observationsByDate = new Map<CivilDate, Observation>();
  for (const observation of observations) {
    if (observation.civilDate <= today) {
      observationsByDate.set(observation.civilDate, observation);
    }
  }

  const datedObservations = [...observationsByDate.values()].sort((left, right) =>
    left.civilDate.localeCompare(right.civilDate),
  );

  const cycleStartDates = new Set<CivilDate>();
  let previousRecordedBleeding: Bleeding | undefined;
  for (const observation of datedObservations) {
    if (observation.bleeding === null) continue;
    if (
      isFullFlow(observation.bleeding) &&
      (previousRecordedBleeding === undefined || !isFullFlow(previousRecordedBleeding))
    ) {
      cycleStartDates.add(observation.civilDate);
    }
    previousRecordedBleeding = observation.bleeding;
  }

  for (const overlay of cycleOverlays) {
    if (overlay.startDate <= today) {
      cycleStartDates.add(overlay.startDate);
    }
  }

  const cycleStarts: Array<{ readonly civilDate: CivilDate }> = [...cycleStartDates]
    .sort((a, b) => a.localeCompare(b))
    .map((civilDate) => ({ civilDate }));

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

    // Compute Mucus Peak for this cycle (knowable retrospectively)
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

    // High monitor readings and Mucus change observations
    const highReadings = observationsInCycle.filter(
      (o) => o.monitorReading === "High",
    );
    const firstHighObs = highReadings[0];
    const firstHighCycleDay =
      firstHighObs !== undefined
        ? daysBetweenCivilDates(start.civilDate, firstHighObs.civilDate) + 1
        : undefined;

    const mucusChangeObservations = observationsInCycle.filter(
      (observation) => isMucusChangeFromBaseline(observation.mucus),
    );
    const firstMucusChange = mucusChangeObservations[0];
    const firstMucusChangeCycleDay =
      firstMucusChange !== undefined
        ? daysBetweenCivilDates(start.civilDate, firstMucusChange.civilDate) + 1
        : undefined;

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
        const lastMonitorPeak =
          monitorPeaks.length > 0
            ? monitorPeaks[monitorPeaks.length - 1]
            : undefined;
        const end = computePeakPlusThreeEndBoundary(
          lastMonitorPeak,
          start.civilDate,
          today,
          nextStart,
          "REG-END-1",
        );
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
        const priorCycles = getLastSixPriorMethodCycles(
          cycleStarts,
          index,
          overlaysByStartDate,
          datedObservations,
          today,
        );
        const historicalPeakCycleDays: number[] = [];

        for (const cycle of priorCycles) {
          const priorMonitorPeaks = cycle.observations.filter(
            (o) => o.monitorReading === "Peak",
          );
          for (const peak of priorMonitorPeaks) {
            const peakCycleDay =
              daysBetweenCivilDates(cycle.startDate, peak.civilDate) + 1;
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
    } else if (
      protocolFamily === "mucus_only" &&
      protocolVersion === "marquette_mucus_only_manual"
    ) {
      if (methodCycleNumber <= 6) {
        let startBoundary: FertileWindowBoundary;
        if (
          firstMucusChangeCycleDay !== undefined &&
          firstMucusChangeCycleDay < 6
        ) {
          startBoundary = {
            cycleDay: firstMucusChangeCycleDay,
            ruleId: "MUCUS-ONLY-START-3",
            confidence: "final",
          };
        } else {
          startBoundary = {
            cycleDay: 6,
            ruleId: "MUCUS-ONLY-START-1",
            confidence: "final",
          };
        }

        let endBoundary: FertileWindowBoundary | null = null;
        if (mucusPeak !== null) {
          const endCycleDay = mucusPeak.cycleDay + 3;
          const endCivilDate = civilDatePlusDays(mucusPeak.civilDate, 3);
          const isEndComplete =
            !mucusPeak.provisional &&
            (today > endCivilDate || nextStart !== undefined);
          endBoundary = {
            cycleDay: endCycleDay,
            ruleId: "MUCUS-ONLY-END-1",
            confidence: isEndComplete ? "final" : "provisional",
          };
        }

        fertileWindow = {
          start: startBoundary,
          end: endBoundary,
        };
      } else {
        // After six completed cycles under mucus_only: historical mucus peaks
        const priorCycles = getLastSixPriorMethodCycles(
          cycleStarts,
          index,
          overlaysByStartDate,
          datedObservations,
          today,
        );
        const historicalMucusPeakCycleDays: number[] = [];

        for (const cycle of priorCycles) {
          const priorPeakMucusObs = cycle.observations.filter(
            (o) => mucusCategory(o.mucus) === "Peak",
          );
          const priorLastPeakMucus = priorPeakMucusObs[priorPeakMucusObs.length - 1];
          if (priorLastPeakMucus !== undefined) {
            const peakCycleDay =
              daysBetweenCivilDates(cycle.startDate, priorLastPeakMucus.civilDate) + 1;
            historicalMucusPeakCycleDays.push(peakCycleDay);
          }
        }

        if (historicalMucusPeakCycleDays.length === 0) {
          fertileWindow = {
            start: {
              cycleDay: 6,
              ruleId: "MUCUS-ONLY-START-1",
              confidence: "final",
            },
            end: null,
          };
        } else {
          const earliestPeakLast6 = Math.min(...historicalMucusPeakCycleDays);
          const latestPeakLast6 = Math.max(...historicalMucusPeakCycleDays);
          const historicalCalendarStart = Math.max(1, earliestPeakLast6 - 6);

          let startBoundary: FertileWindowBoundary;
          if (
            firstMucusChangeCycleDay !== undefined &&
            firstMucusChangeCycleDay < historicalCalendarStart
          ) {
            startBoundary = {
              cycleDay: firstMucusChangeCycleDay,
              ruleId: "MUCUS-ONLY-START-3",
              confidence: "final",
            };
          } else {
            startBoundary = {
              cycleDay: historicalCalendarStart,
              ruleId: "MUCUS-ONLY-START-2",
              confidence: "final",
            };
          }

          let endBoundary: FertileWindowBoundary | null = null;
          if (mucusPeak !== null) {
            const endCycleDay = mucusPeak.cycleDay + 3;
            const endCivilDate = civilDatePlusDays(mucusPeak.civilDate, 3);
            const isEndComplete =
              !mucusPeak.provisional &&
              (today > endCivilDate || nextStart !== undefined);
            endBoundary = {
              cycleDay: endCycleDay,
              ruleId: "MUCUS-ONLY-END-1",
              confidence: isEndComplete ? "final" : "provisional",
            };
          } else {
            const fallbackEnd = latestPeakLast6 + 3;
            const endCivilDate = civilDatePlusDays(start.civilDate, fallbackEnd - 1);
            const isEndComplete = today > endCivilDate || nextStart !== undefined;
            endBoundary = {
              cycleDay: fallbackEnd,
              ruleId: "MUCUS-ONLY-END-2",
              confidence: isEndComplete ? "final" : "provisional",
            };
          }

          fertileWindow = {
            start: startBoundary,
            end: endBoundary,
          };
        }
      }
    } else if (
      protocolFamily === "regular_monitor_plus_mucus" &&
      protocolVersion === "marquette_regular_plus_mucus_manual"
    ) {
      const discrepancies: MarkerDiscrepancy[] = [];

      // Record start discrepancies
      if (
        firstMucusChangeCycleDay !== undefined &&
        (firstHighCycleDay === undefined || firstMucusChangeCycleDay < firstHighCycleDay)
      ) {
        discrepancies.push("mucus_fertile_before_monitor_high");
      } else if (
        firstHighCycleDay !== undefined &&
        (firstMucusChangeCycleDay === undefined || firstHighCycleDay < firstMucusChangeCycleDay)
      ) {
        discrepancies.push("monitor_high_before_mucus_change");
      }

      let startBoundary: FertileWindowBoundary;
      let latestPeakLast6: number | undefined;
      let latestPeakSource: "monitor" | "mucus" = "monitor";

      if (methodCycleNumber <= 6) {
        // In first six cycles, calendar start is Cycle Day 6
        if (
          firstMucusChangeCycleDay !== undefined &&
          firstMucusChangeCycleDay < 6 &&
          (firstHighCycleDay === undefined || firstMucusChangeCycleDay < firstHighCycleDay)
        ) {
          startBoundary = {
            cycleDay: firstMucusChangeCycleDay,
            ruleId: "MUCUS-START",
            confidence: "final",
          };
        } else if (
          firstHighCycleDay !== undefined &&
          firstHighCycleDay < 6 &&
          (firstMucusChangeCycleDay === undefined || firstHighCycleDay < firstMucusChangeCycleDay)
        ) {
          startBoundary = {
            cycleDay: firstHighCycleDay,
            ruleId: "REG-START-3",
            confidence: "final",
          };
        } else if (
          firstHighCycleDay !== undefined &&
          firstHighCycleDay < 6 &&
          firstMucusChangeCycleDay !== undefined &&
          firstHighCycleDay === firstMucusChangeCycleDay
        ) {
          startBoundary = {
            cycleDay: firstHighCycleDay,
            ruleId: "REG-START-3",
            confidence: "final",
          };
        } else {
          startBoundary = {
            cycleDay: 6,
            ruleId: "REG-START-1",
            confidence: "final",
          };
        }
      } else {
        // After six completed cycles: history uses both Monitor Peaks and Mucus Peaks
        const priorCycles = getLastSixPriorMethodCycles(
          cycleStarts,
          index,
          overlaysByStartDate,
          datedObservations,
          today,
        );
        interface HistoricalPeak {
          readonly cycleDay: number;
          readonly source: "monitor" | "mucus";
        }
        const historicalPeaks: HistoricalPeak[] = [];

        for (const cycle of priorCycles) {
          for (const peak of cycle.observations.filter((o) => o.monitorReading === "Peak")) {
            historicalPeaks.push({
              cycleDay: daysBetweenCivilDates(cycle.startDate, peak.civilDate) + 1,
              source: "monitor",
            });
          }
          const priorPeakMucusObs = cycle.observations.filter(
            (o) => mucusCategory(o.mucus) === "Peak",
          );
          const priorLastPeakMucus = priorPeakMucusObs[priorPeakMucusObs.length - 1];
          if (priorLastPeakMucus !== undefined) {
            historicalPeaks.push({
              cycleDay: daysBetweenCivilDates(cycle.startDate, priorLastPeakMucus.civilDate) + 1,
              source: "mucus",
            });
          }
        }

        if (historicalPeaks.length === 0) {
          startBoundary = {
            cycleDay: 6,
            ruleId: "REG-START-1",
            confidence: "final",
          };
        } else {
          const earliestPeak = [...historicalPeaks].sort((a, b) => a.cycleDay - b.cycleDay)[0]!;
          const latestPeak = [...historicalPeaks].sort((a, b) => b.cycleDay - a.cycleDay)[0]!;
          latestPeakLast6 = latestPeak.cycleDay;
          latestPeakSource = latestPeak.source;
          const historicalCalendarStart = Math.max(1, earliestPeak.cycleDay - 6);

          if (
            firstMucusChangeCycleDay !== undefined &&
            firstMucusChangeCycleDay < historicalCalendarStart &&
            (firstHighCycleDay === undefined || firstMucusChangeCycleDay < firstHighCycleDay)
          ) {
            startBoundary = {
              cycleDay: firstMucusChangeCycleDay,
              ruleId: "MUCUS-START",
              confidence: "final",
            };
          } else if (
            firstHighCycleDay !== undefined &&
            firstHighCycleDay < historicalCalendarStart &&
            (firstMucusChangeCycleDay === undefined || firstHighCycleDay < firstMucusChangeCycleDay)
          ) {
            startBoundary = {
              cycleDay: firstHighCycleDay,
              ruleId: "REG-START-3",
              confidence: "final",
            };
          } else if (
            firstHighCycleDay !== undefined &&
            firstHighCycleDay < historicalCalendarStart &&
            firstMucusChangeCycleDay !== undefined &&
            firstHighCycleDay === firstMucusChangeCycleDay
          ) {
            startBoundary = {
              cycleDay: firstHighCycleDay,
              ruleId: "REG-START-3",
              confidence: "final",
            };
          } else {
            startBoundary = {
              cycleDay: historicalCalendarStart,
              ruleId: earliestPeak.source === "mucus" ? "MUCUS-ONLY-START-2" : "REG-START-2",
              confidence: "final",
            };
          }
        }
      }

      // End rule: whichever Peak marker occurs last
      const hasMonitorPeak = monitorPeaks.length > 0;
      const lastMonitorPeakObs = monitorPeaks[monitorPeaks.length - 1];
      const monitorPeakCycleDay =
        lastMonitorPeakObs !== undefined
          ? daysBetweenCivilDates(start.civilDate, lastMonitorPeakObs.civilDate) + 1
          : undefined;
      const hasMucusPeak = mucusPeak !== null;
      const mucusPeakCycleDay = mucusPeak?.cycleDay;

      // Record end discrepancies
      if (hasMucusPeak && hasMonitorPeak) {
        if (mucusPeakCycleDay! > monitorPeakCycleDay!) {
          discrepancies.push("mucus_peak_after_monitor_peak");
        } else if (monitorPeakCycleDay! > mucusPeakCycleDay!) {
          discrepancies.push("monitor_peak_after_mucus_peak");
        }
      } else if (hasMucusPeak && !hasMonitorPeak) {
        discrepancies.push("no_monitor_peak_but_mucus_peak");
      } else if (hasMonitorPeak && !hasMucusPeak) {
        discrepancies.push("no_mucus_peak_but_monitor_peak");
      }

      let endBoundary: FertileWindowBoundary | null = null;
      if (hasMucusPeak && hasMonitorPeak) {
        if (mucusPeakCycleDay! > monitorPeakCycleDay!) {
          const endCycleDay = mucusPeakCycleDay! + 3;
          const endCivilDate = civilDatePlusDays(mucusPeak!.civilDate, 3);
          const isEndComplete =
            !mucusPeak!.provisional &&
            (today > endCivilDate || nextStart !== undefined);
          endBoundary = {
            cycleDay: endCycleDay,
            ruleId: "MUCUS-END",
            confidence: isEndComplete ? "final" : "provisional",
          };
        } else {
          const endCycleDay = monitorPeakCycleDay! + 3;
          const endCivilDate = civilDatePlusDays(lastMonitorPeakObs!.civilDate, 3);
          const isEndComplete =
            (!mucusPeak!.provisional || monitorPeakCycleDay! > mucusPeakCycleDay!) &&
            (today > endCivilDate || nextStart !== undefined);
          endBoundary = {
            cycleDay: endCycleDay,
            ruleId: "REG-END-1",
            confidence: isEndComplete ? "final" : "provisional",
          };
        }
      } else if (hasMucusPeak && !hasMonitorPeak) {
        const endCycleDay = mucusPeakCycleDay! + 3;
        const endCivilDate = civilDatePlusDays(mucusPeak!.civilDate, 3);
        const isEndComplete =
          !mucusPeak!.provisional &&
          (today > endCivilDate || nextStart !== undefined);
        endBoundary = {
          cycleDay: endCycleDay,
          ruleId: "MUCUS-END",
          confidence: isEndComplete ? "final" : "provisional",
        };
      } else if (hasMonitorPeak && !hasMucusPeak) {
        endBoundary = computePeakPlusThreeEndBoundary(
          lastMonitorPeakObs,
          start.civilDate,
          today,
          nextStart,
          "REG-END-1",
        );
      } else {
        // Neither peaked
        if (methodCycleNumber > 6 && latestPeakLast6 !== undefined) {
          const fallbackEnd = latestPeakLast6 + 3;
          const endCivilDate = civilDatePlusDays(start.civilDate, fallbackEnd - 1);
          const isEndComplete = today > endCivilDate || nextStart !== undefined;
          endBoundary = {
            cycleDay: fallbackEnd,
            ruleId: latestPeakSource === "mucus" ? "MUCUS-ONLY-END-2" : "REG-END-2",
            confidence: isEndComplete ? "final" : "provisional",
          };
        } else {
          endBoundary = null;
        }
      }

      fertileWindow = {
        start: startBoundary,
        end: endBoundary,
        discrepancies,
      };
    } else if (
      protocolFamily === "postpartum_cycle_zero_original" &&
      protocolVersion === "marquette_postpartum_cycle_zero_2005"
    ) {
      const daysWithHighOrPeak: number[] = [];
      if (firstHighCycleDay !== undefined) daysWithHighOrPeak.push(firstHighCycleDay);
      if (monitorPeaks.length > 0) {
        const firstPeakCycleDay =
          daysBetweenCivilDates(start.civilDate, monitorPeaks[0]!.civilDate) + 1;
        daysWithHighOrPeak.push(firstPeakCycleDay);
      }
      if (peakOverrides.length > 0) {
        const firstOverrideCycleDay =
          daysBetweenCivilDates(start.civilDate, peakOverrides[0]!.civilDate) + 1;
        daysWithHighOrPeak.push(firstOverrideCycleDay);
      }

      if (daysWithHighOrPeak.length > 0) {
        const firstHighOrPeakCycleDay = Math.min(...daysWithHighOrPeak);
        const startBoundary: FertileWindowBoundary = {
          cycleDay: firstHighOrPeakCycleDay,
          ruleId: "PP0-START",
          confidence: "final",
        };

        const endBoundary = computePeakPlusThreeEndBoundary(
          anchorPeak,
          start.civilDate,
          today,
          nextStart,
          "PP0-END",
        );

        fertileWindow = {
          start: startBoundary,
          end: endBoundary,
        };
      } else {
        fertileWindow = null;
      }
    } else if (
      protocolFamily === "postpartum_return_to_cycles" &&
      protocolVersion === "marquette_postpartum_return_to_cycles_2013"
    ) {
      const ppCycleNumber = overlay?.postpartumCycleNumber ?? 1;
      const calendarStart = Math.max(6, 11 - ppCycleNumber);

      let startBoundary: FertileWindowBoundary;
      if (firstHighCycleDay !== undefined && firstHighCycleDay < calendarStart) {
        startBoundary = {
          cycleDay: firstHighCycleDay,
          ruleId: "PP-RETURN-START-HIGH",
          confidence: "final",
        };
      } else {
        startBoundary = {
          cycleDay: calendarStart,
          ruleId: "PP-RETURN-START-1",
          confidence: "final",
        };
      }

      const endBoundary = computePeakPlusThreeEndBoundary(
        anchorPeak,
        start.civilDate,
        today,
        nextStart,
        "PP-RETURN-END-1",
      );

      fertileWindow = {
        start: startBoundary,
        end: endBoundary,
      };
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
      } else if (
        protocolFamily === "postpartum_cycle_zero_original" &&
        protocolVersion === "marquette_postpartum_cycle_zero_2005"
      ) {
        dayStatus = "infertile";
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

    return { startDate: start.civilDate, days, mucusPeak, fertileWindow };
  });

  const unassignedDays = unassignedObservations.map((observation) => ({
    civilDate: observation.civilDate,
    monitorReading: observation.monitorReading,
    markers: markersFor(observation),
  }));

  const eligibilityWarnings = evaluateEligibilityWarnings(
    cycles,
    today,
    profile,
    cycleOverlays,
  );

  return { today, cycles, unassignedDays, eligibilityWarnings };
}
