import { describe, expect, it } from "vitest";

import {
  BLEEDING_LEVELS,
  MONITOR_READINGS,
  applyUpdate,
  isFullFlow,
  mucusCategory,
  unrecordedObservation,
  updateOf,
} from "./observation";

describe("Monitor reading", () => {
  it("carries Missed and Error as values", () => {
    expect(MONITOR_READINGS).toContain("Missed");
    expect(MONITOR_READINGS).toContain("Error");
  });
});

describe("Mucus category", () => {
  it("maps descriptions to Low, High, or Peak", () => {
    expect(mucusCategory("Dry")).toBe("Low");
    expect(mucusCategory("Sticky")).toBe("Low");
    expect(mucusCategory("Creamy")).toBe("High");
    expect(mucusCategory("Stretchy")).toBe("Peak");
    expect(mucusCategory(null)).toBeNull();
  });
});

describe("an unrecorded day", () => {
  it("is distinguishable from a recorded Missed and from a recorded Error", () => {
    const unrecorded = unrecordedObservation("2026-08-30");
    const missed = applyUpdate(unrecorded, { monitorReading: "Missed" });
    const errored = applyUpdate(unrecorded, { monitorReading: "Error" });

    expect(unrecorded.monitorReading).toBeNull();
    expect(missed.monitorReading).toBe("Missed");
    expect(errored.monitorReading).toBe("Error");
    expect(missed).not.toEqual(errored);
  });

  it("has every field empty", () => {
    expect(unrecordedObservation("2026-08-30")).toEqual({
      civilDate: "2026-08-30",
      monitorReading: null,
      bleeding: null,
      peakOverride: null,
      intercourse: null,
      lhStrip: null,
      mucus: null,
      temperature: null,
      temperatureUnit: null,
      note: null,
    });
  });
});

describe("applyUpdate", () => {
  it("writes only the fields the update names, so a partner editing one field does not blank the others", () => {
    const hers = applyUpdate(unrecordedObservation("2026-08-30"), {
      monitorReading: "High",
      bleeding: "None",
      peakOverride: false,
      intercourse: true,
    });

    const his = applyUpdate(hers, { note: "travelling" });

    expect(his.monitorReading).toBe("High");
    expect(his.intercourse).toBe(true);
    expect(his.note).toBe("travelling");
  });

  it("never moves an Observation to another Civil date", () => {
    const observation = unrecordedObservation("2026-08-30");
    expect(applyUpdate(observation, { monitorReading: "Low" }).civilDate).toBe("2026-08-30");
  });

  it("keeps an explicitly cleared field cleared", () => {
    const recorded = applyUpdate(unrecordedObservation("2026-08-30"), { note: "away" });
    expect(applyUpdate(recorded, { note: null }).note).toBeNull();
  });

  it("can set and clear a Peak override on a date", () => {
    const unrecorded = unrecordedObservation("2026-08-30");
    const setOverride = applyUpdate(unrecorded, { peakOverride: true });
    expect(setOverride.peakOverride).toBe(true);

    const clearedOverride = applyUpdate(setOverride, { peakOverride: false });
    expect(clearedOverride.peakOverride).toBe(false);

    const resetToNull = applyUpdate(clearedOverride, { peakOverride: null });
    expect(resetToNull.peakOverride).toBeNull();
  });
});

describe("isFullFlow", () => {
  it("is true for the bleeding levels that anchor a Cycle Day 1 and false for the rest", () => {
    expect(BLEEDING_LEVELS.filter(isFullFlow)).toEqual(["Light", "Moderate", "Heavy"]);
  });

  it("is false for a day with no bleeding recorded", () => {
    expect(isFullFlow(null)).toBe(false);
  });
});

describe("updateOf", () => {
  const values = {
    monitorReading: "High",
    bleeding: "Heavy",
    peakOverride: false,
    intercourse: true,
    lhStrip: null,
    mucus: null,
    temperature: null,
    temperatureUnit: null,
    note: null,
  } as const;

  it("carries only the fields it was given, so an untouched column is left to the other partner", () => {
    expect(updateOf(values, new Set(["intercourse"]))).toEqual({ intercourse: true });
  });

  it("carries a field the partner deliberately cleared", () => {
    expect(updateOf({ ...values, note: null }, new Set(["note"]))).toEqual({ note: null });
  });

  it("writes nothing when nothing was edited", () => {
    expect(updateOf(values, new Set())).toEqual({});
  });

  it("leaves an Observation whole when applied field by field from both partners", () => {
    const hers = applyUpdate(
      unrecordedObservation("2026-08-30"),
      updateOf(values, new Set(["monitorReading"])),
    );
    const his = applyUpdate(hers, updateOf(values, new Set(["intercourse"])));

    expect(his.monitorReading).toBe("High");
    expect(his.intercourse).toBe(true);
    expect(his.bleeding).toBeNull();
  });
});
