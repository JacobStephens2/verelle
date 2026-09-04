import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { describe, expect, it } from "vitest";

import type { Observation } from "../observations/observation";
import { applyUpdate, unrecordedObservation } from "../observations/observation";
import type { CycleOverlay } from "../observations/cycle-overlay";
import { defaultCycleOverlay } from "../observations/cycle-overlay";
import type { Profile } from "../observations/profile";
import { defaultProfile } from "../observations/profile";
import type { CivilDate } from "./civil-date";
import { civilDatePlusDays } from "./civil-date";
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

describe("Fertile window computation (regular_monitor, after six cycles: the history rules)", () => {
  const cycleStartDates = [
    "2026-01-01",
    "2026-01-29",
    "2026-02-26",
    "2026-03-26",
    "2026-04-23",
    "2026-05-21",
    "2026-06-18", // Cycle 7 (after 6 completed cycles)
  ];

  // Last 6 cycles have peaks at CD 14, 15, 13, 16, 14, 15
  // Earliest Monitor Peak = CD 13 -> 13 - 6 = CD 7
  // Latest Monitor Peak = CD 16 -> 16 + 3 = CD 19
  function makeSixPriorCycles(): {
    observations: Observation[];
    overlays: CycleOverlay[];
  } {
    const observations: Observation[] = [];
    const overlays: CycleOverlay[] = [];

    const peakOffsets = [13, 14, 12, 15, 13, 14]; // 0-indexed day offset: CD 14, 15, 13, 16, 14, 15
    for (let i = 0; i < 6; i++) {
      const startDate = cycleStartDates[i]!;
      overlays.push({
        ...defaultCycleOverlay(startDate),
        protocolFamily: "regular_monitor",
        protocolVersion: "marquette_regular_manual_public",
      });
      observations.push(
        applyUpdate(unrecordedObservation(startDate), { bleeding: "Heavy" }),
      );
      // Bleeding ends
      observations.push(
        applyUpdate(unrecordedObservation(civilDatePlusDays(startDate, 4)), {
          bleeding: "None",
        }),
      );
      // Add Monitor Peak
      const peakCivilDate = civilDatePlusDays(startDate, peakOffsets[i]!);
      observations.push(
        applyUpdate(unrecordedObservation(peakCivilDate), { monitorReading: "Peak" }),
      );
    }

    // Add Cycle 7 overlay & start
    const c7Start = cycleStartDates[6]!;
    overlays.push({
      ...defaultCycleOverlay(c7Start),
      protocolFamily: "regular_monitor",
      protocolVersion: "marquette_regular_manual_public",
    });
    observations.push(
      applyUpdate(unrecordedObservation(c7Start), { bleeding: "Heavy" }),
    );

    return { observations, overlays };
  }

  it("opens fertility at earliest Monitor Peak of the last six minus six with REG-START-2", () => {
    const { observations, overlays } = makeSixPriorCycles();
    // Cycle 7 start is 2026-06-18. Today is 2026-06-25 (CD 8).
    const chart = projectChart(observations, "2026-06-25", overlays);
    expect(chart.cycles).toHaveLength(7);
    const cycle7 = chart.cycles[6]!;

    // Earliest peak CD 13 - 6 = CD 7
    expect(cycle7.fertileWindow?.start).toEqual({
      cycleDay: 7,
      ruleId: "REG-START-2",
      confidence: "final",
    });

    const statusesByDay = Object.fromEntries(
      cycle7.days.map((d) => [d.cycleDay, d.dayStatus]),
    );
    for (let cd = 1; cd <= 6; cd++) {
      expect(statusesByDay[cd], `Cycle Day ${cd}`).toBe("infertile");
    }
    expect(statusesByDay[7], "Cycle Day 7").toBe("fertile");
  });

  it("moves start earlier to first High with REG-START-3 when High is earlier than calendar start", () => {
    const { observations, overlays } = makeSixPriorCycles();
    // High on CD 5 (2026-06-22) earlier than calendar start CD 7
    observations.push(
      applyUpdate(unrecordedObservation("2026-06-22"), { monitorReading: "High" }),
    );
    const chart = projectChart(observations, "2026-06-25", overlays);
    const cycle7 = chart.cycles[6]!;

    expect(cycle7.fertileWindow?.start).toEqual({
      cycleDay: 5,
      ruleId: "REG-START-3",
      confidence: "final",
    });

    const statusesByDay = Object.fromEntries(
      cycle7.days.map((d) => [d.cycleDay, d.dayStatus]),
    );
    for (let cd = 1; cd <= 4; cd++) {
      expect(statusesByDay[cd], `Cycle Day ${cd}`).toBe("infertile");
    }
    for (let cd = 5; cd <= 8; cd++) {
      expect(statusesByDay[cd], `Cycle Day ${cd}`).toBe("fertile");
    }
  });

  it("keeps calendar start REG-START-2 when first High occurs on or after calendar start", () => {
    const { observations, overlays } = makeSixPriorCycles();
    // High on CD 8 (2026-06-25) on/after calendar start CD 7
    observations.push(
      applyUpdate(unrecordedObservation("2026-06-25"), { monitorReading: "High" }),
    );
    const chart = projectChart(observations, "2026-06-26", overlays);
    const cycle7 = chart.cycles[6]!;

    expect(cycle7.fertileWindow?.start).toEqual({
      cycleDay: 7,
      ruleId: "REG-START-2",
      confidence: "final",
    });
  });

  it("ends at the earlier of current Peak + 3 and historical latest Peak + 3 (current is earlier: REG-END-1)", () => {
    const { observations, overlays } = makeSixPriorCycles();
    // Current cycle peak on CD 14 (2026-07-01). 14 + 3 = 17.
    // Historical latest peak is CD 16. 16 + 3 = 19.
    // Earlier is CD 17 (REG-END-1).
    observations.push(
      applyUpdate(unrecordedObservation("2026-07-01"), { monitorReading: "Peak" }),
    );
    // Today is CD 22 (2026-07-09), after CD 17.
    const chart = projectChart(observations, "2026-07-09", overlays);
    const cycle7 = chart.cycles[6]!;

    expect(cycle7.fertileWindow?.end).toEqual({
      cycleDay: 17,
      ruleId: "REG-END-1",
      confidence: "final",
    });

    const statusesByDay = Object.fromEntries(
      cycle7.days.map((d) => [d.cycleDay, d.dayStatus]),
    );
    expect(statusesByDay[17]).toBe("fertile");
    expect(statusesByDay[18]).toBe("infertile");
  });

  it("ends at the earlier of current Peak + 3 and historical latest Peak + 3 (historical is earlier: REG-END-2)", () => {
    const { observations, overlays } = makeSixPriorCycles();
    // Current cycle late peak on CD 18 (2026-07-05). 18 + 3 = 21.
    // Historical latest peak is CD 16. 16 + 3 = 19.
    // Earlier is CD 19 (REG-END-2).
    observations.push(
      applyUpdate(unrecordedObservation("2026-07-05"), { monitorReading: "Peak" }),
    );
    // Today is CD 22 (2026-07-09), after CD 19.
    const chart = projectChart(observations, "2026-07-09", overlays);
    const cycle7 = chart.cycles[6]!;

    expect(cycle7.fertileWindow?.end).toEqual({
      cycleDay: 19,
      ruleId: "REG-END-2",
      confidence: "final",
    });

    const statusesByDay = Object.fromEntries(
      cycle7.days.map((d) => [d.cycleDay, d.dayStatus]),
    );
    expect(statusesByDay[19]).toBe("fertile");
    expect(statusesByDay[20]).toBe("infertile");
  });

  it("uses historical missed-surge fallback REG-END-2 when cycle after six has no Monitor Peak and no prolonged High", () => {
    const { observations, overlays } = makeSixPriorCycles();
    // High on CD 10-11, then Low on CD 12-14. No Monitor Peak.
    observations.push(
      applyUpdate(unrecordedObservation("2026-06-27"), { monitorReading: "High" }), // CD 10
      applyUpdate(unrecordedObservation("2026-06-28"), { monitorReading: "High" }), // CD 11
      applyUpdate(unrecordedObservation("2026-06-29"), { monitorReading: "Low" }),  // CD 12
    );
    // Historical latest peak is CD 16 -> fallback end is CD 19.
    // Today is CD 22 (2026-07-09).
    const chart = projectChart(observations, "2026-07-09", overlays);
    const cycle7 = chart.cycles[6]!;

    expect(cycle7.fertileWindow?.end).toEqual({
      cycleDay: 19,
      ruleId: "REG-END-2",
      confidence: "final",
    });

    const statusesByDay = Object.fromEntries(
      cycle7.days.map((d) => [d.cycleDay, d.dayStatus]),
    );
    for (let cd = 7; cd <= 19; cd++) {
      expect(statusesByDay[cd], `Cycle Day ${cd}`).toBe("fertile");
    }
    for (let cd = 20; cd <= 22; cd++) {
      expect(statusesByDay[cd], `Cycle Day ${cd}`).toBe("infertile");
    }
  });

  it("keeps the window open rather than reading as infertility when a prolonged run of High readings occurs with no Peak", () => {
    const { observations, overlays } = makeSixPriorCycles();
    // Prolonged run of High readings without a Peak (CD 9 through CD 20 are High)
    // Historical latest peak + 3 would be CD 19, but High continues through CD 20.
    for (let cd = 9; cd <= 20; cd++) {
      const date = civilDatePlusDays("2026-06-18", cd - 1);
      observations.push(
        applyUpdate(unrecordedObservation(date), {
          monitorReading: "High",
        }),
      );
    }

    // Today is CD 22 (2026-07-09).
    const chart = projectChart(observations, "2026-07-09", overlays);
    const cycle7 = chart.cycles[6]!;

    // Window stays open (end is null)
    expect(cycle7.fertileWindow).toEqual({
      start: {
        cycleDay: 7,
        ruleId: "REG-START-2",
        confidence: "final",
      },
      end: null,
    });

    // All days from CD 7 to CD 22 are fertile, none reading as infertility
    const statusesByDay = Object.fromEntries(
      cycle7.days.map((d) => [d.cycleDay, d.dayStatus]),
    );
    for (let cd = 7; cd <= 22; cd++) {
      expect(statusesByDay[cd], `Cycle Day ${cd}`).toBe("fertile");
    }
  });
});

