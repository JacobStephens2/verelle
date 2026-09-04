import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";

import type { ChartDay } from "../chart/projection";
import { defaultCycleOverlay } from "../observations/cycle-overlay";
import { applyUpdate, unrecordedObservation } from "../observations/observation";
import ChartCell from "./ChartCell.vue";
import ChartFrame from "./ChartFrame.vue";

describe("ChartCell component rendering", () => {
  const baseDay: ChartDay = {
    civilDate: "2026-06-06",
    cycleDay: 6,
    monitorReading: "Low",
    markers: ["monitor"],
    annotations: [],
    dayStatus: "fertile",
  };

  it("renders fertile band classes and Day status on cell and stamp button", async () => {
    const app = createSSRApp({
      render: () =>
        h(ChartCell, {
          day: baseDay,
          isToday: false,
          band: {
            inFertileWindow: true,
            isFertileStart: true,
            isFertileEnd: false,
            startConfidence: "final",
            classes: ["chart__cell--fertile", "chart__cell--fertile-start"],
          },
        }),
    });

    const html = await renderToString(app);
    expect(html).toContain("chart__cell--fertile");
    expect(html).toContain("chart__cell--fertile-start");
    expect(html).not.toContain("chart__cell--fertile-end");
    expect(html).toContain('data-day-status="fertile"');
    expect(html).toContain("Day status fertile");
  });

  it("renders provisional dashed end edge when boundary is provisional", async () => {
    const app = createSSRApp({
      render: () =>
        h(ChartCell, {
          day: { ...baseDay, cycleDay: 17, civilDate: "2026-06-17" },
          isToday: false,
          band: {
            inFertileWindow: true,
            isFertileStart: false,
            isFertileEnd: true,
            endConfidence: "provisional",
            classes: [
              "chart__cell--fertile",
              "chart__cell--fertile-end",
              "chart__cell--provisional-end",
            ],
          },
        }),
    });

    const html = await renderToString(app);
    expect(html).toContain("chart__cell--fertile");
    expect(html).toContain("chart__cell--fertile-end");
    expect(html).toContain("chart__cell--provisional-end");
  });

  it("omits band classes and day status when dayStatus is null and not in window", async () => {
    const app = createSSRApp({
      render: () =>
        h(ChartCell, {
          day: { ...baseDay, dayStatus: null },
          isToday: false,
          band: null,
        }),
    });

    const html = await renderToString(app);
    expect(html).not.toContain("chart__cell--fertile");
    expect(html).not.toContain("data-day-status");
    expect(html).not.toContain("Day status");
  });
});

describe("ChartFrame component presentation seam", () => {
  const cd1 = applyUpdate(unrecordedObservation("2026-06-01"), { bleeding: "Heavy" });
  const peak = applyUpdate(unrecordedObservation("2026-06-14"), { monitorReading: "Peak" });

  it("renders a continuous band behind the Cycle row when regular_monitor is selected", async () => {
    const overlay = {
      ...defaultCycleOverlay("2026-06-01"),
      protocolFamily: "regular_monitor" as const,
      protocolVersion: "marquette_regular_manual_public" as const,
    };

    const app = createSSRApp({
      render: () =>
        h(ChartFrame, {
          today: "2026-06-20",
          observations: [cd1, peak],
          cycleOverlays: [overlay],
        }),
    });

    const html = await renderToString(app);

    // The Cycle row indicates the fertile window
    expect(html).toContain('data-has-fertile-window="true"');
    expect(html).toContain('data-fertile-start="6"');
    expect(html).toContain('data-fertile-end="17"');
    expect(html).toContain('data-fertile-end-confidence="final"');

    // Start cell CD6 (2026-06-06) has start edge
    expect(html).toMatch(
      /class="[^"]*chart__cell--fertile-start[^"]*"[^>]*data-civil-date="2026-06-06"/,
    );

    // End cell CD17 (2026-06-17) has end edge (solid, not provisional)
    expect(html).toMatch(
      /class="[^"]*chart__cell--fertile-end[^"]*"[^>]*data-civil-date="2026-06-17"/,
    );
    expect(html).not.toMatch(
      /class="[^"]*chart__cell--provisional-end[^"]*"[^>]*data-civil-date="2026-06-17"/,
    );
  });

  it("renders a provisional dashed end edge when Peak count is incomplete", async () => {
    const overlay = {
      ...defaultCycleOverlay("2026-06-01"),
      protocolFamily: "regular_monitor" as const,
      protocolVersion: "marquette_regular_manual_public" as const,
    };

    // Today is 2026-06-15 (P+1, CD15 <= CD17)
    const app = createSSRApp({
      render: () =>
        h(ChartFrame, {
          today: "2026-06-15",
          observations: [cd1, peak],
          cycleOverlays: [overlay],
        }),
    });

    const html = await renderToString(app);
    expect(html).toContain('data-fertile-end-confidence="provisional"');
    expect(html).toContain('data-fertile-end="17"');
    expect(html).toContain("chart__cell--provisional-end");
  });

  it("renders a provisional dashed end edge through the end of the cycle when no Monitor Peak occurs", async () => {
    const overlay = {
      ...defaultCycleOverlay("2026-06-01"),
      protocolFamily: "regular_monitor" as const,
      protocolVersion: "marquette_regular_manual_public" as const,
    };

    // Cycle 1: 2026-06-01 to 2026-06-24 (24 days, no Peak).
    const cd5 = applyUpdate(unrecordedObservation("2026-06-05"), { bleeding: "None" });
    // Cycle 2 starts 2026-06-25.
    const cd1Cycle2 = applyUpdate(unrecordedObservation("2026-06-25"), { bleeding: "Heavy" });

    const app = createSSRApp({
      render: () =>
        h(ChartFrame, {
          today: "2026-06-26",
          observations: [cd1, cd5, cd1Cycle2],
          cycleOverlays: [overlay],
        }),
    });

    const html = await renderToString(app);

    // Cycle 1 has fertile window with end open
    expect(html).toContain('data-fertile-start="6"');
    expect(html).toContain('data-fertile-end="open"');
    expect(html).toContain('data-fertile-end-confidence="provisional"');

    // Start cell CD6 (2026-06-06) has start edge
    expect(html).toMatch(
      /class="[^"]*chart__cell--fertile-start[^"]*"[^>]*data-civil-date="2026-06-06"/,
    );

    // End cell CD24 (2026-06-24) has provisional dashed end edge
    expect(html).toMatch(
      /class="[^"]*chart__cell--fertile-end chart__cell--provisional-end[^"]*"[^>]*data-civil-date="2026-06-24"/,
    );
  });

  it("renders no band at all when no protocol family is chosen", async () => {
    const app = createSSRApp({
      render: () =>
        h(ChartFrame, {
          today: "2026-06-20",
          observations: [cd1, peak],
          cycleOverlays: [],
        }),
    });

    const html = await renderToString(app);
    expect(html).not.toContain('data-has-fertile-window="true"');
    expect(html).not.toContain("chart__cell--fertile");
    expect(html).not.toContain("data-day-status");
  });
});
