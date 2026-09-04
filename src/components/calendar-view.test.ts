import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";

import CalendarView from "./CalendarView.vue";
import { projectChart } from "../chart/projection";
import { defaultCycleOverlay } from "../observations/cycle-overlay";
import { applyUpdate, unrecordedObservation } from "../observations/observation";

describe("CalendarView component rendering", () => {
  const cd1 = applyUpdate(unrecordedObservation("2026-09-01"), { bleeding: "Heavy" });
  const cd6 = applyUpdate(unrecordedObservation("2026-09-06"), { monitorReading: "Low" });
  const cd11 = applyUpdate(unrecordedObservation("2026-09-11"), { monitorReading: "High" });
  const cd14 = applyUpdate(unrecordedObservation("2026-09-14"), {
    monitorReading: "Peak",
    intercourse: true,
  });

  const overlay = {
    ...defaultCycleOverlay("2026-09-01"),
    protocolFamily: "regular_monitor" as const,
    protocolVersion: "marquette_regular_manual_public" as const,
  };

  const chart = projectChart(
    [cd1, cd6, cd11, cd14],
    "2026-09-14",
    [overlay],
  );

  function createTestApp(props: InstanceType<typeof CalendarView>["$props"]) {
    return createSSRApp({
      render: () => h(CalendarView, props),
    });
  }

  it("renders month calendar with title, navigation buttons, and weekday headers", async () => {
    const app = createTestApp({
      today: "2026-09-14",
      chart,
      observations: [cd1, cd6, cd11, cd14],
      selectedDate: "2026-09-14",
    });

    const html = await renderToString(app);

    expect(html).toContain('class="calendar-view"');
    expect(html).toContain('data-testid="calendar-view"');
    expect(html).toContain('data-testid="calendar-month-title"');
    expect(html).toContain("September 2026");
    expect(html).toContain('data-testid="calendar-prev"');
    expect(html).toContain('data-testid="calendar-next"');

    // Weekdays
    expect(html).toContain("Sun");
    expect(html).toContain("Mon");
    expect(html).toContain("Tue");
    expect(html).toContain("Wed");
    expect(html).toContain("Thu");
    expect(html).toContain("Fri");
    expect(html).toContain("Sat");
  });

  it("renders empty padding cells and 30 day cells for September 2026", async () => {
    const app = createTestApp({
      today: "2026-09-14",
      chart,
      observations: [cd1, cd6, cd11, cd14],
      selectedDate: "2026-09-14",
    });

    const html = await renderToString(app);

    // Tuesday start = 2 empty cells
    const emptyCount = (html.match(/class="calendar-day empty"/g) || []).length;
    expect(emptyCount).toBe(2);

    // 30 day buttons
    const dayCount = (html.match(/data-testid="calendar-day"/g) || []).length;
    expect(dayCount).toBe(30);
  });

  it("renders cycle start marker on Cycle Day 1", async () => {
    const app = createTestApp({
      today: "2026-09-14",
      chart,
      observations: [cd1, cd6, cd11, cd14],
      selectedDate: "2026-09-14",
    });

    const html = await renderToString(app);

    expect(html).toMatch(/class="[^"]*\bcycle-start\b[^"]*"[^>]*data-civil-date="2026-09-01"/);
    expect(html).not.toMatch(/class="[^"]*\bcycle-start\b[^"]*"[^>]*data-civil-date="2026-09-02"/);
  });

  it("highlights today's cell with .today", async () => {
    const app = createTestApp({
      today: "2026-09-14",
      chart,
      observations: [cd1, cd6, cd11, cd14],
      selectedDate: "2026-09-14",
    });

    const html = await renderToString(app);

    expect(html).toMatch(/class="[^"]*\btoday\b[^"]*"[^>]*data-civil-date="2026-09-14"/);
    expect(html).not.toMatch(/class="[^"]*\btoday\b[^"]*"[^>]*data-civil-date="2026-09-06"/);
  });

  it("renders per-day markers with Verelle palette classes", async () => {
    const app = createTestApp({
      today: "2026-09-14",
      chart,
      observations: [cd1, cd6, cd11, cd14],
      selectedDate: "2026-09-14",
    });

    const html = await renderToString(app);

    // Low reading: calendar-stamp--low with 'L'
    expect(html).toContain("calendar-stamp--low");
    expect(html).toMatch(/class="[^"]*\bcalendar-stamp--low\b[^"]*"[^>]*>L<\/div>/);

    // High reading: calendar-stamp--high with 'H'
    expect(html).toContain("calendar-stamp--high");
    expect(html).toMatch(/class="[^"]*\bcalendar-stamp--high\b[^"]*"[^>]*>H<\/div>/);

    // Peak reading: calendar-stamp--peak with 'P'
    expect(html).toContain("calendar-stamp--peak");
    expect(html).toMatch(/class="[^"]*\bcalendar-stamp--peak\b[^"]*"[^>]*>P<\/div>/);

    // Bleeding: calendar-stamp--bleeding
    expect(html).toContain("calendar-stamp--bleeding");
  });

  it("renders intercourse indicator ❤️ on days with recorded intercourse", async () => {
    const app = createTestApp({
      today: "2026-09-14",
      chart,
      observations: [cd1, cd6, cd11, cd14],
      selectedDate: "2026-09-14",
    });

    const html = await renderToString(app);

    expect(html).toContain('class="calendar-intercourse"');
    expect(html).toContain("❤️");
  });

  it("renders fertile window days with in-fertile-window styling", async () => {
    const app = createTestApp({
      today: "2026-09-14",
      chart,
      observations: [cd1, cd6, cd11, cd14],
      selectedDate: "2026-09-14",
    });

    const html = await renderToString(app);

    // Fertile window opens on CD6 (2026-09-06)
    expect(html).toMatch(/class="[^"]*\bin-fertile-window\b[^"]*"[^>]*data-civil-date="2026-09-06"/);
    // CD2 (2026-09-02) is before fertile window
    expect(html).not.toMatch(/class="[^"]*\bin-fertile-window\b[^"]*"[^>]*data-civil-date="2026-09-02"/);
  });

  it("renders Go to Today action button", async () => {
    const app = createTestApp({
      today: "2026-09-14",
      chart,
      observations: [cd1, cd6, cd11, cd14],
      selectedDate: "2026-09-14",
    });

    const html = await renderToString(app);

    expect(html).toContain('data-testid="calendar-today-btn"');
    expect(html).toContain("Go to Today");
  });
});