describe("Eligibility warnings integration", () => {
  const cd1 = applyUpdate(unrecordedObservation("2026-06-01"), { bleeding: "Heavy" });
  const cd6 = applyUpdate(unrecordedObservation("2026-06-06"), { monitorReading: "Low" });
  const peak = applyUpdate(unrecordedObservation("2026-06-12"), { monitorReading: "Peak" });
  const overlay: CycleOverlay = {
    ...defaultCycleOverlay("2026-06-01"),
    protocolFamily: "regular_monitor",
    protocolVersion: "marquette_regular_manual_public",
  };

  it("produces empty eligibilityWarnings when fields are not entered", () => {
    const chart = projectChart([cd1, cd6, peak], "2026-06-18", [overlay], null);
    expect(chart.eligibilityWarnings).toEqual([]);
  });

  it("continues computing fertile window while an eligibility warning is active", () => {
    const profile: Profile = {
      dateOfBirth: "1980-01-01", // age 46 on 2026-06-18
      breastfeeding: null,
      postpartum: null,
      perimenopause: null,
      hormonalContraceptionStop: null,
    };
    const chart = projectChart([cd1, cd6, peak], "2026-06-18", [overlay], profile);

    // Warning is produced
    expect(chart.eligibilityWarnings.some((w) => w.circumstance === "age_outside_range")).toBe(true);

    // Fertile window is STILL computed (never blocked)
    const cycle = chart.cycles[0]!;
    expect(cycle).toBeDefined();
    expect(cycle.fertileWindow).toEqual({
      start: {
        cycleDay: 6,
        ruleId: "REG-START-1",
        confidence: "final",
      },
      end: {
        cycleDay: 15,
        ruleId: "REG-END-1",
        confidence: "final",
      },
    });
    expect(cycle.days[0]?.dayStatus).toBe("infertile");
    expect(cycle.days[5]?.dayStatus).toBe("fertile");
  });
});

