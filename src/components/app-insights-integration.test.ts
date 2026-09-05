import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";

import App from "../App.vue";
import { createMemoryObservationStore } from "../observations/memory-store";
import { observationStoreKey } from "../observations/store";
import type { OwnerManager } from "../owners/owner-manager";
import { ownerManagerKey } from "../owners/owner-manager-store";

describe("App Insights view integration", () => {
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

  it("renders segmented view toggle with Chart, Calendar, and Insights options in header", async () => {
    const { app } = createTestApp();
    const html = await renderToString(app);

    expect(html).toContain('data-testid="view-chart"');
    expect(html).toContain('data-testid="view-calendar"');
    expect(html).toContain('data-testid="view-insights"');
    expect(html).toContain("Chart");
    expect(html).toContain("Calendar");
    expect(html).toContain("Insights");
  });
});
