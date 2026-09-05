import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";

import InsightsView from "./InsightsView.vue";
import { projectChart } from "../chart/projection";
import { defaultCycleOverlay } from "../observations/cycle-overlay";
import { applyUpdate, unrecordedObservation } from "../observations/observation";

describe("InsightsView component rendering", () => {
  // Cycle 1: 28 days (2026-01-01 to 2026-01-28)
  const c1Start = applyUpdate(unrecordedObservation("2026-01-01"), { bleeding: "Heavy" });
  // Cycle 2: 32 days (2026-01-29 to 2026-03-01)
  const c2Start = applyUpdate(unrecordedObservation("2026-01-29"), { bleeding: "Heavy" });
  // Cycle 3: in progress (2026-03-02 to 2026-03-10)
  const c3Start = applyUpdate(unrecordedObservation("2026-03-02"), { bleeding: "Heavy" });

  const overlay1 = defaultCycleOverlay("2026-01-01");
  const overlay2 = defaultCycleOverlay("2026-01-29");
  const overlay3 = defaultCycleOverlay("2026-03-02");

  const chart = projectChart(
    [c1Start, c2Start, c3Start],
    "2026-03-10",
    [overlay1, overlay2, overlay3],
  );

  function createTestApp(props: InstanceType<typeof InsightsView>["$props"]) {
    return createSSRApp({
      render: () => h(InsightsView, props),
    });
  }

  it("renders cycle statistics summary with lengths and variation", async () => {
    const app = createTestApp({
      today: "2026-03-10",
      chart,
      observations: [c1Start, c2Start, c3Start],
    });

    const html = await renderToString(app);

    expect(html).toContain('data-testid="insights-view"');
    expect(html).toContain('data-testid="cycle-stats"');
    // Stats values: 28 shortest, 32 longest, variation 4 days (32 - 28)
    expect(html).toContain("28 days");
    expect(html).toContain("32 days");
    expect(html).toContain("4 days");
    expect(html).toContain("30 days"); // average
  });

  it("renders trend items for each recorded cycle", async () => {
    const app = createTestApp({
      today: "2026-03-10",
      chart,
      observations: [c1Start, c2Start, c3Start],
    });

    const html = await renderToString(app);

    expect(html).toContain('data-testid="cycle-trend-list"');
    expect(html).toContain("Cycle 1");
    expect(html).toContain("Cycle 2");
    expect(html).toContain("Cycle 3");
    expect(html).toContain("in progress");
  });

  it("renders export buttons for CSV and instructor chart", async () => {
    const app = createTestApp({
      today: "2026-03-10",
      chart,
      observations: [c1Start, c2Start, c3Start],
    });

    const html = await renderToString(app);

    expect(html).toContain('data-testid="export-csv-btn"');
    expect(html).toContain('data-testid="export-html-btn"');
    expect(html).toContain("Export as CSV");
    expect(html).toContain("Export Printable Chart");
  });

  it("contains zero forbidden advice words", async () => {
    const app = createTestApp({
      today: "2026-03-10",
      chart,
      observations: [c1Start, c2Start, c3Start],
    });

    const html = await renderToString(app);
    const lower = html.toLowerCase();

    expect(lower).not.toContain("safe");
    expect(lower).not.toContain("unsafe");
    expect(lower).not.toContain("should");
  });
});
