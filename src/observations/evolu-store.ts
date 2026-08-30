/**
 * The Evolu-backed {@link ObservationStore}. **The only module in the app that
 * imports Evolu.**
 *
 * Everything above it - the Chart frame, the recording screen, every view -
 * sees Observations and nothing else, which is what keeps the Chart projection
 * a pure function of Observations plus today (issue #9) and what makes this
 * module replaceable without touching a view.
 */
import {
  AppName,
  createAppOwner,
  createEvolu,
  createIdFromString,
  createQueryBuilder,
  createRun,
  FiniteNumber,
  getOrThrow,
  id,
  literal,
  NonEmptyTrimmedString1000,
  nullOr,
  NonEmptyTrimmedString100,
  SqliteBoolean,
  testOwnerSecret,
  union,
  type Evolu,
  type MutationValues,
} from "@evolu/common";
import { createEvoluDeps } from "@evolu/web";
import { ref } from "vue";

import type { CivilDate } from "../chart/civil-date";
import type { Observation, ObservationUpdate } from "./observation";
import { unrecordedObservation } from "./observation";
import type { ObservationStore } from "./store";

const ObservationId = id("Observation");

/**
 * One row per **Civil date**, every field its own column.
 *
 * Separate columns are load-bearing, not cosmetic: Evolu merges per column
 * with last-write-wins, so two partners editing different fields of the same
 * date both win. A single record-level write would discard four fields to win
 * one (ADR 0012).
 *
 * Every column but `id` is nullable so that a save writes only the fields it
 * names - Evolu emits one message carrying exactly the columns passed - and so
 * that `null` can mean "not recorded" without competing with a recorded value.
 * `Missed` and `Error` are monitor readings for exactly that reason.
 */
const Schema = {
  observation: {
    id: ObservationId,
    /** `YYYY-MM-DD` in the recording partner's own timezone. Never a timestamp. */
    civilDate: NonEmptyTrimmedString100,
    monitorReading: nullOr(
      union(
        literal("Low"),
        literal("High"),
        literal("Peak"),
        literal("Missed"),
        literal("Error"),
      ),
    ),
    bleeding: nullOr(
      union(
        literal("None"),
        literal("Spotting"),
        literal("Light"),
        literal("Moderate"),
        literal("Heavy"),
      ),
    ),
    userMarkedPeak: nullOr(SqliteBoolean),
    intercourse: nullOr(SqliteBoolean),
    lhStrip: nullOr(union(literal("Negative"), literal("Positive"), literal("Invalid"))),
    mucus: nullOr(
      union(literal("Dry"), literal("Sticky"), literal("Creamy"), literal("Stretchy")),
    ),
    temperature: nullOr(FiniteNumber),
    temperatureUnit: nullOr(union(literal("C"), literal("F"))),
    note: nullOr(NonEmptyTrimmedString1000),
  },
};

const createQuery = createQueryBuilder(Schema);

const allObservations = createQuery((db) =>
  db
    .selectFrom("observation")
    .selectAll()
    .where("isDeleted", "is not", 1)
    .orderBy("civilDate"),
);

type ObservationRow = typeof allObservations.Row;

/**
 * The row Evolu hands back, turned into the Observation the app deals in.
 *
 * Returns `null` for a row with no Civil date. Every column but the id is
 * nullable in the schema, so the query type says a dateless row is possible
 * even though nothing writes one; a Chart cell keyed on nothing is worse than
 * a row skipped.
 */
function toObservation(row: ObservationRow): Observation | null {
  if (row.civilDate === null) return null;
  return {
    ...unrecordedObservation(row.civilDate),
    monitorReading: row.monitorReading,
    bleeding: row.bleeding,
    userMarkedPeak: row.userMarkedPeak === null ? null : row.userMarkedPeak === 1,
    intercourse: row.intercourse === null ? null : row.intercourse === 1,
    lhStrip: row.lhStrip,
    mucus: row.mucus,
    temperature: row.temperature,
    temperatureUnit: row.temperatureUnit,
    note: row.note,
  };
}

/**
 * The columns a save writes, validated into the branded types the schema
 * declares. Only the fields the update names appear, so Evolu's one message
 * carries only what changed and the other partner's columns survive.
 */
type ObservationColumns = Partial<
  Omit<MutationValues<(typeof Schema)["observation"], "upsert">, "id" | "civilDate">
>;

const toSqliteBoolean = (value: boolean | null | undefined) =>
  value === null || value === undefined ? null : ((value ? 1 : 0) as 0 | 1);

