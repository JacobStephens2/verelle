import { describe, expect, it } from "vitest";

import type { Profile } from "../observations/profile";
import { defaultProfile } from "../observations/profile";
import { defaultCycleOverlay } from "../observations/cycle-overlay";
import { evaluateEligibilityWarnings } from "./eligibility-warnings";
import { makeTestCycle } from "./test-cycle";

const makeCycle = makeTestCycle;

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

  describe("Protocol scope filtering", () => {
    it("does not produce regular-cycle manual warnings for cycles charted under postpartum protocols", () => {
      // Cycle 1 is 15 days, Cycle 2 is 50 days (both outside 22–42 days for regular cycles)
      const cycle1 = makeCycle("2026-01-01", 15);
      const cycle2 = makeCycle("2026-01-16", 50);
      const overlay1 = {
        ...defaultCycleOverlay("2026-01-01"),
        protocolFamily: "postpartum_cycle_zero_original" as const,
      };
      const overlay2 = {
        ...defaultCycleOverlay("2026-01-16"),
        protocolFamily: "postpartum_return_to_cycles" as const,
      };

      const warnings = evaluateEligibilityWarnings(
        [cycle1, cycle2],
        today,
        null,
        [overlay1, overlay2],
      );

      // No regular-cycle length or variation warnings produced
      expect(warnings.some((w) => w.circumstance === "cycle_length_outside_range")).toBe(false);
      expect(warnings.some((w) => w.circumstance === "two_or_more_out_of_range_cycles")).toBe(false);
      expect(warnings.some((w) => w.circumstance === "cycle_variation_over_10_days")).toBe(false);
    });
  });

  describe("Missed test near expected Peak", () => {
    it("produces a warning that the window may be less certain when a monitor test is missed near expected Peak", () => {
      const cycle = makeCycle("2026-01-01", 28);
      const days = [...cycle.days];
      days[11] = { ...days[11]!, monitorReading: "High" };
      days[13] = { ...days[13]!, monitorReading: "Missed" };
      const cycleWithMissed = { ...cycle, days };

      const warnings = evaluateEligibilityWarnings([cycleWithMissed], today, null);
      const warning = warnings.find((w) => w.circumstance === "missed_test_near_expected_peak");
      expect(warning).toBeDefined();
      expect(warning?.reason).toMatch(/missed.*expected Peak/i);
      expect(warning?.conservativeGuidance).toMatch(/less certain/i);
      expect(warning?.instructionLimit).toMatch(/Clearblue/i);
    });

    it("produces a warning when a test is missed near historical Peak from prior cycles", () => {
      const priorCycle = makeCycle("2026-01-01", 28);
      const priorDays = [...priorCycle.days];
      priorDays[14] = { ...priorDays[14]!, monitorReading: "Peak" };

      const currentCycle = makeCycle("2026-01-29", 20);
      const currentDays = [...currentCycle.days];
      currentDays[13] = { ...currentDays[13]!, monitorReading: "Missed" };

      const warnings = evaluateEligibilityWarnings(
        [{ ...priorCycle, days: priorDays }, { ...currentCycle, days: currentDays }],
        today,
        null,
      );
      const warning = warnings.find((w) => w.circumstance === "missed_test_near_expected_peak");
      expect(warning).toBeDefined();
      expect(warning?.conservativeGuidance).toMatch(/less certain/i);
    });

    it("does not produce a warning when a test is missed far from expected Peak (e.g. CD6)", () => {
      const priorCycle = makeCycle("2026-01-01", 28);
      const priorDays = [...priorCycle.days];
      priorDays[15] = { ...priorDays[15]!, monitorReading: "Peak" };

      const currentCycle = makeCycle("2026-01-29", 20);
      const currentDays = [...currentCycle.days];
      currentDays[5] = { ...currentDays[5]!, monitorReading: "Missed" };

      const warnings = evaluateEligibilityWarnings(
        [{ ...priorCycle, days: priorDays }, { ...currentCycle, days: currentDays }],
        today,
        null,
      );
      expect(warnings.some((w) => w.circumstance === "missed_test_near_expected_peak")).toBe(false);
    });

    it("does not produce a warning when Peak was already detected in the current cycle", () => {
      const cycle = makeCycle("2026-01-01", 28);
      const days = [...cycle.days];
      days[13] = { ...days[13]!, monitorReading: "Peak" }; // Peak on CD14
      days[14] = { ...days[14]!, monitorReading: "Missed" }; // Missed on CD15 (P+1)
      const cycleWithPeak = { ...cycle, days };

      const warnings = evaluateEligibilityWarnings([cycleWithPeak], today, null);
      expect(warnings.some((w) => w.circumstance === "missed_test_near_expected_peak")).toBe(false);
    });

    it("evaluates historical peak without being shadowed by an early High reading", () => {
      const priorCycle = makeCycle("2026-01-01", 28);
      const priorDays = [...priorCycle.days];
      priorDays[17] = { ...priorDays[17]!, monitorReading: "Peak" }; // Prior Peak on CD18

      // Current cycle has early High on CD10 and Missed on CD17 (near historical Peak CD18, even though CD17 > CD10 + 5)
      const currentCycle = makeCycle("2026-01-29", 20);
      const currentDays = [...currentCycle.days];
      currentDays[9] = { ...currentDays[9]!, monitorReading: "High" };
      currentDays[16] = { ...currentDays[16]!, monitorReading: "Missed" };

      const warnings = evaluateEligibilityWarnings(
        [{ ...priorCycle, days: priorDays }, { ...currentCycle, days: currentDays }],
        today,
        null,
      );
      expect(warnings.some((w) => w.circumstance === "missed_test_near_expected_peak")).toBe(true);
    });
  });
});


