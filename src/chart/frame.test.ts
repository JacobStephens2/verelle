import { describe, expect, it } from "vitest";

import type { ObservationUpdate } from "../observations/observation";
import { applyUpdate, unrecordedObservation } from "../observations/observation";
import { CYCLE_DAY_COLUMNS, chartFrame } from "./frame";

describe("chartFrame", () => {
  it("lays the cycle out as cycle day columns numbered from 1", () => {
    const frame = chartFrame("2026-03-09");

    expect(frame.columns).toHaveLength(CYCLE_DAY_COLUMNS);
    expect(frame.columns[0]?.cycleDay).toBe(1);
    expect(frame.columns.at(-1)?.cycleDay).toBe(CYCLE_DAY_COLUMNS);
    expect(frame.columns.map((column) => column.cycleDay)).toEqual(
      frame.columns.map((_, index) => index + 1),
    );
  });

  it("spans the longest cycle the monitor supports", () => {
    expect(CYCLE_DAY_COLUMNS).toBe(42);
  });

  it("reports an empty cycle as empty", () => {
    // Story 20: a day with no Observation must read as a gap, not as a filled
    // cell. The empty state the view shows hangs off this flag.
    expect(chartFrame("2026-03-09").isEmpty).toBe(true);
  });

  it("carries the civil date it was built for", () => {
    expect(chartFrame("2026-03-09").today).toBe("2026-03-09");
  });
});

describe("chartFrame with Observations", () => {
  const observed = (civilDate: string, update: ObservationUpdate) =>
    applyUpdate(unrecordedObservation(civilDate), update);

  it("puts a recorded Monitor reading in that date's cell", () => {
    const frame = chartFrame("2026-03-09", [
      observed("2026-03-09", { monitorReading: "High", bleeding: "Heavy" }),
    ]);

    const todayColumn = frame.columns.find((column) => column.isToday);
    expect(todayColumn?.civilDate).toBe("2026-03-09");
    expect(todayColumn?.observation?.monitorReading).toBe("High");
    expect(frame.isEmpty).toBe(false);
  });

  it("anchors Cycle Day 1 on the first day of full flow", () => {
    const frame = chartFrame("2026-03-09", [
      observed("2026-03-05", { bleeding: "Spotting" }),
      observed("2026-03-07", { bleeding: "Heavy" }),
      observed("2026-03-09", { monitorReading: "Low" }),
    ]);

    expect(frame.columns[0]?.civilDate).toBe("2026-03-07");
    expect(frame.columns[2]?.civilDate).toBe("2026-03-09");
    expect(frame.columns[2]?.observation?.monitorReading).toBe("Low");
    expect(frame.isAnchoredToFullFlow).toBe(true);
  });

  it("dates the columns from the earliest Observation when no full flow day is recorded yet, and says so", () => {
    const frame = chartFrame("2026-03-09", [
      observed("2026-03-08", { monitorReading: "Missed" }),
      observed("2026-03-09", { monitorReading: "Error" }),
    ]);

    expect(frame.columns[0]?.civilDate).toBe("2026-03-08");
    expect(frame.columns[0]?.observation?.monitorReading).toBe("Missed");
    expect(frame.columns[1]?.observation?.monitorReading).toBe("Error");
    expect(frame.isAnchoredToFullFlow).toBe(false);
  });

  it("leaves a day with no Observation empty rather than filling it with a guess", () => {
    const frame = chartFrame("2026-03-09", [
      observed("2026-03-07", { bleeding: "Heavy" }),
      observed("2026-03-09", { monitorReading: "Low" }),
    ]);

    expect(frame.columns[1]?.civilDate).toBe("2026-03-08");
    expect(frame.columns[1]?.observation).toBeNull();
  });

  it("keeps today on the Chart when the anchor is further back than the frame is wide", () => {
    const frame = chartFrame("2026-06-01", [observed("2026-03-07", { bleeding: "Heavy" })]);

    expect(frame.columns.find((column) => column.isToday)?.civilDate).toBe("2026-06-01");
  });

  it("dates no column while nothing is recorded, because there is no anchor to invent", () => {
    const frame = chartFrame("2026-03-09");

    expect(frame.columns.every((column) => column.civilDate === null)).toBe(true);
    expect(frame.columns.every((column) => column.observation === null)).toBe(true);
    expect(frame.isEmpty).toBe(true);
  });
});
