import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { Observation } from "../observations/observation";
import { applyUpdate, unrecordedObservation } from "../observations/observation";
import type { CivilDate } from "./civil-date";
import { projectChart } from "./projection";

interface GoldenFixture {
  readonly name: string;
  readonly today: CivilDate;
  readonly observations: readonly Observation[];
  readonly expected: unknown;
}

const FIXTURES_DIRECTORY = path.resolve(import.meta.dirname, "../../fixtures");

describe("projectChart golden fixtures", () => {
  it("discovers every fixture and matches its exact Chart structure", async () => {
    const fixtureFiles = (await readdir(FIXTURES_DIRECTORY))
      .filter((file) => file.endsWith(".json"))
      .sort();

    expect(fixtureFiles.length, "fixtures/ must contain at least one JSON fixture").toBeGreaterThan(
      0,
    );

    for (const fixtureFile of fixtureFiles) {
      const fixture = JSON.parse(
        await readFile(path.join(FIXTURES_DIRECTORY, fixtureFile), "utf8"),
      ) as GoldenFixture;

      expect(projectChart(fixture.observations, fixture.today), fixture.name).toEqual(
        fixture.expected,
      );
    }
  });
});

describe("Mucus Peak derivation", () => {
  const cd1 = applyUpdate(unrecordedObservation("2026-06-01"), { bleeding: "Heavy" });

  it("is null when no mucus was recorded in the Cycle", () => {
    const chart = projectChart([cd1], "2026-06-05");
    expect(chart.cycles[0]?.mucusPeak).toBeNull();
  });

  it("is null when only non-Peak mucus was recorded in the Cycle", () => {
    const day2 = applyUpdate(unrecordedObservation("2026-06-02"), { mucus: "Creamy" });
    const chart = projectChart([cd1, day2], "2026-06-05");
    expect(chart.cycles[0]?.mucusPeak).toBeNull();
  });

  it("is derived as the last day of Peak-category mucus and marked provisional when no non-Peak mucus day follows", () => {
    const day2 = applyUpdate(unrecordedObservation("2026-06-02"), { mucus: "Stretchy" });
    const chart = projectChart([cd1, day2], "2026-06-05");
    expect(chart.cycles[0]?.mucusPeak).toEqual({
      civilDate: "2026-06-02",
      cycleDay: 2,
      provisional: true,
    });
  });

  it("is marked non-provisional once a non-Peak mucus day follows it", () => {
    const peakDay = applyUpdate(unrecordedObservation("2026-06-02"), { mucus: "Stretchy" });
    const postPeakDay = applyUpdate(unrecordedObservation("2026-06-03"), { mucus: "Sticky" });
    const chart = projectChart([cd1, peakDay, postPeakDay], "2026-06-05");
    expect(chart.cycles[0]?.mucusPeak).toEqual({
      civilDate: "2026-06-02",
      cycleDay: 2,
      provisional: false,
    });
  });

  it("derives the last Peak mucus day when consecutive Peak days occur", () => {
    const peak1 = applyUpdate(unrecordedObservation("2026-06-02"), { mucus: "Stretchy" });
    const peak2 = applyUpdate(unrecordedObservation("2026-06-03"), { mucus: "Stretchy" });
    const nonPeak = applyUpdate(unrecordedObservation("2026-06-04"), { mucus: "Dry" });
    const chart = projectChart([cd1, peak1, peak2, nonPeak], "2026-06-05");
    expect(chart.cycles[0]?.mucusPeak).toEqual({
      civilDate: "2026-06-03",
      cycleDay: 3,
      provisional: false,
    });
  });
});

describe("Peak count anchoring", () => {
  const cd1 = applyUpdate(unrecordedObservation("2026-06-01"), { bleeding: "Heavy" });

  it("anchors to the last Monitor Peak of the Cycle when no override is set, not the first", () => {
    const monitorPeak1 = applyUpdate(unrecordedObservation("2026-06-03"), {
      monitorReading: "Peak",
    });
    const monitorPeak2 = applyUpdate(unrecordedObservation("2026-06-04"), {
      monitorReading: "Peak",
    });
    const chart = projectChart([cd1, monitorPeak1, monitorPeak2], "2026-06-08");
    const cycle = chart.cycles[0]!;

    const annotationsByDate = Object.fromEntries(
      cycle.days.map((d) => [d.civilDate, d.annotations]),
    );

    expect(annotationsByDate["2026-06-03"]).toEqual([]);
    expect(annotationsByDate["2026-06-04"]).toEqual(["P"]);
    expect(annotationsByDate["2026-06-05"]).toEqual(["P+1"]);
    expect(annotationsByDate["2026-06-06"]).toEqual(["P+2"]);
    expect(annotationsByDate["2026-06-07"]).toEqual(["P+3"]);
    expect(annotationsByDate["2026-06-08"]).toEqual([]);
  });

  it("anchors to the Peak override when present, superseding any Monitor Peak", () => {
    const monitorPeak1 = applyUpdate(unrecordedObservation("2026-06-03"), {
      monitorReading: "Peak",
    });
    const monitorPeak2 = applyUpdate(unrecordedObservation("2026-06-04"), {
      monitorReading: "Peak",
    });
    const override = applyUpdate(unrecordedObservation("2026-06-05"), {
      peakOverride: true,
    });
    const chart = projectChart([cd1, monitorPeak1, monitorPeak2, override], "2026-06-09");
    const cycle = chart.cycles[0]!;

    const annotationsByDate = Object.fromEntries(
      cycle.days.map((d) => [d.civilDate, d.annotations]),
    );

    expect(annotationsByDate["2026-06-03"]).toEqual([]);
    expect(annotationsByDate["2026-06-04"]).toEqual([]);
    expect(annotationsByDate["2026-06-05"]).toEqual(["P"]);
    expect(annotationsByDate["2026-06-06"]).toEqual(["P+1"]);
    expect(annotationsByDate["2026-06-07"]).toEqual(["P+2"]);
    expect(annotationsByDate["2026-06-08"]).toEqual(["P+3"]);
    expect(annotationsByDate["2026-06-09"]).toEqual([]);
  });

  it("anchors to the Peak override even when set before a Monitor Peak", () => {
    const override = applyUpdate(unrecordedObservation("2026-06-03"), {
      peakOverride: true,
    });
    const monitorPeak = applyUpdate(unrecordedObservation("2026-06-04"), {
      monitorReading: "Peak",
    });
    const chart = projectChart([cd1, override, monitorPeak], "2026-06-07");
    const cycle = chart.cycles[0]!;

    const annotationsByDate = Object.fromEntries(
      cycle.days.map((d) => [d.civilDate, d.annotations]),
    );

    expect(annotationsByDate["2026-06-03"]).toEqual(["P"]);
    expect(annotationsByDate["2026-06-04"]).toEqual(["P+1"]);
    expect(annotationsByDate["2026-06-05"]).toEqual(["P+2"]);
    expect(annotationsByDate["2026-06-06"]).toEqual(["P+3"]);
    expect(annotationsByDate["2026-06-07"]).toEqual([]);
  });
});