describe("Fertile window computation (mucus_only)", () => {
  const cd1Date = "2026-06-01";
  const cd1 = applyUpdate(unrecordedObservation(cd1Date), { bleeding: "Heavy" });
  const mucusOnlyOverlay: CycleOverlay = {
    ...defaultCycleOverlay(cd1Date),
    protocolFamily: "mucus_only",
    protocolVersion: "marquette_mucus_only_manual",
  };

  it("computes a fertile window with no Monitor reading recorded at all", () => {
    // Mucus change on CD5 (thick and sticky).
    // Mucus Peak on CD14 (clear and stretchy like egg white).
    // Followed by non-Peak mucus on CD15 (thick and sticky).
    // Today is 2026-06-20 (after CD17 end, so complete).
    const cd2 = applyUpdate(unrecordedObservation("2026-06-02"), { mucus: "dry or scant" });
    const cd5 = applyUpdate(unrecordedObservation("2026-06-05"), { mucus: "thick and sticky" });
    const cd14 = applyUpdate(unrecordedObservation("2026-06-14"), {
      mucus: "clear and stretchy like egg white",
    });
    const cd15 = applyUpdate(unrecordedObservation("2026-06-15"), { mucus: "thick and sticky" });

    const chart = projectChart([cd1, cd2, cd5, cd14, cd15], "2026-06-20", [mucusOnlyOverlay]);
    const cycle = chart.cycles[0]!;

    expect(cycle.mucusPeak).toEqual({
      civilDate: "2026-06-14",
      cycleDay: 14,
      provisional: false,
    });

    expect(cycle.fertileWindow).toEqual({
      start: {
        cycleDay: 5,
        ruleId: "MUCUS-ONLY-START-3",
        confidence: "final",
      },
      end: {
        cycleDay: 17,
        ruleId: "MUCUS-ONLY-END-1",
        confidence: "final",
      },
    });

    // Check statuses
    expect(cycle.days[0]?.dayStatus).toBe("infertile"); // CD 1
    expect(cycle.days[3]?.dayStatus).toBe("infertile"); // CD 4
    expect(cycle.days[4]?.dayStatus).toBe("fertile"); // CD 5
    expect(cycle.days[16]?.dayStatus).toBe("fertile"); // CD 17
    expect(cycle.days[17]?.dayStatus).toBe("infertile"); // CD 18
  });

  it("opens the fertile window on Cycle Day 6 with MUCUS-ONLY-START-1 when no mucus change occurs before CD6", () => {
    const cd2 = applyUpdate(unrecordedObservation("2026-06-02"), { mucus: "dry or scant" });
    const cd7 = applyUpdate(unrecordedObservation("2026-06-07"), { mucus: "thick and sticky" });

    const chart = projectChart([cd1, cd2, cd7], "2026-06-10", [mucusOnlyOverlay]);
    const cycle = chart.cycles[0]!;

    expect(cycle.fertileWindow?.start).toEqual({
      cycleDay: 6,
      ruleId: "MUCUS-ONLY-START-1",
      confidence: "final",
    });
  });

  it("keeps the window provisional until a non-Peak mucus day follows it, even when three days have elapsed", () => {
    // Peak mucus on CD14 (2026-06-14). No further mucus recorded.
    // Today is 2026-06-18 (4 days after CD14).
    const cd14 = applyUpdate(unrecordedObservation("2026-06-14"), {
      mucus: "clear and stretchy like egg white",
    });

    const chart = projectChart([cd1, cd14], "2026-06-18", [mucusOnlyOverlay]);
    const cycle = chart.cycles[0]!;

    expect(cycle.mucusPeak?.provisional).toBe(true);
    expect(cycle.fertileWindow?.end).toEqual({
      cycleDay: 17,
      ruleId: "MUCUS-ONLY-END-1",
      confidence: "provisional",
    });
  });

  it("leaves the fertile window open with end null in first six cycles if no Mucus Peak occurs", () => {
    const cd8 = applyUpdate(unrecordedObservation("2026-06-08"), { mucus: "cloudy and slightly stretchy" });

    const chart = projectChart([cd1, cd8], "2026-06-12", [mucusOnlyOverlay]);
    const cycle = chart.cycles[0]!;

    expect(cycle.fertileWindow).toEqual({
      start: {
        cycleDay: 6,
        ruleId: "MUCUS-ONLY-START-1",
        confidence: "final",
      },
      end: null,
    });
  });

  it("computes historical start and missed-peak fallback after six completed cycles under mucus_only", () => {
    // 6 prior cycles charting under mucus_only
    const overlays: CycleOverlay[] = [];
    const observations: Observation[] = [];

    // Cycles 1..6: start on the 1st of each month (Jan..Jun 2026)
    // Mucus peaks on CD 14, 13, 15, 14, 16, 14.
    const peakDays = [14, 13, 15, 14, 16, 14];
    const monthStarts = [
      "2026-01-01",
      "2026-01-30",
      "2026-02-28",
      "2026-03-30",
      "2026-04-29",
      "2026-05-29",
    ];

    for (let i = 0; i < 6; i++) {
      const start = monthStarts[i]!;
      overlays.push({
        ...defaultCycleOverlay(start),
        protocolFamily: "mucus_only",
        protocolVersion: "marquette_mucus_only_manual",
      });
      observations.push(applyUpdate(unrecordedObservation(start), { bleeding: "Heavy" }));
      // Mucus Peak
      const peakDate = civilDatePlusDays(start, peakDays[i]! - 1);
      observations.push(
        applyUpdate(unrecordedObservation(peakDate), { mucus: "clear and stretchy like egg white" }),
      );
      // Non-peak mucus day to confirm peak
      observations.push(
        applyUpdate(unrecordedObservation(civilDatePlusDays(peakDate, 1)), {
          mucus: "dry or scant",
          bleeding: "None",
        }),
      );
    }

    // Cycle 7: starts 2026-06-28
    const cycle7Start = "2026-06-28";
    overlays.push({
      ...defaultCycleOverlay(cycle7Start),
      protocolFamily: "mucus_only",
      protocolVersion: "marquette_mucus_only_manual",
    });
    observations.push(applyUpdate(unrecordedObservation(cycle7Start), { bleeding: "Heavy" }));

    // In Cycle 7, no peak recorded.
    // Earliest Mucus Peak in last 6 cycles = 13.
    // Start = 13 - 6 = 7 (MUCUS-ONLY-START-2).
    // Latest Mucus Peak in last 6 cycles = 16.
    // Fallback end = 16 + 3 = 19 (MUCUS-ONLY-END-2).
    const chart = projectChart(observations, "2026-07-15", overlays);
    const cycle7 = chart.cycles[6]!;

    expect(cycle7.fertileWindow).toEqual({
      start: {
        cycleDay: 7,
        ruleId: "MUCUS-ONLY-START-2",
        confidence: "final",
      },
      end: {
        cycleDay: 19,
        ruleId: "MUCUS-ONLY-END-2",
        confidence: "provisional",
      },
    });
  });
});

