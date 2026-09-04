import { describe, expect, it } from "vitest";

import type { Profile } from "../observations/profile";
import { defaultProfile } from "../observations/profile";
import { evaluateEligibilityWarnings } from "./eligibility-warnings";

describe("evaluateEligibilityWarnings", () => {
  const today = "2026-06-15";

  describe("Age outside 20–42", () => {
    it("produces no warning when date of birth has not been entered", () => {
      const profile: Profile = {
        ...defaultProfile(),
        dateOfBirth: null,
      };
      const warnings = evaluateEligibilityWarnings([], today, profile);
      expect(warnings).toEqual([]);
    });

    it("produces no warning when age is exactly 20", () => {
      const profile: Profile = {
        ...defaultProfile(),
        dateOfBirth: "2006-06-15", // exactly 20 on 2026-06-15
      };
      const warnings = evaluateEligibilityWarnings([], today, profile);
      expect(warnings.some((w) => w.circumstance === "age_outside_range")).toBe(false);
    });

    it("produces no warning when age is exactly 42", () => {
      const profile: Profile = {
        ...defaultProfile(),
        dateOfBirth: "1984-06-15", // exactly 42 on 2026-06-15
      };
      const warnings = evaluateEligibilityWarnings([], today, profile);
      expect(warnings.some((w) => w.circumstance === "age_outside_range")).toBe(false);
    });

    it("produces age warning when age is under 20 (e.g. 19)", () => {
      const profile: Profile = {
        ...defaultProfile(),
        dateOfBirth: "2006-06-16", // 19 on 2026-06-15
      };
      const warnings = evaluateEligibilityWarnings([], today, profile);
      const ageWarning = warnings.find((w) => w.circumstance === "age_outside_range");
      expect(ageWarning).toBeDefined();
      expect(ageWarning?.reason).toMatch(/20.*42/);
      expect(ageWarning?.instructionLimit).toMatch(/Marquette/);
      expect(ageWarning?.instructionLimit).not.toMatch(/Verelle/i);
      expect(ageWarning?.conservativeGuidance).toBeTruthy();
      expect(ageWarning?.instructorRoute.label).toContain("instructor");
      expect(ageWarning?.instructorRoute.url).toMatch(/^https?:\/\//);
    });

    it("produces age warning when age is over 42 (e.g. 43)", () => {
      const profile: Profile = {
        ...defaultProfile(),
        dateOfBirth: "1983-06-15", // 43 on 2026-06-15
      };
      const warnings = evaluateEligibilityWarnings([], today, profile);
      const ageWarning = warnings.find((w) => w.circumstance === "age_outside_range");
      expect(ageWarning).toBeDefined();
    });
  });

  describe("Cycle length outside 22–42 days", () => {
    function makeCycle(startDate: string, length: number) {
      return {
        startDate,
        days: Array.from({ length }, (_, i) => ({
          civilDate: `2026-01-${String(i + 1).padStart(2, "0")}`,
          cycleDay: i + 1,
          monitorReading: null,
          markers: [],
          annotations: [],
          dayStatus: null,
        })),
        mucusPeak: null,
        fertileWindow: null,
      };
    }

    it("produces no warning when completed cycle length is within 22–42 days (e.g. 28)", () => {
      const cycle1 = makeCycle("2026-01-01", 28);
      const cycle2 = makeCycle("2026-01-29", 5); // in-progress
      const warnings = evaluateEligibilityWarnings([cycle1, cycle2], today, null);
      expect(warnings.some((w) => w.circumstance === "cycle_length_outside_range")).toBe(false);
    });

    it("produces warning when a single completed cycle is under 22 days (e.g. 21 days)", () => {
      const cycle1 = makeCycle("2026-01-01", 21);
      const cycle2 = makeCycle("2026-01-22", 5);
      const warnings = evaluateEligibilityWarnings([cycle1, cycle2], today, null);
      const warning = warnings.find((w) => w.circumstance === "cycle_length_outside_range");
      expect(warning).toBeDefined();
      expect(warning?.reason).toMatch(/22.*42/);
      expect(warning?.instructionLimit).toMatch(/Marquette/);
      expect(warning?.instructionLimit).not.toMatch(/Verelle/i);
      expect(warning?.conservativeGuidance).toBeTruthy();
      expect(warning?.instructorRoute.label).toContain("instructor");
      expect(warning?.instructorRoute.url).toMatch(/^https?:\/\//);
    });

    it("produces warning when a single completed cycle is over 42 days (e.g. 45 days)", () => {
      const cycle1 = makeCycle("2026-01-01", 45);
      const cycle2 = makeCycle("2026-02-15", 5);
      const warnings = evaluateEligibilityWarnings([cycle1, cycle2], today, null);
      const warning = warnings.find((w) => w.circumstance === "cycle_length_outside_range");
      expect(warning).toBeDefined();
    });

    it("produces warning when an in-progress cycle exceeds 42 days (e.g. day 43)", () => {
      const currentCycle = makeCycle("2026-01-01", 43);
      const warnings = evaluateEligibilityWarnings([currentCycle], today, null);
      const warning = warnings.find((w) => w.circumstance === "cycle_length_outside_range");
      expect(warning).toBeDefined();
    });

    it("produces no warning when in-progress cycle is on day 15", () => {
      const currentCycle = makeCycle("2026-01-01", 15);
      const warnings = evaluateEligibilityWarnings([currentCycle], today, null);
      expect(warnings.some((w) => w.circumstance === "cycle_length_outside_range")).toBe(false);
    });
  });

  describe("Two or more out-of-range Cycles", () => {
    function makeCycle(startDate: string, length: number) {
      return {
        startDate,
        days: Array.from({ length }, (_, i) => ({
          civilDate: `2026-01-${String(i + 1).padStart(2, "0")}`,
          cycleDay: i + 1,
          monitorReading: null,
          markers: [],
          annotations: [],
          dayStatus: null,
        })),
        mucusPeak: null,
        fertileWindow: null,
      };
    }

    it("produces two_or_more_out_of_range_cycles warning when two cycles are out of range", () => {
      const cycle1 = makeCycle("2026-01-01", 20); // out of range (<22)
      const cycle2 = makeCycle("2026-01-21", 21); // out of range (<22)
      const cycle3 = makeCycle("2026-02-11", 5); // in progress
      const warnings = evaluateEligibilityWarnings([cycle1, cycle2, cycle3], today, null);
      const warning = warnings.find((w) => w.circumstance === "two_or_more_out_of_range_cycles");
      expect(warning).toBeDefined();
      expect(warning?.reason).toMatch(/two or more/i);
      expect(warning?.instructionLimit).toMatch(/Marquette/);
      expect(warning?.instructionLimit).not.toMatch(/Verelle/i);
      expect(warning?.conservativeGuidance).toBeTruthy();
      expect(warning?.instructorRoute.label).toContain("instructor");
      expect(warning?.instructorRoute.url).toMatch(/^https?:\/\//);

      // In isolation: does not duplicate as single cycle_length_outside_range
      expect(warnings.some((w) => w.circumstance === "cycle_length_outside_range")).toBe(false);
    });
  });

  describe("Variation over 10 days", () => {
    function makeCycle(startDate: string, length: number) {
      return {
        startDate,
        days: Array.from({ length }, (_, i) => ({
          civilDate: `2026-01-${String(i + 1).padStart(2, "0")}`,
          cycleDay: i + 1,
          monitorReading: null,
          markers: [],
          annotations: [],
          dayStatus: null,
        })),
        mucusPeak: null,
        fertileWindow: null,
      };
    }

    it("produces no warning when variation is exactly 10 days (e.g. 25 and 35)", () => {
      const cycle1 = makeCycle("2026-01-01", 25);
      const cycle2 = makeCycle("2026-01-26", 35);
      const cycle3 = makeCycle("2026-03-02", 5); // in progress
      const warnings = evaluateEligibilityWarnings([cycle1, cycle2, cycle3], today, null);
      expect(warnings.some((w) => w.circumstance === "cycle_variation_over_10_days")).toBe(false);
    });

    it("produces cycle_variation_over_10_days warning when variation is 11 days (e.g. 25 and 36)", () => {
      const cycle1 = makeCycle("2026-01-01", 25);
      const cycle2 = makeCycle("2026-01-26", 36);
      const cycle3 = makeCycle("2026-03-03", 5); // in progress
      const warnings = evaluateEligibilityWarnings([cycle1, cycle2, cycle3], today, null);
      const warning = warnings.find((w) => w.circumstance === "cycle_variation_over_10_days");
      expect(warning).toBeDefined();
      expect(warning?.reason).toMatch(/10/);
      expect(warning?.instructionLimit).toMatch(/Marquette/);
      expect(warning?.instructionLimit).not.toMatch(/Verelle/i);
      expect(warning?.conservativeGuidance).toBeTruthy();
      expect(warning?.instructorRoute.label).toContain("instructor");
      expect(warning?.instructorRoute.url).toMatch(/^https?:\/\//);

      // In isolation: no other warnings since 25 and 36 are within 22-42
      expect(warnings.length).toBe(1);
    });
  });

  describe("Post-pill status", () => {
    it("produces no warning when hormonal contraception stop date has not been entered", () => {
      const profile: Profile = {
        ...defaultProfile(),
        hormonalContraceptionStop: null,
      };
      const warnings = evaluateEligibilityWarnings([], today, profile);
      expect(warnings.some((w) => w.circumstance === "post_pill")).toBe(false);
    });

    it("produces post_pill warning when hormonal contraception stop date is entered", () => {
      const profile: Profile = {
        ...defaultProfile(),
        hormonalContraceptionStop: "2026-05-01",
      };
      const warnings = evaluateEligibilityWarnings([], today, profile);
      const warning = warnings.find((w) => w.circumstance === "post_pill");
      expect(warning).toBeDefined();
      expect(warning?.reason).toMatch(/hormonal contraception/i);
      expect(warning?.instructionLimit).toMatch(/Marquette/);
      expect(warning?.instructionLimit).not.toMatch(/Verelle/i);
      expect(warning?.conservativeGuidance).toBeTruthy();
      expect(warning?.instructorRoute.label).toContain("instructor");
      expect(warning?.instructorRoute.url).toMatch(/^https?:\/\//);
      expect(warnings.length).toBe(1);
    });
  });

  describe("Perimenopausal status", () => {
    it("produces no warning when perimenopause is null or false", () => {
      const profileNull: Profile = {
        ...defaultProfile(),
        perimenopause: null,
      };
      expect(evaluateEligibilityWarnings([], today, profileNull).some((w) => w.circumstance === "perimenopausal")).toBe(false);

      const profileFalse: Profile = {
        ...defaultProfile(),
        perimenopause: false,
      };
      expect(evaluateEligibilityWarnings([], today, profileFalse).some((w) => w.circumstance === "perimenopausal")).toBe(false);
    });

    it("produces perimenopausal warning when perimenopause is true", () => {
      const profile: Profile = {
        ...defaultProfile(),
        perimenopause: true,
      };
      const warnings = evaluateEligibilityWarnings([], today, profile);
      const warning = warnings.find((w) => w.circumstance === "perimenopausal");
      expect(warning).toBeDefined();
      expect(warning?.reason).toMatch(/perimenopaus/i);
      expect(warning?.instructionLimit).toMatch(/Marquette/);
      expect(warning?.instructionLimit).not.toMatch(/Verelle/i);
      expect(warning?.conservativeGuidance).toBeTruthy();
      expect(warning?.instructorRoute.label).toContain("instructor");
      expect(warning?.instructorRoute.url).toMatch(/^https?:\/\//);
      expect(warnings.length).toBe(1);
    });
  });

  describe("Postpartum without breastfeeding status", () => {
    it("produces no warning when postpartum is null or false", () => {
      const profileNull: Profile = {
        ...defaultProfile(),
        postpartum: null,
        breastfeeding: false,
      };
      expect(evaluateEligibilityWarnings([], today, profileNull).some((w) => w.circumstance === "postpartum_without_breastfeeding")).toBe(false);
    });

    it("produces no warning when postpartum is true but breastfeeding is null (not entered)", () => {
      const profile: Profile = {
        ...defaultProfile(),
        postpartum: true,
        breastfeeding: null,
      };
      expect(evaluateEligibilityWarnings([], today, profile).some((w) => w.circumstance === "postpartum_without_breastfeeding")).toBe(false);
    });

    it("produces no warning when postpartum is true and breastfeeding is true", () => {
      const profile: Profile = {
        ...defaultProfile(),
        postpartum: true,
        breastfeeding: true,
      };
      expect(evaluateEligibilityWarnings([], today, profile).some((w) => w.circumstance === "postpartum_without_breastfeeding")).toBe(false);
    });

    it("produces postpartum_without_breastfeeding warning when postpartum is true and breastfeeding is false", () => {
      const profile: Profile = {
        ...defaultProfile(),
        postpartum: true,
        breastfeeding: false,
      };
      const warnings = evaluateEligibilityWarnings([], today, profile);
      const warning = warnings.find((w) => w.circumstance === "postpartum_without_breastfeeding");
      expect(warning).toBeDefined();
      expect(warning?.reason).toMatch(/postpartum/i);
      expect(warning?.instructionLimit).toMatch(/Marquette/);
      expect(warning?.instructionLimit).not.toMatch(/Verelle/i);
      expect(warning?.conservativeGuidance).toBeTruthy();
      expect(warning?.instructorRoute.label).toContain("instructor");
      expect(warning?.instructorRoute.url).toMatch(/^https?:\/\//);
      expect(warnings.length).toBe(1);
    });
  });
});
