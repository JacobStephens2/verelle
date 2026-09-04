import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { ChartDay } from "./projection";
import {
  chartCellClass,
  CHART_ZOOM_LEVELS,
  fertileBandPresentation,
  isAchievingHighlight,
  isHighOrPeakDay,
} from "./chart-presentation";

const REPO_ROOT = path.resolve(import.meta.dirname, "../..");

describe("Chart presentation and palette", () => {
  it("defines Verelle's own palette and excludes Creighton stamp colors for Low/High/Peak", async () => {
    // Read chart stylesheet
    const cssPath = path.join(REPO_ROOT, "src", "styles", "chart.css");
    const css = await readFile(cssPath, "utf8");

    // Must define Verelle stamp color tokens
    expect(css).toContain("--verelle-stamp-bleeding");
    expect(css).toContain("--verelle-stamp-low");
    expect(css).toContain("--verelle-stamp-high");
    expect(css).toContain("--verelle-stamp-peak");
    expect(css).toContain("--verelle-stamp-missed");
    expect(css).toContain("--verelle-stamp-error");

    // Creighton stamp colors must NOT be used for Marquette Low/High/Peak
    // Chart35 Creighton colors:
    // green = #4f7b63, yellow = #dfc26b, white = #fffdfb
    const creightonColors = ["#4f7b63", "#dfc26b", "#fffdfb"];
    for (const color of creightonColors) {
      expect(css.toLowerCase()).not.toContain(`--verelle-stamp-low: ${color}`);
      expect(css.toLowerCase()).not.toContain(`--verelle-stamp-high: ${color}`);
      expect(css.toLowerCase()).not.toContain(`--verelle-stamp-peak: ${color}`);
    }
  });

  it("supports three zoom levels: normal, compact, trend", () => {
    expect(CHART_ZOOM_LEVELS).toEqual(["normal", "compact", "trend"]);
  });

  it("determines cell presentation class from projected chart days", () => {
    const makeDay = (partial: Partial<ChartDay>): ChartDay => ({
      civilDate: "2026-09-04",
      cycleDay: 1,
      monitorReading: null,
      markers: [],
      annotations: [],
      dayStatus: null,
      ...partial,
    });

    // Unrecorded / empty day -> empty
    expect(chartCellClass(undefined)).toBe("stamp--empty");
    expect(chartCellClass(makeDay({}))).toBe("stamp--empty");

    // Monitor readings
    expect(chartCellClass(makeDay({ monitorReading: "Low", markers: ["monitor"] }))).toBe("stamp--low");
    expect(chartCellClass(makeDay({ monitorReading: "High", markers: ["monitor"] }))).toBe("stamp--high");
    expect(chartCellClass(makeDay({ monitorReading: "Peak", markers: ["monitor"] }))).toBe("stamp--peak");
    expect(chartCellClass(makeDay({ monitorReading: "Missed", markers: ["monitor"] }))).toBe("stamp--missed");
    expect(chartCellClass(makeDay({ monitorReading: "Error", markers: ["monitor"] }))).toBe("stamp--error");

    // Peak override
    expect(chartCellClass(makeDay({ monitorReading: "High", markers: ["monitor", "peak_override"] }))).toBe("stamp--peak");

    // Observation recorded without monitor reading
    expect(chartCellClass(makeDay({ markers: ["bleeding"] }))).toBe("stamp--recorded");
    expect(chartCellClass(makeDay({ markers: ["mucus"] }))).toBe("stamp--recorded");
  });

  it("defines palette and styling for the Fertile window continuous band behind the Cycle row", async () => {
    const cssPath = path.join(REPO_ROOT, "src", "styles", "chart.css");
    const css = await readFile(cssPath, "utf8");

    // Palette tokens
    expect(css).toContain("--verelle-fertile-band");
    expect(css).toContain("--verelle-fertile-boundary");

    // Continuous band styles
    expect(css).toContain(".chart__cell--fertile");
    expect(css).toContain(".chart__cell--fertile-start");
    expect(css).toContain(".chart__cell--fertile-end");
    expect(css).toContain(".chart__cell--provisional-start");
    expect(css).toContain(".chart__cell--provisional-end");
  });

  it("computes fertile band presentation classes and edges for cells", () => {
    const closedWindow = {
      start: { cycleDay: 6, ruleId: "REG-START-1", confidence: "final" as const },
      end: { cycleDay: 17, ruleId: "REG-END-1", confidence: "final" as const },
    };

    // Cycle with no protocol chosen (fertileWindow is null) -> no band
    expect(fertileBandPresentation(6, null, 25).classes).toEqual([]);
    expect(fertileBandPresentation(6, null, 25).inFertileWindow).toBe(false);

    // Days before window
    expect(fertileBandPresentation(5, closedWindow, 25).inFertileWindow).toBe(false);
    expect(fertileBandPresentation(5, closedWindow, 25).classes).toEqual([]);

    // Start day (CD6, final confidence)
    const startPres = fertileBandPresentation(6, closedWindow, 25);
    expect(startPres.inFertileWindow).toBe(true);
    expect(startPres.isFertileStart).toBe(true);
    expect(startPres.isFertileEnd).toBe(false);
    expect(startPres.classes).toContain("chart__cell--fertile");
    expect(startPres.classes).toContain("chart__cell--fertile-start");
    expect(startPres.classes).not.toContain("chart__cell--provisional-start");

    // Mid-window day (CD10)
    const midPres = fertileBandPresentation(10, closedWindow, 25);
    expect(midPres.inFertileWindow).toBe(true);
    expect(midPres.isFertileStart).toBe(false);
    expect(midPres.isFertileEnd).toBe(false);
    expect(midPres.classes).toEqual(["chart__cell--fertile"]);

    // End day (CD17, final confidence -> solid edge)
    const endPres = fertileBandPresentation(17, closedWindow, 25);
    expect(endPres.inFertileWindow).toBe(true);
    expect(endPres.isFertileEnd).toBe(true);
    expect(endPres.classes).toContain("chart__cell--fertile-end");
    expect(endPres.classes).not.toContain("chart__cell--provisional-end");

    // Day after window
    expect(fertileBandPresentation(18, closedWindow, 25).inFertileWindow).toBe(false);

    // Provisional end boundary (e.g. today <= CD17)
    const provisionalWindow = {
      start: { cycleDay: 6, ruleId: "REG-START-1", confidence: "final" as const },
      end: { cycleDay: 17, ruleId: "REG-END-1", confidence: "provisional" as const },
    };
    const provEndPres = fertileBandPresentation(17, provisionalWindow, 25);
    expect(provEndPres.isFertileEnd).toBe(true);
    expect(provEndPres.classes).toContain("chart__cell--fertile-end");
    expect(provEndPres.classes).toContain("chart__cell--provisional-end");

    // Open-ended window (no Peak in cycle -> end is null)
    const noPeakWindow = {
      start: { cycleDay: 6, ruleId: "REG-START-1", confidence: "final" as const },
      end: null,
    };
    // Middle day CD15
    expect(fertileBandPresentation(15, noPeakWindow, 24).inFertileWindow).toBe(true);
    // Last cycle day (CD24) renders as the provisional end edge
    const noPeakLastPres = fertileBandPresentation(24, noPeakWindow, 24);
    expect(noPeakLastPres.inFertileWindow).toBe(true);
    expect(noPeakLastPres.isFertileEnd).toBe(true);
    expect(noPeakLastPres.classes).toContain("chart__cell--fertile-end");
    expect(noPeakLastPres.classes).toContain("chart__cell--provisional-end");
  });

  it("identifies High and Peak days pointed to by the method", () => {
    const makeDay = (partial: Partial<ChartDay>): ChartDay => ({
      civilDate: "2026-06-10",
      cycleDay: 10,
      monitorReading: null,
      markers: [],
      annotations: [],
      dayStatus: "fertile",
      ...partial,
    });

    expect(isHighOrPeakDay(undefined)).toBe(false);
    expect(isHighOrPeakDay(makeDay({ monitorReading: "Low" }))).toBe(false);
    expect(isHighOrPeakDay(makeDay({ monitorReading: "Missed" }))).toBe(false);
    expect(isHighOrPeakDay(makeDay({ monitorReading: "Error" }))).toBe(false);
    expect(isHighOrPeakDay(makeDay({ monitorReading: null, markers: ["bleeding"] }))).toBe(false);

    // High and Peak readings within fertile window
    expect(isHighOrPeakDay(makeDay({ monitorReading: "High", markers: ["monitor"] }))).toBe(true);
    expect(isHighOrPeakDay(makeDay({ monitorReading: "Peak", markers: ["monitor"] }))).toBe(true);

    // High/Peak readings outside fertile window are not targeted by the method
    expect(
      isHighOrPeakDay(makeDay({ monitorReading: "High", markers: ["monitor"], dayStatus: "infertile" })),
    ).toBe(false);
    expect(
      isHighOrPeakDay(makeDay({ monitorReading: "Peak", markers: ["monitor"], dayStatus: null })),
    ).toBe(false);

    // Peak override within fertile window
    expect(isHighOrPeakDay(makeDay({ markers: ["peak_override"] }))).toBe(true);

    // Mucus category High or Peak within fertile window
    expect(isHighOrPeakDay(makeDay({}), null, "High")).toBe(true);
    expect(isHighOrPeakDay(makeDay({}), null, "Peak")).toBe(true);
    expect(isHighOrPeakDay(makeDay({}), null, "Low")).toBe(false);

    // Mucus Peak
    const mucusPeak = { civilDate: "2026-06-14", cycleDay: 14, provisional: false };
    expect(isHighOrPeakDay(makeDay({ cycleDay: 14 }), mucusPeak)).toBe(true);
    expect(isHighOrPeakDay(makeDay({ cycleDay: 13 }), mucusPeak)).toBe(false);
  });

  it("highlights High and Peak days only when Intention is achieve", () => {
    const highDay: ChartDay = {
      civilDate: "2026-06-11",
      cycleDay: 11,
      monitorReading: "High",
      markers: ["monitor"],
      annotations: [],
      dayStatus: "fertile",
    };
    const lowDay: ChartDay = {
      civilDate: "2026-06-06",
      cycleDay: 6,
      monitorReading: "Low",
      markers: ["monitor"],
      annotations: [],
      dayStatus: "fertile",
    };

    // Under avoid: never highlights High or Low days
    expect(isAchievingHighlight(highDay, "avoid")).toBe(false);
    expect(isAchievingHighlight(lowDay, "avoid")).toBe(false);
    expect(isAchievingHighlight(highDay, null)).toBe(false);
    expect(isAchievingHighlight(highDay, undefined)).toBe(false);

    // Under achieve: highlights High day, but not Low day
    expect(isAchievingHighlight(highDay, "achieve")).toBe(true);
    expect(isAchievingHighlight(lowDay, "achieve")).toBe(false);
  });

  it("defines achieving emphasis CSS styles for cycle row and highlighted High/Peak stamps", async () => {
    const cssPath = path.join(REPO_ROOT, "src", "styles", "chart.css");
    const css = await readFile(cssPath, "utf8");

    expect(css).toContain(".cycle-row--achieve");
    expect(css).toContain(".chart__cell--highlight");
    expect(css).toContain(".stamp--highlight");
  });
});

