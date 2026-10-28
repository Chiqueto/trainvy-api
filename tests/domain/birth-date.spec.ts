import { describe, expect, it } from "vitest";

import {
  ageFromBirthDate,
  BirthDateSchema,
  calendarToday,
} from "../../src/domain/birth-date.js";

describe("date-only birth date", () => {
  it("advances age on the birthday rather than at the beginning of the year", () => {
    expect(ageFromBirthDate("2000-10-28", "2026-10-27")).toBe(25);
    expect(ageFromBirthDate("2000-10-28", "2026-10-28")).toBe(26);
    expect(ageFromBirthDate("2000-10-28", "2026-10-29")).toBe(26);
    expect(ageFromBirthDate("2000-02-29", "2025-02-28")).toBe(24);
    expect(ageFromBirthDate("2000-02-29", "2025-03-01")).toBe(25);
  });
  it("uses the Sao Paulo calendar at the UTC day boundary", () => {
    expect(calendarToday(new Date("2026-10-29T01:00:00Z"))).toBe("2026-10-28");
  });
  it("rejects impossible dates and timestamp substitutions", () => {
    for (const value of [
      "2000-02-30",
      "2001-02-29",
      "1998-05-20T00:00:00Z",
      "",
      "9999-01-01",
    ])
      expect(BirthDateSchema.safeParse(value).success).toBe(false);
  });
});
