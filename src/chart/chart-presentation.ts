import type { MonitorReading } from "../observations/observation";
import {
  isDayInFertileWindow,
  type ChartDay,
  type Confidence,
  type FertileWindow,
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


