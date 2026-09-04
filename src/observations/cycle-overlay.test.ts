import { describe, expect, it } from "vitest";

import {
  applyCycleOverlayUpdate,
  cycleOverlayUpdateOf,
  defaultCycleOverlay,
  defaultProtocolVersion,
  PROTOCOL_FAMILIES,
  PROTOCOL_FAMILY_LABELS,
  PROTOCOL_VERSIONS,
  PROTOCOL_VERSION_LABELS,
  INTENTIONS,
  INTENTION_LABELS,
  type CycleOverlayFields,
} from "./cycle-overlay";

describe("Protocol families", () => {
  it("includes the five shipped families from ADR 0015", () => {
    expect(PROTOCOL_FAMILIES).toEqual([
      "regular_monitor",
      "regular_monitor_plus_mucus",
      "mucus_only",
      "postpartum_cycle_zero_original",
      "postpartum_return_to_cycles",
    ]);
  });

  it("provides a default protocol version for each family", () => {
    expect(defaultProtocolVersion("regular_monitor")).toBe(
      "marquette_regular_manual_public",
    );
    expect(defaultProtocolVersion("regular_monitor_plus_mucus")).toBe(
      "marquette_regular_plus_mucus_manual",
    );
    expect(defaultProtocolVersion("mucus_only")).toBe("marquette_mucus_only_manual");
    expect(defaultProtocolVersion("postpartum_cycle_zero_original")).toBe(
      "marquette_postpartum_cycle_zero_2005",
    );
    expect(defaultProtocolVersion("postpartum_return_to_cycles")).toBe(
      "marquette_postpartum_return_to_cycles_2013",
    );
  });

  it("provides human-readable labels for each family", () => {
    expect(PROTOCOL_FAMILY_LABELS.regular_monitor).toBe("Regular monitor");
    expect(PROTOCOL_FAMILY_LABELS.regular_monitor_plus_mucus).toBe("Monitor with mucus");
    expect(PROTOCOL_FAMILY_LABELS.mucus_only).toBe("Mucus only");
    expect(PROTOCOL_FAMILY_LABELS.postpartum_cycle_zero_original).toBe("Postpartum cycle zero");
    expect(PROTOCOL_FAMILY_LABELS.postpartum_return_to_cycles).toBe("Postpartum return to cycles");
  });

  it("includes published protocol versions with labels", () => {
    expect(PROTOCOL_VERSIONS).toHaveLength(5);
    for (const version of PROTOCOL_VERSIONS) {
      expect(PROTOCOL_VERSION_LABELS[version]).toBeDefined();
    }
  });
});

describe("Intentions", () => {
  it("includes avoid and achieve with human-readable labels", () => {
    expect(INTENTIONS).toEqual(["avoid", "achieve"]);
    expect(INTENTION_LABELS.avoid).toBe("Avoid pregnancy");
    expect(INTENTION_LABELS.achieve).toBe("Achieve pregnancy");
  });
});

describe("defaultCycleOverlay", () => {
  it("creates an unchosen overlay keyed by Cycle Day 1 Civil date", () => {
    expect(defaultCycleOverlay("2026-08-01")).toEqual({
      startDate: "2026-08-01",
      protocolFamily: null,
      protocolVersion: null,
      intention: null,
      postpartumCycleNumber: null,
    });
  });
});

describe("applyCycleOverlayUpdate", () => {
  it("writes only named fields, so a partner setting one choice does not wipe another", () => {
    const hers = applyCycleOverlayUpdate(defaultCycleOverlay("2026-08-01"), {
      protocolFamily: "regular_monitor",
      protocolVersion: "marquette_regular_manual_public",
    });

    const his = applyCycleOverlayUpdate(hers, {
      intention: "avoid",
    });

    expect(his.protocolFamily).toBe("regular_monitor");
    expect(his.protocolVersion).toBe("marquette_regular_manual_public");
    expect(his.intention).toBe("avoid");
    expect(his.postpartumCycleNumber).toBeNull();
  });

  it("can record a postpartum cycle number for return-to-cycles", () => {
    const overlay = applyCycleOverlayUpdate(defaultCycleOverlay("2026-08-01"), {
      protocolFamily: "postpartum_return_to_cycles",
      postpartumCycleNumber: 2,
    });

    expect(overlay.protocolFamily).toBe("postpartum_return_to_cycles");
    expect(overlay.postpartumCycleNumber).toBe(2);
  });

  it("never moves an overlay to a different startDate", () => {
    const initial = defaultCycleOverlay("2026-08-01");
    const updated = applyCycleOverlayUpdate(initial, { protocolFamily: "mucus_only" });
    expect(updated.startDate).toBe("2026-08-01");
  });
});

describe("cycleOverlayUpdateOf", () => {
  const values: CycleOverlayFields = {
    protocolFamily: "regular_monitor",
    protocolVersion: "marquette_regular_manual_public",
    intention: "avoid",
    postpartumCycleNumber: null,
  };

  it("carries only the edited fields so untouched columns survive sync", () => {
    expect(cycleOverlayUpdateOf(values, new Set(["protocolFamily"]))).toEqual({
      protocolFamily: "regular_monitor",
    });
  });

  it("carries explicitly cleared fields", () => {
    expect(
      cycleOverlayUpdateOf({ ...values, intention: null }, new Set(["intention"])),
    ).toEqual({
      intention: null,
    });
  });
});
