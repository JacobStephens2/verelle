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
