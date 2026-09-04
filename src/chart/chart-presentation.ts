import type { MonitorReading } from "../observations/observation";
import type { ChartDay } from "./projection";

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

