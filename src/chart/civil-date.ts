/**
 * A **Civil date** - the calendar date in the recording partner's own
 * timezone, as `YYYY-MM-DD`. Observations are day-granular, so this is the
 * only date type the Chart deals in; a timezone change never moves an existing
 * Observation to a different day (`CONTEXT.md`, "Civil date").
 */
export type CivilDate = string;

/**
 * The **Civil date** an instant falls on in `timeZone`.
 *
 * `en-CA` is used because it formats as `YYYY-MM-DD`, which is the storage
 * shape - going through the parts and reassembling them would say the same
 * thing at more length.
 */
export function civilDateIn(instant: Date, timeZone: string): CivilDate {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** The device's current **Civil date**, in the device's own timezone. */
export function todayCivilDate(
  now: Date = new Date(),
  timeZone: string = Intl.DateTimeFormat().resolvedOptions().timeZone,
): CivilDate {
  return civilDateIn(now, timeZone);
}

/**
 * Midnight UTC on a **Civil date**.
 *
 * UTC is used precisely because it has no daylight-saving transitions: a civil
 * date is a label on a calendar, not an instant, so arithmetic on it must not
 * inherit any zone's 23- and 25-hour days.
 */
function utcMidnight(date: CivilDate): number {
  return Date.parse(`${date}T00:00:00Z`);
}

const MILLISECONDS_PER_DAY = 86_400_000;

/** Whole days from `from` to `to`; negative when `to` is the earlier date. */
export function daysBetweenCivilDates(from: CivilDate, to: CivilDate): number {
  return Math.round((utcMidnight(to) - utcMidnight(from)) / MILLISECONDS_PER_DAY);
}

/** The **Civil date** `days` after `date`. Negative `days` counts backwards. */
export function civilDatePlusDays(date: CivilDate, days: number): CivilDate {
  return new Date(utcMidnight(date) + days * MILLISECONDS_PER_DAY)
    .toISOString()
    .slice(0, 10);
}

/** Format a CivilDate for display, e.g. "2026-09-04" -> "Sep 4" */
export function displayCivilDate(date: CivilDate): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  }).format(new Date(utcMidnight(date)));
}

/**
 * Completed calendar years between two CivilDates; negative when `to` is earlier.
 * Returns 0 if either date is malformed or invalid.
 */
export function completedYearsBetweenCivilDates(from: CivilDate, to: CivilDate): number {
  const fromParts = from.split("-").map(Number);
  const toParts = to.split("-").map(Number);
  const fromYear = fromParts[0];
  const fromMonth = fromParts[1];
  const fromDay = fromParts[2];
  const toYear = toParts[0];
  const toMonth = toParts[1];
  const toDay = toParts[2];
  if (
    fromYear === undefined ||
    fromMonth === undefined ||
    fromDay === undefined ||
    toYear === undefined ||
    toMonth === undefined ||
    toDay === undefined ||
    Number.isNaN(fromYear) ||
    Number.isNaN(fromMonth) ||
    Number.isNaN(fromDay) ||
    Number.isNaN(toYear) ||
    Number.isNaN(toMonth) ||
    Number.isNaN(toDay)
  ) {
    return 0;
  }
  let years = toYear - fromYear;
  if (toMonth < fromMonth || (toMonth === fromMonth && toDay < fromDay)) {
    years--;
  }
  return years;
}

/** Alias for completedYearsBetweenCivilDates when calculating age from a birth date. */
export const ageOnCivilDate = completedYearsBetweenCivilDates;

/** A calendar month: year and 0-indexed month (0 = January..11 = December). */
export interface CivilMonth {
  readonly year: number;
  readonly month: number;
}

/** Format a month for display, e.g. (2026, 8) -> "September 2026" (month is 0-indexed). */
export function displayMonth(year: number, month: number): string {
  const date = new Date(Date.UTC(year, month, 1));
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "long",
    year: "numeric",
  }).format(date);
}

/** Get all CivilDates (YYYY-MM-DD) in a month (month is 0-indexed). */
export function getDatesInMonth(year: number, month: number): CivilDate[] {
  const dates: CivilDate[] = [];
  const d = new Date(Date.UTC(year, month, 1));
  while (d.getUTCMonth() === month) {
    dates.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return dates;
}

/** First day of week for a given month (0 = Sunday..6 = Saturday, month is 0-indexed). */
export function firstDayOfMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 1)).getUTCDay();
}

/** Shift year and 0-indexed month by delta months. */
export function shiftMonth(year: number, month: number, delta: number): CivilMonth {
  const totalMonths = year * 12 + month + delta;
  const newYear = Math.floor(totalMonths / 12);
  const newMonth = ((totalMonths % 12) + 12) % 12;
  return { year: newYear, month: newMonth };
}

/** Extract year and 0-indexed month from a CivilDate. */
export function civilDateMonth(date: CivilDate): CivilMonth {
  const parts = date.split("-").map(Number);
  return { year: parts[0] ?? 0, month: (parts[1] ?? 1) - 1 };
}




