import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";

import { projectChart } from "../chart/projection";
import { defaultCycleOverlay } from "../observations/cycle-overlay";
import { createMemoryObservationStore } from "../observations/memory-store";
import { applyUpdate, unrecordedObservation } from "../observations/observation";
import { observationStoreKey } from "../observations/store";
import RecordObservation from "./RecordObservation.vue";

describe("RecordObservation day details teaching surface integration", () => {
  const cd1 = applyUpdate(unrecordedObservation("2026-06-01"), { bleeding: "Heavy" });
  const cd6 = applyUpdate(unrecordedObservation("2026-06-06"), { monitorReading: "Low" });
  const peak = applyUpdate(unrecordedObservation("2026-06-14"), { monitorReading: "Peak" });

  const overlay = {
    ...defaultCycleOverlay("2026-06-01"),
    protocolFamily: "regular_monitor" as const,
    protocolVersion: "marquette_regular_manual_public" as const,
  };

  function createTestApp(componentProps: InstanceType<typeof RecordObservation>["$props"]) {
    const store = createMemoryObservationStore();
    const app = createSSRApp({
      render: () => h(RecordObservation, componentProps),
    });
    app.provide(observationStoreKey, store);
    return app;
  }

  it("surfaces why this day is fertile or infertile, the boundary rule, protocol version, and published source link in day details", async () => {
    const chart = projectChart([cd1, cd6, peak], "2026-06-20", [overlay]);

    // Render RecordObservation for Cycle Day 6 (2026-06-06), opened as Day Details
    const app = createTestApp({
      date: "2026-06-06",
      today: "2026-06-20",
      observations: [cd1, cd6, peak],
      showAllFields: true,
      chart,
      cycleOverlays: [overlay],
    });

    const html = await renderToString(app);

    // Day details title
    expect(html).toContain("Observation details");

    // The teaching surface explains why this day is fertile
    expect(html).toContain('data-testid="day-explanation"');
    expect(html).toContain("Cycle Day 6");
    expect(html).toContain("Fertile");
    expect(html).toContain("fertile window opens on Cycle Day 6");

    // Names the boundary rule
    expect(html).toContain('data-testid="boundary-rule"');
    expect(html).toContain("REG-START-1");

    // States protocol version
    expect(html).toContain('data-testid="protocol-version"');
    expect(html).toContain("Marquette Regular Manual (Public)");

    // Links to published source
    expect(html).toContain('data-testid="rule-source-link"');
    expect(html).toContain("https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf");
    expect(html).toContain("Marquette regular-cycles user manual");
  });

  it("explains why a pre-window day is infertile in day details", async () => {
    const chart = projectChart([cd1, cd6, peak], "2026-06-20", [overlay]);

    const app = createTestApp({
      date: "2026-06-02",
      today: "2026-06-20",
      observations: [cd1, cd6, peak],
      showAllFields: true,
      chart,
      cycleOverlays: [overlay],
    });

    const html = await renderToString(app);

    expect(html).toContain('data-testid="day-explanation"');
    expect(html).toContain("Cycle Day 2");
    expect(html).toContain("Infertile");
    expect(html).toContain("before the fertile window opens on Cycle Day 6");
    expect(html).toContain("REG-START-1");
  });

  it("surfaces provisional status and what would make it final when the end boundary is provisional", async () => {
    // Peak count incomplete: today is 2026-06-15 (P+1)
    const chart = projectChart([cd1, cd6, peak], "2026-06-15", [overlay]);

    const app = createTestApp({
      date: "2026-06-15",
      today: "2026-06-15",
      observations: [cd1, cd6, peak],
      showAllFields: true,
      chart,
      cycleOverlays: [overlay],
    });

    const html = await renderToString(app);

    expect(html).toContain('data-testid="day-explanation"');
    expect(html).toContain('data-testid="boundary-confidence"');
    expect(html).toContain("Provisional");
    expect(html).toContain('data-testid="provisional-explanation"');
    expect(html).toContain("Completing three full days after the last Monitor Peak will make it final");
  });
});
