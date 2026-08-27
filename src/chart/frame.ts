import type { CivilDate } from "./civil-date";
import { todayCivilDate } from "./civil-date";

/**
 * How many **Cycle Day** columns the Chart frame spans.
 *
 * The Clearblue Fertility Monitor detects Peak fertility in cycles of 21–42
 * days (`docs/marquette-method-business-logic-specification-for-verelle.md`,
 * line 313), so 42 columns hold the longest Cycle the device supports without
 * the Chart having to grow a column mid-Cycle.
 */
export const CYCLE_DAY_COLUMNS = 42;

/** One **Cycle Day** column of the frame. */
export interface CycleDayColumn {
  /** The date's position within its Cycle, counting from 1. */
  readonly cycleDay: number;
  /**
   * The **Civil date** this column stands for, or `null` when the Cycle has no
   * Cycle Day 1 yet. Cycle Day 1 is anchored by the first day of full flow, so
   * until there is an Observation recording bleeding there is no date to hang
   * the columns on.
   */
  readonly date: CivilDate | null;
}

/** The current **Cycle**, laid out as **Cycle Day** columns. */
export interface ChartFrame {
  /** The **Civil date** the frame was built for. */
  readonly today: CivilDate;
  readonly columns: readonly CycleDayColumn[];
  /** True when the Cycle holds no Observations at all. */
  readonly isEmpty: boolean;
}

/**
 * The frame of today's **Cycle**: the Cycle Day columns the Chart lays out,
 * before any Observation is put in them.
 *
 * Pure — it reads nothing from Evolu, Vue or the DOM, and nothing but the
 * Civil date it is handed.
 */
export function chartFrame(today: CivilDate = todayCivilDate()): ChartFrame {
  const columns = Array.from({ length: CYCLE_DAY_COLUMNS }, (_, index) => ({
    cycleDay: index + 1,
    date: null,
  }));

  return { today, columns, isEmpty: true };
}
