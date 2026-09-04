import type { CivilDate } from "./civil-date";
import type { Chart, ChartDay, DayStatus } from "./projection";
import type { MonitorReading, Observation } from "../observations/observation";
import { isRecorded } from "../observations/observation";

export interface CalendarDayPresentation {
  readonly civilDate: CivilDate;
  readonly dayNumber: number;
  readonly isToday: boolean;
  readonly isCycleStart: boolean;
  readonly cycleDay?: number;
  readonly hasObservation: boolean;
  readonly hasIntercourse: boolean;
  readonly hasBleeding: boolean;
  readonly markerClass: string;
  readonly markerLabel: string;
  readonly dayStatus: DayStatus | null;
  readonly inFertileWindow: boolean;
  readonly ariaLabel: string;
}

export interface CalendarMarkerPresentation {
  readonly markerClass: string;
  readonly markerLabel: string;
}

const READING_MARKER_CLASSES: Record<MonitorReading, string> = {
  Low: "calendar-stamp--low",
  High: "calendar-stamp--high",
  Peak: "calendar-stamp--peak",
  Missed: "calendar-stamp--missed",
  Error: "calendar-stamp--error",
};

const READING_MARKER_LABELS: Record<MonitorReading, string> = {
  Low: "L",
  High: "H",
  Peak: "P",
  Missed: "M",
  Error: "E",
};

export function calendarMarker(observation: Observation | null | undefined): CalendarMarkerPresentation {
  if (!observation || !isRecorded(observation)) {
    return { markerClass: "", markerLabel: "" };
  }

  if (observation.peakOverride || observation.monitorReading === "Peak") {
    return { markerClass: "calendar-stamp--peak", markerLabel: "P" };
  }

  if (observation.monitorReading !== null) {
    return {
      markerClass: READING_MARKER_CLASSES[observation.monitorReading] ?? "",
      markerLabel: READING_MARKER_LABELS[observation.monitorReading] ?? "",
    };
  }

  if (observation.bleeding !== null && observation.bleeding !== "None") {
    return { markerClass: "calendar-stamp--bleeding", markerLabel: "" };
  }

  return { markerClass: "calendar-stamp--recorded", markerLabel: "" };
}

export function calendarMarkerClass(observation: Observation | null | undefined): string {
  return calendarMarker(observation).markerClass;
}

export function calendarMarkerLabel(observation: Observation | null | undefined): string {
  return calendarMarker(observation).markerLabel;
}

export function calendarDayPresentation(
  date: CivilDate,
  chart: Chart,
  observation: Observation | null | undefined,
  today: CivilDate,
): CalendarDayPresentation {
  const parts = date.split("-").map(Number);
  const dayNumber = parts[2] ?? 1;

  let foundChartDay: ChartDay | undefined;
  let isCycleStart = false;
  let inFertileWindow = false;

  for (const cycle of chart.cycles) {
    if (cycle.startDate === date) {
      isCycleStart = true;
    }
    const day = cycle.days.find((d) => d.civilDate === date);
    if (day) {
      foundChartDay = day;
      if (day.dayStatus === "fertile") {
        inFertileWindow = true;
      }
      break;
    }
  }

  const hasObs = isRecorded(observation);
  const hasIntercourse = Boolean(observation?.intercourse);
  const hasBleeding = Boolean(observation?.bleeding && observation.bleeding !== "None");
  const isToday = date === today;
  const { markerClass, markerLabel } = calendarMarker(observation);

  // Build accessible ariaLabel
  const ariaParts = [date];
  if (foundChartDay) {
    ariaParts.push(`Cycle Day ${foundChartDay.cycleDay}`);
  }
  if (foundChartDay?.dayStatus) {
    ariaParts.push(`Day status ${foundChartDay.dayStatus}`);
  }
  if (observation?.monitorReading) {
    ariaParts.push(`Monitor reading ${observation.monitorReading}`);
  } else if (observation?.peakOverride) {
    ariaParts.push("Peak override");
  } else if (observation?.bleeding) {
    ariaParts.push(`Bleeding ${observation.bleeding}`);
  }
  if (hasIntercourse) {
    ariaParts.push("Intercourse recorded");
  }

  return {
    civilDate: date,
    dayNumber,
    isToday,
    isCycleStart,
    cycleDay: foundChartDay?.cycleDay,
    hasObservation: hasObs,
    hasIntercourse,
    hasBleeding,
    markerClass,
    markerLabel,
    dayStatus: foundChartDay?.dayStatus ?? null,
    inFertileWindow,
    ariaLabel: ariaParts.join(", "),
  };
}
