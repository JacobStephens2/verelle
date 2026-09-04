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
import type { CycleOverlay, CycleOverlayUpdate } from "./cycle-overlay";
import { applyCycleOverlayUpdate, defaultCycleOverlay } from "./cycle-overlay";
import type { Observation, ObservationUpdate } from "./observation";
import { applyUpdate, unrecordedObservation } from "./observation";
import type { Profile, ProfileUpdate } from "./profile";
import { applyProfileUpdate, defaultProfile } from "./profile";
import type { ObservationStore } from "./store";

export function createMemoryObservationStore(): ObservationStore {
  const rows = new Map<CivilDate, Observation>();
  const observations = ref<readonly Observation[]>(snapshot());
  const overlays = new Map<CivilDate, CycleOverlay>();
  const cycleOverlays = ref<readonly CycleOverlay[]>(snapshotOverlays());
  const profile = ref<Profile>(defaultProfile());
  const syncState = ref<"synced">("synced");

  function snapshot(): readonly Observation[] {
    return [...rows.values()].sort((a, b) => a.civilDate.localeCompare(b.civilDate));
  }

  function snapshotOverlays(): readonly CycleOverlay[] {
    return [...overlays.values()].sort((a, b) => a.startDate.localeCompare(b.startDate));
  }

  return {
    upsert: (civilDate, update: ObservationUpdate) => {
      const existing = rows.get(civilDate) ?? unrecordedObservation(civilDate);
      rows.set(civilDate, applyUpdate(existing, update));
      observations.value = snapshot();
      return Promise.resolve();
    },
    observe: () => observations,
    observeSyncState: () => syncState,

    upsertCycleOverlay: (startDate: CivilDate, update: CycleOverlayUpdate) => {
      const existing = overlays.get(startDate) ?? defaultCycleOverlay(startDate);
      overlays.set(startDate, applyCycleOverlayUpdate(existing, update));
      cycleOverlays.value = snapshotOverlays();
      return Promise.resolve();
    },
    observeCycleOverlays: () => cycleOverlays,

    upsertProfile: (update: ProfileUpdate) => {
      profile.value = applyProfileUpdate(profile.value, update);
      return Promise.resolve();
    },
    observeProfile: () => profile,
  };
}
