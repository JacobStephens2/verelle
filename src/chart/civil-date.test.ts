import { describe, expect, it } from "vitest";

import { civilDateIn, todayCivilDate } from "./civil-date";

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
