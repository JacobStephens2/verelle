import type { CivilDate } from "./civil-date";
import { civilDatePlusDays, daysBetweenCivilDates } from "./civil-date";
import type { ChartCycle } from "./projection";

export interface CycleTrendItem {
  readonly cycleNumber: number;
  readonly startDate: CivilDate;
  readonly endDate: CivilDate;
  readonly lengthDays: number;
  readonly isCurrent: boolean;
}

export interface CycleStats {
  readonly totalCycles: number;
  readonly completedCyclesCount: number;
  readonly cycleTrend: readonly CycleTrendItem[];
  readonly shortestDays: number | null;
  readonly longestDays: number | null;
  readonly averageDays: number | null;
  readonly variationDays: number | null;
}

/**
 * Compute objective cycle length statistics and trend across recorded Cycles.
 *
 * Adheres to CONTEXT.md advice boundaries: outputs purely factual metrics
 * (lengths, variation, averages) without medical conclusions or interpretation words.
 */
export function computeCycleStats(
  cycles: readonly ChartCycle[],
  today: CivilDate,
): CycleStats {
  if (cycles.length === 0) {
    return {
      totalCycles: 0,
      completedCyclesCount: 0,
      cycleTrend: [],
      shortestDays: null,
      longestDays: null,
      averageDays: null,
      variationDays: null,
    };
  }

  const trend: CycleTrendItem[] = [];
  const completedLengths: number[] = [];

  for (let i = 0; i < cycles.length; i++) {
    const cycle = cycles[i]!;
    const nextCycle = cycles[i + 1];
    const isCurrent = nextCycle === undefined;

    let endDate: CivilDate;
    let lengthDays: number;

    if (nextCycle !== undefined) {
      endDate = civilDatePlusDays(nextCycle.startDate, -1);
      lengthDays = daysBetweenCivilDates(cycle.startDate, nextCycle.startDate);
      completedLengths.push(lengthDays);
    } else {
      endDate = today >= cycle.startDate ? today : cycle.startDate;
      lengthDays = daysBetweenCivilDates(cycle.startDate, endDate) + 1;
    }

    trend.push({
      cycleNumber: i + 1,
      startDate: cycle.startDate,
      endDate,
      lengthDays,
      isCurrent,
    });
  }

  const completedCyclesCount = completedLengths.length;
  if (completedCyclesCount === 0) {
    return {
      totalCycles: cycles.length,
      completedCyclesCount: 0,
      cycleTrend: trend,
      shortestDays: null,
      longestDays: null,
      averageDays: null,
      variationDays: null,
    };
  }

  const shortestDays = Math.min(...completedLengths);
  const longestDays = Math.max(...completedLengths);
  const totalDays = completedLengths.reduce((sum, len) => sum + len, 0);
  const averageDays = Math.round((totalDays / completedCyclesCount) * 10) / 10;
  const variationDays = completedCyclesCount >= 2 ? longestDays - shortestDays : null;

  return {
    totalCycles: cycles.length,
    completedCyclesCount,
    cycleTrend: trend,
    shortestDays,
    longestDays,
    averageDays,
    variationDays,
  };
}
