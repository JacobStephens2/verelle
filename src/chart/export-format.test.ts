import { describe, expect, it } from "vitest";
import { formatChartCsv, formatChartHtml } from "./export-format";
import type { Chart } from "./projection";
import type { Observation } from "../observations/observation";
import { makeTestCycle } from "./test-cycle";

describe("export-format", () => {
  const testCycle1 = makeTestCycle("2026-01-01", 28);
  const testObservations: Observation[] = [
    {
      civilDate: "2026-01-01",
      monitorReading: null,
      bleeding: "Heavy",
      intercourse: true,
      mucus: null,
      temperature: null,
      temperatureUnit: null,
      lhStrip: null,
      peakOverride: null,
      note: "Cycle start note",
    },
    {
      civilDate: "2026-01-10",
      monitorReading: "High",
      bleeding: null,
      intercourse: false,
      mucus: "clear and stretchy like egg white",
      temperature: 97.4,
      temperatureUnit: "F",
      lhStrip: "Positive",
      peakOverride: null,
      note: null,
    },
    {
      civilDate: "2026-01-14",
      monitorReading: "Peak",
      bleeding: null,
      intercourse: null,
      mucus: null,
      temperature: null,
      temperatureUnit: null,
      lhStrip: null,
      peakOverride: null,
      note: null,
    },
  ];

  const testChart: Chart = {
    today: "2026-01-28",
    cycles: [testCycle1],
    unassignedDays: [],
    eligibilityWarnings: [],
  };

  describe("formatChartCsv", () => {
    it("generates valid CSV with header and cycle rows", () => {
      const csv = formatChartCsv(testChart, testObservations);
      const lines = csv.trim().split("\n");

      expect(lines[0]).toBe(
        "Cycle,Cycle Day,Date,Monitor Reading,Bleeding,Mucus Description,Mucus Category,LH Strip,Temperature,Intercourse,Peak Annotation,Day Status,Notes",
      );

      // Line 2 is Cycle Day 1
      expect(lines[1]).toContain("1,1,2026-01-01");
      expect(lines[1]).toContain("Heavy");
      expect(lines[1]).toContain("Yes");
      expect(lines[1]).toContain("Cycle start note");

      // Cycle Day 10 (index 10 in lines, since line 0 is header)
      const day10Line = lines.find((l) => l.includes("2026-01-10"));
      expect(day10Line).toBeDefined();
      expect(day10Line).toContain("High");
      expect(day10Line).toContain("clear and stretchy like egg white");
      expect(day10Line).toContain("Peak"); // Mucus category
      expect(day10Line).toContain("Positive");
      expect(day10Line).toContain("97.4°F");
      expect(day10Line).toContain("No");
    });

    it("escapes fields containing commas or quotes", () => {
      const obsWithComma: Observation = {
        civilDate: "2026-01-01",
        monitorReading: null,
        bleeding: null,
        intercourse: null,
        mucus: null,
        temperature: null,
        temperatureUnit: null,
        lhStrip: null,
        peakOverride: null,
        note: 'Note with "quotes" and, commas',
      };
      const csv = formatChartCsv(testChart, [obsWithComma]);
      expect(csv).toContain('"Note with ""quotes"" and, commas"');
    });
  });

  describe("formatChartHtml", () => {
    it("generates an instructor-readable HTML chart report", () => {
      const html = formatChartHtml(testChart, testObservations);

      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toContain("<title>Verelle Chart Export</title>");
      expect(html).toContain("Cycle 1");
      expect(html).toContain("2026-01-01");
      expect(html).toContain("Heavy");
      expect(html).toContain("High");
      expect(html).toContain("clear and stretchy like egg white");
      expect(html).toContain("Method disclaimer");
      expect(html).toContain("certified Marquette instructor");
      // Check no advice words
      expect(html.toLowerCase()).not.toContain("safe");
      expect(html.toLowerCase()).not.toContain("unsafe");
      expect(html.toLowerCase()).not.toContain("should");
    });
  });
});
