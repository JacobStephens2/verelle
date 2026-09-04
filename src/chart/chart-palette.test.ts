import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { ChartDay } from "./projection";
import { chartCellClass, CHART_ZOOM_LEVELS } from "./chart-presentation";

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
});
