import type { Observation } from "../observations/observation";
import { isFullFlow, mucusCategory } from "../observations/observation";

export const CHART_ZOOM_LEVELS = ["normal", "compact", "trend"] as const;
export type ChartZoom = (typeof CHART_ZOOM_LEVELS)[number];

export const DEFAULT_CHART_ZOOM: ChartZoom = "normal";

/**
 * Determine the CSS classes for a cell's stamp circle based on what was recorded.
 *
 * Verelle gets its own hues: Low (slate blue), High (violet), Peak (magenta),
 * Bleeding (crimson), Spotting (outline), Missed (muted outline), Error (amber).
 * Creighton's green/white/yellow stamp vocabulary is excluded.
 */
export function chartCellClass(obs: Observation | undefined): string {
  if (obs === undefined) return "stamp--empty";

  const classes: string[] = [];

  // Bleeding
  if (isFullFlow(obs.bleeding)) {
    classes.push("stamp--bleeding");
  } else if (obs.bleeding === "Spotting") {
    classes.push("stamp--spotting");
  }

  // Monitor reading takes precedence for device readings, followed by Mucus category
  const category = mucusCategory(obs.mucus);
  if (obs.peakOverride === true || obs.monitorReading === "Peak") {
    classes.push("stamp--peak");
  } else if (obs.monitorReading === "Error") {
    classes.push("stamp--error");
  } else if (obs.monitorReading === "Missed") {
    classes.push("stamp--missed");
  } else if (obs.monitorReading === "High") {
    classes.push("stamp--high");
  } else if (obs.monitorReading === "Low") {
    classes.push("stamp--low");
  } else if (category === "Peak") {
    classes.push("stamp--peak");
  } else if (category === "High") {
    classes.push("stamp--high");
  } else if (category === "Low") {
    classes.push("stamp--low");
  }

  if (obs.intercourse === true) {
    classes.push("has-intercourse");
  }

  if (classes.length === 0) {
    return "stamp--empty";
  }

  return classes.join(" ");
}
