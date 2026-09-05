import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";

import type { FertileWindow } from "../chart/projection";
import DayExplanation from "./DayExplanation.vue";

describe("DayExplanation component", () => {
  const fertileWindow: FertileWindow = {
    start: {
      cycleDay: 6,
      ruleId: "REG-START-1",
      confidence: "final",
    },
    end: {
      cycleDay: 17,
      ruleId: "REG-END-1",
      confidence: "final",
    },
  };

  it("explains in plain language why a pre-window day is infertile, naming the boundary rule, protocol version, and linked source", async () => {
    const app = createSSRApp({
      render: () =>
        h(DayExplanation, {
          cycleDay: 2,
          dayStatus: "infertile",
          fertileWindow,
          protocolFamily: "regular_monitor",
          protocolVersion: "marquette_regular_manual_public",
        }),
    });

    const html = await renderToString(app);

    // Explains why infertile in plain language
    expect(html).toContain("Cycle Day 2 is infertile");
    expect(html).toContain("before the fertile window opens on Cycle Day 6");

    // Names the boundary rule that set the relevant window edge
    expect(html).toContain('data-testid="boundary-rule"');
    expect(html).toContain("REG-START-1");

    // Protocol version in force is visible
    expect(html).toContain('data-testid="protocol-version"');
    expect(html).toContain("Marquette Regular Manual (Public)");

    // Links to the published source it came from
    expect(html).toContain('data-testid="rule-source-link"');
    expect(html).toContain("https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf");
    expect(html).toContain("Marquette regular-cycles user manual");

    // Final boundary confidence
    expect(html).toContain('data-testid="boundary-confidence"');
    expect(html).toContain("Final");
  });

  it("explains why a fertile day is fertile when the window is open without a Peak, stating that the boundary is provisional and what makes it final", async () => {
    const openFertileWindow: FertileWindow = {
      start: {
        cycleDay: 6,
        ruleId: "REG-START-1",
        confidence: "final",
      },
      end: null,
    };

    const app = createSSRApp({
      render: () =>
        h(DayExplanation, {
          cycleDay: 8,
          dayStatus: "fertile",
          fertileWindow: openFertileWindow,
          protocolFamily: "regular_monitor",
          protocolVersion: "marquette_regular_manual_public",
        }),
    });

    const html = await renderToString(app);

    // Explains why fertile in plain language
    expect(html).toContain("Cycle Day 8 is fertile");
    expect(html).toContain("fertile window that opened on Cycle Day 6");

    // Names boundary rule
    expect(html).toContain('data-testid="boundary-rule"');
    expect(html).toContain("REG-START-1");

    // Protocol version
    expect(html).toContain('data-testid="protocol-version"');
    expect(html).toContain("Marquette Regular Manual (Public)");

    // Source link
    expect(html).toContain('data-testid="rule-source-link"');
    expect(html).toContain("https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf");

    // Provisional status and what makes it final
    expect(html).toContain('data-testid="boundary-confidence"');
    expect(html).toContain("Provisional");
    expect(html).toContain('data-testid="provisional-explanation"');
    expect(html).toContain("Recording a Monitor Peak and completing three full days after the last Monitor Peak will make it final");
  });

  it("marks start boundary day CD6 with final confidence even when end boundary is open", async () => {
    const openFertileWindow: FertileWindow = {
      start: {
        cycleDay: 6,
        ruleId: "REG-START-1",
        confidence: "final",
      },
      end: null,
    };

    const app = createSSRApp({
      render: () =>
        h(DayExplanation, {
          cycleDay: 6,
          dayStatus: "fertile",
          fertileWindow: openFertileWindow,
          protocolFamily: "regular_monitor",
          protocolVersion: "marquette_regular_manual_public",
        }),
    });

    const html = await renderToString(app);

    // Start day explains window opened on Cycle Day 6
    expect(html).toContain("Cycle Day 6 is fertile because the fertile window opens on Cycle Day 6");
    expect(html).toContain("REG-START-1");
    // Start boundary confidence is final
    expect(html).toContain('data-testid="boundary-confidence"');
    expect(html).toContain("Final");
    // No provisional warning on the final start boundary day
    expect(html).not.toContain('data-testid="provisional-explanation"');
  });

  it("explains why a fertile day is fertile when a Peak is recorded but the count is incomplete, stating the provisional end rule and what makes it final", async () => {
    const provisionalEndFertileWindow: FertileWindow = {
      start: {
        cycleDay: 6,
        ruleId: "REG-START-1",
        confidence: "final",
      },
      end: {
        cycleDay: 17,
        ruleId: "REG-END-1",
        confidence: "provisional",
      },
    };

    const app = createSSRApp({
      render: () =>
        h(DayExplanation, {
          cycleDay: 15,
          dayStatus: "fertile",
          fertileWindow: provisionalEndFertileWindow,
          protocolFamily: "regular_monitor",
          protocolVersion: "marquette_regular_manual_public",
        }),
    });

    const html = await renderToString(app);

    expect(html).toContain("Cycle Day 15 is fertile");
    expect(html).toContain("closes on Cycle Day 17");

    // When end rule is active, both the start rule and end rule are named and linked
    expect(html).toContain('data-testid="boundary-rule"');
    expect(html).toContain("REG-START-1");
    expect(html).toContain("REG-END-1");
    expect(html).toContain('data-testid="rule-source-link"');

    expect(html).toContain('data-testid="boundary-confidence"');
    expect(html).toContain("Provisional");
    expect(html).toContain('data-testid="provisional-explanation"');
    expect(html).toContain("Completing three full days after the last Monitor Peak will make it final");
  });

  it("explains why a post-window day is infertile, naming the closing boundary rule REG-END-1 and final confidence", async () => {
    const app = createSSRApp({
      render: () =>
        h(DayExplanation, {
          cycleDay: 18,
          dayStatus: "infertile",
          fertileWindow,
          protocolFamily: "regular_monitor",
          protocolVersion: "marquette_regular_manual_public",
        }),
    });

    const html = await renderToString(app);

    // Explains why infertile in plain language
    expect(html).toContain("Cycle Day 18 is infertile");
    expect(html).toContain("fertile window closed on Cycle Day 17");

    // Names closing boundary rule REG-END-1
    expect(html).toContain('data-testid="boundary-rule"');
    expect(html).toContain("REG-END-1");
    expect(html).toContain("End is three full days after last Monitor Peak");

    // Protocol version
    expect(html).toContain('data-testid="protocol-version"');
    expect(html).toContain("Marquette Regular Manual (Public)");

    // Source link
    expect(html).toContain('data-testid="rule-source-link"');
    expect(html).toContain("https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf");

    // Final boundary confidence
    expect(html).toContain('data-testid="boundary-confidence"');
    expect(html).toContain("Final");
  });

  it("renders nothing when fertileWindow is null or dayStatus is null", async () => {
    const app = createSSRApp({
      render: () =>
        h(DayExplanation, {
          cycleDay: 1,
          dayStatus: null,
          fertileWindow: null,
          protocolFamily: null,
          protocolVersion: null,
        }),
    });

    const html = await renderToString(app);
    expect(html).not.toContain("day-explanation");
  });

  it("explains fertility starting from earliest Peak minus six with REG-START-2", async () => {
    const historyStartWindow: FertileWindow = {
      start: {
        cycleDay: 7,
        ruleId: "REG-START-2",
        confidence: "final",
      },
      end: {
        cycleDay: 19,
        ruleId: "REG-END-2",
        confidence: "final",
      },
    };

    const app = createSSRApp({
      render: () =>
        h(DayExplanation, {
          cycleDay: 7,
          dayStatus: "fertile",
          fertileWindow: historyStartWindow,
          protocolFamily: "regular_monitor",
          protocolVersion: "marquette_regular_manual_public",
        }),
    });

    const html = await renderToString(app);
    expect(html).toContain("Cycle Day 7 is fertile");
    expect(html).toContain("opens on Cycle Day 7");
    expect(html).toContain("REG-START-2");
    expect(html).toContain("Earliest Monitor Peak of the last six cycles minus six");
    expect(html).toContain("https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf");
  });

  it("explains fertility starting earlier from first High with REG-START-3", async () => {
    const highStartWindow: FertileWindow = {
      start: {
        cycleDay: 5,
        ruleId: "REG-START-3",
        confidence: "final",
      },
      end: {
        cycleDay: 19,
        ruleId: "REG-END-2",
        confidence: "final",
      },
    };

    const app = createSSRApp({
      render: () =>
        h(DayExplanation, {
          cycleDay: 5,
          dayStatus: "fertile",
          fertileWindow: highStartWindow,
          protocolFamily: "regular_monitor",
          protocolVersion: "marquette_regular_manual_public",
        }),
    });

    const html = await renderToString(app);
    expect(html).toContain("Cycle Day 5 is fertile");
    expect(html).toContain("opens on Cycle Day 5");
    expect(html).toContain("REG-START-3");
    expect(html).toContain("First High reading earlier than calendar start");
    expect(html).toContain("https://device.report/m/5d2a8bd09ddf8f66399d538367a5d586e38444ab368d3e85f42fd740a0aeb0ea.pdf");
  });

  it("explains closing with missed-surge fallback REG-END-2 and links Case Reports source", async () => {
    const fallbackWindow: FertileWindow = {
      start: {
        cycleDay: 7,
        ruleId: "REG-START-2",
        confidence: "final",
      },
      end: {
        cycleDay: 19,
        ruleId: "REG-END-2",
        confidence: "final",
      },
    };

    const app = createSSRApp({
      render: () =>
        h(DayExplanation, {
          cycleDay: 20,
          dayStatus: "infertile",
          fertileWindow: fallbackWindow,
          protocolFamily: "regular_monitor",
          protocolVersion: "marquette_regular_manual_public",
        }),
    });

    const html = await renderToString(app);
    expect(html).toContain("Cycle Day 20 is infertile");
    expect(html).toContain("fertile window closed on Cycle Day 19");
    expect(html).toContain("REG-END-2");
    expect(html).toContain("Missed-surge fallback uses latest Monitor Peak from last six cycles plus three full days");
    expect(html).toContain("https://pmc.ncbi.nlm.nih.gov/articles/PMC6081769/");
    expect(html).toContain("Case Reports of the Marquette Method");
  });

  it("explains provisional confidence when REG-END-2 is provisional", async () => {
    const fallbackWindowProvisional: FertileWindow = {
      start: {
        cycleDay: 7,
        ruleId: "REG-START-2",
        confidence: "final",
      },
      end: {
        cycleDay: 19,
        ruleId: "REG-END-2",
        confidence: "provisional",
      },
    };

    const app = createSSRApp({
      render: () =>
        h(DayExplanation, {
          cycleDay: 10,
          dayStatus: "fertile",
          fertileWindow: fallbackWindowProvisional,
          protocolFamily: "regular_monitor",
          protocolVersion: "marquette_regular_manual_public",
        }),
    });

    const html = await renderToString(app);
    expect(html).toContain("Provisional");
    expect(html).toContain("Passing the historical fallback day or completing three full days after a Monitor Peak will make it final");
  });

  it("explains why a day is fertile under mucus_only with MUCUS-ONLY-START-3 and MUCUS-ONLY-END-1", async () => {
    const mucusWindow: FertileWindow = {
      start: {
        cycleDay: 5,
        ruleId: "MUCUS-ONLY-START-3",
        confidence: "final",
      },
      end: {
        cycleDay: 17,
        ruleId: "MUCUS-ONLY-END-1",
        confidence: "final",
      },
    };

    const app = createSSRApp({
      render: () =>
        h(DayExplanation, {
          cycleDay: 5,
          dayStatus: "fertile",
          fertileWindow: mucusWindow,
          protocolFamily: "mucus_only",
          protocolVersion: "marquette_mucus_only_manual",
        }),
    });

    const html = await renderToString(app);
    expect(html).toContain("Cycle Day 5 is fertile");
    expect(html).toContain("MUCUS-ONLY-START-3");
    expect(html).toContain("First mucus observation earlier than calendar start");
    expect(html).toContain("Marquette Mucus-Only Manual");
    expect(html).toContain("Marquette regular-cycles user manual");
  });

  it("explains provisional requirement under mucus_only when window is still open without peak", async () => {
    const openMucusWindow: FertileWindow = {
      start: {
        cycleDay: 6,
        ruleId: "MUCUS-ONLY-START-1",
        confidence: "final",
      },
      end: null,
    };

    const app = createSSRApp({
      render: () =>
        h(DayExplanation, {
          cycleDay: 8,
          dayStatus: "fertile",
          fertileWindow: openMucusWindow,
          protocolFamily: "mucus_only",
          protocolVersion: "marquette_mucus_only_manual",
        }),
    });

    const html = await renderToString(app);
    expect(html).toContain("Provisional");
    expect(html).toContain("Observing a non-Peak mucus day after a Mucus Peak and completing three full days will make it final");
  });

  it("explains day under regular_monitor_plus_mucus with MUCUS-START and MUCUS-END citing USCCB paper", async () => {
    const dualWindow: FertileWindow = {
      start: {
        cycleDay: 5,
        ruleId: "MUCUS-START",
        confidence: "final",
      },
      end: {
        cycleDay: 19,
        ruleId: "MUCUS-END",
        confidence: "final",
      },
      discrepancies: ["mucus_fertile_before_monitor_high", "mucus_peak_after_monitor_peak"],
    };

    const app = createSSRApp({
      render: () =>
        h(DayExplanation, {
          cycleDay: 10,
          dayStatus: "fertile",
          fertileWindow: dualWindow,
          protocolFamily: "regular_monitor_plus_mucus",
          protocolVersion: "marquette_regular_plus_mucus_manual",
        }),
    });

    const html = await renderToString(app);
    expect(html).toContain("Cycle Day 10 is fertile");
    expect(html).toContain("MUCUS-START");
    expect(html).toContain("MUCUS-END");
    expect(html).toContain("USCCB Marquette Model history/effectiveness paper");
    expect(html).toContain("https://www.usccb.org/resources/MM%20History%20and%20effectiveness%20Paper%202018.pdf");
  });

  it("explains cycle zero day when no High reading has occurred", async () => {
    const app = createSSRApp({
      render: () =>
        h(DayExplanation, {
          cycleDay: 5,
          dayStatus: "infertile",
          fertileWindow: null,
          protocolFamily: "postpartum_cycle_zero_original",
          protocolVersion: "marquette_postpartum_cycle_zero_2005",
        }),
    });

    const html = await renderToString(app);
    expect(html).toContain("Cycle Day 5 is infertile");
    expect(html).toContain("no High or Peak monitor reading has occurred");
    expect(html).toContain("PP0-START");
    expect(html).toContain("Marquette Postpartum Cycle 0 (2005)");
    expect(html).toContain("https://doi.org/10.1016/j.fertnstert.2005.03.042");
    expect(html).toContain("Final");
  });

  it("explains cycle zero fertile window with PP0-START and PP0-END", async () => {
    const pp0Window: FertileWindow = {
      start: {
        cycleDay: 10,
        ruleId: "PP0-START",
        confidence: "final",
      },
      end: {
        cycleDay: 16,
        ruleId: "PP0-END",
        confidence: "final",
      },
    };

    const app = createSSRApp({
      render: () =>
        h(DayExplanation, {
          cycleDay: 12,
          dayStatus: "fertile",
          fertileWindow: pp0Window,
          protocolFamily: "postpartum_cycle_zero_original",
          protocolVersion: "marquette_postpartum_cycle_zero_2005",
        }),
    });

    const html = await renderToString(app);
    expect(html).toContain("Cycle Day 12 is fertile");
    expect(html).toContain("PP0-START");
    expect(html).toContain("PP0-END");
    expect(html).toContain("Marquette Postpartum Cycle 0 (2005)");
    expect(html).toContain("https://doi.org/10.1016/j.fertnstert.2005.03.042");
  });

  it("explains return-to-cycles window with PP-RETURN-START-1 and PP-RETURN-END-1", async () => {
    const returnWindow: FertileWindow = {
      start: {
        cycleDay: 10,
        ruleId: "PP-RETURN-START-1",
        confidence: "final",
      },
      end: {
        cycleDay: 17,
        ruleId: "PP-RETURN-END-1",
        confidence: "final",
      },
    };

    const app = createSSRApp({
      render: () =>
        h(DayExplanation, {
          cycleDay: 12,
          dayStatus: "fertile",
          fertileWindow: returnWindow,
          protocolFamily: "postpartum_return_to_cycles",
          protocolVersion: "marquette_postpartum_return_to_cycles_2013",
        }),
    });

    const html = await renderToString(app);
    expect(html).toContain("Cycle Day 12 is fertile");
    expect(html).toContain("PP-RETURN-START-1");
    expect(html).toContain("PP-RETURN-END-1");
    expect(html).toContain("Marquette Postpartum Return to Cycles (2013)");
    expect(html).toContain("https://doi.org/10.3122/jabfm.2013.01.120126");
  });

  it("explains return-to-cycles early High override with PP-RETURN-START-HIGH", async () => {
    const returnWindow: FertileWindow = {
      start: {
        cycleDay: 8,
        ruleId: "PP-RETURN-START-HIGH",
        confidence: "final",
      },
      end: {
        cycleDay: 16,
        ruleId: "PP-RETURN-END-1",
        confidence: "final",
      },
    };

    const app = createSSRApp({
      render: () =>
        h(DayExplanation, {
          cycleDay: 8,
          dayStatus: "fertile",
          fertileWindow: returnWindow,
          protocolFamily: "postpartum_return_to_cycles",
          protocolVersion: "marquette_postpartum_return_to_cycles_2013",
        }),
    });

    const html = await renderToString(app);
    expect(html).toContain("Cycle Day 8 is fertile");
    expect(html).toContain("PP-RETURN-START-HIGH");
    expect(html).toContain("First High reading earlier than calendar start");
  });

  it("warns that the window may be less certain when a test was missed near expected Peak", async () => {
    const app = createSSRApp({
      render: () =>
        h(DayExplanation, {
          cycleDay: 14,
          dayStatus: "fertile",
          fertileWindow,
          protocolFamily: "regular_monitor",
          protocolVersion: "marquette_regular_manual_public",
          hasMissedNearExpectedPeak: true,
        }),
    });

    const html = await renderToString(app);
    expect(html).toContain('data-testid="missed-test-warning"');
    expect(html).toContain("less certain");
  });
});



