import { describe, expect, it } from "vitest";
import { computeCycleStats } from "./cycle-stats";
import { makeTestCycle } from "./test-cycle";

describe("computeCycleStats", () => {
  it("returns null stats for empty cycle array", () => {
    const stats = computeCycleStats([], "2026-06-01");
    expect(stats.totalCycles).toBe(0);
    expect(stats.completedCyclesCount).toBe(0);
    expect(stats.cycleTrend).toEqual([]);
    expect(stats.shortestDays).toBeNull();
    expect(stats.longestDays).toBeNull();
    expect(stats.averageDays).toBeNull();
    expect(stats.variationDays).toBeNull();
  });

  it("handles a single in-progress cycle with no completed cycles", () => {
    const cycle1 = makeTestCycle("2026-06-01", 10);
    const stats = computeCycleStats([cycle1], "2026-06-10");

    expect(stats.totalCycles).toBe(1);
    expect(stats.completedCyclesCount).toBe(0);
    expect(stats.shortestDays).toBeNull();
    expect(stats.longestDays).toBeNull();
    expect(stats.averageDays).toBeNull();
    expect(stats.variationDays).toBeNull();
    expect(stats.cycleTrend).toEqual([
      {
        cycleNumber: 1,
        startDate: "2026-06-01",
        endDate: "2026-06-10",
        lengthDays: 10,
        isCurrent: true,
      },
    ]);
  });

  it("computes stats across multiple completed cycles and one in-progress cycle", () => {
    // Cycle 1: 28 days (2026-01-01 to 2026-01-28)
    const cycle1 = makeTestCycle("2026-01-01", 28);
    // Cycle 2: 32 days (2026-01-29 to 2026-03-01)
    const cycle2 = makeTestCycle("2026-01-29", 32);
    // Cycle 3: 30 days (2026-03-02 to 2026-03-31)
    const cycle3 = makeTestCycle("2026-03-02", 30);
    // Cycle 4 (in progress): 5 days (2026-04-01 to 2026-04-05)
    const cycle4 = makeTestCycle("2026-04-01", 5);

    const stats = computeCycleStats([cycle1, cycle2, cycle3, cycle4], "2026-04-05");

    expect(stats.totalCycles).toBe(4);
    expect(stats.completedCyclesCount).toBe(3);
    expect(stats.shortestDays).toBe(28);
    expect(stats.longestDays).toBe(32);
    expect(stats.averageDays).toBe(30.0);
    expect(stats.variationDays).toBe(4); // 32 - 28

    expect(stats.cycleTrend.length).toBe(4);
    expect(stats.cycleTrend[0]).toEqual({
      cycleNumber: 1,
      startDate: "2026-01-01",
      endDate: "2026-01-28",
      lengthDays: 28,
      isCurrent: false,
    });
    expect(stats.cycleTrend[3]).toEqual({
      cycleNumber: 4,
      startDate: "2026-04-01",
      endDate: "2026-04-05",
      lengthDays: 5,
      isCurrent: true,
    });
  });

  it("computes variation as null when only one completed cycle exists", () => {
    const cycle1 = makeTestCycle("2026-01-01", 29);
    const cycle2 = makeTestCycle("2026-01-30", 3);

    const stats = computeCycleStats([cycle1, cycle2], "2026-02-01");

    expect(stats.completedCyclesCount).toBe(1);
    expect(stats.shortestDays).toBe(29);
    expect(stats.longestDays).toBe(29);
    expect(stats.averageDays).toBe(29.0);
    expect(stats.variationDays).toBeNull();
  });
});