describe("Fertile window computation (regular_monitor_plus_mucus: dual-check)", () => {
  const cd1Date = "2026-06-01";
  const cd1 = applyUpdate(unrecordedObservation(cd1Date), { bleeding: "Heavy" });
  const dualOverlay: CycleOverlay = {
    ...defaultCycleOverlay(cd1Date),
    protocolFamily: "regular_monitor_plus_mucus",
    protocolVersion: "marquette_regular_plus_mucus_manual",
  };

  it("opens at the earlier of mucus change from baseline and monitor High (mucus earlier)", () => {
    // Mucus changes on CD5 ("thick and sticky").
    // Monitor High on CD8.
    // Mucus opens window earlier on CD5 with MUCUS-START.
    const cd5 = applyUpdate(unrecordedObservation("2026-06-05"), { mucus: "thick and sticky" });
    const cd8 = applyUpdate(unrecordedObservation("2026-06-08"), { monitorReading: "High" });

    const chart = projectChart([cd1, cd5, cd8], "2026-06-10", [dualOverlay]);
    const cycle = chart.cycles[0]!;

    expect(cycle.fertileWindow?.start).toEqual({
      cycleDay: 5,
      ruleId: "MUCUS-START",
      confidence: "final",
    });
    expect(cycle.fertileWindow?.discrepancies).toContain("mucus_fertile_before_monitor_high");
  });

  it("opens at the earlier of mucus change from baseline and monitor High (monitor High earlier)", () => {
    // Monitor High on CD5.
    // Mucus changes on CD8 ("cloudy and slightly stretchy").
    // Monitor High opens window earlier on CD5 with REG-START-3.
    const cd5 = applyUpdate(unrecordedObservation("2026-06-05"), { monitorReading: "High" });
    const cd8 = applyUpdate(unrecordedObservation("2026-06-08"), {
      mucus: "cloudy and slightly stretchy",
    });

    const chart = projectChart([cd1, cd5, cd8], "2026-06-10", [dualOverlay]);
    const cycle = chart.cycles[0]!;

    expect(cycle.fertileWindow?.start).toEqual({
      cycleDay: 5,
      ruleId: "REG-START-3",
      confidence: "final",
    });
    expect(cycle.fertileWindow?.discrepancies).toContain("monitor_high_before_mucus_change");
  });

  it("opens on Cycle Day 6 with REG-START-1 when neither biomarker occurs before CD6", () => {
    const cd7 = applyUpdate(unrecordedObservation("2026-06-07"), { monitorReading: "High" });
    const cd8 = applyUpdate(unrecordedObservation("2026-06-08"), { mucus: "thick and sticky" });

    const chart = projectChart([cd1, cd7, cd8], "2026-06-10", [dualOverlay]);
    const cycle = chart.cycles[0]!;

    expect(cycle.fertileWindow?.start).toEqual({
      cycleDay: 6,
      ruleId: "REG-START-1",
      confidence: "final",
    });
  });

  it("closes three full days after whichever Peak marker occurs last (Mucus Peak is later)", () => {
    // Monitor Peak on CD14-15 (last monitor peak = CD15).
    // Mucus Peak on CD16 (clear and stretchy like egg white).
    // Non-peak mucus on CD17 (thick and sticky).
    // Mucus Peak (CD16) > Monitor Peak (CD15).
    // Closes on CD16 + 3 = CD19 with MUCUS-END.
    // Today is 2026-06-22 (complete).
    const monPeak1 = applyUpdate(unrecordedObservation("2026-06-14"), { monitorReading: "Peak" });
    const monPeak2 = applyUpdate(unrecordedObservation("2026-06-15"), { monitorReading: "Peak" });
    const mucPeak = applyUpdate(unrecordedObservation("2026-06-16"), {
      mucus: "clear and stretchy like egg white",
    });
    const mucLow = applyUpdate(unrecordedObservation("2026-06-17"), { mucus: "thick and sticky" });

    const chart = projectChart(
      [cd1, monPeak1, monPeak2, mucPeak, mucLow],
      "2026-06-22",
      [dualOverlay],
    );
    const cycle = chart.cycles[0]!;

    expect(cycle.fertileWindow?.end).toEqual({
      cycleDay: 19,
      ruleId: "MUCUS-END",
      confidence: "final",
    });
    expect(cycle.fertileWindow?.discrepancies).toContain("mucus_peak_after_monitor_peak");
  });

  it("closes three full days after whichever Peak marker occurs last (Monitor Peak is later)", () => {
    // Mucus Peak on CD13 (followed by non-peak mucus on CD14).
    // Monitor Peak on CD15-16 (last monitor peak = CD16).
    // Monitor Peak (CD16) > Mucus Peak (CD13).
    // Closes on CD16 + 3 = CD19 with REG-END-1.
    const mucPeak = applyUpdate(unrecordedObservation("2026-06-13"), {
      mucus: "clear and stretchy like egg white",
    });
    const mucLow = applyUpdate(unrecordedObservation("2026-06-14"), { mucus: "dry or scant" });
    const monPeak1 = applyUpdate(unrecordedObservation("2026-06-15"), { monitorReading: "Peak" });
    const monPeak2 = applyUpdate(unrecordedObservation("2026-06-16"), { monitorReading: "Peak" });

    const chart = projectChart(
      [cd1, mucPeak, mucLow, monPeak1, monPeak2],
      "2026-06-22",
      [dualOverlay],
    );
    const cycle = chart.cycles[0]!;

    expect(cycle.fertileWindow?.end).toEqual({
      cycleDay: 19,
      ruleId: "REG-END-1",
      confidence: "final",
    });
    expect(cycle.fertileWindow?.discrepancies).toContain("monitor_peak_after_mucus_peak");
  });

  it("closes on Mucus Peak + 3 when Monitor never detects a Peak (no_monitor_peak_but_mucus_peak)", () => {
    // Monitor only shows High (e.g. CD10..18).
    // Mucus Peak on CD15, confirmed by non-peak on CD16.
    // Window closes CD15 + 3 = CD18 with MUCUS-END.
    const high = applyUpdate(unrecordedObservation("2026-06-10"), { monitorReading: "High" });
    const mucPeak = applyUpdate(unrecordedObservation("2026-06-15"), {
      mucus: "clear and stretchy like egg white",
    });
    const mucLow = applyUpdate(unrecordedObservation("2026-06-16"), { mucus: "dry or scant" });

    const chart = projectChart([cd1, high, mucPeak, mucLow], "2026-06-22", [dualOverlay]);
    const cycle = chart.cycles[0]!;

    expect(cycle.fertileWindow?.end).toEqual({
      cycleDay: 18,
      ruleId: "MUCUS-END",
      confidence: "final",
    });
    expect(cycle.fertileWindow?.discrepancies).toContain("no_monitor_peak_but_mucus_peak");
  });

  it("keeps the window provisional when Mucus Peak is controlling but no non-Peak mucus day has followed", () => {
    // Monitor Peak on CD14. Mucus Peak on CD16.
    // No non-peak day recorded on CD17+. Today is 2026-06-21.
    const monPeak = applyUpdate(unrecordedObservation("2026-06-14"), { monitorReading: "Peak" });
    const mucPeak = applyUpdate(unrecordedObservation("2026-06-16"), {
      mucus: "clear and stretchy like egg white",
    });

    const chart = projectChart([cd1, monPeak, mucPeak], "2026-06-21", [dualOverlay]);
    const cycle = chart.cycles[0]!;

    expect(cycle.fertileWindow?.end).toEqual({
      cycleDay: 19,
      ruleId: "MUCUS-END",
      confidence: "provisional",
    });
  });

  it("closes on Monitor Peak + 3 when Mucus never detects a Peak (no_mucus_peak_but_monitor_peak)", () => {
    // Monitor High on CD10. Mucus changes to thick/sticky on CD12.
    // Monitor Peak on CD14-15 (last Peak CD15). Mucus stays non-peak (dry on CD15).
    // Window closes CD15 + 3 = CD18 with REG-END-1.
    const cd10 = applyUpdate(unrecordedObservation("2026-06-10"), { monitorReading: "High" });
    const cd12 = applyUpdate(unrecordedObservation("2026-06-12"), { mucus: "thick and sticky" });
    const cd14 = applyUpdate(unrecordedObservation("2026-06-14"), {
      monitorReading: "Peak",
      mucus: "thick and sticky",
    });
    const cd15 = applyUpdate(unrecordedObservation("2026-06-15"), {
      monitorReading: "Peak",
      mucus: "dry or scant",
    });

    const chart = projectChart(
      [cd1, cd10, cd12, cd14, cd15],
      "2026-06-22",
      [dualOverlay],
    );
    const cycle = chart.cycles[0]!;

    expect(cycle.fertileWindow?.end).toEqual({
      cycleDay: 18,
      ruleId: "REG-END-1",
      confidence: "final",
    });
    expect(cycle.fertileWindow?.discrepancies).toContain("monitor_high_before_mucus_change");
    expect(cycle.fertileWindow?.discrepancies).toContain("no_mucus_peak_but_monitor_peak");
  });

  it("attributes MUCUS-ONLY-START-2 and MUCUS-ONLY-END-2 in post-6 cycles when mucus peak controls history", () => {
    const cycleStartDates = [
      "2026-01-01",
      "2026-01-29",
      "2026-02-26",
      "2026-03-26",
      "2026-04-23",
      "2026-05-21",
      "2026-06-18",
    ];
    const observations: Observation[] = [];
    const overlays: CycleOverlay[] = [];

    // Prior 6 cycles: monitor peaks at CD 16 (offset 15), mucus peaks at CD 12 (offset 11)
    // Earliest peak is CD 12 (mucus). Latest peak is CD 16 (monitor).
    for (let i = 0; i < 6; i++) {
      const startDate = cycleStartDates[i]!;
      overlays.push({
        ...defaultCycleOverlay(startDate),
        protocolFamily: "regular_monitor_plus_mucus",
        protocolVersion: "marquette_regular_plus_mucus_manual",
      });
      observations.push(
        applyUpdate(unrecordedObservation(startDate), { bleeding: "Heavy" }),
      );
      // Bleeding ends
      observations.push(
        applyUpdate(unrecordedObservation(civilDatePlusDays(startDate, 4)), {
          bleeding: "None",
        }),
      );
      // Mucus Peak at CD 12
      observations.push(
        applyUpdate(unrecordedObservation(civilDatePlusDays(startDate, 11)), {
          mucus: "clear and stretchy like egg white",
        }),
      );
      // Monitor Peak at CD 16
      observations.push(
        applyUpdate(unrecordedObservation(civilDatePlusDays(startDate, 15)), {
          monitorReading: "Peak",
        }),
      );
    }

    // Cycle 7
    const c7Start = cycleStartDates[6]!;
    overlays.push({
      ...defaultCycleOverlay(c7Start),
      protocolFamily: "regular_monitor_plus_mucus",
      protocolVersion: "marquette_regular_plus_mucus_manual",
    });
    observations.push(
      applyUpdate(unrecordedObservation(c7Start), { bleeding: "Heavy" }),
    );

    // Earliest peak in last 6 was CD 12 (mucus). Calendar start = CD 12 - 6 = CD 6.
    // Rule attribution: earliest peak source was mucus -> MUCUS-ONLY-START-2.
    // If no peaks in cycle 7, fallback end = latest peak (CD 16, monitor) + 3 = CD 19 with REG-END-2.
    const chart = projectChart(observations, "2026-06-25", overlays);
    const cycle7 = chart.cycles[6]!;

    expect(cycle7.fertileWindow?.start).toEqual({
      cycleDay: 6,
      ruleId: "MUCUS-ONLY-START-2",
      confidence: "final",
    });
    expect(cycle7.fertileWindow?.end).toEqual({
      cycleDay: 19,
      ruleId: "REG-END-2",
      confidence: "provisional",
    });
  });
});

