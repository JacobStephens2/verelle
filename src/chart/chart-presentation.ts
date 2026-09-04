import type { Intention } from "../observations/cycle-overlay";
import type { MonitorReading, MucusCategory } from "../observations/observation";
import {
  isDayInFertileWindow,
  type ChartDay,
  type Confidence,
  type FertileWindow,
  type MucusPeak,
} from "./projection";

export const CHART_ZOOM_LEVELS = ["normal", "compact", "trend"] as const;
export type ChartZoom = (typeof CHART_ZOOM_LEVELS)[number];

export const DEFAULT_CHART_ZOOM: ChartZoom = "normal";

const READING_CLASSES: Record<MonitorReading, string> = {
  Low: "stamp--low",
  High: "stamp--high",
  Peak: "stamp--peak",
  Missed: "stamp--missed",
  Error: "stamp--error",
};

/**
 * Determine the CSS classes for a cell's stamp circle based on the projected ChartDay.
 *
 * Verelle gets its own hues: Low (slate blue), High (violet), Peak (magenta),
 * Missed (muted outline), Error (amber).
 * Creighton's green/white/yellow stamp vocabulary is excluded.
 */
export function chartCellClass(day: ChartDay | undefined): string {
  if (day === undefined || day.markers.length === 0) {
    return "stamp--empty";
  }

  if (day.markers.includes("peak_override") || day.monitorReading === "Peak") {
    return "stamp--peak";
  }

  if (day.monitorReading !== null) {
    return READING_CLASSES[day.monitorReading] ?? "stamp--empty";
  }

  return "stamp--recorded";
}

export interface FertileBandCellPresentation {
  readonly inFertileWindow: boolean;
  readonly isFertileStart: boolean;
  readonly isFertileEnd: boolean;
  readonly startConfidence?: Confidence;
  readonly endConfidence?: Confidence;
  readonly classes: readonly string[];
}

/**
 * Determine the fertile window band presentation classes and edges for a cell.
 *
 * Renders as a continuous band behind the Cycle row with marked start and end edges.
 * Solid edge when final, dashed when provisional or when no published end rule applies (`CONTEXT.md`).
 */
export function fertileBandPresentation(
  cycleDay: number | undefined,
  fertileWindow: FertileWindow | null | undefined,
  lastCycleDay: number,
): FertileBandCellPresentation {
  if (cycleDay === undefined || !fertileWindow) {
    return {
      inFertileWindow: false,
      isFertileStart: false,
      isFertileEnd: false,
      classes: [],
    };
  }

  const inFertileWindow = isDayInFertileWindow(cycleDay, fertileWindow, lastCycleDay);
  if (!inFertileWindow) {
    return {
      inFertileWindow: false,
      isFertileStart: false,
      isFertileEnd: false,
      classes: [],
    };
  }

  const startCycleDay = fertileWindow.start.cycleDay;
  const endCycleDay = fertileWindow.end?.cycleDay ?? lastCycleDay;

  const isFertileStart = cycleDay === startCycleDay;
  const isFertileEnd = cycleDay === endCycleDay;
  const startConfidence = isFertileStart ? fertileWindow.start.confidence : undefined;
  const endConfidence = isFertileEnd
    ? (fertileWindow.end ? fertileWindow.end.confidence : "provisional")
    : undefined;

  const classes: string[] = ["chart__cell--fertile"];
  if (isFertileStart) {
    classes.push("chart__cell--fertile-start");
    if (startConfidence === "provisional") {
      classes.push("chart__cell--provisional-start");
    }
  }
  if (isFertileEnd) {
    classes.push("chart__cell--fertile-end");
    if (endConfidence === "provisional") {
      classes.push("chart__cell--provisional-end");
    }
  }

  return {
    inFertileWindow: true,
    isFertileStart,
    isFertileEnd,
    startConfidence,
    endConfidence,
    classes,
  };
}

/**
 * Whether a day is a High or Peak fertility day pointed to by the method (`CONTEXT.md`).
 *
 * Under Marquette instructions, achieving pregnancy targets High and Peak days
 * within the fertile window. Readings outside the fertile window are not targeted.
 */
export function isHighOrPeakDay(
  day: ChartDay | undefined,
  mucusPeak?: MucusPeak | null,
  mucusCategory?: MucusCategory | null,
): boolean {
  if (!day || day.dayStatus !== "fertile") return false;
  if (day.monitorReading === "High" || day.monitorReading === "Peak") return true;
  if (day.markers.includes("peak_override")) return true;
  if (mucusPeak && mucusPeak.cycleDay === day.cycleDay) return true;
  if (mucusCategory === "High" || mucusCategory === "Peak") return true;
  return false;
}

/**
 * Whether a day should receive achieving emphasis under an achieving Intention (`CONTEXT.md`, Issue #41).
 */
export function isAchievingHighlight(
  day: ChartDay | undefined,
  intention: Intention | null | undefined,
  mucusPeak?: MucusPeak | null,
  mucusCategory?: MucusCategory | null,
): boolean {
  if (intention !== "achieve") return false;
  return isHighOrPeakDay(day, mucusPeak, mucusCategory);
}


