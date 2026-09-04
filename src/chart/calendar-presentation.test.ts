import { describe, expect, it } from "vitest";

import { projectChart } from "./projection";
import { defaultCycleOverlay } from "../observations/cycle-overlay";
import { applyUpdate, unrecordedObservation } from "../observations/observation";
import {
  calendarDayPresentation,
  calendarMarkerClass,
  calendarMarkerLabel,
} from "./calendar-presentation";

describe("calendarDayPresentation", () => {
  const cd1 = applyUpdate(unrecordedObservation("2026-09-01"), { bleeding: "Heavy" });
  const cd6 = applyUpdate(unrecordedObservation("2026-09-06"), { monitorReading: "Low" });
  const cd11 = applyUpdate(unrecordedObservation("2026-09-11"), { monitorReading: "High" });
  const cd14 = applyUpdate(unrecordedObservation("2026-09-14"), {
    monitorReading: "Peak",
    intercourse: true,
  });
  const cd18 = applyUpdate(unrecordedObservation("2026-09-18"), { monitorReading: "Missed" });
  const cd19 = applyUpdate(unrecordedObservation("2026-09-19"), { monitorReading: "Error" });
  const cd22 = applyUpdate(unrecordedObservation("2026-09-22"), {
    peakOverride: true,
    monitorReading: "High",
  });
  const cd25 = applyUpdate(unrecordedObservation("2026-09-25"), {
    mucus: "clear and stretchy like egg white",
  });

  const overlay = {
    ...defaultCycleOverlay("2026-09-01"),
    protocolFamily: "regular_monitor" as const,
    protocolVersion: "marquette_regular_manual_public" as const,
  };

  const chart = projectChart(
    [cd1, cd6, cd11, cd14, cd18, cd19, cd22, cd25],
    "2026-09-14",
    [overlay],
  );

  it("identifies empty and unrecorded days", () => {
    const pres = calendarDayPresentation("2026-09-05", chart, null, "2026-09-14");
    expect(pres.civilDate).toBe("2026-09-05");
    expect(pres.dayNumber).toBe(5);
    expect(pres.hasObservation).toBe(false);
    expect(pres.isToday).toBe(false);
    expect(pres.isCycleStart).toBe(false);
    expect(pres.cycleDay).toBe(5);
    expect(pres.hasIntercourse).toBe(false);
    expect(pres.markerClass).toBe("");
    expect(pres.markerLabel).toBe("");
  });

  it("identifies cycle start date (Cycle Day 1)", () => {
    const pres = calendarDayPresentation("2026-09-01", chart, cd1, "2026-09-14");
    expect(pres.isCycleStart).toBe(true);
    expect(pres.cycleDay).toBe(1);
    expect(pres.hasObservation).toBe(true);
    expect(pres.markerClass).toBe("calendar-stamp--bleeding");
  });

  it("maps Monitor readings to Verelle palette classes and labels", () => {
    // Low
    expect(calendarMarkerClass(cd6)).toBe("calendar-stamp--low");
    expect(calendarMarkerLabel(cd6)).toBe("L");

    // High
    expect(calendarMarkerClass(cd11)).toBe("calendar-stamp--high");
    expect(calendarMarkerLabel(cd11)).toBe("H");

    // Peak
    expect(calendarMarkerClass(cd14)).toBe("calendar-stamp--peak");
    expect(calendarMarkerLabel(cd14)).toBe("P");

    // Missed
    expect(calendarMarkerClass(cd18)).toBe("calendar-stamp--missed");
    expect(calendarMarkerLabel(cd18)).toBe("M");

    // Error
    expect(calendarMarkerClass(cd19)).toBe("calendar-stamp--error");
    expect(calendarMarkerLabel(cd19)).toBe("E");
  });

  it("renders Peak marker for peak override", () => {
    expect(calendarMarkerClass(cd22)).toBe("calendar-stamp--peak");
    expect(calendarMarkerLabel(cd22)).toBe("P");
  });

  it("renders recorded marker for observation without monitor reading or bleeding", () => {
    expect(calendarMarkerClass(cd25)).toBe("calendar-stamp--recorded");
  });

  it("identifies intercourse and today", () => {
    const pres = calendarDayPresentation("2026-09-14", chart, cd14, "2026-09-14");
    expect(pres.isToday).toBe(true);
    expect(pres.hasIntercourse).toBe(true);
    expect(pres.cycleDay).toBe(14);
    expect(pres.markerClass).toBe("calendar-stamp--peak");
    expect(pres.markerLabel).toBe("P");
  });

  it("formats accessible aria-label with date, cycle day, monitor reading, and intercourse", () => {
    const pres = calendarDayPresentation("2026-09-14", chart, cd14, "2026-09-14");
    expect(pres.ariaLabel).toContain("2026-09-14");
    expect(pres.ariaLabel).toContain("Cycle Day 14");
    expect(pres.ariaLabel).toContain("Monitor reading Peak");
    expect(pres.ariaLabel).toContain("Intercourse recorded");
    expect(pres.ariaLabel).not.toMatch(/safe|unsafe|should/i);
  });

  it("identifies bleeding across recorded days", () => {
    const presCd1 = calendarDayPresentation("2026-09-01", chart, cd1, "2026-09-14");
    expect(presCd1.hasBleeding).toBe(true);

    const presCd6 = calendarDayPresentation("2026-09-06", chart, cd6, "2026-09-14");
    expect(presCd6.hasBleeding).toBe(false);
  });
});
