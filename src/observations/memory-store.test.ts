import { describe, expect, it } from "vitest";

import { createMemoryObservationStore } from "./memory-store";

describe("an observation store", () => {
  it("observes an empty record before anything is saved", () => {
    expect(createMemoryObservationStore().observe().value).toEqual([]);
  });

  it("makes a saved Observation observable", async () => {
    const store = createMemoryObservationStore();
    const observations = store.observe();

    await store.upsert("2026-08-30", {
      monitorReading: "High",
      bleeding: "None",
      userMarkedPeak: false,
      intercourse: true,
    });

    expect(observations.value).toHaveLength(1);
    expect(observations.value[0]).toMatchObject({
      civilDate: "2026-08-30",
      monitorReading: "High",
      intercourse: true,
    });
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
});
