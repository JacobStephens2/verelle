import type { CivilDate } from "./civil-date";
import { todayCivilDate } from "./civil-date";

/**
 * How many **Cycle Day** columns the Chart frame spans.
 *
 * `docs/marquette-method-business-logic-specification-for-verelle.md` records
 * the Clearblue booklet's claim that the monitor detects Peak fertility in
 * cycles of 21 to 42 days, so 42 columns hold the longest Cycle the device
 * supports without the Chart having to grow a column mid-Cycle.
 */
export const CYCLE_DAY_COLUMNS = 42;

/**
 * One **Cycle Day** column of the frame.
 *
 * A column carries no **Civil date** yet. Cycle Day 1 is anchored by the first
 * day of full flow, so until an Observation records bleeding there is no date
 * to hang the columns on, and the frame does not invent one.
 */
export interface CycleDayColumn {
  /** The date's position within its Cycle, counting from 1. */
  readonly cycleDay: number;
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
 * Pure - it reads nothing from Evolu, Vue or the DOM, and nothing but the
 * Civil date it is handed.
 */
export function chartFrame(today: CivilDate = todayCivilDate()): ChartFrame {
  const columns = Array.from({ length: CYCLE_DAY_COLUMNS }, (_, index) => ({
    cycleDay: index + 1,
  }));

  return { today, columns, isEmpty: true };
}
