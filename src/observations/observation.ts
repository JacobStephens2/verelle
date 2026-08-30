/**
 * The **Observation**: everything one partner recorded for a single **Civil
 * date**. The unit of storage, of sync, and of one Chart cell (`CONTEXT.md`).
 *
 * Nothing here is derived. There is no Cycle Day, no Peak count and no day
 * status - those are the Chart projection's business, and interpretation is
 * nobody's (ADR 0001, ADR 0011).
 */
import type { CivilDate } from "../chart/civil-date";

/**
 * What the Clearblue Fertility Monitor displayed on a test day.
 *
 * `Missed` and `Error` are readings, not the absence of one: a day the monitor
 * gave no usable result has to stay distinguishable from a day nobody charted,
 * which is why they are values here rather than a missing row.
 */
export const MONITOR_READINGS = ["Low", "High", "Peak", "Missed", "Error"] as const;
export type MonitorReading = (typeof MONITOR_READINGS)[number];

/** Menstrual flow recorded for a date, weakest first. */
export const BLEEDING_LEVELS = ["None", "Spotting", "Light", "Moderate", "Heavy"] as const;
export type Bleeding = (typeof BLEEDING_LEVELS)[number];

/** What an LH strip showed, transcribed rather than judged. */
export const LH_STRIP_VALUES = ["Negative", "Positive", "Invalid"] as const;
export type LhStrip = (typeof LH_STRIP_VALUES)[number];

/**
 * Cervical mucus as observed. Described, never categorised: the Marquette
 * manual's Low/High/Peak mucus categories are a reading of the description,
 * and reading it is the couple's and their instructor's job.
 */
export const MUCUS_OBSERVATIONS = ["Dry", "Sticky", "Creamy", "Stretchy"] as const;
export type Mucus = (typeof MUCUS_OBSERVATIONS)[number];

/** The scale a temperature was recorded on. Stored, so it is never guessed. */
export const TEMPERATURE_UNITS = ["C", "F"] as const;
export type TemperatureUnit = (typeof TEMPERATURE_UNITS)[number];

/**
 * One row per **Civil date**, every field its own column.
 *
 * The separate columns follow from Evolu's per-column last-write-wins: two
 * partners editing different fields of the same date must both win, where
 * record-level last-write-wins would discard four fields to win one (ADR
 * 0012).
 *
 * `null` means "not recorded". It is never a stand-in for a recorded value.
 */
export interface Observation {
  /**
   * The date this was recorded for, in the recording partner's own timezone.
   * A date string, never a timestamp, so travelling never moves an existing
   * Observation onto a different day of the Chart.
   */
  readonly civilDate: CivilDate;
  readonly monitorReading: MonitorReading | null;
  readonly bleeding: Bleeding | null;
  /**
   * An explicit act by the recording partner declaring this date her Peak day.
   * The only thing that may ever render a `P`; a **Monitor Peak** may not
   * (`CONTEXT.md`).
   */
  readonly userMarkedPeak: boolean | null;
  readonly intercourse: boolean | null;
  readonly lhStrip: LhStrip | null;
  readonly mucus: Mucus | null;
  readonly temperature: number | null;
  readonly temperatureUnit: TemperatureUnit | null;
  readonly note: string | null;
}

/** The fields of one Observation that a save writes, keyed by its date. */
export type ObservationFields = Omit<Observation, "civilDate">;

/**
 * A save: only the fields it touches.
 *
 * Naming a field is what writes it, so an update that mentions the note leaves
 * the monitor reading exactly as the other partner left it. Assembled by the
 * caller a field at a time, so unlike an Observation it is not frozen.
 */
export type ObservationUpdate = {
  -readonly [Field in keyof ObservationFields]?: ObservationFields[Field];
};

/** A **Civil date** nobody has charted: every field empty. */
export function unrecordedObservation(civilDate: CivilDate): Observation {
  return {
    civilDate,
    monitorReading: null,
    bleeding: null,
    userMarkedPeak: null,
    intercourse: null,
    lhStrip: null,
    mucus: null,
    temperature: null,
    temperatureUnit: null,
    note: null,
  };
}

/**
 * The Observation that results from writing `update` onto `observation`.
 *
 * Field-wise, matching the storage merge, so that what a test asserts and what
 * two phones converge on are the same operation.
 */
export function applyUpdate(
  observation: Observation,
  update: ObservationUpdate,
): Observation {
  const merged = { ...observation };
  for (const key of Object.keys(update) as Array<keyof ObservationFields>) {
    if (!(key in update)) continue;
    // Each column is written independently; the cast is the price of a
    // key-by-key copy that TypeScript cannot correlate across a union.
    (merged as Record<string, unknown>)[key] = update[key] ?? null;
  }
  return merged;
}

/**
 * The update that writes just `fields` of `values`.
 *
 * A save carries only what this partner edited. That is what makes Evolu's
 * per-column merge do its job: if she records the monitor reading and he
 * records intercourse on the same date, both survive. Sending every field on
 * every save would blank whatever the other phone had just set, which is the
 * record-level behaviour the column layout exists to avoid (ADR 0012).
 */
export function updateOf(
  values: ObservationFields,
  fields: ReadonlySet<keyof ObservationFields>,
): ObservationUpdate {
  const update: ObservationUpdate = {};
  for (const field of fields) {
    // Each column is written independently; the cast is the price of a
    // key-by-key copy that TypeScript cannot correlate across a union.
    (update as Record<string, unknown>)[field] = values[field];
  }
  return update;
}

/**
 * Whether this bleeding level is full flow - the thing that anchors Cycle Day
 * 1. Spotting is not, and a day with nothing recorded is not.
 */
export function isFullFlow(bleeding: Bleeding | null): boolean {
  return bleeding === "Light" || bleeding === "Moderate" || bleeding === "Heavy";
}
