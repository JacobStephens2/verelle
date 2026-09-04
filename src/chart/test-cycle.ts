import type { ChartCycle } from "./projection";

/**
 * Creates a minimal ChartCycle for test assertions.
 */
export function makeTestCycle(startDate: string, length: number): ChartCycle {
  return {
    startDate,
    days: Array.from({ length }, (_, i) => ({
      civilDate: `2026-01-${String(i + 1).padStart(2, "0")}`,
      cycleDay: i + 1,
      monitorReading: null,
      markers: [],
      annotations: [],
      dayStatus: null,
    })),
    mucusPeak: null,
    fertileWindow: null,
  };
}
