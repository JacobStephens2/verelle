import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

import type { Observation } from "../observations/observation";
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

  it("determines cell presentation class from recorded observations", () => {
    const makeObs = (partial: Partial<Observation>): Observation => ({
      civilDate: "2026-09-04",
      monitorReading: null,
      bleeding: null,
      peakOverride: null,
      intercourse: null,
      lhStrip: null,
      mucus: null,
      temperature: null,
      temperatureUnit: null,
      note: null,
      ...partial,
    });

    // Unrecorded / empty day -> empty
    expect(chartCellClass(undefined)).toBe("stamp--empty");
    expect(chartCellClass(makeObs({}))).toBe("stamp--empty");

    // Bleeding
    expect(chartCellClass(makeObs({ bleeding: "Heavy" }))).toContain("stamp--bleeding");
    expect(chartCellClass(makeObs({ bleeding: "Moderate" }))).toContain("stamp--bleeding");
    expect(chartCellClass(makeObs({ bleeding: "Light" }))).toContain("stamp--bleeding");
    expect(chartCellClass(makeObs({ bleeding: "Spotting" }))).toContain("stamp--spotting");

    // Peak: Monitor Peak, Peak override, or Peak mucus
    expect(chartCellClass(makeObs({ monitorReading: "Peak" }))).toContain("stamp--peak");
    expect(chartCellClass(makeObs({ peakOverride: true }))).toContain("stamp--peak");
    expect(chartCellClass(makeObs({ mucus: "Stretchy" }))).toContain("stamp--peak");

    // High: Monitor High or High mucus
    expect(chartCellClass(makeObs({ monitorReading: "High" }))).toContain("stamp--high");
    expect(chartCellClass(makeObs({ mucus: "Creamy" }))).toContain("stamp--high");

    // Low: Monitor Low or Low mucus
    expect(chartCellClass(makeObs({ monitorReading: "Low" }))).toContain("stamp--low");
    expect(chartCellClass(makeObs({ mucus: "Dry" }))).toContain("stamp--low");

    // Missed and Error
    expect(chartCellClass(makeObs({ monitorReading: "Missed" }))).toContain("stamp--missed");
    expect(chartCellClass(makeObs({ monitorReading: "Error" }))).toContain("stamp--error");

    // Intercourse adds has-intercourse
    expect(chartCellClass(makeObs({ intercourse: true }))).toContain("has-intercourse");

    // Both bleeding and reading recorded on same day: both classes present
    const both = chartCellClass(makeObs({ bleeding: "Heavy", monitorReading: "High" }));
    expect(both).toContain("stamp--bleeding");
    expect(both).toContain("stamp--high");
  });
});
