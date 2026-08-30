/**
 * An {@link ObservationStore} that keeps everything in memory.
 *
 * For tests and for anything that needs the app's behaviour without a
 * database. It merges field by field exactly as the Evolu-backed store does,
 * so a test written against it stays honest about what two phones will agree
 * on.
 */
import { ref } from "vue";

import type { CivilDate } from "../chart/civil-date";
import type { Observation, ObservationUpdate } from "./observation";
import { applyUpdate, unrecordedObservation } from "./observation";
import type { ObservationStore } from "./store";

export function createMemoryObservationStore(): ObservationStore {
  const rows = new Map<CivilDate, Observation>();
  const observations = ref<readonly Observation[]>(snapshot());

  function snapshot(): readonly Observation[] {
    return [...rows.values()].sort((a, b) => a.civilDate.localeCompare(b.civilDate));
  }

  return {
    upsert: (civilDate, update: ObservationUpdate) => {
      const existing = rows.get(civilDate) ?? unrecordedObservation(civilDate);
      rows.set(civilDate, applyUpdate(existing, update));
      observations.value = snapshot();
      return Promise.resolve();
    },
    observe: () => observations,
  };
}
