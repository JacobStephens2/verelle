import { describe, expect, it } from "vitest";

import {
  ageOnCivilDate,
  civilDateIn,
  civilDatePlusDays,
  completedYearsBetweenCivilDates,
  daysBetweenCivilDates,
  displayCivilDate,
  todayCivilDate,
} from "./civil-date";

describe("civilDateIn", () => {
  it("formats the civil date as YYYY-MM-DD", () => {
    expect(civilDateIn(new Date("2026-03-09T14:00:00Z"), "America/Chicago")).toBe("2026-03-09");
  });

  it("uses the calendar date in the given timezone, not UTC", () => {
    // 21:00 in Chicago is already the next day in UTC.
    const instant = new Date("2026-03-10T03:00:00Z");

    expect(civilDateIn(instant, "America/Chicago")).toBe("2026-03-09");
    expect(civilDateIn(instant, "UTC")).toBe("2026-03-10");
  });

  it("keeps a morning reading on its own date across a long flight", () => {
    // Story 12: the observation belongs to the civil date it was recorded on
    // and flying somewhere must not move it onto a different day. Recording at
    // 07:00 in Chicago and re-reading the same instant from Tokyo is the shape
    // of that failure.
    const recordedAt = new Date("2026-03-09T13:00:00Z");

    expect(civilDateIn(recordedAt, "America/Chicago")).toBe("2026-03-09");
    expect(civilDateIn(recordedAt, "Asia/Tokyo")).toBe("2026-03-09");
  });
});

describe("todayCivilDate", () => {
  it("defaults to the device timezone", () => {
    const now = new Date("2026-03-10T03:00:00Z");
    const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

    expect(todayCivilDate(now)).toBe(civilDateIn(now, deviceZone));
  });
});

describe("civil date arithmetic", () => {
  it("counts whole days between two civil dates", () => {
    expect(daysBetweenCivilDates("2026-08-30", "2026-08-30")).toBe(0);
    expect(daysBetweenCivilDates("2026-08-28", "2026-08-30")).toBe(2);
    expect(daysBetweenCivilDates("2026-08-30", "2026-08-28")).toBe(-2);
  });

  it("crosses a month, a year and a leap day without drifting", () => {
    expect(daysBetweenCivilDates("2026-01-31", "2026-02-01")).toBe(1);
    expect(daysBetweenCivilDates("2026-12-31", "2027-01-01")).toBe(1);
    expect(daysBetweenCivilDates("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("is unaffected by a daylight-saving transition, because civil dates are not instants", () => {
    // 2026-03-08 is a US spring-forward date; a 23-hour day must still be one
    // day apart from its neighbours.
    expect(daysBetweenCivilDates("2026-03-07", "2026-03-09")).toBe(2);
  });

  it("adds days, returning a civil date", () => {
    expect(civilDatePlusDays("2026-08-30", 0)).toBe("2026-08-30");
    expect(civilDatePlusDays("2026-08-30", 2)).toBe("2026-09-01");
    expect(civilDatePlusDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("formats a civil date for display", () => {
    expect(displayCivilDate("2026-09-04")).toBe("Sep 4");
    expect(displayCivilDate("2026-01-01")).toBe("Jan 1");
  });
});

describe("completedYearsBetweenCivilDates / ageOnCivilDate", () => {
  it("calculates completed years before and after birthday in a calendar year", () => {
    expect(completedYearsBetweenCivilDates("2000-06-15", "2026-06-14")).toBe(25);
    expect(completedYearsBetweenCivilDates("2000-06-15", "2026-06-15")).toBe(26);
    expect(completedYearsBetweenCivilDates("2000-06-15", "2026-06-16")).toBe(26);
    expect(ageOnCivilDate("2000-06-15", "2026-06-15")).toBe(26);
  });

  it("handles leap day birthdays", () => {
    expect(completedYearsBetweenCivilDates("2000-02-29", "2026-02-28")).toBe(25);
    expect(completedYearsBetweenCivilDates("2000-02-29", "2026-03-01")).toBe(26);
  });

  it("returns 0 for malformed dates", () => {
    expect(completedYearsBetweenCivilDates("invalid", "2026-06-15")).toBe(0);
  });
});



