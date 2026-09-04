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
 * Calculate age in completed years from `birthDate` to `onDate`.
 */
export function ageOnCivilDate(birthDate: CivilDate, onDate: CivilDate): number {
  const bParts = birthDate.split("-").map(Number);
  const tParts = onDate.split("-").map(Number);
  const bYear = bParts[0];
  const bMonth = bParts[1];
  const bDay = bParts[2];
  const tYear = tParts[0];
  const tMonth = tParts[1];
  const tDay = tParts[2];
  if (
    bYear === undefined ||
    bMonth === undefined ||
    bDay === undefined ||
    tYear === undefined ||
    tMonth === undefined ||
    tDay === undefined ||
    Number.isNaN(bYear) ||
    Number.isNaN(bMonth) ||
    Number.isNaN(bDay) ||
    Number.isNaN(tYear) ||
    Number.isNaN(tMonth) ||
    Number.isNaN(tDay)
  ) {
    return 0;
  }
  let age = tYear - bYear;
  if (tMonth < bMonth || (tMonth === bMonth && tDay < bDay)) {
    age--;
  }
  return age;
}



