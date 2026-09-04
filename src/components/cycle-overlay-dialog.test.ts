import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";

import { createMemoryObservationStore } from "../observations/memory-store";
import { observationStoreKey } from "../observations/store";
import CycleOverlayDialog from "./CycleOverlayDialog.vue";

describe("CycleOverlayDialog component", () => {
  function createTestApp(props: InstanceType<typeof CycleOverlayDialog>["$props"]) {
    const store = createMemoryObservationStore();
    const app = createSSRApp({
      render: () => h(CycleOverlayDialog, props),
    });
    app.provide(observationStoreKey, store);
    return { app, store };
  }

  it("renders select dropdown with toggle button when cycleStartDates are present", async () => {
    const { app } = createTestApp({
      startDate: "2026-06-01",
      cycleStartDates: ["2026-05-01", "2026-06-01"],
    });

    const html = await renderToString(app);
    expect(html).toContain('data-testid="cycle-select"');
    expect(html).toContain("Cycle starting 2026-05-01");
    expect(html).toContain("Cycle starting 2026-06-01");
    expect(html).toContain('data-testid="toggle-new-cycle-date"');
    expect(html).toContain("Enter a new cycle start date");
  });

  it("renders date input directly when no cycleStartDates exist", async () => {
    const { app } = createTestApp({
      cycleStartDates: [],
    });

    const html = await renderToString(app);
    expect(html).not.toContain('data-testid="cycle-select"');
    expect(html).toContain('data-testid="cycle-start-input"');
  });

  it("includes postpartum protocol families in protocol family select", async () => {
    const { app } = createTestApp({
      cycleStartDates: ["2026-06-01"],
    });

    const html = await renderToString(app);
    expect(html).toContain("postpartum_cycle_zero_original");
    expect(html).toContain("postpartum_return_to_cycles");
    expect(html).toContain("Postpartum cycle zero");
    expect(html).toContain("Postpartum return to cycles");
  });
});