function toColumns(update: ObservationUpdate): ObservationColumns {
  const columns: { -readonly [K in keyof ObservationColumns]: ObservationColumns[K] } = {};
  if (update.monitorReading !== undefined) columns.monitorReading = update.monitorReading;
  if (update.bleeding !== undefined) columns.bleeding = update.bleeding;
  if (update.userMarkedPeak !== undefined)
    columns.userMarkedPeak = toSqliteBoolean(update.userMarkedPeak);
  if (update.intercourse !== undefined)
    columns.intercourse = toSqliteBoolean(update.intercourse);
  if (update.lhStrip !== undefined) columns.lhStrip = update.lhStrip;
  if (update.mucus !== undefined) columns.mucus = update.mucus;
  if (update.temperature !== undefined) {
    columns.temperature =
      update.temperature === null ? null : FiniteNumber.orThrow(update.temperature);
  }
  if (update.temperatureUnit !== undefined) columns.temperatureUnit = update.temperatureUnit;
  if (update.note !== undefined) {
    // An empty note is no note. Evolu's string type rejects an empty string,
    // and "the partner cleared the note" and "the partner never wrote one" are
    // the same fact about the day.
    const note = update.note?.trim() ?? "";
    columns.note = note === "" ? null : NonEmptyTrimmedString1000.orThrow(note);
  }
  return columns;
}

async function boot(
  observations: ReturnType<typeof ref<readonly Observation[]>>,
): Promise<Evolu<typeof Schema>> {
  // Must run before createEvoluDeps(). iOS 26's WKWebView exposes SharedWorker,
  // but under capacitor://localhost it fails SILENTLY: no error surfaces and
  // every query hangs forever, presenting as a permanent spinner with a clean
  // console. Deleting it selects Evolu's one-tab dedicated-Worker path, which
  // Android already uses. A Capacitor app is only ever one tab, so nothing is
  // lost. This looks like dead code and is not (ADR 0012,
  // prototype/evolu-capacitor/VERDICT.md).
  //
  // ADR 0012 requires this on native. It is unconditional here because the same
  // fault, in a milder form, is reproducible in desktop Chrome over
  // http://127.0.0.1: with the SharedWorker path, a reload comes back to an
  // empty Chart while the record sits in OPFS, unread. Verelle is one tab
  // everywhere it ships, and the browser smoke has to exercise the path the
  // phones take or it is testing an app nobody runs.
  delete (globalThis as { SharedWorker?: unknown }).SharedWorker;

  const run = createRun(createEvoluDeps());
  const result = await run(
    createEvolu(Schema, {
      appName: AppName.orThrow("Verelle"),
      // PROVISIONAL, replaced in issue #12 by owner material from the platform
      // keystore (ADR 0013). Evolu's own deterministic test secret is used
      // deliberately: it is not a secret, it protects nothing, and it is named
      // so that it cannot quietly become permanent. It is never written to
      // localStorage, sessionStorage, IndexedDB or any other web-storage
      // surface, which is the trap the spike fell into on purpose and ADR 0013
      // exists to stop.
      appOwner: createAppOwner(testOwnerSecret),
      // No sync in this ticket. Passing no transports also means the
      // provisional owner above never reaches a relay.
      transports: [],
    }),
  );

  // The error type is `never` - creating the database cannot fail in a way
  // the app could handle - so unwrapping is honest rather than lazy.
  const evolu = getOrThrow(result);
  const publish = () => {
    observations.value = evolu
      .getQueryRows(allObservations)
      .map(toObservation)
      .filter((observation) => observation !== null);
  };
  evolu.subscribeQuery(allObservations)(publish);
  await evolu.loadQuery(allObservations);
  publish();
  return evolu;
}

/**
 * Opens the local database and returns the store immediately, before the
 * database is ready.
 *
 * Returning synchronously is the point: the app paints and accepts taps at
 * once, and a save made before the database has opened is queued on the boot
 * promise rather than dropped. Nothing here disables a control while it works
 * - v1's global busy flag is exactly the bug this shape avoids.
 */
export function createEvoluObservationStore(): ObservationStore {
  const observations = ref<readonly Observation[]>([]);
  const ready = boot(observations);
  // A boot failure belongs to the save that needed the database, where the
  // caller can react to it, not to a bare unhandled rejection at launch.
  void ready.catch(() => undefined);

  return {
    upsert: async (civilDate: CivilDate, update: ObservationUpdate) => {
      const evolu = await ready;
      await new Promise<void>((resolve) => {
        evolu.upsert(
          "observation",
          {
            // The Civil date is the natural key, so the row id is derived from
            // it: recording the same day twice updates one row instead of
            // growing a second.
            id: ObservationId.orThrow(createIdFromString(civilDate)),
            civilDate: NonEmptyTrimmedString100.orThrow(civilDate),
            ...toColumns(update),
          },
          { onComplete: resolve },
        );
      });
    },
    observe: () => observations,
  };
}
