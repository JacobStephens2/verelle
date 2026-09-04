import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";

import { projectChart } from "../chart/projection";
import { defaultCycleOverlay } from "../observations/cycle-overlay";
import { applyUpdate, unrecordedObservation } from "../observations/observation";
import DayDetail from "./DayDetail.vue";

describe("DayDetail component", () => {
  const cd1 = applyUpdate(unrecordedObservation("2026-06-01"), { bleeding: "Heavy" });
  const cd6 = applyUpdate(unrecordedObservation("2026-06-06"), { monitorReading: "Low" });
  const cd14 = applyUpdate(unrecordedObservation("2026-06-14"), {
    monitorReading: "Peak",
    bleeding: "Spotting",
    peakOverride: true,
    intercourse: true,
    lhStrip: "Positive",
    mucus: "clear and stretchy like egg white",
    temperature: 98.6,
    temperatureUnit: "F",
    note: "Peak surge observed",
  });

  const overlay = {
    ...defaultCycleOverlay("2026-06-01"),
    protocolFamily: "regular_monitor" as const,
    protocolVersion: "marquette_regular_manual_public" as const,
  };

  const chart = projectChart([cd1, cd6, cd14], "2026-06-20", [overlay]);
  const cycle = chart.cycles[0];
  const day14 = cycle?.days.find((d) => d.civilDate === "2026-06-14");

  function createTestApp(componentProps: InstanceType<typeof DayDetail>["$props"]) {
    return createSSRApp({
      render: () => h(DayDetail, componentProps),
    });
  }

  it("renders everything recorded for a day using structural CSS rows", async () => {
    const app = createTestApp({
      date: "2026-06-14",
      observation: cd14,
      chartDay: day14,
      cycle,
      cycleOverlay: overlay,
    });

    const html = await renderToString(app);

    // Structural CSS container
    expect(html).toContain('class="day-detail"');
    expect(html).toContain('data-testid="day-detail"');

    // Date display
    expect(html).toContain("2026-06-14");

    // All recorded fields displayed in detail rows
    expect(html).toContain("Monitor reading");
    expect(html).toContain("Peak");
    expect(html).toContain("Bleeding");
    expect(html).toContain("Spotting");
    expect(html).toContain("Peak override");
    expect(html).toContain("Intercourse");
    expect(html).toContain("LH strip");
    expect(html).toContain("Positive");

    // Mucus description with its category
    expect(html).toContain("Mucus");
    expect(html).toContain("clear and stretchy like egg white (Peak)");

    // Temperature & scale
    expect(html).toContain("Temperature");
    expect(html).toContain("98.6 °F");

    // Note
    expect(html).toContain("Note");
    expect(html).toContain("Peak surge observed");

    // Teaching surface DayExplanation included
    expect(html).toContain('data-testid="day-explanation"');
    expect(html).toContain("Cycle Day 14");
    expect(html).toContain("Fertile");
  });

  it("renders an empty state when no observation exists for the day", async () => {
    const app = createTestApp({
      date: "2026-06-15",
      observation: null,
    });

    const html = await renderToString(app);

    expect(html).toContain('data-testid="day-detail"');
    expect(html).toContain("No Observation");
    expect(html).toContain("Nothing recorded for this day");
    expect(html).toContain("Add Observation");
  });
});
