import { describe, expect, it } from "vitest";
import { createSSRApp, h } from "vue";
import { renderToString } from "@vue/server-renderer";

import type { EligibilityWarning } from "../chart/eligibility-warnings";
import { MARQUETTE_INSTRUCTOR_ROUTE } from "../chart/eligibility-warnings";
import EligibilityWarnings from "./EligibilityWarnings.vue";

describe("EligibilityWarnings component", () => {
  it("renders nothing when warnings list is empty", async () => {
    const app = createSSRApp({
      render: () => h(EligibilityWarnings, { warnings: [] }),
    });
    const html = await renderToString(app);
    expect(html).not.toContain('data-testid="eligibility-warnings"');
  });

  it("renders each warning with reason, limit, guidance, and instructor link", async () => {
    const warnings: EligibilityWarning[] = [
      {
        circumstance: "age_outside_range",
        reason: "Age (45) is outside the 20–42 range of the published regular-cycle instructions.",
        instructionLimit: "The Marquette regular-cycle manual publishes instructions tested for women aged 20–42.",
        conservativeGuidance: "Published method instructions advise teacher consultation for protocol adjustments outside this age range.",
        instructorRoute: MARQUETTE_INSTRUCTOR_ROUTE,
      },
    ];

    const app = createSSRApp({
      render: () => h(EligibilityWarnings, { warnings }),
    });
    const html = await renderToString(app);

    expect(html).toContain('data-testid="eligibility-warnings"');
    expect(html).toContain('data-testid="eligibility-warning"');
    expect(html).toContain('data-testid="warning-reason"');
    expect(html).toContain("20–42");
    expect(html).toContain('data-testid="warning-limit"');
    expect(html).toContain("Marquette regular-cycle manual");
    expect(html).not.toMatch(/Verelle/i);
    expect(html).toContain('data-testid="warning-guidance"');
    expect(html).toContain("Published method instructions");
    expect(html).toContain('data-testid="warning-instructor-link"');
    expect(html).toContain('href="https://www.marquettemethod.com/"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Find a Marquette instructor");
  });
});
