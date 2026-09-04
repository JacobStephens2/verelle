import { describe, expect, it } from "vitest";

import { createMemoryObservationStore } from "./memory-store";

describe("an observation store", () => {
  it("exposes whether its Observations have synced", () => {
    expect(createMemoryObservationStore().observeSyncState().value).toBe("synced");
  });

  it("observes an empty record before anything is saved", () => {
    expect(createMemoryObservationStore().observe().value).toEqual([]);
  });

  it("makes a saved Observation observable", async () => {
    const store = createMemoryObservationStore();
    const observations = store.observe();

    await store.upsert("2026-08-30", {
      monitorReading: "High",
      bleeding: "None",
      peakOverride: false,
      intercourse: true,
    });

    expect(observations.value).toHaveLength(1);
    expect(observations.value[0]).toMatchObject({
      civilDate: "2026-08-30",
      monitorReading: "High",
      intercourse: true,
    });
  });

  it("can set and clear a Peak override on a date", async () => {
    const store = createMemoryObservationStore();
    const observations = store.observe();

    await store.upsert("2026-08-30", { peakOverride: true });
    expect(observations.value[0]?.peakOverride).toBe(true);

    await store.upsert("2026-08-30", { peakOverride: false });
    expect(observations.value[0]?.peakOverride).toBe(false);

    await store.upsert("2026-08-30", { peakOverride: null });
    expect(observations.value[0]?.peakOverride).toBeNull();
  });

  it("keeps one row per Civil date, merging field by field", async () => {
    const store = createMemoryObservationStore();

    await store.upsert("2026-08-30", { monitorReading: "Peak" });
    await store.upsert("2026-08-30", { intercourse: true });

    expect(store.observe().value).toHaveLength(1);
    expect(store.observe().value[0]).toMatchObject({
      monitorReading: "Peak",
      intercourse: true,
    });
  });

  it("orders Observations by Civil date", async () => {
    const store = createMemoryObservationStore();

    await store.upsert("2026-08-30", { monitorReading: "Low" });
    await store.upsert("2026-08-28", { monitorReading: "High" });

    expect(store.observe().value.map((o) => o.civilDate)).toEqual([
      "2026-08-28",
      "2026-08-30",
    ]);
  });

  it("records Missed and Error as readings on their own dates", async () => {
    const store = createMemoryObservationStore();

    await store.upsert("2026-08-29", { monitorReading: "Missed" });
    await store.upsert("2026-08-30", { monitorReading: "Error" });

    expect(store.observe().value.map((o) => o.monitorReading)).toEqual([
      "Missed",
      "Error",
    ]);
  });

  it("observes an empty profile before anything is saved", () => {
    const store = createMemoryObservationStore();
    expect(store.observeProfile().value).toEqual({
      dateOfBirth: null,
      breastfeeding: null,
      postpartum: null,
      perimenopause: null,
      hormonalContraceptionStop: null,
    });
  });

  it("makes saved profile fields observable, storing date of birth as a date", async () => {
    const store = createMemoryObservationStore();
    await store.upsertProfile({
      dateOfBirth: "1994-06-12",
      breastfeeding: true,
      postpartum: true,
    });

    const profile = store.observeProfile().value;
    expect(profile.dateOfBirth).toBe("1994-06-12");
    expect(profile.breastfeeding).toBe(true);
    expect(profile.postpartum).toBe(true);
    expect(profile.perimenopause).toBeNull();
    expect(profile.hormonalContraceptionStop).toBeNull();
  });

  it("merges profile updates field by field so both partners win", async () => {
    const store = createMemoryObservationStore();

    await store.upsertProfile({ dateOfBirth: "1994-06-12" });
    await store.upsertProfile({ perimenopause: false, breastfeeding: true });

    expect(store.observeProfile().value).toMatchObject({
      dateOfBirth: "1994-06-12",
      breastfeeding: true,
      perimenopause: false,
    });
  });

  it("observes empty cycle overlays before any are saved", () => {
    expect(createMemoryObservationStore().observeCycleOverlays().value).toEqual([]);
  });

  it("can choose a Protocol family and Intention per Cycle and persist them", async () => {
    const store = createMemoryObservationStore();

    await store.upsertCycleOverlay("2026-08-01", {
      protocolFamily: "regular_monitor",
      protocolVersion: "marquette_regular_manual_public",
      intention: "avoid",
    });

    const overlays = store.observeCycleOverlays().value;
    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toEqual({
      startDate: "2026-08-01",
      protocolFamily: "regular_monitor",
      protocolVersion: "marquette_regular_manual_public",
      intention: "avoid",
      postpartumCycleNumber: null,
    });
  });

  it("merges cycle overlay updates field by field so both partners win", async () => {
    const store = createMemoryObservationStore();

    await store.upsertCycleOverlay("2026-08-01", { protocolFamily: "regular_monitor" });
    await store.upsertCycleOverlay("2026-08-01", { intention: "avoid" });

    const overlays = store.observeCycleOverlays().value;
    expect(overlays).toHaveLength(1);
    expect(overlays[0]).toMatchObject({
      startDate: "2026-08-01",
      protocolFamily: "regular_monitor",
      intention: "avoid",
    });
  });

  it("orders cycle overlays by ascending Cycle Day 1 Civil date", async () => {
    const store = createMemoryObservationStore();

    await store.upsertCycleOverlay("2026-09-01", { protocolFamily: "mucus_only" });
    await store.upsertCycleOverlay("2026-08-01", { protocolFamily: "regular_monitor" });

    expect(store.observeCycleOverlays().value.map((o) => o.startDate)).toEqual([
      "2026-08-01",
      "2026-09-01",
    ]);
  });
});
