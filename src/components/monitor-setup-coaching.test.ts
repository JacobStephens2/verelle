import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";

import MonitorSetupCoaching from "./MonitorSetupCoaching.vue";

describe("MonitorSetupCoaching component", () => {
  it("renders monitor setup coaching with m button and testing window", async () => {
    const app = createSSRApp({
      render: () => h(MonitorSetupCoaching),
    });

    const html = await renderToString(app);

    expect(html).toContain('data-testid="monitor-setup-coaching"');
    expect(html).toContain('data-testid="coaching-m-button"');
    expect(html).toContain('data-testid="coaching-testing-window"');

    // m button coaching details
    expect(html).toMatch(/m\s*button/i);
    expect(html).toMatch(/Cycle Day 1/i);

    // Testing window coaching details
    expect(html).toMatch(/testing window/i);
    expect(html).toMatch(/6-hour|six-hour|3 hours/i);
  });

  it("surfaces first-morning urine and the twenty-test limit", async () => {
    const app = createSSRApp({
      render: () => h(MonitorSetupCoaching),
    });

    const html = await renderToString(app);

    expect(html).toContain('data-testid="coaching-first-morning-urine"');
    expect(html).toContain('data-testid="coaching-twenty-test-limit"');

    // First morning urine details
    expect(html).toMatch(/first-morning urine/i);

    // Twenty-test limit details
    expect(html).toMatch(/20-test|twenty-test|twenty test/i);
  });

  it("contains no forbidden advice words ('safe', 'unsafe', 'should')", async () => {
    const app = createSSRApp({
      render: () => h(MonitorSetupCoaching),
    });

    const html = await renderToString(app);
    const lower = html.toLowerCase();

    expect(lower).not.toContain("safe");
    expect(lower).not.toContain("unsafe");
    expect(lower).not.toContain("should");
  });
});
