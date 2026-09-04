import { describe, expect, it } from "vitest";

import {
  applyProfileUpdate,
  defaultProfile,
  profileUpdateOf,
  type ProfileFields,
} from "./profile";

describe("defaultProfile", () => {
  it("initialises with all circumstance and demographic fields empty", () => {
    expect(defaultProfile()).toEqual({
      dateOfBirth: null,
      breastfeeding: null,
      postpartum: null,
      perimenopause: null,
      hormonalContraceptionStop: null,
    });
  });
});

describe("applyProfileUpdate", () => {
  it("stores date of birth as a date string, never as a computed age", () => {
    const profile = applyProfileUpdate(defaultProfile(), {
      dateOfBirth: "1994-06-12",
    });

    expect(profile.dateOfBirth).toBe("1994-06-12");
    expect(typeof profile.dateOfBirth).toBe("string");
    // Ensure no 'age' property exists or is derived
    expect("age" in profile).toBe(false);
  });

  it("merges field by field so two partners editing different profile fields both win", () => {
    const hers = applyProfileUpdate(defaultProfile(), {
      dateOfBirth: "1994-06-12",
      breastfeeding: true,
      postpartum: true,
    });

    const his = applyProfileUpdate(hers, {
      perimenopause: false,
      hormonalContraceptionStop: "2026-01-15",
    });

    expect(his.dateOfBirth).toBe("1994-06-12");
    expect(his.breastfeeding).toBe(true);
    expect(his.postpartum).toBe(true);
    expect(his.perimenopause).toBe(false);
    expect(his.hormonalContraceptionStop).toBe("2026-01-15");
  });

  it("can clear fields explicitly", () => {
    const initial = applyProfileUpdate(defaultProfile(), {
      breastfeeding: true,
      hormonalContraceptionStop: "2026-01-15",
    });

    const cleared = applyProfileUpdate(initial, {
      breastfeeding: null,
      hormonalContraceptionStop: null,
    });

    expect(cleared.breastfeeding).toBeNull();
    expect(cleared.hormonalContraceptionStop).toBeNull();
  });
});

describe("profileUpdateOf", () => {
  const values: ProfileFields = {
    dateOfBirth: "1994-06-12",
    breastfeeding: true,
    postpartum: false,
    perimenopause: false,
    hormonalContraceptionStop: "2026-01-15",
  };

  it("carries only edited fields so unedited fields are not overwritten", () => {
    expect(profileUpdateOf(values, new Set(["dateOfBirth"]))).toEqual({
      dateOfBirth: "1994-06-12",
    });
  });

  it("carries multiple edited fields", () => {
    expect(
      profileUpdateOf(values, new Set(["breastfeeding", "postpartum"])),
    ).toEqual({
      breastfeeding: true,
      postpartum: false,
    });
  });
});
