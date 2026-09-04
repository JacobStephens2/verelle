import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";

import { projectChart } from "../chart/projection";
import { createMemoryObservationStore } from "../observations/memory-store";
import { applyUpdate, unrecordedObservation } from "../observations/observation";
import { defaultProfile } from "../observations/profile";
import ChartFrame from "./ChartFrame.vue";

describe("Cold open, onboarding, and disclaimer seam integration", () => {
  it("allows a new user to record a Monitor reading on first launch with no profile and no protocol family", async () => {
    const store = createMemoryObservationStore();
    const today = "2026-06-15";

    // 1. Initial state: no observations, no cycle overlays, default/null profile
    expect(store.observe().value).toEqual([]);
    expect(store.observeCycleOverlays().value).toEqual([]);
    expect(store.observeProfile().value).toEqual(defaultProfile());


    // 2. User records a Monitor reading on first launch
    await store.upsert(today, { monitorReading: "High" });

    const observations = store.observe().value;
    expect(observations.length).toBe(1);
    expect(observations[0]!.civilDate).toBe(today);
    expect(observations[0]!.monitorReading).toBe("High");

    // 3. Project Chart: renders recorded observation with NO fertile window band and NO eligibility warnings
    const chart = projectChart(observations, today, [], null);
    expect(chart.cycles).toEqual([]);
    expect(chart.unassignedDays.length).toBe(1);
    expect(chart.unassignedDays[0]!.civilDate).toBe(today);
    expect(chart.unassignedDays[0]!.monitorReading).toBe("High");
    expect(chart.eligibilityWarnings).toEqual([]);


    // 4. ChartFrame SSR presentation
    const chartApp = createSSRApp({
      render: () =>
        h(ChartFrame, {
          today,
          observations,
          cycleOverlays: [],
          profile: undefined,
        }),
    });
    const html = await renderToString(chartApp);

    // Unassigned day is rendered
    expect(html).toContain(today);
    expect(html).toContain("Monitor reading High");
    expect(html).toContain("Before Cycle Day 1");

    // No fertile window band
    expect(html).not.toContain('data-has-fertile-window="true"');
    expect(html).not.toContain("chart__cell--fertile");

    // Disclaimer is shown once at the start
    expect(html).toContain('data-testid="disclaimer"');
    expect(html).toContain('data-testid="dismiss-disclaimer"');

    // No protocol family offer before Cycle Day 1
    expect(html).not.toContain('data-testid="protocol-family-offer"');

    // No eligibility warnings
    expect(html).not.toContain('data-testid="eligibility-warning"');
  });

  it("offers a Protocol family at the first Cycle Day 1, which is skippable and renders no band until chosen", async () => {
    const today = "2026-06-15";
    // First Cycle Day 1 recorded with full flow bleeding
    const cd1 = applyUpdate(unrecordedObservation(today), { bleeding: "Heavy" });

    // Without a protocol family chosen
    const chartBeforeChoice = projectChart([cd1], today, [], null);
    expect(chartBeforeChoice.cycles.length).toBe(1);
    expect(chartBeforeChoice.cycles[0]!.fertileWindow).toBeNull();

    // ChartFrame renders the protocol family offer at Cycle Day 1
    const app = createSSRApp({
      render: () =>
        h(ChartFrame, {
          today,
          observations: [cd1],
          cycleOverlays: [],
        }),
    });
    const html = await renderToString(app);

    // Protocol family offer is present with choose and skip actions
    expect(html).toContain('data-testid="protocol-family-offer"');
    expect(html).toContain('data-testid="offer-choose-protocol"');
    expect(html).toContain('data-testid="offer-skip-protocol"');
    expect(html).toContain("Choose a Protocol family");

    // No fertile window band until a family is chosen
    expect(html).not.toContain('data-has-fertile-window="true"');
    expect(html).not.toContain("chart__cell--fertile");

    // Now if the user chooses a protocol family (e.g. regular_monitor)
    const overlay = {
      startDate: today,
      protocolFamily: "regular_monitor" as const,
      protocolVersion: "marquette_regular_manual_public" as const,
      intention: null,
      postpartumCycleNumber: null,
    };
    const chartAfterChoice = projectChart([cd1], today, [overlay], null);
    expect(chartAfterChoice.cycles[0]!.fertileWindow).not.toBeNull();
    expect(chartAfterChoice.cycles[0]!.fertileWindow?.start.cycleDay).toBe(6);

    const appWithChoice = createSSRApp({
      render: () =>
        h(ChartFrame, {
          today,
          observations: [cd1],
          cycleOverlays: [overlay],
        }),
    });
    const htmlWithChoice = await renderToString(appWithChoice);

    // Offer is no longer shown
    expect(htmlWithChoice).not.toContain('data-testid="protocol-family-offer"');

    // Fertile window band is now rendered
    expect(htmlWithChoice).toContain('data-has-fertile-window="true"');
    expect(htmlWithChoice).toContain('data-fertile-start="6"');
  });

  it("produces no eligibility warnings for unentered profile fields on cold open", () => {
    const today = "2026-06-15";
    // Null profile on cold open
    const chartNullProfile = projectChart([], today, [], null);
    expect(chartNullProfile.eligibilityWarnings).toEqual([]);

    // Profile with only empty/unentered fields
    const emptyProfile = {
      dateOfBirth: null,
      breastfeeding: null,
      postpartum: null,
      perimenopause: null,
      hormonalContraceptionStop: null,
    };
    const chartEmptyProfile = projectChart([], today, [], emptyProfile);
    expect(chartEmptyProfile.eligibilityWarnings).toEqual([]);
  });

  it("functions entirely local-first for offline and airplane mode cold open", async () => {
    // Memory store represents local-first zero-network operation
    const store = createMemoryObservationStore();
    const today = "2026-06-15";

    // Immediate local writes without waiting for network or throwing
    await store.upsert(today, { monitorReading: "Low", bleeding: "None" });
    const observations = store.observe().value;
    expect(observations.length).toBe(1);

    const chart = projectChart(observations, today, [], null);
    expect(chart.unassignedDays[0]!.monitorReading).toBe("Low");


    // SSR renders without network access
    const app = createSSRApp({
      render: () =>
        h(ChartFrame, {
          today,
          observations,
          syncState: "pending", // offline/pending sync state
          pairingState: "unpaired",
        }),
    });
    const html = await renderToString(app);
    expect(html).toContain("This Chart is only on this phone");
    expect(html).toContain("Pending changes");
    expect(html).toContain("Low");
  });
});
