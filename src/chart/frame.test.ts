import { describe, expect, it } from "vitest";

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

  it("reports an empty cycle as empty rather than guessing at dates", () => {
    // Story 20: a day with no Observation must read as a gap, not as a filled
    // cell. With nothing recorded there is no first day of full flow, so no
    // column has a civil date yet.
    const frame = chartFrame("2026-03-09");

    expect(frame.isEmpty).toBe(true);
    expect(frame.columns.every((column) => column.date === null)).toBe(true);
  });

  it("carries the civil date it was built for", () => {
    expect(chartFrame("2026-03-09").today).toBe("2026-03-09");
  });
});
