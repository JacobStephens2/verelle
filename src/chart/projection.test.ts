import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { Observation } from "../observations/observation";
import { applyUpdate, unrecordedObservation } from "../observations/observation";
import type { CycleOverlay } from "../observations/cycle-overlay";
import { defaultCycleOverlay } from "../observations/cycle-overlay";
import type { Profile } from "../observations/profile";
import type { CivilDate } from "./civil-date";
import { projectChart } from "./projection";

interface GoldenFixture {
  readonly name: string;
  readonly today: CivilDate;
  readonly observations: readonly Observation[];
  readonly cycleOverlays?: readonly CycleOverlay[];
  readonly profile?: Profile;
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
      const filePath = path.join(FIXTURES_DIRECTORY, fixtureFile);
      const fixture = JSON.parse(
        await readFile(filePath, "utf8"),
      ) as GoldenFixture;

      const projected = projectChart(
        fixture.observations,
        fixture.today,
        fixture.cycleOverlays ?? [],
        fixture.profile ?? null,
      );

      expect(projected, fixture.name).toEqual(fixture.expected);
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

describe("Fertile window computation (regular_monitor, first six cycles)", () => {
  const cd1Date = "2026-06-01";
  const cd1 = applyUpdate(unrecordedObservation(cd1Date), { bleeding: "Heavy" });
  const regularOverlay: CycleOverlay = {
    ...defaultCycleOverlay(cd1Date),
    protocolFamily: "regular_monitor",
    protocolVersion: "marquette_regular_manual_public",
  };

  it("produces no fertile window and dayStatus null when no protocol family is chosen", () => {
    const chart = projectChart([cd1], "2026-06-10", []);
    const cycle = chart.cycles[0]!;
    expect(cycle.fertileWindow).toBeNull();
    for (const day of cycle.days) {
      expect(day.dayStatus).toBeNull();
    }
  });

  it("opens the fertile window on Cycle Day 6 with REG-START-1 for first six cycles under regular_monitor", () => {
    const chart = projectChart([cd1], "2026-06-05", [regularOverlay]);
    const cycle = chart.cycles[0]!;
    expect(cycle.fertileWindow).not.toBeNull();
    expect(cycle.fertileWindow?.start).toEqual({
      cycleDay: 6,
      ruleId: "REG-START-1",
      confidence: "final",
    });
  });

  it("closes the fertile window three full days after the last Monitor Peak with REG-END-1 and final confidence when complete", () => {
    const peak1 = applyUpdate(unrecordedObservation("2026-06-13"), { monitorReading: "Peak" }); // CD 13
    const peak2 = applyUpdate(unrecordedObservation("2026-06-14"), { monitorReading: "Peak" }); // CD 14 (last peak)
    // Last peak CD14 + 3 full days = CD17 (2026-06-17)
    // Today is 2026-06-20 (after CD17, so peak count is complete)
    const chart = projectChart([cd1, peak1, peak2], "2026-06-20", [regularOverlay]);
    const cycle = chart.cycles[0]!;

    expect(cycle.fertileWindow).toEqual({
      start: {
        cycleDay: 6,
        ruleId: "REG-START-1",
        confidence: "final",
      },
      end: {
        cycleDay: 17,
        ruleId: "REG-END-1",
        confidence: "final",
      },
    });

    // Days 1..5 infertile, 6..17 fertile, 18..20 infertile
    const statusesByDay = Object.fromEntries(
      cycle.days.map((d) => [d.cycleDay, d.dayStatus]),
    );
    for (let cycleDay = 1; cycleDay <= 5; cycleDay += 1) {
      expect(statusesByDay[cycleDay], `Cycle Day ${cycleDay}`).toBe("infertile");
    }
    for (let cycleDay = 6; cycleDay <= 17; cycleDay += 1) {
      expect(statusesByDay[cycleDay], `Cycle Day ${cycleDay}`).toBe("fertile");
    }
    for (let cycleDay = 18; cycleDay <= 20; cycleDay += 1) {
      expect(statusesByDay[cycleDay], `Cycle Day ${cycleDay}`).toBe("infertile");
    }
  });

  it("marks the end boundary provisional while Peak count is still incomplete", () => {
    // Peak on CD14 (2026-06-14). Today is 2026-06-15 (P+1, CD15 <= CD17).
    const peak = applyUpdate(unrecordedObservation("2026-06-14"), { monitorReading: "Peak" });
    const chart = projectChart([cd1, peak], "2026-06-15", [regularOverlay]);
    const cycle = chart.cycles[0]!;

    expect(cycle.fertileWindow?.end).toEqual({
      cycleDay: 17,
      ruleId: "REG-END-1",
      confidence: "provisional",
    });
  });

  it("stays fertile through to the next bleeding when no Monitor Peak occurs in the first six cycles", () => {
    // Cycle 1 from 2026-06-01 to 2026-06-25 with no Peak.
    const cd5 = applyUpdate(unrecordedObservation("2026-06-05"), { bleeding: "None" });
    // Cycle 2 starts on 2026-06-26.
    const cd1Cycle2 = applyUpdate(unrecordedObservation("2026-06-26"), { bleeding: "Heavy" });
    const chart = projectChart([cd1, cd5, cd1Cycle2], "2026-06-28", [regularOverlay]);
    const cycle1 = chart.cycles[0]!;

    // Does not invent an end date: end is null
    expect(cycle1.fertileWindow).toEqual({
      start: {
        cycleDay: 6,
        ruleId: "REG-START-1",
        confidence: "final",
      },
      end: null,
    });

    // All days from Cycle Day 6 to end of cycle 1 (Cycle Day 25) are fertile
    const statusesByDay = Object.fromEntries(
      cycle1.days.map((d) => [d.cycleDay, d.dayStatus]),
    );
    for (let cycleDay = 1; cycleDay <= 5; cycleDay += 1) {
      expect(statusesByDay[cycleDay], `Cycle Day ${cycleDay}`).toBe("infertile");
    }
    for (let cycleDay = 6; cycleDay <= 25; cycleDay += 1) {
      expect(statusesByDay[cycleDay], `Cycle Day ${cycleDay}`).toBe("fertile");
    }
  });

  it("does not count cycles without a protocol family toward the first six method cycles", () => {
    // Cycle 1 starts 2026-05-01 (no overlay / no protocol family)
    const cycle1Cd1 = applyUpdate(unrecordedObservation("2026-05-01"), { bleeding: "Heavy" });
    const cycle1Cd5 = applyUpdate(unrecordedObservation("2026-05-05"), { bleeding: "None" });

    // Cycle 2 starts 2026-06-01 (regular_monitor - this is method cycle 1!)
    const cycle2Cd1 = applyUpdate(unrecordedObservation("2026-06-01"), { bleeding: "Heavy" });
    const overlay = {
      ...defaultCycleOverlay("2026-06-01"),
      protocolFamily: "regular_monitor" as const,
      protocolVersion: "marquette_regular_manual_public" as const,
    };

    const chart = projectChart([cycle1Cd1, cycle1Cd5, cycle2Cd1], "2026-06-10", [overlay]);
    expect(chart.cycles).toHaveLength(2);
    expect(chart.cycles[0]!.fertileWindow).toBeNull();
    // Cycle 2 is method cycle 1, so it opens on Cycle Day 6 under regular_monitor
    expect(chart.cycles[1]!.fertileWindow).toEqual({
      start: {
        cycleDay: 6,
        ruleId: "REG-START-1",
        confidence: "final",
      },
      end: null,
    });
  });
});

