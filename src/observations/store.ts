/**
 * The observation-store boundary.
 *
 * Everything that reads or writes Observations goes through this interface, so
 * that Evolu is reachable from exactly one module. Views never import Evolu -
 * that is what lets the Chart projection stay a pure function of Observations
 * plus today (issue #9).
 */
import { inject, type InjectionKey, type Ref } from "vue";

import type { CivilDate } from "../chart/civil-date";
import type { SyncState } from "../sync/sync-state";
import type { CycleOverlay, CycleOverlayUpdate } from "./cycle-overlay";
import type { Observation, ObservationUpdate } from "./observation";
import type { Profile, ProfileUpdate } from "./profile";

export interface ObservationStore {
  /**
   * Writes the named fields of one **Civil date**, creating the row if this is
   * the first thing recorded for that date. Fields the update does not name
   * are left as they are, which is what lets two partners edit different
   * fields of the same day and both win.
   *
   * Resolves once the write has been applied locally, so a caller can confirm
   * the save without polling.
   */
  upsert: (civilDate: CivilDate, update: ObservationUpdate) => Promise<void>;

  /** Every Observation, by ascending **Civil date**, kept up to date in place. */
  observe: () => Readonly<Ref<readonly Observation[]>>;

  /** Whether this Chart has completed its latest Relay sync. */
  observeSyncState: () => Readonly<Ref<SyncState>>;

  /**
   * Writes the named choices for one Cycle, keyed by its Cycle Day 1 Civil date.
   * Fields the update does not name are left untouched, so two partners editing
   * different choices for the same cycle both win.
   */
  upsertCycleOverlay: (startDate: CivilDate, update: CycleOverlayUpdate) => Promise<void>;

  /** Every Cycle overlay, ordered by ascending Cycle Day 1 Civil date. */
  observeCycleOverlays: () => Readonly<Ref<readonly CycleOverlay[]>>;

  /**
   * Writes the named profile fields for the couple. Fields the update does not
   * name are left untouched, so two partners editing different fields both win.
   */
  upsertProfile: (update: ProfileUpdate) => Promise<void>;

  /** The couple's profile, kept up to date in place. */
  observeProfile: () => Readonly<Ref<Profile>>;
}

/**
 * How views reach the store. One store is created at the app entry point and
 * injected; a view asks for this key and gets Observations, never a database.
 */
export const observationStoreKey: InjectionKey<ObservationStore> =
  Symbol("verelle.observationStore");

/** The store provided at the app entry point. */
export function useObservationStore(): ObservationStore {
  const store = inject(observationStoreKey);
  if (store === undefined) {
    throw new Error("No observation store was provided at the app entry point");
  }
  return store;
}
