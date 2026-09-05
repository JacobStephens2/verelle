import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";

import App from "../App.vue";
import { createMemoryObservationStore } from "../observations/memory-store";
import { observationStoreKey } from "../observations/store";
import type { OwnerManager } from "../owners/owner-manager";
import { ownerManagerKey } from "../owners/owner-manager-store";
import CycleOverlayDialog from "./CycleOverlayDialog.vue";

describe("App Method Guide & Monitor Coaching integration", () => {
  function createTestApp() {
    const observationStore = createMemoryObservationStore();
    const fakeOwnerManager: OwnerManager = {
      load: async () => ({
        deviceOwner: "fake-device" as any,
        sharedOwner: "fake-shared" as any,
        sharedOwnerMnemonic: "fake-mnemonic" as any,
        pairingState: "unpaired",
      }),
      restoreSharedOwner: async () => ({ ok: true }),
      showPairingCode: async () => "fake-code",
      confirmShared: async () => {},
      joinSharedOwner: async () => ({ ok: true }),
    };

    const app = createSSRApp({
      render: () => h(App),
    });

    app.provide(observationStoreKey, observationStore);
    app.provide(ownerManagerKey, fakeOwnerManager);

    return { app, observationStore };
  }

  it("renders Guide option in the header view switcher and utility tools", async () => {
    const { app } = createTestApp();
    const html = await renderToString(app);

    expect(html).toContain('data-testid="view-guide"');
    expect(html).toContain('data-testid="open-guide"');
    expect(html).toContain("Guide");
    expect(html).toContain("Method guide");
  });

  it("surfaces monitor setup coaching covering first-morning urine and twenty-test limit at setup in CycleOverlayDialog", async () => {
    const observationStore = createMemoryObservationStore();
    const dialogApp = createSSRApp({
      render: () =>
        h(CycleOverlayDialog, {
          startDate: "2026-01-01",
          cycleStartDates: ["2026-01-01"],
        }),
    });
    dialogApp.provide(observationStoreKey, observationStore);

    const html = await renderToString(dialogApp);

    // Surfaced at setup
    expect(html).toContain('data-testid="monitor-setup-coaching"');
    expect(html).toContain('data-testid="coaching-m-button"');
    expect(html).toContain('data-testid="coaching-testing-window"');
    expect(html).toContain('data-testid="coaching-first-morning-urine"');
    expect(html).toContain('data-testid="coaching-twenty-test-limit"');
  });
});