describe("Postpartum protocols (cycle zero and return to cycles)", () => {
  it("can start and chart an artificial cycle during amenorrhea with no menses required", () => {
    const today = "2026-06-20";
    const observations = [
      applyUpdate(unrecordedObservation("2026-06-01"), { monitorReading: "Low", bleeding: "None" }),
      applyUpdate(unrecordedObservation("2026-06-02"), { monitorReading: "Low" }),
    ];
    const overlay: CycleOverlay = {
      ...defaultCycleOverlay("2026-06-01"),
      protocolFamily: "postpartum_cycle_zero_original",
      protocolVersion: "marquette_postpartum_cycle_zero_2005",
    };

    const chart = projectChart(observations, today, [overlay]);
    expect(chart.cycles.length).toBe(1);
    expect(chart.cycles[0]?.startDate).toBe("2026-06-01");
    expect(chart.cycles[0]?.days.length).toBe(20);
    expect(chart.unassignedDays).toEqual([]);
  });

  it("in cycle zero with no High or Peak readings, all days are infertile and fertileWindow is null", () => {
    const today = "2026-06-20";
    const observations = [
      applyUpdate(unrecordedObservation("2026-06-01"), { monitorReading: "Low", bleeding: "None" }),
      applyUpdate(unrecordedObservation("2026-06-05"), { monitorReading: "Low" }),
      applyUpdate(unrecordedObservation("2026-06-10"), { monitorReading: "Low" }),
      applyUpdate(unrecordedObservation("2026-06-15"), { monitorReading: "Low" }),
      applyUpdate(unrecordedObservation("2026-06-20"), { monitorReading: "Low" }),
    ];
    const overlay: CycleOverlay = {
      ...defaultCycleOverlay("2026-06-01"),
      protocolFamily: "postpartum_cycle_zero_original",
      protocolVersion: "marquette_postpartum_cycle_zero_2005",
    };

    const chart = projectChart(observations, today, [overlay]);
    const cycle = chart.cycles[0]!;
    expect(cycle.fertileWindow).toBeNull();
    for (const day of cycle.days) {
      expect(day.dayStatus).toBe("infertile");
    }
  });

  it("in cycle zero, High and Peak days are fertile along with three full days after the last Peak", () => {
    const today = "2026-06-25";
    const observations = [
      applyUpdate(unrecordedObservation("2026-06-01"), { monitorReading: "Low", bleeding: "None" }),
      applyUpdate(unrecordedObservation("2026-06-09"), { monitorReading: "Low" }),
      applyUpdate(unrecordedObservation("2026-06-10"), { monitorReading: "High" }), // CD 10: first High
      applyUpdate(unrecordedObservation("2026-06-11"), { monitorReading: "High" }), // CD 11
      applyUpdate(unrecordedObservation("2026-06-12"), { monitorReading: "Peak" }), // CD 12: Peak
      applyUpdate(unrecordedObservation("2026-06-13"), { monitorReading: "Peak" }), // CD 13: last Peak
      applyUpdate(unrecordedObservation("2026-06-14"), { monitorReading: "Low" }),  // CD 14: P+1
      applyUpdate(unrecordedObservation("2026-06-15"), { monitorReading: "Low" }),  // CD 15: P+2
      applyUpdate(unrecordedObservation("2026-06-16"), { monitorReading: "Low" }),  // CD 16: P+3
      applyUpdate(unrecordedObservation("2026-06-17"), { monitorReading: "Low" }),  // CD 17: infertile
      applyUpdate(unrecordedObservation("2026-06-20"), { monitorReading: "Low" }),  // CD 20: infertile
    ];
    const overlay: CycleOverlay = {
      ...defaultCycleOverlay("2026-06-01"),
      protocolFamily: "postpartum_cycle_zero_original",
      protocolVersion: "marquette_postpartum_cycle_zero_2005",
    };

    const chart = projectChart(observations, today, [overlay]);
    const cycle = chart.cycles[0]!;
    expect(cycle.fertileWindow).not.toBeNull();
    expect(cycle.fertileWindow?.start).toEqual({
      cycleDay: 10,
      ruleId: "PP0-START",
      confidence: "final",
    });
    expect(cycle.fertileWindow?.end).toEqual({
      cycleDay: 16,
      ruleId: "PP0-END",
      confidence: "final",
    });

    // Check individual dayStatus
    expect(cycle.days[0]?.dayStatus).toBe("infertile"); // CD 1
    expect(cycle.days[8]?.dayStatus).toBe("infertile"); // CD 9
    expect(cycle.days[9]?.dayStatus).toBe("fertile");   // CD 10 (High)
    expect(cycle.days[10]?.dayStatus).toBe("fertile");  // CD 11 (High)
    expect(cycle.days[11]?.dayStatus).toBe("fertile");  // CD 12 (Peak)
    expect(cycle.days[12]?.dayStatus).toBe("fertile");  // CD 13 (Peak)
    expect(cycle.days[13]?.dayStatus).toBe("fertile");  // CD 14 (P+1)
    expect(cycle.days[14]?.dayStatus).toBe("fertile");  // CD 15 (P+2)
    expect(cycle.days[15]?.dayStatus).toBe("fertile");  // CD 16 (P+3)
    expect(cycle.days[16]?.dayStatus).toBe("infertile"); // CD 17
    expect(cycle.days[19]?.dayStatus).toBe("infertile"); // CD 20
  });

  it("in cycle zero, when High occurs without a Peak, fertile window is open and end is null", () => {
    const today = "2026-06-12";
    const observations = [
      applyUpdate(unrecordedObservation("2026-06-01"), { monitorReading: "Low", bleeding: "None" }),
      applyUpdate(unrecordedObservation("2026-06-10"), { monitorReading: "High" }), // CD 10
      applyUpdate(unrecordedObservation("2026-06-11"), { monitorReading: "High" }), // CD 11
      applyUpdate(unrecordedObservation("2026-06-12"), { monitorReading: "High" }), // CD 12
    ];
    const overlay: CycleOverlay = {
      ...defaultCycleOverlay("2026-06-01"),
      protocolFamily: "postpartum_cycle_zero_original",
      protocolVersion: "marquette_postpartum_cycle_zero_2005",
    };

    const chart = projectChart(observations, today, [overlay]);
    const cycle = chart.cycles[0]!;
    expect(cycle.fertileWindow).not.toBeNull();
    expect(cycle.fertileWindow?.start).toEqual({
      cycleDay: 10,
      ruleId: "PP0-START",
      confidence: "final",
    });
    expect(cycle.fertileWindow?.end).toBeNull();
    expect(cycle.days[8]?.dayStatus).toBe("infertile"); // CD 9
    expect(cycle.days[9]?.dayStatus).toBe("fertile");   // CD 10
    expect(cycle.days[11]?.dayStatus).toBe("fertile");  // CD 12
  });

  it("in cycle zero, when Peak occurs without prior High, fertility begins on the Peak day", () => {
    const today = "2026-06-25";
    const observations = [
      applyUpdate(unrecordedObservation("2026-06-01"), { monitorReading: "Low", bleeding: "None" }),
      applyUpdate(unrecordedObservation("2026-06-11"), { monitorReading: "Low" }),
      applyUpdate(unrecordedObservation("2026-06-12"), { monitorReading: "Peak" }), // CD 12
      applyUpdate(unrecordedObservation("2026-06-13"), { monitorReading: "Peak" }), // CD 13
      applyUpdate(unrecordedObservation("2026-06-17"), { monitorReading: "Low" }),  // CD 17
    ];
    const overlay: CycleOverlay = {
      ...defaultCycleOverlay("2026-06-01"),
      protocolFamily: "postpartum_cycle_zero_original",
      protocolVersion: "marquette_postpartum_cycle_zero_2005",
    };

    const chart = projectChart(observations, today, [overlay]);
    const cycle = chart.cycles[0]!;
    expect(cycle.fertileWindow?.start).toEqual({
      cycleDay: 12,
      ruleId: "PP0-START",
      confidence: "final",
    });
    expect(cycle.fertileWindow?.end).toEqual({
      cycleDay: 16,
      ruleId: "PP0-END",
      confidence: "final",
    });
    expect(cycle.days[10]?.dayStatus).toBe("infertile"); // CD 11
    expect(cycle.days[11]?.dayStatus).toBe("fertile");   // CD 12
    expect(cycle.days[15]?.dayStatus).toBe("fertile");   // CD 16 (P+3)
    expect(cycle.days[16]?.dayStatus).toBe("infertile"); // CD 17
  });

  it("return to cycles walks calendar start from CD 10 in cycle 1 to CD 6 in cycle 5 onward", () => {
    const today = "2026-06-25";
    const cd1 = applyUpdate(unrecordedObservation("2026-06-01"), { bleeding: "Heavy" });

    // Cycle 1 -> CD 10
    const overlay1: CycleOverlay = {
      ...defaultCycleOverlay("2026-06-01"),
      protocolFamily: "postpartum_return_to_cycles",
      protocolVersion: "marquette_postpartum_return_to_cycles_2013",
      postpartumCycleNumber: 1,
    };
    const chart1 = projectChart([cd1], today, [overlay1]);
    expect(chart1.cycles[0]?.fertileWindow?.start).toEqual({
      cycleDay: 10,
      ruleId: "PP-RETURN-START-1",
      confidence: "final",
    });

    // Cycle 2 -> CD 9
    const overlay2: CycleOverlay = { ...overlay1, postpartumCycleNumber: 2 };
    const chart2 = projectChart([cd1], today, [overlay2]);
    expect(chart2.cycles[0]?.fertileWindow?.start.cycleDay).toBe(9);

    // Cycle 3 -> CD 8
    const overlay3: CycleOverlay = { ...overlay1, postpartumCycleNumber: 3 };
    const chart3 = projectChart([cd1], today, [overlay3]);
    expect(chart3.cycles[0]?.fertileWindow?.start.cycleDay).toBe(8);

    // Cycle 4 -> CD 7
    const overlay4: CycleOverlay = { ...overlay1, postpartumCycleNumber: 4 };
    const chart4 = projectChart([cd1], today, [overlay4]);
    expect(chart4.cycles[0]?.fertileWindow?.start.cycleDay).toBe(7);

    // Cycle 5 -> CD 6
    const overlay5: CycleOverlay = { ...overlay1, postpartumCycleNumber: 5 };
    const chart5 = projectChart([cd1], today, [overlay5]);
    expect(chart5.cycles[0]?.fertileWindow?.start.cycleDay).toBe(6);

    // Cycle 6 -> CD 6
    const overlay6: CycleOverlay = { ...overlay1, postpartumCycleNumber: 6 };
    const chart6 = projectChart([cd1], today, [overlay6]);
    expect(chart6.cycles[0]?.fertileWindow?.start.cycleDay).toBe(6);
  });

  it("in return to cycles, a first High reading earlier than calendar start moves the start earlier", () => {
    const today = "2026-06-25";
    const observations = [
      applyUpdate(unrecordedObservation("2026-06-01"), { bleeding: "Heavy" }),
      applyUpdate(unrecordedObservation("2026-06-08"), { monitorReading: "High" }), // CD 8: High before CD 10
      applyUpdate(unrecordedObservation("2026-06-13"), { monitorReading: "Peak" }), // CD 13: Peak
    ];
    const overlay: CycleOverlay = {
      ...defaultCycleOverlay("2026-06-01"),
      protocolFamily: "postpartum_return_to_cycles",
      protocolVersion: "marquette_postpartum_return_to_cycles_2013",
      postpartumCycleNumber: 1,
    };

    const chart = projectChart(observations, today, [overlay]);
    const cycle = chart.cycles[0]!;
    expect(cycle.fertileWindow?.start).toEqual({
      cycleDay: 8,
      ruleId: "PP-RETURN-START-HIGH",
      confidence: "final",
    });
    expect(cycle.fertileWindow?.end).toEqual({
      cycleDay: 16,
      ruleId: "PP-RETURN-END-1",
      confidence: "final",
    });
  });

  it("in return to cycles, a first High reading on or after calendar start keeps calendar start", () => {
    const today = "2026-06-25";
    const observations = [
      applyUpdate(unrecordedObservation("2026-06-01"), { bleeding: "Heavy" }),
      applyUpdate(unrecordedObservation("2026-06-11"), { monitorReading: "High" }), // CD 11: High after CD 10
      applyUpdate(unrecordedObservation("2026-06-13"), { monitorReading: "Peak" }), // CD 13: Peak
    ];
    const overlay: CycleOverlay = {
      ...defaultCycleOverlay("2026-06-01"),
      protocolFamily: "postpartum_return_to_cycles",
      protocolVersion: "marquette_postpartum_return_to_cycles_2013",
      postpartumCycleNumber: 1,
    };

    const chart = projectChart(observations, today, [overlay]);
    const cycle = chart.cycles[0]!;
    expect(cycle.fertileWindow?.start).toEqual({
      cycleDay: 10,
      ruleId: "PP-RETURN-START-1",
      confidence: "final",
    });
    expect(cycle.fertileWindow?.end).toEqual({
      cycleDay: 16,
      ruleId: "PP-RETURN-END-1",
      confidence: "final",
    });
  });

  it("postpartum without breastfeeding produces an Eligibility warning rather than a computed family", () => {
    const today = "2026-06-10";
    const cd1 = applyUpdate(unrecordedObservation("2026-06-01"), { bleeding: "Heavy" });
    const profile: Profile = {
      ...defaultProfile(),
      postpartum: true,
      breastfeeding: false,
    };

    const chart = projectChart([cd1], today, [], profile);
    expect(chart.eligibilityWarnings.some((w) => w.circumstance === "postpartum_without_breastfeeding")).toBe(true);
    expect(chart.cycles[0]?.fertileWindow).toBeNull();
  });
});
