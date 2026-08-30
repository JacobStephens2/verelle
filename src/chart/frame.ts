import type { Observation } from "../observations/observation";
import { isFullFlow } from "../observations/observation";
import type { CivilDate } from "./civil-date";
import { civilDatePlusDays, daysBetweenCivilDates, todayCivilDate } from "./civil-date";

/**
 * How many **Cycle Day** columns the Chart frame spans.
 *
 * `docs/marquette-method-business-logic-specification-for-verelle.md` records
 * the Clearblue booklet's claim that the monitor detects Peak fertility in
 * cycles of 21 to 42 days, so 42 columns hold the longest Cycle the device
 * supports without the Chart having to grow a column mid-Cycle.
 */
export const CYCLE_DAY_COLUMNS = 42;

/** One **Cycle Day** column of the frame. */
export interface CycleDayColumn {
  /** The date's position within its Cycle, counting from 1. */
  readonly cycleDay: number;
  /**
   * The **Civil date** this column stands for, or `null` while the frame has
   * no anchor - Cycle Day 1 is anchored by the first day of full flow, so
   * until something is recorded there is no date to hang the columns on and
   * the frame does not invent one.
   */
  readonly civilDate: CivilDate | null;
  /**
   * What was recorded for that date, or `null` for a day nobody charted. A
   * recorded `Missed` or `Error` is an Observation and lands here; an
   * unrecorded day stays `null`, so gaps in the record read as gaps.
   */
  readonly observation: Observation | null;
  readonly isToday: boolean;
}

/** The current **Cycle**, laid out as **Cycle Day** columns. */
export interface ChartFrame {
  /** The **Civil date** the frame was built for. */
  readonly today: CivilDate;
  readonly columns: readonly CycleDayColumn[];
  /** True when the Cycle holds no Observations at all. */
  readonly isEmpty: boolean;
  /**
   * Whether Cycle Day 1 sits on a recorded first day of full flow. False while
   * the frame is dated from the earliest Observation instead, which is a
   * placeholder the Chart says out loud rather than a claim about the Cycle.
   */
  readonly isAnchoredToFullFlow: boolean;
}

/**
 * Where Cycle Day 1 falls, and whether that is the real anchor.
 *
 * The real anchor is the first day of full flow. Until one is recorded the
 * frame still has to show the days that *are* recorded, so it dates the
 * columns from the earliest Observation and reports `isAnchoredToFullFlow:
 * false`. Cycle boundaries proper - and the previous Cycles they make
 * reachable - are issue #9's projection, not this frame's.
 */
function anchorFor(
  today: CivilDate,
  observations: readonly Observation[],
): { readonly civilDate: CivilDate | null; readonly anchoredToFullFlow: boolean } {
  const dated = [...observations].sort((a, b) => a.civilDate.localeCompare(b.civilDate));
  if (dated.length === 0) return { civilDate: null, anchoredToFullFlow: false };

  const flow = dated.find((observation) => isFullFlow(observation.bleeding));
  const anchor = flow ?? dated[0];
  if (anchor === undefined) return { civilDate: null, anchoredToFullFlow: false };

  // A Cycle is at most 42 days wide, so an anchor further back than that is
  // one the couple has left behind. Today has to stay on the Chart, so the
  // frame restarts on today rather than scrolling off its own end.
  const offset = daysBetweenCivilDates(anchor.civilDate, today);
  if (offset < 0 || offset >= CYCLE_DAY_COLUMNS) {
    return { civilDate: today, anchoredToFullFlow: false };
  }

  return { civilDate: anchor.civilDate, anchoredToFullFlow: flow !== undefined };
}

/**
 * The frame of today's **Cycle**: the Cycle Day columns the Chart lays out,
 * with each date's Observation in its own column.
 *
 * Pure - it reads nothing from Evolu, Vue or the DOM, and nothing but the
 * Civil date and the Observations it is handed.
 */
export function chartFrame(
  today: CivilDate = todayCivilDate(),
  observations: readonly Observation[] = [],
): ChartFrame {
  const anchor = anchorFor(today, observations);
  const byDate = new Map(
    observations.map((observation) => [observation.civilDate, observation]),
  );

  const columns = Array.from({ length: CYCLE_DAY_COLUMNS }, (_, index): CycleDayColumn => {
    const civilDate =
      anchor.civilDate === null ? null : civilDatePlusDays(anchor.civilDate, index);
    return {
      cycleDay: index + 1,
      civilDate,
      observation: civilDate === null ? null : (byDate.get(civilDate) ?? null),
      isToday: civilDate === today,
    };
  });

  return {
    today,
    columns,
    isEmpty: observations.length === 0,
    isAnchoredToFullFlow: anchor.anchoredToFullFlow,
  };
}
