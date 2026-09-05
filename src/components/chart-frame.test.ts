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

  it("renders achieving emphasis highlight and aria-label when highlight prop is true", async () => {
    const app = createSSRApp({
      render: () =>
        h(ChartCell, {
          day: { ...baseDay, monitorReading: "Peak", cycleDay: 14 },
          isToday: false,
          highlight: true,
          band: {
            inFertileWindow: true,
            isFertileStart: false,
            isFertileEnd: false,
            classes: ["chart__cell--fertile"],
          },
        }),
    });

    const html = await renderToString(app);
    expect(html).toContain("chart__cell--highlight");
    expect(html).toContain("stamp--highlight");
    expect(html).toContain('data-highlight="true"');
    expect(html).toContain("Achieving emphasis");
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

  it("renders eligibility warnings while computing and rendering the chart", async () => {
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
          profile: {
            dateOfBirth: "1980-01-01",
            breastfeeding: null,
            postpartum: null,
            perimenopause: null,
            hormonalContraceptionStop: null,
          },
        }),
    });

    const html = await renderToString(app);
    // Warning is rendered
    expect(html).toContain('data-testid="eligibility-warnings"');
    expect(html).toContain('data-testid="warning-reason"');
    expect(html).toContain("Find a Marquette instructor");

    // Chart and fertile window are still rendered
    expect(html).toContain('data-has-fertile-window="true"');
    expect(html).toContain("chart__cell--fertile");
  });

  it("renders a warning that the window may be less certain when a test was missed near expected Peak", async () => {
    const cd1Obs = applyUpdate(unrecordedObservation("2026-06-01"), { bleeding: "Heavy" });
    const highObs = applyUpdate(unrecordedObservation("2026-06-12"), { monitorReading: "High" });
    const missedObs = applyUpdate(unrecordedObservation("2026-06-14"), { monitorReading: "Missed" });
    const overlay = {
      ...defaultCycleOverlay("2026-06-01"),
      protocolFamily: "regular_monitor" as const,
      protocolVersion: "marquette_regular_manual_public" as const,
    };
    const app = createSSRApp({
      render: () =>
        h(ChartFrame, {
          today: "2026-06-20",
          observations: [cd1Obs, highObs, missedObs],
          cycleOverlays: [overlay],
        }),
    });

    const html = await renderToString(app);
    expect(html).toContain('data-testid="eligibility-warnings"');
    expect(html).toContain('data-testid="eligibility-warning"');
    expect(html).toMatch(/missed.*expected Peak/i);
    expect(html).toContain("less certain");
  });

  describe("Method disclaimer", () => {
    it("renders the disclaimer once at the start of the chart frame", async () => {
      const app = createSSRApp({
        render: () =>
          h(ChartFrame, {
            today: "2026-06-20",
            observations: [cd1, peak],
            cycleOverlays: [],
          }),
      });

      const html = await renderToString(app);
      expect(html).toContain('data-testid="disclaimer"');
      expect(html).toContain("Method disclaimer");
      expect(html).toContain("instructor");
      expect(html).toMatch(/charting tool|not a medical device/i);
    });

    it("does not repeat the disclaimer per day in chart cells or cycle rows", async () => {
      const app = createSSRApp({
        render: () =>
          h(ChartFrame, {
            today: "2026-06-20",
            observations: [cd1, peak],
            cycleOverlays: [],
          }),
      });

      const html = await renderToString(app);
      // Exactly one disclaimer section on screen
      const occurrences = (html.match(/data-testid="disclaimer"/g) || []).length;
      expect(occurrences).toBe(1);

      // Verify no cell carries disclaimer text
      const cellApp = createSSRApp({
        render: () =>
          h(ChartCell, {
            day: {
              civilDate: "2026-06-01",
              cycleDay: 1,
              monitorReading: null,
              markers: [],
              annotations: [],
              dayStatus: null,
            },
          }),
      });
      const cellHtml = await renderToString(cellApp);
      expect(cellHtml).not.toContain("disclaimer");
    });
  });

  describe("Protocol family offer at first Cycle Day 1", () => {
    it("does not offer a protocol family before Cycle Day 1", async () => {
      const monitorOnly = applyUpdate(unrecordedObservation("2026-06-01"), {
        monitorReading: "Low",
      });
      const app = createSSRApp({
        render: () =>
          h(ChartFrame, {
            today: "2026-06-02",
            observations: [monitorOnly],
            cycleOverlays: [],
          }),
      });

      const html = await renderToString(app);
      expect(html).not.toContain('data-testid="protocol-family-offer"');
    });

    it("offers a protocol family at the first Cycle Day 1 when no protocol is chosen", async () => {
      const app = createSSRApp({
        render: () =>
          h(ChartFrame, {
            today: "2026-06-02",
            observations: [cd1],
            cycleOverlays: [],
          }),
      });

      const html = await renderToString(app);
      expect(html).toContain('data-testid="protocol-family-offer"');
      expect(html).toContain('data-testid="offer-choose-protocol"');
      expect(html).toContain('data-testid="offer-skip-protocol"');
      expect(html).toContain("Protocol family");
      // Still renders no band
      expect(html).not.toContain('data-has-fertile-window="true"');
      expect(html).not.toContain("chart__cell--fertile");
    });

    it("does not offer a protocol family once a protocol family has already been chosen", async () => {
      const overlay = {
        ...defaultCycleOverlay("2026-06-01"),
        protocolFamily: "regular_monitor" as const,
        protocolVersion: "marquette_regular_manual_public" as const,
      };
      const app = createSSRApp({
        render: () =>
          h(ChartFrame, {
            today: "2026-06-02",
            observations: [cd1],
            cycleOverlays: [overlay],
          }),
      });

      const html = await renderToString(app);
      expect(html).not.toContain('data-testid="protocol-family-offer"');
    });
  });

  describe("Intention emphasis in ChartFrame", () => {
    it("highlights High and Peak days on the Chart when Intention is achieve", async () => {
      const high = applyUpdate(unrecordedObservation("2026-06-11"), { monitorReading: "High" });
      const achieveOverlay = {
        ...defaultCycleOverlay("2026-06-01"),
        protocolFamily: "regular_monitor" as const,
        protocolVersion: "marquette_regular_manual_public" as const,
        intention: "achieve" as const,
      };

      const app = createSSRApp({
        render: () =>
          h(ChartFrame, {
            today: "2026-06-20",
            observations: [cd1, high, peak],
            cycleOverlays: [achieveOverlay],
          }),
      });

      const html = await renderToString(app);

      // Row carries achieve intention data attribute and class
      expect(html).toContain('data-intention="achieve"');
      expect(html).toContain("cycle-row--achieve");

      // High day (Cycle Day 11, 2026-06-11) is highlighted
      expect(html).toMatch(
        /class="[^"]*chart__cell--highlight[^"]*"[^>]*data-civil-date="2026-06-11"/,
      );
      expect(html).toMatch(
        /data-civil-date="2026-06-11"[^>]*data-highlight="true"/,
      );

      // Monitor Peak day (Cycle Day 14, 2026-06-14) is highlighted
      expect(html).toMatch(
        /class="[^"]*chart__cell--highlight[^"]*"[^>]*data-civil-date="2026-06-14"/,
      );
      expect(html).toMatch(
        /data-civil-date="2026-06-14"[^>]*data-highlight="true"/,
      );

      // Early fertile day before High (Cycle Day 6, 2026-06-06) is fertile but NOT highlighted
      expect(html).not.toMatch(
        /class="[^"]*chart__cell--highlight[^"]*"[^>]*data-civil-date="2026-06-06"/,
      );
    });

    it("does not highlight High readings that occur on infertile days outside the fertile window", async () => {
      // High reading recorded on Cycle Day 20 (post-ovulatory, infertile)
      const postWindowHigh = applyUpdate(unrecordedObservation("2026-06-20"), { monitorReading: "High" });
      const achieveOverlay = {
        ...defaultCycleOverlay("2026-06-01"),
        protocolFamily: "regular_monitor" as const,
        protocolVersion: "marquette_regular_manual_public" as const,
        intention: "achieve" as const,
      };

      const app = createSSRApp({
        render: () =>
          h(ChartFrame, {
            today: "2026-06-25",
            observations: [cd1, peak, postWindowHigh],
            cycleOverlays: [achieveOverlay],
          }),
      });

      const html = await renderToString(app);
      // Cycle Day 20 is infertile, so even with a High reading it must not receive achieving emphasis
      expect(html).not.toMatch(
        /class="[^"]*chart__cell--highlight[^"]*"[^>]*data-civil-date="2026-06-20"/,
      );
    });

    it("highlights High-category cervical mucus days within the fertile window when Intention is achieve", async () => {
      const highMucus = applyUpdate(unrecordedObservation("2026-06-10"), { mucus: "Creamy" });
      const achieveOverlay = {
        ...defaultCycleOverlay("2026-06-01"),
        protocolFamily: "regular_monitor_plus_mucus" as const,
        protocolVersion: "marquette_regular_plus_mucus_manual" as const,
        intention: "achieve" as const,
      };

      const app = createSSRApp({
        render: () =>
          h(ChartFrame, {
            today: "2026-06-20",
            observations: [cd1, highMucus, peak],
            cycleOverlays: [achieveOverlay],
          }),
      });

      const html = await renderToString(app);
      expect(html).toMatch(
        /class="[^"]*chart__cell--highlight[^"]*"[^>]*data-civil-date="2026-06-10"/,
      );
      expect(html).toMatch(
        /data-civil-date="2026-06-10"[^>]*data-highlight="true"/,
      );
    });

    it("defaults row intention to avoid and does not highlight High or Peak days when avoiding", async () => {
      const high = applyUpdate(unrecordedObservation("2026-06-11"), { monitorReading: "High" });
      const avoidOverlay = {
        ...defaultCycleOverlay("2026-06-01"),
        protocolFamily: "regular_monitor" as const,
        protocolVersion: "marquette_regular_manual_public" as const,
        intention: "avoid" as const,
      };

      const app = createSSRApp({
        render: () =>
          h(ChartFrame, {
            today: "2026-06-20",
            observations: [cd1, high, peak],
            cycleOverlays: [avoidOverlay],
          }),
      });

      const html = await renderToString(app);

      // Row carries avoid intention data attribute
      expect(html).toContain('data-intention="avoid"');
      expect(html).not.toContain("cycle-row--achieve");

      // High day and Peak day are NOT highlighted when avoiding
      expect(html).not.toMatch(
        /class="[^"]*chart__cell--highlight[^"]*"[^>]*data-civil-date="2026-06-11"/,
      );
      expect(html).not.toMatch(
        /class="[^"]*chart__cell--highlight[^"]*"[^>]*data-civil-date="2026-06-14"/,
      );
      expect(html).not.toContain('data-highlight="true"');
    });

    it("defaults intention to avoid when no overlay is provided", async () => {
      const app = createSSRApp({
        render: () =>
          h(ChartFrame, {
            today: "2026-06-20",
            observations: [cd1, peak],
            cycleOverlays: [],
          }),
      });

      const html = await renderToString(app);
      expect(html).toContain('data-intention="avoid"');
      expect(html).not.toContain("cycle-row--achieve");
    });
  });
});


