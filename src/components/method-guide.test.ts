import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";

import MethodGuide from "./MethodGuide.vue";

describe("MethodGuide component", () => {
  function createTestApp() {
    return createSSRApp({
      render: () => h(MethodGuide),
    });
  }

  it("renders method guide reachable container", async () => {
    const app = createTestApp();
    const html = await renderToString(app);

    expect(html).toContain('data-testid="method-guide"');
    expect(html).toContain("Marquette Method guide");
  });

  it("cites its sources with external links", async () => {
    const app = createTestApp();
    const html = await renderToString(app);

    expect(html).toContain('data-testid="method-sources"');
    expect(html).toContain('data-testid="source-link"');

    // Specific published sources
    expect(html).toContain("https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf");
    expect(html).toContain("Marquette regular-cycles user manual");

    expect(html).toContain("https://www.clearblue.com/sites/default/files/wysiwyg/fam_booklet_800834-14.pdf");
    expect(html).toContain("Clearblue Fertility Monitor booklet");

    expect(html).toContain("https://www.marquette.edu/nursing/institute-natural-family-planning/model.php");
    expect(html).toContain("Marquette University Institute for Natural Family Planning");

    expect(html).toContain("https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf");
  });

  it("explains the three Peaks and Peak count", async () => {
    const app = createTestApp();
    const html = await renderToString(app);

    expect(html).toContain('data-testid="guide-three-peaks"');
    expect(html).toContain("Monitor Peak");
    expect(html).toContain("Mucus Peak");
    expect(html).toContain("Peak override");

    expect(html).toContain('data-testid="guide-peak-count"');
    expect(html).toContain("P+1");
    expect(html).toContain("P+2");
    expect(html).toContain("P+3");
  });

  it("explains protocol families", async () => {
    const app = createTestApp();
    const html = await renderToString(app);

    expect(html).toContain('data-testid="guide-protocol-families"');
    expect(html).toContain("Regular monitor");
    expect(html).toContain("Monitor with mucus");
    expect(html).toContain("Mucus only");
    expect(html).toContain("Postpartum");
  });

  it("includes monitor setup coaching covering m button, testing window, first-morning urine, twenty-test limit", async () => {
    const app = createTestApp();
    const html = await renderToString(app);

    expect(html).toContain('data-testid="monitor-setup-coaching"');
    expect(html).toContain('data-testid="coaching-m-button"');
    expect(html).toContain('data-testid="coaching-testing-window"');
    expect(html).toContain('data-testid="coaching-first-morning-urine"');
    expect(html).toContain('data-testid="coaching-twenty-test-limit"');
  });

  it("contains no forbidden advice words ('safe', 'unsafe', 'should')", async () => {
    const app = createTestApp();
    const html = await renderToString(app);
    const lower = html.toLowerCase();

    expect(lower).not.toContain("safe");
    expect(lower).not.toContain("unsafe");
    expect(lower).not.toContain("should");
  });
});
